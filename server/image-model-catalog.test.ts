import { describe, expect, it, vi } from "vitest";
import { __testBuildImageModelCatalog } from "./image-generation";
import {
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
  isVodModelId,
  sortImageModelIdsByPriority,
} from "../shared/image-models";

const expectedImageModelDescriptions = {
  // OG image2.5（腾讯 VOD 直连）
  "vod-og25-sunburst-medium": "高性价比默认推荐",
  "vod-og25-flare-medium": "高性价比另一画风",
  "vod-og25-sunburst-low": "极致低成本草稿",
  "vod-og25-flare-low": "极致低成本另一画风",
  "vod-og25-sunburst-high": "极致高清细节",
  "vod-og25-flare-high": "极致高清另一画风",
  // 其余 VOD 直连模型
  "vod-gem": "高品质综合表现",
  "vod-gem-lite": "高性价比出图快",
  "vod-og": "高品质场景稳定",
  "vod-mj": "极致艺术表现",
  "vod-kling": "高品质国风电商",
  "vod-si": "极致写实质感",
  "vod-qwen": "高性价比中文强",
  "vod-jimeng": "高性价比中文强",
};

/**
 * 中转站 /models 仍会返回的图片模型（与下方 mock 一致）。
 *
 * 2026-09-12 这些模型已在本站下线，但**中转站的 /models 接口不归我们控制**，
 * 它大概率继续返回这些 id。目录构建必须把它们全部挡掉，
 * 否则下线的模型会换个来源重新出现在 /api/ai/models 里。
 */
const RETIRED_RELAY_IMAGE_MODEL_IDS = [
  "gemini-3.5-flash-preview",
  "jimeng-4.0",
  "mj-v7",
  "mj-v8.1",
  "og-image2-low",
  "og-image2-medium",
  "og-image2-high",
  "keling",
];

const VOD_IMAGE_MODEL_IDS = IMAGE_MODEL_PRIORITY_IDS.filter(isVodModelId);

function expectUserFacingImageModelDescription(description: string | undefined) {
  expect(description).toBeTruthy();
  expect(description).not.toMatch(/[高中低]价/);
  expect(description!.length).toBeLessThanOrEqual(15);
}

