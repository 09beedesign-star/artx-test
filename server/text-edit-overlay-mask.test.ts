import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildTextEditOverlayMask } from "./text-replace-precise";

const IMAGE_GENERATION_PATH = path.resolve(
  import.meta.dirname,
  "image-generation.ts",
);

function readSourceWithoutComments() {
  const raw = fs.readFileSync(IMAGE_GENERATION_PATH, "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const W = 1000;
const H = 500;

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

const region = (
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
): Region => ({ x, y, width, height, text });

/** 读 PNG，找透明区（alpha < 128）的 bbox 与透明像素计数。 */
async function transparentBBox(png: Buffer) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 128) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX >= minX ? maxX - minX + 1 : 0,
    height: maxY >= minY ? maxY - minY + 1 : 0,
    count,
  };
}

describe("buildTextEditOverlayMask", () => {
  it("减字时洞宽按「新字数/原字数」收窄（7字→5字）", async () => {
    const mask = await buildTextEditOverlayMask(
      [region(0.2, 0.2, 0.6, 0.2, "大吉大利和平年")],
      "欢乐中国年",
      W,
      H,
    );
    expect(mask).not.toBeNull();
    const box = await transparentBBox(mask!);
    // 原洞宽 = 0.6*1000 + 2*paddingX(12) ≈ 624；收窄后 ≈ 455。
    expect(box.width).toBeLessThan(500);
    expect(box.width).toBeGreaterThan(380);
    // 收窄只动宽度，不动高度（保持原字高）
    expect(box.height).toBeGreaterThan(90);
  });

  it("加字时保持原宽不收窄（7字→8字）", async () => {
    const mask = await buildTextEditOverlayMask(
      [region(0.2, 0.2, 0.6, 0.2, "大吉大利和平年")],
      "新年快乐万事如意",
      W,
      H,
    );
    expect(mask).not.toBeNull();
    const box = await transparentBBox(mask!);
    // 原洞宽 = 0.6*1000 + 2*paddingX(12) ≈ 624
    expect(box.width).toBeGreaterThan(600);
    expect(box.width).toBeLessThan(660);
  });

  it("等字数改内容时保持原宽（7字→7字）", async () => {
    const mask = await buildTextEditOverlayMask(
      [region(0.2, 0.2, 0.6, 0.2, "大吉大利和平年")],
      "新年快乐合家欢",
      W,
      H,
    );
    expect(mask).not.toBeNull();
    const box = await transparentBBox(mask!);
    expect(box.width).toBeGreaterThan(600);
    expect(box.width).toBeLessThan(660);
  });

  it("没有任何改动时返回 null（回退原蒙版）", async () => {
    const mask = await buildTextEditOverlayMask(
      [region(0.2, 0.2, 0.6, 0.2, "大吉大利和平年")],
      "大吉大利和平年",
      W,
      H,
    );
    expect(mask).toBeNull();
  });

  it("删除整行（目标文案为空）时返回 null", async () => {
    const mask = await buildTextEditOverlayMask(
      [region(0.2, 0.2, 0.6, 0.2, "大吉大利和平年")],
      "",
      W,
      H,
    );
    expect(mask).toBeNull();
  });

  it("多区域时只收窄被改的那一行，未改行不挖洞", async () => {
    // 第一行「很长标题」改成「短」（1字），第二行「副标题」未改。
    const mask = await buildTextEditOverlayMask(
      [
        region(0.1, 0.2, 0.35, 0.18, "很长标题"),
        region(0.55, 0.2, 0.35, 0.18, "副标题"),
      ],
      "短\n副标题",
      W,
      H,
    );
    expect(mask).not.toBeNull();
    const box = await transparentBBox(mask!);
    // region1（x 0.1~0.45）被改并收窄（1字/4字→clamp 0.55），洞从它左缘附近开始
    expect(box.minX).toBeGreaterThan(80);
    expect(box.minX).toBeLessThan(250);
    // region2（x 0.55~0.9）未改 → 不挖洞，透明区不应延伸到 550 起的位置
    expect(box.maxX).toBeLessThan(500);
  });

  it("蒙版语义正确：编辑区透明、保留区不透明，全图 alpha 只有 0 与 255", async () => {
    const mask = await buildTextEditOverlayMask(
      [region(0.2, 0.2, 0.6, 0.2, "大吉大利和平年")],
      "欢乐中国年",
      W,
      H,
    );
    expect(mask).not.toBeNull();
    const { data } = await sharp(mask!)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphas = new Set<number>();
    for (let i = 0; i < W * H; i++) {
      alphas.add(data[i * 4 + 3]);
    }
    expect(alphas).toEqual(new Set([0, 255]));
  });
});

describe("叠字蒙版收窄的接线（防「只改一个出口 / 误改擦字」）", () => {
  it("image-generation.ts 确实调用了收窄函数并持有收窄蒙版变量", () => {
    const source = readSourceWithoutComments();
    expect(source).toContain("buildTextEditOverlayMask(");
    expect(source).toContain("textEditOverlayMaskSource");
  });

  it("收窄结果必须回填到叠字蒙版变量（否则收窄等于没接上）", () => {
    /**
     * ⚠️ 守的是「调用了但结果没生效」这条最阴险的静默失效：
     * buildTextEditOverlayMask 被调用、甚至生成了 overlay，但若没有
     * `textEditOverlayMaskSource = { buffer: overlay, ... }` 这句回填，
     * 叠字下发用的仍是原蒙版，收窄形同虚设且零报错。
     * M3 变异（删掉回填）必须让这条变红。
     */
    const source = readSourceWithoutComments();
    expect(source).toContain("textEditOverlayMaskSource = { buffer: overlay");
  });

  it("擦字合成蒙版仍是膨胀蒙版，收窄只作用于叠字下发", () => {
    /**
     * ⚠️ 关键约束：擦字必须用原宽膨胀蒙版（擦净原字两端），叠字才用收窄蒙版。
     * 两阶段共用一张蒙版时，收窄必然漏擦原字。若将来有人把 compositeMask
     * 也换成 textEditOverlayMaskSource，擦字会漏擦 —— 这条会红。
     */
    const source = readSourceWithoutComments();
    expect(source).toContain(
      "const compositeMask = textEditDilatedMaskBuffer || maskImageData",
    );
    expect(source).toContain("let textEditOverlayMaskSource = textEditMaskSource");
  });

  it("收窄蒙版生成失败时必须回退原蒙版，不能静默中断叠字", () => {
    const source = readSourceWithoutComments();
    // 初始值 = 原蒙版，生成失败时 catch 不改它，叠字照常用原蒙版
    expect(source).toContain("let textEditOverlayMaskSource = textEditMaskSource");
    // 失败路径有日志可归因，不是静默失败
    expect(source).toContain("回退原蒙版");
  });
});
