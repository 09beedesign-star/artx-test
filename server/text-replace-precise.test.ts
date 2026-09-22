import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  drawTextReplacement,
  dilateMaskTransparent,
  createModifiedRegionsMask,
  verifyDrawnTextQuality,
  eraseTextRegionsLocally,
  calibrateTextRegions,
  resolveRegionTargetTexts,
} from "./text-replace-precise";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Item = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  weight?: number;
  align?: "left" | "center" | "right";
};

/** 生成「原图（带文字）」与「擦字图（仅背景）」 */
async function makeFixture(
  width: number,
  height: number,
  background: string,
  color: string,
  items: Item[],
) {
  const texts = items
    .map(item => {
      const anchor =
        item.align === "left" ? "start" : item.align === "right" ? "end" : "middle";
      const anchorX =
        item.align === "left"
          ? item.x
          : item.align === "right"
            ? item.x + item.w
            : item.x + item.w / 2;
      return (
        `<text x="${anchorX}" y="${item.y + item.h / 2}" font-family="PingFang SC" ` +
        `font-size="${item.size}" font-weight="${item.weight ?? 400}" fill="${color}" ` +
        `text-anchor="${anchor}" dominant-baseline="central">${escapeXml(item.text)}</text>`
      );
    })
    .join("");
  const svg = (body: string) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${background}${body}</svg>`,
      "utf8",
    );
  return {
    original: await sharp(svg(texts)).png().toBuffer(),
    cleaned: await sharp(svg("")).png().toBuffer(),
  };
}

/** 统计区域内与擦字图不同的像素包围盒 */
async function inkBox(
  drawn: Buffer,
  cleaned: Buffer,
  region: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  const crop = {
    left: Math.round(region.x * width),
    top: Math.round(region.y * height),
    width: Math.round(region.width * width),
    height: Math.round(region.height * height),
  };
  const a = await sharp(drawn).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(cleaned).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = a.info.channels;
  let minX = crop.width;
  let maxX = -1;
  let minY = crop.height;
  let maxY = -1;
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const i = (y * crop.width + x) * ch;
      const diff =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (diff > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY, width: crop.width, height: crop.height };
}

describe("drawTextReplacement 确定性文字回填", () => {
  it("回填后的字形高度贴近原文，不再因经验字号偏大而溢出", async () => {
    const width = 900;
    const height = 400;
    const item: Item = { text: "轻量高效的解决方案", x: 80, y: 190, w: 640, h: 50, size: 32, align: "left" };
    const { original, cleaned } = await makeFixture(
      width, height, `<rect width="900" height="400" fill="#f5f2ea"/>`, "#2b2b2b", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: "全新智能方案",
    };

    const drawn = await drawTextReplacement({
      imageBuffer: cleaned, originalBuffer: original, textRegions: [region],
      editedText: "全新智能方案", targetWidth: width, targetHeight: height,
    });

    const reference = await inkBox(original, cleaned, region, width, height);
    const result = await inkBox(drawn, cleaned, region, width, height);
    expect(reference).not.toBeNull();
    expect(result).not.toBeNull();

    const refHeight = reference!.maxY - reference!.minY + 1;
    const outHeight = result!.maxY - result!.minY + 1;
    // 字形高度与原文相差不超过 25%
    expect(Math.abs(outHeight - refHeight) / refHeight).toBeLessThan(0.25);
    // 不得溢出区域
    expect(result!.minY).toBeGreaterThanOrEqual(0);
    expect(result!.maxY).toBeLessThan(result!.height);
  });

  it("保持原文的左对齐版式，而不是一律居中", async () => {
    const width = 900;
    const height = 400;
    const item: Item = { text: "产品介绍说明", x: 80, y: 180, w: 700, h: 60, size: 36, align: "left" };
    const { original, cleaned } = await makeFixture(
      width, height, `<rect width="900" height="400" fill="#ffffff"/>`, "#222222", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: "全新说明",
    };

    const drawn = await drawTextReplacement({
      imageBuffer: cleaned, originalBuffer: original, textRegions: [region],
      editedText: "全新说明", targetWidth: width, targetHeight: height,
    });
    const result = await inkBox(drawn, cleaned, region, width, height);
    expect(result).not.toBeNull();
    // 左对齐：左侧留白应远小于右侧
    expect(result!.minX).toBeLessThan(result!.width - 1 - result!.maxX);
    expect(result!.minX).toBeLessThan(result!.width * 0.1);
  });

  it("未被修改的区域不重绘，返回原始底图", async () => {
    const width = 400;
    const height = 200;
    const item: Item = { text: "保持不变", x: 50, y: 70, w: 300, h: 60, size: 32 };
    const { original, cleaned } = await makeFixture(
      width, height, `<rect width="400" height="200" fill="#eeeeee"/>`, "#333333", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: item.text,
    };
    const drawn = await drawTextReplacement({
      imageBuffer: cleaned, originalBuffer: original, textRegions: [region],
      editedText: item.text, targetWidth: width, targetHeight: height,
    });
    expect(drawn).toBe(cleaned);
  });

  it("不污染目标区域之外的像素", async () => {
    const width = 600;
    const height = 300;
    const item: Item = { text: "标题文字", x: 100, y: 110, w: 400, h: 60, size: 40 };
    const { original, cleaned } = await makeFixture(
      width, height, `<rect width="600" height="300" fill="#101820"/>`, "#ffffff", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: "全新标题",
    };
    const drawn = await drawTextReplacement({
      imageBuffer: cleaned, originalBuffer: original, textRegions: [region],
      editedText: "全新标题", targetWidth: width, targetHeight: height,
    });

    const a = await sharp(drawn).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(cleaned).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = a.info.channels;
    const x0 = Math.round(region.x * width);
    const y0 = Math.round(region.y * height);
    const x1 = x0 + Math.round(region.width * width);
    const y1 = y0 + Math.round(region.height * height);
    let outside = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
        const i = (y * width + x) * ch;
        if (
          Math.abs(a.data[i] - b.data[i]) +
            Math.abs(a.data[i + 1] - b.data[i + 1]) +
            Math.abs(a.data[i + 2] - b.data[i + 2]) >
          30
        ) {
          outside++;
        }
      }
    }
    expect(outside).toBe(0);
  });

});

describe("dilateMaskTransparent 蒙版膨胀", () => {
  it("按 radius + extraX 正确扩展透明区域，且复杂度与半径无关", async () => {
    const width = 400;
    const height = 200;
    const raw = Buffer.alloc(width * height * 4, 255);
    for (let y = 90; y < 110; y++) {
      for (let x = 150; x < 250; x++) {
        const i = (y * width + x) * 4;
        raw[i] = 0; raw[i + 1] = 0; raw[i + 2] = 0; raw[i + 3] = 0;
      }
    }
    const mask = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();

    const started = Date.now();
    const out = await dilateMaskTransparent(mask, width, height, 6, 0, 10, 0);
    const elapsed = Date.now() - started;

    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = width;
    let maxX = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    // 水平扩展 = radius(6) + extraX(10) = 16
    expect(150 - minX).toBe(16);
    expect(maxX - 249).toBe(16);
    // 可分离实现应当很快（旧的 O(n*r^2) 实现在此规模已明显变慢）
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("verifyDrawnTextQuality 质量兜底", () => {
  it("文字正常绘制时通过校验", async () => {
    const width = 600;
    const height = 200;
    const item: Item = { text: "原始文案", x: 100, y: 70, w: 400, h: 60, size: 36 };
    const { original, cleaned } = await makeFixture(
      width, height, `<rect width="600" height="200" fill="#ffffff"/>`, "#000000", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: "新的文案",
    };
    const drawn = await drawTextReplacement({
      imageBuffer: cleaned, originalBuffer: original, textRegions: [region],
      editedText: "新的文案", targetWidth: width, targetHeight: height,
    });
    const result = await verifyDrawnTextQuality(
      cleaned, drawn, [region], "新的文案", width, height,
    );
    expect(result.ok).toBe(true);
  });

  it("区域内没画出任何文字时判定失败，触发降级", async () => {
    const width = 600;
    const height = 200;
    const { cleaned } = await makeFixture(
      width, height, `<rect width="600" height="200" fill="#ffffff"/>`, "#000000",
      [{ text: "原始文案", x: 100, y: 70, w: 400, h: 60, size: 36 }],
    );
    const region = {
      x: 100 / width, y: 70 / height, width: 400 / width, height: 60 / height,
      text: "原始文案", targetText: "新的文案",
    };
    // 传入未改动的底图，模拟「绘制失败」
    const result = await verifyDrawnTextQuality(
      cleaned, cleaned, [region], "新的文案", width, height,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("未绘制出可见文字");
  });

  it("区域被整体涂成色块时判定失败", async () => {
    const width = 600;
    const height = 200;
    const { cleaned } = await makeFixture(
      width, height, `<rect width="600" height="200" fill="#ffffff"/>`, "#000000",
      [{ text: "原始文案", x: 100, y: 70, w: 400, h: 60, size: 36 }],
    );
    const region = {
      x: 100 / width, y: 70 / height, width: 400 / width, height: 60 / height,
      text: "原始文案", targetText: "新的文案",
    };
    const blocked = await sharp(cleaned)
      .composite([{
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="100" y="70" width="400" height="60" fill="#ff0000"/></svg>`,
          "utf8",
        ),
        top: 0, left: 0,
      }])
      .png()
      .toBuffer();
    const result = await verifyDrawnTextQuality(
      cleaned, blocked, [region], "新的文案", width, height,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("色块");
  });
});

