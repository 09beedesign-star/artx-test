import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const CLIENT_CANVAS_PATH = "client/src/components/canvas/InfiniteCanvas.tsx";
const CLIENT_INTENT_PATH = "client/src/lib/ai-intent.ts";
const SERVER_IMAGE_GEN_PATH = "server/image-generation.ts";

/**
 * 多图融合语义理解失效的修复锁定测试。
 *
 * 用户报告：引用 2 张图（脚 + 红鞋）+ 提示词「让脚穿上这双鞋」，
 * 产出完全无关的人，且没穿红鞋。定位出三个叠加的失效点：
 * 1. 底图写死取最后一张 → 主客颠倒（鞋成画布、脚成素材）
 * 2. 措辞写死 person → 诱导模型造人
 * 3. 模型写死 og-image2-medium，走 multipart，图文关系丢失；gem 被排除在外
 *
 * 本测试锁住修复后的四个关键点，防止回退。
 */
describe("多图融合语义理解修复", () => {
  const clientCanvas = readFileSync(CLIENT_CANVAS_PATH, "utf-8");
  const clientIntent = readFileSync(CLIENT_INTENT_PATH, "utf-8");
  const serverImageGen = readFileSync(SERVER_IMAGE_GEN_PATH, "utf-8");

  it("底图下标由 claude 裁决，而非写死最后一张", () => {
    // resolveTargetReferenceIndex 函数接受 decision?.targetImageIndex。
    expect(clientCanvas).toContain("function resolveTargetReferenceIndex(");
    expect(clientCanvas).toContain("decidedIndex?: number");

    /**
     * 上下界都必须校验。
     *
     * 这条是变异测试补出来的：下面复刻版纯函数的断言不会跟着源码变，
     * 把源码里的 `zeroBased >= referenceCount` 删掉时测试依然全绿 ——
     * 越界下标会让 assistantImages[i] 取到 undefined，
     * 紧接着 targetReference.src 直接抛 TypeError，整次生成失败。
     * 所以源码里这半个条件必须单独锁住。
     */
    expect(clientCanvas).toContain(
      "if (zeroBased < 0 || zeroBased >= referenceCount) return fallback;"
    );
    expect(clientCanvas).toContain(
      "if (!decidedIndex || !Number.isInteger(decidedIndex)) return fallback;"
    );

    // 无 skill 分支调用它并传入 decision?.targetImageIndex。
    expect(clientCanvas).toContain(
      "resolveTargetReferenceIndex(\n              assistantImages.length,\n              decision?.targetImageIndex\n            )"
    );

    /**
     * 防回退：写死取最后一张的写法只允许剩 1 处 —— skill 路径。
     *
     * skill 路径不参与本次修复：它的底图由 skill 自身语义确定
     * （image_edit 类 skill 常常只有 1 张图，此时首尾同一张，无歧义），
     * 硬改反而会破坏既有能力。所以这里不是 not.toContain，而是锁定次数：
     * 一旦无 skill 分支被改回去，次数会变成 2，本条立刻报警。
     */
    const hardcodedLastImageUsages = clientCanvas.split(
      "assistantImages[assistantImages.length - 1]"
    ).length - 1;
    expect(hardcodedLastImageUsages).toBe(1);

    // 防回退：不再用 slice(0, -1) 剔除最后一张。
    expect(clientCanvas).toContain(
      "assistantImages.filter((_, index) => index !== targetReferenceIndex)"
    );
  });

  it("意图裁决结构扩展了 targetImageIndex 字段", () => {
    // 类型定义包含该字段。
    expect(clientIntent).toContain("targetImageIndex?: number;");

    // inferCreativeIntentDecision 会把模型回传的值清洗后放入决策结果。
    expect(clientIntent).toContain(
      "targetImageIndex: normalizeTargetImageIndex(parsed.targetImageIndex)"
    );

    // 清洗函数确保值 >= 1 且是整数，否则丢弃。
    expect(clientIntent).toContain("function normalizeTargetImageIndex(");
    expect(clientIntent).toContain("return rounded >= 1 ? rounded : undefined");
  });

  it("提示词告知模型必须返回 targetImageIndex（≥2 图时）", () => {
    // 提示词里显式要求返回该字段。
    expect(clientIntent).toContain(
      "另外必须返回 targetImageIndex（从 1 开始的整数）"
    );
    expect(clientIntent).toContain(
      "判断依据是语义而不是顺序：被添加、被穿戴、被替换、被贴上去的那个东西所在的图是素材；承载它、需要保持不变的那张才是底图。"
    );

    // JSON 格式说明也加了该字段（≥2 图时）。
    // 源码里这段是写在 TS 字符串字面量内的，引号是转义的，所以按转义形式匹配。
    expect(clientIntent).toContain('\\"targetImageIndex\\":1');
  });

  it("引导语去掉了写死的 person 措辞", () => {
    // 新增的共用函数 buildReferenceEditGuidance 措辞中性。
    expect(clientCanvas).toContain("function buildReferenceEditGuidance(");
    expect(clientCanvas).toContain(
      "Keep its subject, scene, composition, background, lighting"
    );
    expect(clientCanvas).toContain(
      "If the target canvas has no human in it, do not add one"
    );

    // 防回退：不再出现 "Preserve the target person"。
    expect(clientCanvas).not.toContain("Preserve the target person");
    expect(clientCanvas).not.toContain("the target person's identity");
  });

  it("多图融合场景改用 gem（auto 模式下）", () => {
    // preferGemForComposedReferences 不再排除 shouldEditTargetReference。
    expect(clientCanvas).toContain(
      "多图融合（shouldEditTargetReference）同样纳入"
    );
    expect(clientCanvas).toContain(
      "const preferGemForComposedReferences =\n          assistantAutoMode &&\n          submittedImages.length > 0"
    );

    // 定义了统一的 referenceEditModelId，三处复用。
    expect(clientCanvas).toContain(
      "const referenceEditModelId = preferGemForComposedReferences\n          ? COMPOSED_REFERENCE_IMAGE_MODEL_ID\n          : DEFAULT_IMAGE_AI_MODEL_ID;"
    );

    // payload.model、backgroundTaskInput.model、editImageWithPrompt 调用全部用它。
    expect(clientCanvas).toContain("model: referenceEditModelId");
  });

  it("VOD 模型在 image_edit 直接走参考图生成路径", () => {
    // isChatCompatibleImageModel 旁边加了 isVodModelId 短路。
    expect(serverImageGen).toContain(
      "if (isChatCompatibleImageModel(selectedModel) || isVodModelId(selectedModel)) {"
    );
    expect(serverImageGen).toContain("return editViaReferenceGeneration();");

    // 注释说明了为何 VOD 不能走 multipart edits。
    expect(serverImageGen).toContain(
      "它们不是 OpenAI 兼容通道，没有 /images/edits 这个端点"
    );
  });
});