describe("image model catalog", () => {
  it("discovers image-generation models without exposing credentials", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: "gpt-image-2" },
        { id: "gpt-image-2-4k" },
        { id: "gemini-3.1-flash-image" },
        { id: "gemini-3.5-flash-preview" },
        { id: "jimeng-4.0" },
        { id: "mj-v7" },
        { id: "mj-v8.1" },
        { id: "og-image2-low" },
        { id: "og-image2-medium" },
        { id: "og-image2-high" },
        { id: "keling" },
        { id: "gpt-5.4-mini" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const catalog = await __testBuildImageModelCatalog({
      apiKey: "secret-image-key",
      baseUrl: "https://token.example.test/v1",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://token.example.test/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-image-key",
        }),
      })
    );
    /**
     * 2026-09-12 起目录 = **全部 VOD 直连模型**，中转站返回值一个都不采纳。
     *
     * 两个方向各自守住一半：
     * 1. vod-* 走腾讯云独立签名链路，永远不会出现在中转站 /models 里，
     *    若只取中转站返回值，/api/ai/models 会一个 image2.5 都没有 ——
     *    直接消费该接口的第三方 Agent 拿不到默认模型。
     * 2. 中转站仍在返回已下线的图片模型（那个接口不归我们控制），
     *    必须整体过滤，否则「下线」只是在前端做了个样子。
     */
    expect(catalog.image.map(model => model.id)).toEqual(
      sortImageModelIdsByPriority([...VOD_IMAGE_MODEL_IDS])
    );
    for (const id of VOD_IMAGE_MODEL_IDS) {
      expect(catalog.image.map(model => model.id)).toContain(id);
    }
    for (const id of RETIRED_RELAY_IMAGE_MODEL_IDS) {
      expect(
        catalog.image.map(model => model.id),
        `${id} 已下线却被中转站目录带回 /api/ai/models`
      ).not.toContain(id);
    }
    expect(catalog.image.map(model => model.label).slice(0, 4)).toEqual([
      "image2.5 medium",
      "image2.5 medium flare",
      "image2.5 low",
      "image2.5 low flare",
    ]);
    for (const [id, description] of Object.entries(expectedImageModelDescriptions)) {
      const model = catalog.image.find(model => model.id === id);
      expect(model?.description).toBe(description);
      expectUserFacingImageModelDescription(model?.description);
    }
    expect(catalog.image.find(model => model.id === "vod-og25-sunburst-high")).toMatchObject({
      description: "极致高清细节",
      icon: "openai",
    });
    expect(catalog.image.find(model => model.id === "vod-gem-lite")).toMatchObject({
      icon: "gemini",
    });
    expect(catalog.image.find(model => model.id === "vod-jimeng")).toMatchObject({
      icon: "jimeng",
    });
    expect(catalog.image.find(model => model.id === "vod-mj")).toMatchObject({
      icon: "midjourney",
    });
    expect(JSON.stringify(catalog)).not.toContain("secret-image-key");
    expect(JSON.stringify(catalog)).not.toContain("gpt-image-2");
    expect(JSON.stringify(catalog)).not.toContain("gemini-3.1-flash-image");
    expect(JSON.stringify(catalog)).not.toContain("gpt-5.4-mini");
  });

  /**
   * 第三方 Agent 调 /api/ai/models 时，约定「取第一项即默认模型」。
   * 这条断言把该契约锁死：目录首项必须恒等于 DEFAULT_IMAGE_MODEL_ID。
   */
  it("puts the site default model first so callers can read it off the catalog", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: RETIRED_RELAY_IMAGE_MODEL_IDS.map(id => ({ id })),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const catalog = await __testBuildImageModelCatalog({
      apiKey: "secret-image-key",
      baseUrl: "https://token.example.test/v1",
      fetchImpl,
    });

    expect(catalog.source).toBe("provider");
    expect(catalog.image[0]?.id).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(isVodModelId(catalog.image[0]!.id)).toBe(true);
    expect(catalog.image[0]?.label).toBe("image2.5 medium");
    // 默认模型必须有图标，否则选择器首项是空白方块。
    expect(catalog.image[0]?.icon).toBe("openai");
    expect(catalog.image[0]?.description).toBeTruthy();
  });

  /**
   * 中转站不可用（无 key）时走 fallback 分支 —— 它同样要能给出全部 VOD 模型，
   * 否则「中转站挂了就没法出图」，而实际上 VOD 是独立链路、完全不受影响。
   */
  it("keeps every VOD model available in the fallback catalog", async () => {
    const catalog = await __testBuildImageModelCatalog({
      apiKey: "",
      baseUrl: "https://token.example.test/v1",
      fetchImpl: vi.fn(async () => new Response("{}", { status: 200 })),
    });

    expect(catalog.source).toBe("fallback");
    expect(catalog.image[0]?.id).toBe(DEFAULT_IMAGE_MODEL_ID);
    for (const id of VOD_IMAGE_MODEL_IDS) {
      expect(catalog.image.map(model => model.id)).toContain(id);
    }
  });

  it("gives every image2.5 tier a user-facing label / description / icon", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: RETIRED_RELAY_IMAGE_MODEL_IDS.map(id => ({ id })),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const catalog = await __testBuildImageModelCatalog({
      apiKey: "secret-image-key",
      baseUrl: "https://token.example.test/v1",
      fetchImpl,
    });

    for (const id of VOD_IMAGE_MODEL_IDS.filter(modelId => modelId.startsWith("vod-og25-"))) {
      const model = catalog.image.find(item => item.id === id);
      expect(model, `${id} 应出现在目录里`).toBeTruthy();
      // label 不能回落成裸 id，否则用户在选择器里看到的是 "vod-og25-sunburst-medium"。
      expect(model!.label).not.toBe(id);
      expect(model!.label).toMatch(/^image2\.5 /);
      expect(model!.icon).toBe("openai");
      expectUserFacingImageModelDescription(model!.description);
    }
  });

  /**
   * 服务端目录的文案必须和前端 IMAGE_AI_MODELS 清单保持一致。
   *
   * 这两份表是分别维护的：前端有本地清单做兜底，所以即使服务端漏了文案，
   * UI 上也完全看不出来 —— 只有直接消费 /api/ai/models 的第三方会拿到
   * 裸 id（如 "vod-gem"）和默认的 "image" 图标。
   * 2026-09-11 就出现过这种漂移：8 个 VOD 模型在服务端一条文案都没有。
   */
  it("keeps server-side labels/icons in sync with the client model list", async () => {
    const { IMAGE_AI_MODELS } = await import("../client/src/lib/workspace-data");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: RETIRED_RELAY_IMAGE_MODEL_IDS.map(id => ({ id })),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const catalog = await __testBuildImageModelCatalog({
      apiKey: "secret-image-key",
      baseUrl: "https://token.example.test/v1",
      fetchImpl,
    });

    for (const model of catalog.image) {
      const clientOption = IMAGE_AI_MODELS.find(option => option.id === model.id);
      if (!clientOption) continue;
      expect(model.label, `${model.id} 的 label 与前端不一致`).toBe(clientOption.label);
      expect(model.icon, `${model.id} 的 icon 与前端不一致`).toBe(clientOption.icon);
      expect(model.description, `${model.id} 的 description 与前端不一致`).toBe(clientOption.description);
    }
  });
});
