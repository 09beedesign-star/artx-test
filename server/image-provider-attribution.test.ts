import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { IMAGE_MODEL_PRIORITY_IDS, isVodModelId } from "../shared/image-models";

/**
 * 后台「第三方接口 / AI 成本」按 provider 字符串分组。
 * 图片生成有两条上游链路（腾讯云 VOD 直连 / 中转站 AI_IMAGE），
 * 曾经全部硬编码成 "AI_IMAGE"，导致后台完全看不到腾讯云 VOD 的真实用量。
 * 这组测试锁住「按模型归属判定 provider」这个行为。
 */
describe("image provider attribution", () => {
  const indexSource = readFileSync(resolve(__dirname, "index.ts"), "utf-8");
  const adminStoreSource = readFileSync(resolve(__dirname, "admin-store.ts"), "utf-8");

  it("exposes 腾讯云 VOD as its own provider health entry", () => {
    expect(adminStoreSource).toContain('id: "ai_tencent_vod"');
    expect(adminStoreSource).toContain('name: "腾讯云 VOD"');
    expect(adminStoreSource).toContain(
      'envStatus(["TENCENT_VOD_SID", "TENCENT_VOD_SKEY", "TENCENT_VOD_SUB_APP_ID"], "all")'
    );
  });

  it("tracks 腾讯云 VOD in the production readiness checklist", () => {
    expect(adminStoreSource).toContain('id: "ai_tencent_vod", domain: "腾讯云 VOD 图片生成"');
    expect(adminStoreSource).toContain(
      'requiredKeys: ["TENCENT_VOD_SID", "TENCENT_VOD_SKEY", "TENCENT_VOD_SUB_APP_ID"]'
    );
  });

  it("resolves the image provider label from the model instead of hardcoding AI_IMAGE", () => {
    expect(indexSource).toContain("function resolveImageProviderLabel");
    expect(indexSource).toContain("function getRouteImageProvider");
    expect(indexSource).toContain('const IMAGE_PROVIDER_TENCENT_VOD = "腾讯云 VOD"');
    expect(indexSource).toContain('const IMAGE_PROVIDER_RELAY = "AI_IMAGE"');

    // 所有图片生成/编辑/文字替换路由都必须走动态归属。
    expect(indexSource).toContain("provider: getRouteImageProvider(req.body)");
    expect(indexSource).toContain("provider: getRouteImageProvider(input)");
    expect(indexSource).toContain(
      'provider: isMeituEdit ? "MEITU" : getRouteImageProvider(req.body)'
    );
  });

  it("keeps the provider name aligned between the route and the health dashboard", () => {
    // 两处字符串必须字面一致，否则健康度列表与成本分组对不上号。
    const healthName = adminStoreSource.match(/id: "ai_tencent_vod", name: "([^"]+)"/)?.[1];
    const routeName = indexSource.match(/const IMAGE_PROVIDER_TENCENT_VOD = "([^"]+)"/)?.[1];
    expect(healthName).toBeTruthy();
    expect(routeName).toBe(healthName);
  });

  it("still has a pure-VOD auto fallback chain, which the auto branch relies on", () => {
    // resolveImageProviderLabel 的 auto 分支断言「兜底链全是 VOD」。
    // 一旦重新混入中转站模型，这条测试会先失败，提醒同步修改归属逻辑。
    expect(IMAGE_MODEL_PRIORITY_IDS.every(isVodModelId)).toBe(true);
  });

  it("does not leave image generation routes on the hardcoded AI_IMAGE string", () => {
    // OCR 走 vision-chat 模型、走中转站，保留 AI_IMAGE 是正确的；
    // 除它之外不应再有硬编码。
    const hardcoded = indexSource.match(/provider: "AI_IMAGE"/g) || [];
    expect(hardcoded.length).toBe(1);
  });
});
