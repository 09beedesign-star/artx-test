import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_IMAGE_OUTPUT_COUNT,
  IMAGE_MODEL_DEFAULT_OUTPUT_COUNTS,
  MAX_IMAGE_OUTPUT_COUNT,
  getImageModelDefaultOutputCount,
  hasCustomDefaultOutputCount,
} from "../../../../shared/image-models";
import { getAiImageModelCreditPolicy } from "../../../../shared/ai-credit-policy";

const REPO_ROOT = resolve(__dirname, "../../../..");

/**
 * 「模型默认出图张数」的语义锁。
 *
 * 背景：用户反馈「MJ 8.2 文档说默认出 4 张，平台只出 1 张，是不是藏了 3 张？」
 * 排查结论是**没有藏图**——我们接的是腾讯云 VOD 直连的 MJ v8.2，
 * VOD 把张数参数化成 OutputImageCount，请求侧一直只要 1 张，
 * 返回侧全链路（.map / 数组类型 / orchestrator 透传 / 前端多图布局）都是干净的。
 *
 * 所以这里锁两件事：
 *   1. MJ 的默认张数必须是 4（还原用户对 MJ 的产品预期）；
 *   2. 其他模型不得被顺手改成多张 —— 每多一张就多一份积分，是真金白银。
 */
describe("模型默认出图张数", () => {
  it("MJ 各种别名都要解析到 4 张", () => {
    expect(getImageModelDefaultOutputCount("vod-mj")).toBe(4);
    expect(getImageModelDefaultOutputCount("mj")).toBe(4);
    expect(getImageModelDefaultOutputCount("mj-v8.2")).toBe(4);
    expect(hasCustomDefaultOutputCount("vod-mj")).toBe(true);
  });

  it("未登记的模型、空值、未知值都回落到全站默认 1 张", () => {
    expect(DEFAULT_IMAGE_OUTPUT_COUNT).toBe(1);
    expect(getImageModelDefaultOutputCount("vod-gem")).toBe(1);
    expect(getImageModelDefaultOutputCount("")).toBe(1);
    expect(getImageModelDefaultOutputCount(undefined)).toBe(1);
    expect(getImageModelDefaultOutputCount("完全不存在的模型")).toBe(1);
    expect(hasCustomDefaultOutputCount("vod-gem")).toBe(false);
  });

  /**
   * 这条是**成本闸门**，不是风格检查。
   *
   * 登记表每多一个条目，就有一个模型的每次点击消耗变成 N 倍。
   * 如果有人在这里加了模型而没有同步产品定价口径，这条会失败，
   * 失败信息会直接把「你正在让哪个模型涨到多少积分」摆在面前。
   */
  it("登记表只能包含经过定价确认的模型，且张数在 UI 可选范围内", () => {
    const entries = Object.entries(IMAGE_MODEL_DEFAULT_OUTPUT_COUNTS);
    const costs = entries.map(([modelId, count]) => {
      const creditsPerImage =
        getAiImageModelCreditPolicy(modelId)?.creditsPerImage ?? 0;
      return `${modelId}=${count}张×${creditsPerImage}积分=${creditsPerImage * count}积分/次`;
    });

    expect(
      entries.map(([modelId]) => modelId).sort(),
      `默认张数登记表发生变化，请先确认定价：${costs.join("；")}`
    ).toEqual(["vod-mj"]);

    for (const [modelId, count] of entries) {
      expect(Number.isInteger(count), `${modelId} 的默认张数必须是整数`).toBe(true);
      expect(count).toBeGreaterThan(DEFAULT_IMAGE_OUTPUT_COUNT);
      /*
       * 超过 UI 上限会出现「默认值选不中」的死角：
       * 徽标写着 N 张，但弹层里根本没有 N 这个按钮。
       */
      expect(count).toBeLessThanOrEqual(MAX_IMAGE_OUTPUT_COUNT);
    }
  });

  it("UI 上限不得超过服务端上限", () => {
    const serverSource = readFileSync(
      resolve(REPO_ROOT, "server/image-generation.ts"),
      "utf-8"
    );
    /*
     * 服务端把张数夹在 [1, 9]，UI 只暴露到 4。
     * 若服务端上限被调低到 4 以下，这条会提醒同步收窄 UI。
     */
    expect(serverSource).toContain("Math.min(Number(input.count) || 1, 9)");
    expect(MAX_IMAGE_OUTPUT_COUNT).toBeLessThanOrEqual(9);
  });

  it("VOD 请求体确实把张数透传成 OutputImageCount", () => {
    const vodSource = readFileSync(
      resolve(REPO_ROOT, "server/tencent-vod-aigc.ts"),
      "utf-8"
    );
    expect(vodSource).toContain("OutputImageCount: input.count || 1");
  });
});

/**
 * 前端联动的结构锁。
 *
 * 自动带出默认张数有个必须守住的边界：**用户一旦手动选过张数，
 * 后续切模型就不能再覆盖他的选择**，否则用户会觉得「我明明改成 1 张了，
 * 换个模型又跳回 4 张」，并且在他没注意时多扣积分。
 */
describe("画布张数选择器与模型的联动", () => {
  const source = readFileSync(
    resolve(__dirname, "InfiniteCanvas.tsx"),
    "utf-8"
  );

  it("张数初值来自模型且为惰性初始化", () => {
    expect(source).toContain(
      "const [assistantImageCount, setAssistantImageCount] = useState(() =>"
    );
    expect(source).toContain(
      "getImageModelDefaultOutputCount(assistantImageModelId)"
    );
    // 反向断言：不允许退回「写死 1 再用 effect 纠正」——会闪一下，且有竞态。
    expect(source).not.toContain(
      "const [assistantImageCount, setAssistantImageCount] = useState(1);"
    );
  });

  it("用户手动选过之后，切模型不再覆盖张数", () => {
    expect(source).toContain("const assistantImageCountTouchedRef = useRef(false);");
    expect(source).toContain("assistantImageCountTouchedRef.current = true;");
    expect(source).toContain("if (assistantImageCountTouchedRef.current) return;");
    // 选择器必须接包装函数，裸 setter 会绕开「已手动选过」的标记。
    expect(source).toContain("onChange={handleAssistantImageCountChange}");
    expect(source).not.toContain("onChange={setAssistantImageCount}");
  });

  it("选择器和模型下拉都要显示默认张数说明", () => {
    expect(source).toContain("hasCustomDefaultOutputCount(model.id)");
    expect(source).toContain("默认{getImageModelDefaultOutputCount(model.id)}张");
    expect(source).toContain("默认{recommendedCount}张");
    // 价格必须出现在说明里——这是用户判断要不要调低张数的唯一依据。
    expect(source).toContain("按张计费");
  });
});
