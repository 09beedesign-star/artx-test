import { describe, expect, it } from "vitest";
import { __testResolveModelAndVersion } from "./tencent-vod-aigc";
import { __testBuildImageModelCatalog } from "./image-generation";
import {
  IMAGE_MODEL_PRIORITY_IDS,
  isSupportedImageModelId,
  isVodModelId,
  normalizeImageModelId,
} from "../shared/image-models";
import {
  getAiImageModelCreditPolicy,
  isHighCostImageModel,
  isImageModelAllowedForFreePlan,
} from "../shared/ai-credit-policy";
import { IMAGE_AI_MODEL_OPTIONS } from "../client/src/lib/workspace-data";

/**
 * nano banana 2.1 接入（2026-10-11）。腾讯侧 ModelName=GG、ModelVersion=3.6。
 * 最致命的静默失效：resolveModelName 默认兜底是 GEM，漏掉 gg 分支会把请求
 * 发成 GEM/3.6 —— 要么被拒，要么用错模型出图，日志里只看得到 vod-gg36。
 */
describe("vod-gg36（nano banana 2.1）", () => {
  it("发给腾讯的是 GG / 3.6，而不是兜底的 GEM", () => {
    expect(__testResolveModelAndVersion("vod-gg36")).toEqual({ modelName: "GG", modelVersion: "3.6" });
  });

  it("不影响既有 gem 族映射", () => {
    expect(__testResolveModelAndVersion("vod-gem")).toEqual({ modelName: "GEM", modelVersion: "3.1" });
    expect(__testResolveModelAndVersion("vod-gem-lite")).toEqual({ modelName: "GEM", modelVersion: "3.1-lite" });
  });

  it("在注册表中、走 VOD 链路、别名可归一", () => {
    expect(IMAGE_MODEL_PRIORITY_IDS).toContain("vod-gg36");
    expect(isSupportedImageModelId("vod-gg36")).toBe(true);
    expect(isVodModelId("vod-gg36")).toBe(true);
    expect(normalizeImageModelId("nano-banana-2.1")).toBe("vod-gg36");
    expect(normalizeImageModelId("GG")).toBe("vod-gg36");
  });

  it("有独立计费条目，按高消耗模型处理，免费版不可选", () => {
    expect(getAiImageModelCreditPolicy("vod-gg36")?.model).toBe("vod-gg36");
    expect(isHighCostImageModel("vod-gg36")).toBe(true);
    expect(isImageModelAllowedForFreePlan("vod-gg36")).toBe(false);
  });

  it("前端选择器与服务端目录都有，名称/描述/图标一致", async () => {
    const client = IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "vod-gg36");
    expect(client).toMatchObject({ label: "banana 2.1", description: "多图融合，角色一致性强", icon: "gemini" });
    // mock 中转站 /models 只回无关项：VOD 模型必须靠「目录 ∪ 全部 VOD」那一步进来。
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ id: "gpt-5.4-mini" }] }), { status: 200 })) as typeof fetch;
    const catalog = await __testBuildImageModelCatalog({ apiKey: "k", baseUrl: "https://t.example/v1", fetchImpl });
    const server = catalog.image.find(option => option.id === "vod-gg36");
    expect(server).toMatchObject({ label: client!.label, description: client!.description, icon: client!.icon });
  });
});
