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

  it("exposes MEITU as its own provider health entry", () => {
    expect(adminStoreSource).toContain('id: "ai_meitu"');
    expect(adminStoreSource).toContain('name: "MEITU"');
    // 美图凭据是**裸的** ACCESS_KEY / SECRET_KEY，没有 MEITU_ 前缀。
    // MEITU_* 那批只是网关地址、配方 ID、超时和蒙版参数，不是凭据。
    expect(adminStoreSource).toContain('envStatus(["ACCESS_KEY", "SECRET_KEY"], "all")');
    // 只禁止把 MEITU_API_KEY 当**凭据**去探测（注释里提到这个词是允许的）。
    expect(adminStoreSource).not.toMatch(/envStatus\(\[[^\]]*MEITU_API_KEY/);
  });

  it("tracks MEITU in the production readiness checklist", () => {
    expect(adminStoreSource).toContain('id: "ai_meitu", domain: "美图开放平台"');
    expect(adminStoreSource).toContain('requiredKeys: ["ACCESS_KEY", "SECRET_KEY"]');
  });

  it("keeps the MEITU provider name aligned with what the edit route writes", () => {
    // /api/images/edit 在 provider=meitu 时写入 "MEITU"，
    // 必须与健康度条目的 name 字面一致，否则成本分组对不上号。
    const healthName = adminStoreSource.match(/id: "ai_meitu", name: "([^"]+)"/)?.[1];
    expect(healthName).toBe("MEITU");
    expect(indexSource).toContain('provider: isMeituEdit ? "MEITU" : getRouteImageProvider(req.body)');
  });

  it("resolves the image provider label from the model instead of hardcoding AI_IMAGE", () => {
    expect(indexSource).toContain("function resolveImageProviderLabel");
    expect(indexSource).toContain("function getRouteImageProvider");
    expect(indexSource).toContain('const IMAGE_PROVIDER_TENCENT_VOD = "腾讯云 VOD"');
    // ⚠️ 中转站的厂商名是 "BKEEL"（健康度条目 ai_bkeel 的 name），
    // 不是 "AI_IMAGE"——那是环境变量前缀 AI_IMAGE_*，不是厂商名。
    // 写错会让所有走中转站的图片任务在成本分组里变成无归属孤儿。
    expect(indexSource).toContain('const IMAGE_PROVIDER_RELAY = "BKEEL"');

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
    // "AI_IMAGE" 是环境变量前缀，不是厂商名，任何路由都不该再写死它。
    // OCR 走中转站视觉模型，现在统一引用 IMAGE_PROVIDER_RELAY 常量。
    expect(indexSource).not.toMatch(/provider: "AI_IMAGE"/);
    expect(indexSource).toContain("provider: IMAGE_PROVIDER_RELAY");
  });

  it("keeps the relay provider name aligned with the health dashboard entry", () => {
    // 与 VOD 同理：路由写入的名字必须能在健康度列表里找到，
    // 否则「有数据没归属」，而且不会报错。
    const healthName = adminStoreSource.match(/id: "ai_bkeel", name: "([^"]+)"/)?.[1];
    const routeName = indexSource.match(/const IMAGE_PROVIDER_RELAY = "([^"]+)"/)?.[1];
    expect(healthName).toBeTruthy();
    expect(routeName).toBe(healthName);
  });
});
