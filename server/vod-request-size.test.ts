import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  __testShrinkFileInfosToLimit,
  __testVodRequestLimits,
} from "./tencent-vod-aigc";

/**
 * VOD 请求体有 10MB 硬上限（`RequestSizeLimitExceeded`）。
 * 2048×1152 原图 + 蒙版以 base64 塞进 FileInfos 实测 19.8MB，必然被拒。
 *
 * 这些用例锁住三件事，它们失效时都**不会报错**，只会在上游被拒：
 * 1. 小载荷必须原样返回（不能无谓重编码，否则白白损失画质）
 * 2. 大载荷必须被压到目标以内
 * 3. 蒙版与原图必须缩到**同一尺寸**，否则编辑区整体错位
 */

/** 噪声图几乎不可压缩，用它稳定构造「超限」载荷，避免依赖具体编码器版本。 */
async function noiseJpegBase64(size: number): Promise<string> {
  const buf = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      noise: { type: "gaussian", mean: 128, sigma: 70 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
  return buf.toString("base64");
}

/** 蒙版：RGBA，中间一条横带 alpha=0 表示编辑区。 */
async function maskPngBase64(size: number): Promise<string> {
  const raw = Buffer.alloc(size * size * 4, 255);
  for (let y = Math.round(size * 0.4); y < Math.round(size * 0.6); y++) {
    for (let x = 0; x < size; x++) raw[(y * size + x) * 4 + 3] = 0;
  }
  const buf = await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

async function dimsOf(base64: string) {
  const meta = await sharp(Buffer.from(base64, "base64")).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/**
 * 构造「原图 + 蒙版」且**确保真的超限**的载荷。
 *
 * ⚠️ 踩过的坑：蒙版是大面积纯色，PNG 压缩率极高（2000² 只有几十 KB），
 * 所以「大原图 + 蒙版」的合计体积远小于「两张大原图」。
 * 若夹具没越过目标线，降采样会正确地原样返回 —— 此时断言「尺寸变小了」会红，
 * 而断言「蒙版仍是二值」会**恒绿**（根本没缩过，等于没测）。
 * 因此这里补一张噪声陪衬图把总量顶过目标线，并显式断言前置条件。
 */
async function makeOversizedImagePlusMask(size: number) {
  const noise = await noiseJpegBase64(size);
  const list = [
    { Base64: noise, Category: "Image" as const },
    {
      Base64: await maskPngBase64(size),
      Category: "Image" as const,
      ReferenceType: "mask",
    },
    // 陪衬图：只为把总量顶过上限，保证降采样一定被触发
    { Base64: noise, Category: "Image" as const },
  ];
  const before = list.reduce((s, f) => s + (f.Base64?.length ?? 0), 0);
  expect(before).toBeGreaterThan(__testVodRequestLimits.targetBytes);
  return list;
}

describe("VOD 请求体降采样收口", () => {
  it("未超限时原样返回同一份引用，不做任何重编码", async () => {
    const small = await noiseJpegBase64(64);
    const list = [{ Base64: small, Category: "Image" as const }];
    const out = await __testShrinkFileInfosToLimit(list);
    // 同一引用 ⇒ 证明它真的走了 early return，而不是"恰好压出一样的结果"
    expect(out).toBe(list);
    expect(out[0].Base64).toBe(small);
  });

  it("超限载荷被压到目标以内", async () => {
    const big = await noiseJpegBase64(2200);
    const list = [
      { Base64: big, Category: "Image" as const },
      { Base64: big, Category: "Image" as const },
    ];
    const before = list.reduce((s, f) => s + f.Base64.length, 0);
    expect(before).toBeGreaterThan(__testVodRequestLimits.targetBytes);

    const out = await __testShrinkFileInfosToLimit(list);
    const after = out.reduce((s, f) => s + (f.Base64?.length ?? 0), 0);
    expect(after).toBeLessThanOrEqual(__testVodRequestLimits.targetBytes);
    expect(after).toBeLessThan(__testVodRequestLimits.maxBytes);
  }, 180000);

  it("蒙版与原图被缩到同一尺寸（错位会零报错地毁掉编辑区）", async () => {
    /**
     * ⚠️ 2026-09-23 夹具校正：原为 SIZE=2000，两张图合计约 7MB，
     * **没越过 8.5MB 的压缩目标**，于是 shrink 直接原样返回 ——
     * 末尾「确实缩过」的断言必然失败。这是夹具没满足被测前提，不是实现有错。
     * 📌⭐⭐ 判据：测降采样的夹具必须先确认自己真的超限，
     *    否则测的是「不需要压缩时不压缩」，与用例名完全相反。
     */
    const SIZE = 4000;
    const list = [
      { Base64: await noiseJpegBase64(SIZE), Category: "Image" as const },
      {
        Base64: await maskPngBase64(SIZE),
        Category: "Image" as const,
        ReferenceType: "mask",
      },
    ];
    const out = await __testShrinkFileInfosToLimit(list);

    const img = await dimsOf(out[0].Base64!);
    const mask = await dimsOf(out[1].Base64!);
    expect(img.width).toBe(mask.width);
    expect(img.height).toBe(mask.height);
    // 确实缩过，而不是两者都没动
    expect(img.width).toBeLessThan(SIZE);
  }, 180000);

  it("蒙版缩放后仍是二值 alpha，不会被插值糊成中间值", async () => {
    const SIZE = 2000;
    const list = [
      { Base64: await noiseJpegBase64(SIZE), Category: "Image" as const },
      {
        Base64: await maskPngBase64(SIZE),
        Category: "Image" as const,
        ReferenceType: "mask",
      },
    ];
    const out = await __testShrinkFileInfosToLimit(list);

    const { data, info } = await sharp(Buffer.from(out[1].Base64!, "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let mid = 0;
    for (let p = 0; p < info.width * info.height; p++) {
      const a = data[p * info.channels + 3];
      if (a > 16 && a < 239) mid++;
    }
    // 最近邻缩放不应产生成片的半透明像素
    expect(mid / (info.width * info.height)).toBeLessThan(0.01);
  }, 180000);

  it("没有 Base64 的条目（走 Url/FileId）原样保留", async () => {
    const big = await noiseJpegBase64(2200);
    const list = [
      { Base64: big, Category: "Image" as const },
      { Base64: big, Category: "Image" as const },
      { Url: "https://example.com/a.png", Category: "Image" as const },
    ];
    const out = await __testShrinkFileInfosToLimit(list);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ Url: "https://example.com/a.png", Category: "Image" });
  }, 180000);
});