describe("eraseTextRegionsLocally 本地像素擦除兜底", () => {
  it("擦掉被修改行的文字墨迹，同时不动未修改行", async () => {
    const width = 800;
    const height = 400;
    const changed: Item = { text: "需要替换的文案", x: 100, y: 80, w: 600, h: 60, size: 40, align: "left" };
    const kept: Item = { text: "保持原样的文案", x: 100, y: 240, w: 600, h: 60, size: 40, align: "left" };
    const { original, cleaned } = await makeFixture(
      width, height, `<rect width="800" height="400" fill="#f0ece4"/>`, "#1a1a1a", [changed, kept],
    );
    const toRegion = (item: Item, targetText: string) => ({
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText,
    });
    const regions = [toRegion(changed, "全新文案"), toRegion(kept, kept.text)];

    const erased = await eraseTextRegionsLocally(original, regions, "全新文案\n保持原样的文案", width, height);

    // 被修改行：墨迹应基本消失
    const changedInk = await inkBox(erased, cleaned, regions[0], width, height);
    expect(changedInk).toBeNull();
    // 未修改行：墨迹必须原样保留
    const keptInk = await inkBox(erased, cleaned, regions[1], width, height);
    expect(keptInk).not.toBeNull();
    const refKept = await inkBox(original, cleaned, regions[1], width, height);
    expect(keptInk!.minX).toBe(refKept!.minX);
    expect(keptInk!.maxX).toBe(refKept!.maxX);
  });

  it("区域外像素与原图逐像素一致", async () => {
    const width = 600;
    const height = 300;
    const item: Item = { text: "只改这一行", x: 80, y: 120, w: 440, h: 60, size: 36, align: "left" };
    const { original } = await makeFixture(
      width, height,
      `<rect width="600" height="300" fill="#ffffff"/><circle cx="520" cy="40" r="26" fill="#c0392b"/>`,
      "#202020", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: "改后的一行",
    };

    const erased = await eraseTextRegionsLocally(original, [region], "改后的一行", width, height);

    // 取远离编辑区域的装饰图形做逐像素比对
    const crop = { left: 480, top: 8, width: 80, height: 64 };
    const a = await sharp(original).extract(crop).removeAlpha().raw().toBuffer();
    const b = await sharp(erased).extract(crop).removeAlpha().raw().toBuffer();
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("没有任何区域被修改时原样返回底图", async () => {
    const width = 300;
    const height = 160;
    const item: Item = { text: "不变", x: 40, y: 50, w: 220, h: 60, size: 32, align: "left" };
    const { original } = await makeFixture(
      width, height, `<rect width="300" height="160" fill="#dddddd"/>`, "#333333", [item],
    );
    const region = {
      x: item.x / width, y: item.y / height, width: item.w / width, height: item.h / height,
      text: item.text, targetText: item.text,
    };
    const erased = await eraseTextRegionsLocally(original, [region], item.text, width, height);
    expect(Buffer.compare(erased, original)).toBe(0);
  });
});

describe("createModifiedRegionsMask 精确合成蒙版", () => {
  it("只把被修改区域标记为可编辑，其余保持原图", async () => {
    const width = 200;
    const height = 100;
    const regions = [
      { x: 0.1, y: 0.1, width: 0.3, height: 0.2, text: "改这行", targetText: "已改动" },
      { x: 0.1, y: 0.6, width: 0.3, height: 0.2, text: "不改这行", targetText: "不改这行" },
    ];
    const mask = await createModifiedRegionsMask(regions, "已改动\n不改这行", width, height);
    const { data } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const alphaAt = (nx: number, ny: number) => {
      const x = Math.round(nx * width);
      const y = Math.round(ny * height);
      return data[(y * width + x) * 4 + 3];
    };
    // 被修改区域内部 alpha=0（使用编辑结果）
    expect(alphaAt(0.2, 0.15)).toBe(0);
    // 未修改区域 alpha=255（保留原图）
    expect(alphaAt(0.2, 0.65)).toBe(255);
    // 区域外 alpha=255
    expect(alphaAt(0.8, 0.5)).toBe(255);
  });
});

describe("calibrateTextRegions OCR 坐标像素校正", () => {
  // 造一张模拟「视觉模型 bbox 系统性偏上」的图：
  // 真实文字画在 y=120 与 y=240，但传入的 regions 声称在 y=40 与 y=140。
  const buildImage = async (width: number, height: number) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" fill="#123456"/>` +
      `<text x="40" y="150" font-family="sans-serif" font-size="40" fill="#ffffff">AAAAAA</text>` +
      `<text x="40" y="265" font-family="sans-serif" font-size="28" fill="#ffcc33">BBBBBB</text>` +
      `</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  };

  // 复刻实测的失效模式：两行的 bbox 都明显偏上。
  // 逐区域「就近吸附」在这类输入下容易串行错位，保序分配才能稳定解对。
  const offsetRegions = [
    { x: 0.1, y: 0.125, width: 0.5, height: 0.13, text: "AAAAAA" },
    { x: 0.1, y: 0.4375, width: 0.4, height: 0.1, text: "BBBBBB" },
  ];

  it("把偏移的 bbox 吸附回真实文字带", async () => {
    const width = 400;
    const height = 320;
    const image = await buildImage(width, height);
    const calibrated = await calibrateTextRegions(image, offsetRegions);

    // 第一行真实墨迹约在 y=118~150，第二行约在 y=244~265
    const y0 = calibrated[0].y * height;
    const y1 = calibrated[1].y * height;
    expect(y0).toBeGreaterThan(100);
    expect(y0).toBeLessThan(135);
    expect(y1).toBeGreaterThan(225);
    expect(y1).toBeLessThan(255);
    // 保序：第一行仍在第二行上方，没有发生错配
    expect(y0).toBeLessThan(y1);
  });

  it("异色文字行也能检出（不依赖单一采样色）", async () => {
    const width = 400;
    const height = 320;
    const image = await buildImage(width, height);
    // 第二行是金色。若实现只按第一行采到的白色做投影，金色行会漏检，
    // 导致「带数 < 区域数」而整体放弃校正 —— 那样下面的断言就会失败。
    const calibrated = await calibrateTextRegions(image, offsetRegions);
    const y1 = calibrated[1].y * height;
    expect(y1).toBeGreaterThan(225);
    expect(y1).toBeLessThan(255);
  });

  it("全幅高频背景上仍能吸附（主路径放弃时走主色兜底）", async () => {
    // 复刻线上失效场景：全幅摄影海报。
    // 主路径判据是「偏离该行背景中位数」，在这种每行都有高对比内容的图上恒为真，
    // 整张图被判成一条带 → 带数 < 区域数 → 放弃校正（实测可分性仅 1.21）。
    // 此时必须由主色吸附兜底接管，否则 bbox 偏移无人修正，
    // 表象就是「擦对了框但擦错了字，原字永远留在画面上」。
    const width = 400;
    const height = 320;
    // 用随机噪声块模拟摄影内容：每一行都有强烈明暗变化
    const blocks: string[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        const v = Math.round(rand() * 255);
        blocks.push(`<rect x="${x}" y="${y}" width="8" height="8" fill="rgb(${v},${Math.round(v * 0.7)},${Math.round(v * 0.5)})"/>`);
      }
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      blocks.join("") +
      `<text x="40" y="150" font-family="sans-serif" font-size="40" font-weight="bold" fill="#ffffff">AAAAAA</text>` +
      `</svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();

    // 偏移量对齐**线上实测量级**：线上粗框 y433-557(高124)、真值 y534-636，
    // 偏移 101px ≈ 0.81 个框高。这里框高 42px，故偏移约 34px → 框在 y≈84。
    // ⚠️ 不要把偏移造得比线上更极端：夹具一度偏移 1.86 个框高，
    // 文字完全落在搜索窗外（白字在窗内占比 0.00%），代码不可能吸附到采不到的像素，
    // 测试红了却根因在夹具 —— **夹具比被测代码更容易错，红了先查夹具**。
    const regions = [{ x: 0.1, y: 84 / 320, width: 0.5, height: 0.13, text: "AAAAAA" }];
    const calibrated = await calibrateTextRegions(image, regions);
    const y0 = calibrated[0].y * height;
    // 必须向下移动到真实文字带附近，而不是停在原处
    expect(y0).toBeGreaterThan(95);
    expect(y0).toBeLessThan(140);
  });

  it("空区域列表原样返回", async () => {
    const image = await buildImage(200, 200);
    const result = await calibrateTextRegions(image, []);
    expect(result).toEqual([]);
  });

  it("图中找不到足够文字带时保持原坐标不变", async () => {
    // 纯色图：没有任何文字带，必须原样返回而不是乱改
    const plain = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 20, g: 30, b: 40 } },
    }).png().toBuffer();
    const regions = [{ x: 0.1, y: 0.1, width: 0.5, height: 0.2, text: "X" }];
    const result = await calibrateTextRegions(plain, regions);
    expect(result[0].y).toBe(0.1);
    expect(result[0].x).toBe(0.1);
  });
});