/**
 * resolveTargetReferenceIndex 的真实行为测试。
 *
 * 上面那组是源码文本断言，只能证明「代码长这样」，证明不了「算得对」。
 * InfiniteCanvas.tsx 是两万余行的组件文件、导入大量浏览器侧依赖，
 * 在单测里整体 import 代价过高且容易被无关模块拖垮，
 * 所以这里按同一份实现复刻一份纯函数来锁行为契约；
 * 上面的文本断言负责保证两边不会各自漂移。
 */
function resolveTargetReferenceIndex(
  referenceCount: number,
  decidedIndex?: number
) {
  const fallback = referenceCount - 1;
  if (!decidedIndex || !Number.isInteger(decidedIndex)) return fallback;
  const zeroBased = decidedIndex - 1;
  if (zeroBased < 0 || zeroBased >= referenceCount) return fallback;
  return zeroBased;
}

describe("resolveTargetReferenceIndex 的取值契约", () => {
  it("采纳模型裁决：脚在第 1 张时应选中第 1 张作底图", () => {
    // 这正是用户 bug 的场景：assistantImages = [脚, 红鞋]，
    // claude 判定底图是脚（编号 1），应返回下标 0 而不是 1。
    expect(resolveTargetReferenceIndex(2, 1)).toBe(0);
  });

  it("模型裁决指向最后一张时也照办", () => {
    expect(resolveTargetReferenceIndex(2, 2)).toBe(1);
    expect(resolveTargetReferenceIndex(3, 3)).toBe(2);
  });

  it("裁决缺失时回退到最后一张，与改动前行为一致", () => {
    // 这条保证「裁决链路失效时最多退回原状，不会更糟」。
    expect(resolveTargetReferenceIndex(2, undefined)).toBe(1);
    expect(resolveTargetReferenceIndex(3)).toBe(2);
  });

  it("裁决越界或非法时同样回退，不会抛错也不会返回负下标", () => {
    expect(resolveTargetReferenceIndex(2, 0)).toBe(1);
    expect(resolveTargetReferenceIndex(2, -5)).toBe(1);
    expect(resolveTargetReferenceIndex(2, 99)).toBe(1);
    expect(resolveTargetReferenceIndex(2, 1.5)).toBe(1);
    expect(resolveTargetReferenceIndex(2, NaN)).toBe(1);
  });
});
