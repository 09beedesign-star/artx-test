import { describe, expect, it } from "vitest";
import {
  HUNYUAN3D_POLL_TIMEOUT_MS,
  buildHunyuan3DPayload,
  pickHunyuan3DGlb,
} from "./tencent-vod-aigc";
import { resolvePublicReferenceImageUrl } from "./threed-generation";
import {
  AI_THREED_MODEL_CREDIT_POLICIES,
  HUNYUAN3D_COST_PER_GENERATION_CNY,
  quoteAiUsage,
} from "../shared/ai-credit-policy";
import { THREED_GEN_MODEL_IDS } from "../shared/model3d";

/**
 * 混元生 3D（腾讯云 VOD CreateAigcHunyuan3DTask）接入锁。
 * 字段形状以官方 SDK + 2026-11-17 生产真实调用为准，改之前先读 tencent-vod-aigc.ts 3D 段注释。
 */
describe("buildHunyuan3DPayload", () => {
  it("纯文字：只发 Prompt，不发 ImageInfos；临时存储；Normal 不显式传", () => {
    const p = buildHunyuan3DPayload(123, { prompt: " 小黄鸭 ", generateType: "Normal" });
    expect(p).toEqual({ SubAppId: 123, Prompt: "小黄鸭", OutputConfig: { StorageMode: "Temporary" } });
  });

  it("有参考图：走 ImageInfos(Type=Url)，与 Prompt 互斥", () => {
    const p = buildHunyuan3DPayload(1, { prompt: "鸭子", imageUrl: "https://a.com/x.png" });
    expect(p.ImageInfos).toEqual([{ Type: "Url", Url: "https://a.com/x.png" }]);
    expect(p.Prompt).toBeUndefined();
  });

  it("非 http(s) 图（data:/相对路径）不进 ImageInfos，退回文字", () => {
    const p = buildHunyuan3DPayload(1, { prompt: "鸭子", imageUrl: "data:image/png;base64,xx" });
    expect(p.ImageInfos).toBeUndefined();
    expect(p.Prompt).toBe("鸭子");
  });

  it("EnablePBR 是字符串、FaceCount 夹到 3000–1500000、不传 ResultFormat", () => {
    const p = buildHunyuan3DPayload(1, { prompt: "x", enablePbr: true, faceCount: 10, generateType: "Geometry" });
    expect(p.EnablePBR).toBe("Enabled");
    expect(p.FaceCount).toBe(3000);
    expect(p.GenerateType).toBe("Geometry");
    expect(p).not.toHaveProperty("ResultFormat");
  });

  it("没描述也没图 → 报错而不是发空请求", () => {
    expect(() => buildHunyuan3DPayload(1, { prompt: "  " })).toThrow();
  });
});

describe("pickHunyuan3DGlb", () => {
  it("按 FileType 挑 GLB，不取 [0]（生产实录顺序 OBJ 在前）", () => {
    expect(
      pickHunyuan3DGlb([
        { FileType: "OBJ", FileUrl: "https://s/a.obj" },
        { FileType: "GLB", FileUrl: "https://s/aigcHunyuan3DGenFile_0.glb" },
      ])
    ).toBe("https://s/aigcHunyuan3DGenFile_0.glb");
  });
  it("FileType 缺失时按扩展名兜底；都没有返回 undefined", () => {
    expect(pickHunyuan3DGlb([{ FileUrl: "https://s/x.glb?sign=1" }])).toBe("https://s/x.glb?sign=1");
    expect(pickHunyuan3DGlb([{ FileType: "OBJ", FileUrl: "https://s/a.obj" }])).toBeUndefined();
    expect(pickHunyuan3DGlb(undefined)).toBeUndefined();
  });
});

describe("resolvePublicReferenceImageUrl（画布参考图 → 腾讯能拉的公网地址）", () => {
  const base = "https://backstage.artxsd.com";
  it("站内相对路径拼公网域名", () => {
    expect(resolvePublicReferenceImageUrl("/uploads/images/a@b.com/x.png", base)).toBe(
      "https://backstage.artxsd.com/uploads/images/a@b.com/x.png"
    );
  });
  it("公网绝对地址原样保留", () => {
    expect(resolvePublicReferenceImageUrl("https://cdn.x.com/a.png", base)).toBe("https://cdn.x.com/a.png");
  });
  it("data:/blob:/本机/协议相对 一律丢弃（退回文字生成）", () => {
    for (const v of ["data:image/png;base64,xx", "blob:https://x/1", "http://localhost:3000/a.png", "http://127.0.0.1/a.png", "//x.com/a.png", ""]) {
      expect(resolvePublicReferenceImageUrl(v, base), v).toBeUndefined();
    }
  });
  it("没有 https 公网域名配置时，相对路径不拼（本地 dev）", () => {
    expect(resolvePublicReferenceImageUrl("/uploads/a.png", "")).toBeUndefined();
  });
});

describe("3D 计费：真实上游成本下守住毛利红线", () => {
  it("所有 3D id（含已隐藏的旧 id）都有定价且与混元同价——旧 id 后端也走混元", () => {
    const credits = new Set(AI_THREED_MODEL_CREDIT_POLICIES.map(p => p.creditsPerGeneration));
    expect(credits.size).toBe(1);
    for (const id of THREED_GEN_MODEL_IDS) {
      expect(AI_THREED_MODEL_CREDIT_POLICIES.some(p => p.model === id), id).toBe(true);
    }
  });

  it("成本按混元 Normal 上限 ¥3.0 计，最坏充值档 331 积分/元毛利 > 55%", () => {
    expect(HUNYUAN3D_COST_PER_GENERATION_CNY).toBeGreaterThanOrEqual(3);
    const WORST_RATE = 331;
    for (const model of [...THREED_GEN_MODEL_IDS, "unknown-3d"]) {
      const q = quoteAiUsage({ capability: "text_to_3d", model });
      const revenue = q.chargedCredits / WORST_RATE;
      expect((revenue - q.estimatedCost) / revenue, model).toBeGreaterThan(0.55);
    }
  });

  it("后端等待上限短于前端轮询上限（160×3s=8min）", () => {
    expect(HUNYUAN3D_POLL_TIMEOUT_MS).toBeLessThan(160 * 3000);
  });
});