describe("resolveRegionTargetTexts 行匹配公共口径", () => {
  const regions = [
    { x: 0.1, y: 0.1, width: 0.5, height: 0.1, text: "第一行" },
    { x: 0.1, y: 0.3, width: 0.5, height: 0.1, text: "第二行" },
    { x: 0.1, y: 0.5, width: 0.5, height: 0.1, text: "第三行" },
  ];

  it("只把真正被改动的行标记为 changed", () => {
    // 前端普通改字时不下发 targetText，必须靠行匹配识别出改了哪行
    const result = resolveRegionTargetTexts(regions, "第一行\n新的第二行\n第三行");
    expect(result.map(r => r.changed)).toEqual([false, true, false]);
    expect(result[1].targetText).toBe("新的第二行");
  });

  it("显式 targetText 优先于行匹配", () => {
    const withTarget = [{ ...regions[0], targetText: "指定文案" }, regions[1], regions[2]];
    const result = resolveRegionTargetTexts(withTarget, "第一行\n第二行\n第三行");
    expect(result[0].changed).toBe(true);
    expect(result[0].targetText).toBe("指定文案");
  });

  it("按 y 再按 x 排序，返回顺序与绘制/蒙版一致", () => {
    // 传入顺序打乱，结果必须仍按版面顺序，否则擦除与绘制会错位到不同行
    const shuffled = [regions[2], regions[0], regions[1]];
    const result = resolveRegionTargetTexts(shuffled, "第一行\n第二行\n第三行");
    expect(result.map(r => r.region.text)).toEqual(["第一行", "第二行", "第三行"]);
  });

  it("全部未改动时没有任何 changed，擦字通道应据此跳过", () => {
    const result = resolveRegionTargetTexts(regions, "第一行\n第二行\n第三行");
    expect(result.some(r => r.changed)).toBe(false);
  });

  /**
   * ⚠️⚠️⚠️ 2026-09-21 线上事故的回归测试，数据是实录不是构造。
   *
   * 前端 textRegions 来自 OCR（本函数再按 y 排序），而 editedText 来自大模型
   * 「按商业设计阅读层级整理」的结果 —— 两套排序规则，行序天然不对应。
   * 旧实现（纯 buildReplacementMap 下标对齐）在这组真实数据上判定 8/9 行被改动，
   * 且每行都配错文案（标题被要求写成 "CADPA"），全程零报错。
   */
  it("区域顺序与文案顺序不一致时，仍然只命中真正被改的那一行", () => {
    const posterRegions = [
      { x: 0.921, y: 0.028, width: 0.045, height: 0.048, text: "16+" },
      { x: 0.917, y: 0.075, width: 0.052, height: 0.026, text: "CADPA" },
      { x: 0.906, y: 0.103, width: 0.066, height: 0.028, text: "适龄提示" },
      { x: 0, y: 0.127, width: 0.05, height: 0.036, text: "PEACE" },
      { x: 0.515, y: 0.355, width: 0.104, height: 0.048, text: "龙狮城" },
      { x: 0.925, y: 0.348, width: 0.024, height: 0.078, text: "龙狮迎冰雪" },
      { x: 0.578, y: 0.812, width: 0.235, height: 0.026, text: "GAME FOR PEACE" },
      { x: 0.427, y: 0.843, width: 0.545, height: 0.079, text: "大吉大利和平年" },
      { x: 0.575, y: 0.934, width: 0.246, height: 0.032, text: "龙 狮 迎 冰 雪" },
    ];
    // 阅读层级顺序：主标题在前，角标在后 —— 与上面的 y 序正好相反
    const editedText = [
      "GAME FOR PEACE",
      "欢乐中国年",
      "龙 狮 迎 冰 雪",
      "",
      "龙狮城",
      "龙狮迎冰雪",
      "",
      "PEACE",
      "",
      "16+",
      "CADPA",
      "适龄提示",
    ].join("\n");

    const changed = resolveRegionTargetTexts(posterRegions, editedText).filter(r => r.changed);
    expect(changed).toHaveLength(1);
    expect(changed[0].region.text).toBe("大吉大利和平年");
    expect(changed[0].targetText).toBe("欢乐中国年");
  });

  it("整页文案全改时仍按原有顺序口径对齐，不因内容锚定而失效", () => {
    // 一个锚点都命中不了 —— 必须原样回退 buildReplacementMap，保持历史语义
    const result = resolveRegionTargetTexts(regions, "甲\n乙\n丙");
    expect(result.map(r => r.changed)).toEqual([true, true, true]);
    expect(result.map(r => r.targetText)).toEqual(["甲", "乙", "丙"]);
  });

  /**
   * 咬住 usedUpdated 去重（每条新文案只能被一个区域锚走）。
   *
   * 原图有两处一模一样的「立即购买」，用户只改了其中一处。
   * 不去重的话，第二个「立即购买」区域会重复锚到第一条未改动的新文案上，
   * 于是它被误判成「没改」，用户输入的新文案静默消失 —— 零报错，只是没生效。
   */
  it("重复原文中只改了一处时，被改的那一处不能被重复锚定吞掉", () => {
    const dupRegions = [
      { x: 0.1, y: 0.1, width: 0.5, height: 0.1, text: "立即购买" },
      { x: 0.1, y: 0.3, width: 0.5, height: 0.1, text: "立即购买" },
      { x: 0.1, y: 0.5, width: 0.5, height: 0.1, text: "底部说明" },
    ];
    const result = resolveRegionTargetTexts(dupRegions, "立即购买\n马上抢购\n底部说明");
    const changed = result.filter(r => r.changed);
    expect(changed).toHaveLength(1);
    expect(changed[0].targetText).toBe("马上抢购");
  });

  it("整页全改且行数不等时，仍要给出目标文案而不是留空", () => {
    const result = resolveRegionTargetTexts(regions, "甲\n乙");
    const changed = result.filter(r => r.changed);
    expect(changed.length).toBeGreaterThan(0);
    // 关键：有 changed 就必须有对应文案，不能是「判定改了却不知道写什么」
    for (const item of changed) {
      expect(item.targetText).toBeTruthy();
    }
    expect(changed.map(c => c.targetText)).toEqual(["甲", "乙"]);
  });

  it("多行同名文案时，锚定不能把同一条新文案重复分配给多个区域", () => {
    const dupRegions = [
      { x: 0.1, y: 0.1, width: 0.5, height: 0.1, text: "立即购买" },
      { x: 0.1, y: 0.3, width: 0.5, height: 0.1, text: "标题" },
      { x: 0.1, y: 0.5, width: 0.5, height: 0.1, text: "立即购买" },
    ];
    // 两个「立即购买」都没动，只改中间的标题
    const result = resolveRegionTargetTexts(dupRegions, "立即购买\n新标题\n立即购买");
    const changed = result.filter(r => r.changed);
    expect(changed).toHaveLength(1);
    expect(changed[0].region.text).toBe("标题");
    expect(changed[0].targetText).toBe("新标题");
  });
});
