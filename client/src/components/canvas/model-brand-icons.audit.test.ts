import { describe, expect, it } from "vitest";
import { getModelBrandIconKind } from "./model-brand-icons";
import { DEFAULT_TEXT_MODEL } from "../../../../shared/text-models";
import { IMAGE_MODEL_PRIORITY_IDS } from "../../../../shared/image-models";

describe("model brand icons after the claude text-model switch", () => {
  it("gives the claude text model its own icon instead of falling through to openai", () => {
    // 切换前 getModelBrandIconKind 的正则里没有 claude 分支，
    // 文本模型会一路落到 `return icon ? "image" : "none"`，UI 上表现为图标缺失。
    expect(getModelBrandIconKind(DEFAULT_TEXT_MODEL)).toBe("anthropic");
    expect(getModelBrandIconKind("claude-sonnet-5")).toBe("anthropic");
    expect(getModelBrandIconKind("anything", "anthropic")).toBe("anthropic");
  });

  it("keeps retired relay model ids resolvable so historical records stay readable", () => {
    /**
     * 这些 id 已于 2026-09-12 从选择器与注册表下线，但**图标解析不能跟着删**。
     *
     * 历史作品记录、订单明细里存的仍是这些字面量，
     * 图标函数一旦不再识别，旧记录会在 UI 上退化成无图标的陌生字符串。
     * 解析规则本身零成本，保留即可。
     */
    const expected: Record<string, string> = {
      "og-image2-medium": "openai",
      "og-image2-high": "openai",
      "og-image2-low": "openai",
      "gemini-3.5-flash-preview": "banana",
      "jimeng-4.0": "jimeng",
      "mj-v7": "midjourney",
      "mj-v8.1": "midjourney",
      keling: "kling",
    };
    for (const [id, kind] of Object.entries(expected)) {
      expect(getModelBrandIconKind(id)).toBe(kind);
    }
    expect(getModelBrandIconKind("gpt-image-2")).toBe("openai");
  });

  it("does not change the icon verdict of any shipped image model", () => {
    // 这条是「零回归锁」：锁住每个在售图片模型的图标判定结果。
    //
    // 2026-09-11 更新：vod-* 模型接入选择器后，它们在 IMAGE_AI_MODELS 里
    // 显式带上了 icon 字段（gemini / openai / midjourney / kling / jimeng），
    // 因此**传入 icon 参数时**会解析到对应品牌图标。
    //
    // 但下面的断言只传 modelId 不传 icon，测的是「裸 id 的兜底判定」——
    // 这是 UI 拿不到 icon 时的降级路径，必须保持稳定。
    // vod-gem / vod-og / vod-mj 的裸 id 不含品牌关键字，仍为 none，属既有状况。
    //
    // vod-hunyuan 已于 2026-09-11 按用户要求从注册表移除，故不再出现在此表中。
    // 8 个中转站图片模型已于 2026-09-12 整体下线，同样退出此表；
    // 它们的图标解析规则仍然保留（见上一条用例），只是不再属于「在售模型」。
    const baseline: Record<string, string> = {
      "vod-gem": "none",
      "vod-gem-lite": "none",
      "vod-og": "none",
      "vod-mj": "none",
      "vod-kling": "kling",
      "vod-si": "none",
      "vod-qwen": "none",
      "vod-jimeng": "jimeng",
      // OG image2.5（2026-09-11 接入，sunburst medium 为全站默认出图模型）。
      // 裸 id 里既没有 "image2" 也没有 "gpt"，靠正则里新增的 `og25` 分支识别；
      // 若那个分支被误删，默认模型会在 UI 上变成无图标 —— 这六条就是它的锁。
      "vod-og25-sunburst-medium": "openai",
      "vod-og25-flare-medium": "openai",
      "vod-og25-sunburst-low": "openai",
      "vod-og25-flare-low": "openai",
      "vod-og25-sunburst-high": "openai",
      "vod-og25-flare-high": "openai",
    };
    // 先确保基线表没有漏掉新上线的图片模型，否则这条锁会形同虚设。
    expect(Object.keys(baseline).sort()).toEqual([...IMAGE_MODEL_PRIORITY_IDS].sort());
    for (const id of IMAGE_MODEL_PRIORITY_IDS) {
      expect(getModelBrandIconKind(id)).toBe(baseline[id]);
    }
  });
});
