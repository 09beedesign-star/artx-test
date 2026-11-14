/**
 * 🔒 2026-11-14 用户要求：右键图片节点显示真实属性，来源分
 * 「AI 生成 / 本地上传 / 网页加载」三种，按真实属性显示、不猜。
 */
import { describe, expect, it } from "vitest";
import {
  resolveAssetProperties,
  resolveAssetSource,
  timestampFromNodeId,
} from "@/lib/asset-node-properties";

describe("图片来源判定", () => {
  it("新节点按显式 assetSource 判定", () => {
    expect(resolveAssetSource({ assetSource: "ai" })).toBe("ai");
    expect(resolveAssetSource({ assetSource: "upload" })).toBe("upload");
    expect(resolveAssetSource({ assetSource: "web" })).toBe("web");
  });

  it("旧 AI 生成节点按 generationId / assetType 判定", () => {
    expect(resolveAssetSource({ generationId: "gen-1730000000000", assetType: "AI 生成" })).toBe("ai");
    expect(resolveAssetSource({ assetType: "AI 生成" })).toBe("ai");
  });

  it("旧网页图按 sourceUrl 判定，且优先于本地上传 id 前缀", () => {
    expect(resolveAssetSource({ sourceUrl: "https://example.com/a.png", id: "clipboard-image-1730000000000-0" })).toBe("web");
    expect(resolveAssetSource({ id: "external-image-1730000000000-0" })).toBe("web");
  });

  it("本地上传按真实 id 前缀判定；判不出就是未记录", () => {
    expect(resolveAssetSource({ id: "upload-1730000000000-0" })).toBe("upload");
    expect(resolveAssetSource({ id: "local-1730000000000-0" })).toBe("upload");
    expect(resolveAssetSource({ id: "mystery-node", title: "x" })).toBe("unknown");
  });
});

describe("属性读数", () => {
  it("分辨率取原始像素，不把画布显示尺寸冒充分辨率", () => {
    const data = { assetSource: "upload", imgW: 240, imgH: 180, naturalWidth: 2048, naturalHeight: 1536 };
    const p = resolveAssetProperties(data);
    expect(p.resolution).toBe("2048 × 1536 px");
    expect(p.exactResolution).toBe(true);
    const fallback = resolveAssetProperties({ assetSource: "upload", imgW: 240, imgH: 180 });
    expect(fallback.resolution).toContain("画布显示尺寸");
    expect(fallback.exactResolution).toBe(false);
  });

  it("弹窗异步读到的 naturalWidth 覆盖节点旧值", () => {
    const p = resolveAssetProperties({ naturalWidth: 1, naturalHeight: 1 }, { naturalWidth: 800, naturalHeight: 600 });
    expect(p.resolution).toBe("800 × 600 px");
  });

  it("格式从文件名 / data URL 推断，时间从 id 时间戳读取", () => {
    const p = resolveAssetProperties({
      assetSource: "upload",
      assetCreatedAt: new Date(2026, 10, 14, 9, 30).getTime(),
      fileName: "海报.webp",
      localSrc: "data:image/webp;base64,AAAA",
      imgW: 100,
      imgH: 100,
    });
    expect(p.format).toBe("WEBP");
    expect(p.createdAt).toContain("2026-11-14 09:30");
    expect(p.sourceLabel).toBe("本地上传");
  });

  it("时间戳只认 13 位合理年份，随机数字不算", () => {
    expect(timestampFromNodeId("upload-1730000000000-0")).toBe(1730000000000);
    expect(timestampFromNodeId("node-12345")).toBeNull();
    expect(timestampFromNodeId("x-9999999999999-x")).toBeNull();
  });

  it("三种来源的中文标签齐全", () => {
    expect(resolveAssetProperties({ assetSource: "ai" }).sourceLabel).toBe("AI 生成");
    expect(resolveAssetProperties({ assetSource: "upload" }).sourceLabel).toBe("本地上传");
    expect(resolveAssetProperties({ assetSource: "web" }).sourceLabel).toBe("网页加载");
    expect(resolveAssetProperties({}).sourceLabel).toBe("未记录");
  });
});
