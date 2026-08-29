import sharp from "sharp";

export interface TextLocation {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  fontSize: number;
  color: { r: number; g: number; b: number };
  confidence: number;
  direction: "horizontal" | "vertical";
}

export interface TextReplacement {
  originalText: string;
  newText: string;
  regionIndex: number;
}

export interface PreciseReplaceInput {
  imageSrc: string;
  textLocations: TextLocation[];
  replacements: TextReplacement[];
}

export interface DrawTextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  /** 前端指定的目标文案；存在时优先使用，空字符串表示删除该文字 */
  targetText?: string;
  direction?: string;
  /** 文字倾斜角度（度，正值顺时针），回填时以区域中心旋转 */
  rotate?: number;
  /** 用户指定字体颜色（十六进制 #rrggbb），优先于自动提取 */
  fontColor?: string;
  /** 用户指定字体（中文名或 CSS 字体名） */
  fontFamily?: string;
}

export interface DrawTextReplacementInput {
  /** 擦字后的干净底图（美图擦字输出） */
  imageBuffer: Buffer;
  /** 擦字前的原图（用于提取每个区域的原始文字颜色） */
  originalBuffer: Buffer;
  /** OCR 识别出的原文字区域 */
  textRegions: DrawTextRegion[];
  /** 修改后的完整文案（多行用 \n 分隔） */
  editedText: string;
  targetWidth: number;
  targetHeight: number;
}

const TEXT_FONT_FAMILY =
  "Microsoft YaHei, PingFang SC, SimHei, SimSun, Noto Sans SC, Arial, sans-serif";

/** 常用中文名 -> CSS 字体族映射（sharp/libvips 走系统字体） */
const FONT_FAMILY_MAP: Record<string, string> = {
  微软雅黑: "Microsoft YaHei",
  雅黑: "Microsoft YaHei",
  黑体: "SimHei",
  宋体: "SimSun",
  新宋体: "NSimSun",
  楷体: "KaiTi",
  仿宋: "FangSong",
  等线: "DengXian",
  隶书: "LiSu",
  思源黑体: "Noto Sans CJK SC",
  思源宋体: "Noto Serif CJK SC",
  arial: "Arial",
};

/** 用户选择的字体名 → 实际 font-family 列表 */
function resolveFontFamily(name?: string): string {
  if (!name || !name.trim()) return TEXT_FONT_FAMILY;
  const key = Object.keys(FONT_FAMILY_MAP).find(k =>
    name.toLowerCase().includes(k.toLowerCase()),
  );
  if (key) return `${FONT_FAMILY_MAP[key]}, ${TEXT_FONT_FAMILY}`;
  return `${name}, ${TEXT_FONT_FAMILY}`;
}

function parseHexColor(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 原行与新行内容不同即认为该区域需要重绘 */
function lineHasChanged(original: string, updated: string): boolean {
  return original !== updated;
}

/**
 * 将修改后的行（updated）按顺序对齐到原 OCR 区域（original）。
 * 返回 Map：原区域索引 -> 需要绘制的新文本，仅包含"被修改"的区域。
 * 行数一致时逐行比对；行数不一致时用 LCS 保持未变行对齐，其余按顺序替换。
 */
function buildReplacementMap(
  original: string[],
  updated: string[],
): Map<number, string> {
  const map = new Map<number, string>();
  const n = original.length;
  const m = updated.length;
  if (n === 0 || m === 0) return map;

  if (n === m) {
    for (let i = 0; i < n; i++) {
      if (lineHasChanged(original[i], updated[i])) {
        map.set(i, updated[i]);
      }
    }
    return map;
  }

  // LCS：找出保持不变的 original 行与对应的 updated 行
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (original[i] === updated[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const unchangedOriginal = new Set<number>();
  const matchedUpdated = new Set<number>();
  {
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (original[i] === updated[j]) {
        unchangedOriginal.add(i);
        matchedUpdated.add(j);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        i++;
      } else {
        j++;
      }
    }
  }
  const changedOriginal = Array.from({ length: n }, (_, i) => i).filter(
    idx => !unchangedOriginal.has(idx),
  );
  const newUpdated = Array.from({ length: m }, (_, j) => j)
    .filter(j => !matchedUpdated.has(j))
    .map(j => updated[j]);

  changedOriginal.forEach((idx, k) => {
    const text = newUpdated[k];
    if (text !== undefined && lineHasChanged(original[idx], text)) {
      map.set(idx, text);
    }
  });
  return map;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function luminance(color: Rgb): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

function guessFallbackColor(avgLum: number): Rgb {
  return avgLum > 128 ? { r: 51, g: 51, b: 51 } : { r: 255, g: 255, b: 255 };
}

/**
 * 从原图 bbox 区域提取"文字颜色"：
 * 用 K-means(k=2) 把区域像素聚成两个主色，取与区域平均亮度反差更大的那个作为文字色。
 * 若两簇反差过低（区域可能是纯色背景），按平均亮度取相反色兜底。
 */
async function extractTextColor(
  originalBuffer: Buffer,
  region: DrawTextRegion,
  scaleX: number,
  scaleY: number,
): Promise<Rgb> {
  // 向内收缩 20%，减少 bbox 边缘背景像素对 K-means 颜色提取的干扰
  const inset = 0.2;
  const x = Math.max(
    0,
    Math.round((region.x + region.width * inset / 2) * scaleX),
  );
  const y = Math.max(
    0,
    Math.round((region.y + region.height * inset / 2) * scaleY),
  );
  const width = Math.max(1, Math.round(region.width * (1 - inset) * scaleX));
  const height = Math.max(1, Math.round(region.height * (1 - inset) * scaleY));

  let data: Buffer;
  let channels: number;
  try {
    const res = await sharp(originalBuffer)
      .extract({ left: x, top: y, width, height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = res.data;
    channels = res.info.channels;
  } catch {
    return guessFallbackColor(128);
  }

  const pixels: Array<[number, number, number]> = [];
  const total = width * height;
  const stride = Math.max(1, Math.floor(total / 600));
  for (let i = 0; i < data.length && pixels.length < 600; i += stride * channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return guessFallbackColor(128);

  let avgLum = 0;
  for (const p of pixels) avgLum += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  avgLum /= pixels.length;

  // K-means(k=2)
  let c1: [number, number, number] = [pixels[0][0], pixels[0][1], pixels[0][2]];
  let c2: [number, number, number] = [
    pixels[pixels.length - 1][0],
    pixels[pixels.length - 1][1],
    pixels[pixels.length - 1][2],
  ];
  let n1 = 0;
  let n2 = 0;
  for (let iter = 0; iter < 25; iter++) {
    let sum1 = [0, 0, 0];
    let sum2 = [0, 0, 0];
    n1 = 0;
    n2 = 0;
    for (const p of pixels) {
      const d1 = (p[0] - c1[0]) ** 2 + (p[1] - c1[1]) ** 2 + (p[2] - c1[2]) ** 2;
      const d2 = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 + (p[2] - c2[2]) ** 2;
      if (d1 <= d2) {
        sum1[0] += p[0];
        sum1[1] += p[1];
        sum1[2] += p[2];
        n1++;
      } else {
        sum2[0] += p[0];
        sum2[1] += p[1];
        sum2[2] += p[2];
        n2++;
      }
    }
    if (n1 > 0) c1 = [sum1[0] / n1, sum1[1] / n1, sum1[2] / n1];
    if (n2 > 0) c2 = [sum2[0] / n2, sum2[1] / n2, sum2[2] / n2];
  }

  const color1: Rgb = { r: Math.round(c1[0]), g: Math.round(c1[1]), b: Math.round(c1[2]) };
  const color2: Rgb = { r: Math.round(c2[0]), g: Math.round(c2[1]), b: Math.round(c2[2]) };
  const lum1 = luminance(color1);
  const lum2 = luminance(color2);
  // 两簇亮度差太小：区域近似单色（纯背景），取相反色兜底
  if (Math.abs(lum1 - lum2) < 30) {
    return guessFallbackColor(avgLum);
  }
  // 取与区域平均亮度反差更大的簇作为文字色
  return Math.abs(lum1 - avgLum) >= Math.abs(lum2 - avgLum) ? color1 : color2;
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch === " ") width += fontSize * 0.5;
    else if (/[\x00-\x7F]/.test(ch)) width += fontSize * 0.55;
    else width += fontSize;
  }
  return width;
}

/**
 * 方案 B：确定性文字绘制。
 * 在（美图擦字后的）干净底图上，按 OCR 区域用 SVG 直接绘制新文字，
 * 背景完全保持擦字结果，不经过任何 AI 重绘。
 */
export async function drawTextReplacement(
  input: DrawTextReplacementInput,
): Promise<Buffer> {
  const { imageBuffer, originalBuffer, textRegions, editedText, targetWidth, targetHeight } = input;

  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length === 0) return imageBuffer;

  // textRegions 坐标是归一化的（0-1），需要乘以目标尺寸得到像素坐标。
  const scaleX = targetWidth;
  const scaleY = targetHeight;

  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);

  interface DrawItem {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fontSize: number;
    color: Rgb;
    rotate: number;
    fontFamily: string;
  }
  const drawItems: DrawItem[] = [];

  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    const originalText = (region.text || "").trim();

    // 优先使用前端明确指定的 targetText；未指定时按 editedText 行匹配回退。
    let newText: string | undefined;
    if (typeof region.targetText === "string") {
      newText = region.targetText.trim();
    } else {
      newText = replacementMap.get(i);
    }
    if (newText === undefined) continue; // 该行未修改，保留擦字图上的原内容
    if (newText === "") continue; // 用户移除该区域：只擦除，不绘制
    if (newText === originalText) continue; // 内容相同，无需重绘

    const pixelWidth = region.width * scaleX;
    const pixelHeight = region.height * scaleY;

    // OCR bbox 通常包含 padding，收缩后更接近真实文字区域
    const padX = pixelWidth * 0.05;
    const padY = pixelHeight * 0.05;
    const drawX = region.x * scaleX + padX;
    // 顶部对齐：y 紧贴 region 顶部，不留顶部空隙
    const drawY = region.y * scaleY;
    const drawWidth = Math.max(1, pixelWidth - padX * 2);
    // 按用户反馈，把绘制区域整体高度再减少 10px，让文字块更紧凑
    const drawHeight = Math.max(1, pixelHeight - padY * 2 - 10);

    // 基准字号按区域高度推算并额外 +16（默认 +12 再大 4px）
    let fontSize = Math.max(10, Math.round(drawHeight * 0.65) + 16);
    const estimatedWidth = estimateTextWidth(newText, fontSize);
    // 放宽到整宽，避免宽度收缩把大 4px 的字号又压回去
    const maxWidth = Math.max(drawWidth, 20);
    if (estimatedWidth > maxWidth) {
      fontSize = Math.max(8, Math.round(fontSize * (maxWidth / estimatedWidth)));
    }

    // 颜色优先级：用户指定 > OCR 返回 > K-means 自动提取
    const color =
      parseHexColor(region.fontColor || "") ||
      (await extractTextColor(originalBuffer, region, scaleX, scaleY));
    const rotate = region.rotate ?? 0;
    const fontFamily = resolveFontFamily(region.fontFamily);

    drawItems.push({
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
      text: newText,
      fontSize,
      color,
      rotate,
      fontFamily,
    });
  }

  if (drawItems.length === 0) {
    // 没有任何行被修改：直接返回底图（擦字图）
    return imageBuffer;
  }

  // 生成 SVG 文字层
  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}">`,
  );
  for (const item of drawItems) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    // 以区域中心垂直居中绘制：原文字在 OCR 区域内通常是居中的，
    // 顶部对齐会导致视觉上偏低；居中后与原文字位置更一致。
    const rotateAttr =
      item.rotate !== 0 ? ` transform="rotate(${item.rotate} ${cx} ${cy})"` : "";
    const fill = `rgb(${item.color.r},${item.color.g},${item.color.b})`;
    svgParts.push(
      `<text x="${cx}" y="${cy}" font-family="${item.fontFamily}" font-size="${item.fontSize}" ` +
        `fill="${fill}" text-anchor="middle" dominant-baseline="central"${rotateAttr}>${escapeXml(item.text)}</text>`,
    );
  }
  svgParts.push(`</svg>`);
  const svgBuffer = Buffer.from(svgParts.join(""), "utf8");

  // 合成到底图上
  return sharp(imageBuffer)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * 生成"仅覆盖被修改文字区域"的合成 mask：
 * - 被修改 region 透明（alpha=0）→ 使用 edited（擦字图+新文字）
 * - 其余区域白色不透明（alpha=255）→ 使用 source（原图）
 * 这样即使前端 mask 覆盖了多余区域，未被修改的文字和背景也能用原图恢复。
 */
/**
 * 膨胀 mask 中的透明区域（即擦字/编辑区域），让美图/模型多处理边缘一圈像素，
 * 减少原文字残留。
 * @param radius   基础膨胀半径
 * @param shiftY   把透明区域向上平移的像素数（用于修正 mask 偏下）
 * @param extraX   在 radius 之外额外向左右扩展的像素数
 * @param shrinkY  垂直方向收缩的总像素数（上下各 shrinkY/2，减少 OCR bbox 多余的上下 padding）
 */
export async function dilateMaskTransparent(
  maskBuffer: Buffer,
  width: number,
  height: number,
  radius: number,
  shiftY: number = 0,
  extraX: number = 0,
  shrinkY: number = 0,
): Promise<Buffer> {
  const { data, info } = await sharp(maskBuffer, { limitInputPixels: false })
    .resize(width, height, { fit: "fill" })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const transparent = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] < 128) transparent[i] = 1;
  }

  // 先把透明区域整体向上平移 shiftY 像素
  let working = new Uint8Array(width * height);
  if (shiftY > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (transparent[y * width + x]) {
          const ny = y - shiftY;
          if (ny >= 0) working[ny * width + x] = 1;
        }
      }
    }
  } else {
    working.set(transparent);
  }

  // 垂直收缩：上下各 shrinkY/2，仅当该列上下 shrinkY 范围内全部为透明时保留
  if (shrinkY > 0) {
    const half = Math.round(shrinkY / 2);
    const eroded = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let allTransparent = true;
        for (let dy = -half; dy <= half; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height || !working[ny * width + x]) {
            allTransparent = false;
            break;
          }
        }
        if (allTransparent) eroded[y * width + x] = 1;
      }
    }
    working = eroded;
  }

  const xRadius = radius + extraX;
  const yRadius = radius;

  const out = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let isTransparent = false;
      for (let dy = -yRadius; dy <= yRadius && !isTransparent; dy++) {
        for (let dx = -xRadius; dx <= xRadius && !isTransparent; dx++) {
          if ((dx * dx) / (xRadius * xRadius || 1) + (dy * dy) / (yRadius * yRadius || 1) > 1) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (working[ny * width + nx]) {
            isTransparent = true;
            break;
          }
        }
      }
      const idx = (y * width + x) * 4;
      if (isTransparent) {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
      }
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function createModifiedRegionsMask(
  textRegions: DrawTextRegion[],
  editedText: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length === 0) {
    // 没有任何修改：全白 mask（完全保留原图）
    return sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
    })
      .png()
      .toBuffer();
  }

  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);

  // 直接写 raw alpha：背景 alpha=255（用 source），被修改区域 alpha=0（用 edited）
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    const originalText = (region.text || "").trim();
    let newText: string | undefined;
    if (typeof region.targetText === "string") {
      newText = region.targetText.trim();
    } else {
      newText = replacementMap.get(i);
    }
    if (newText === undefined || newText === originalText) continue;
    const x0 = Math.max(0, Math.round(region.x * width));
    const y0 = Math.max(0, Math.round(region.y * height));
    const w = Math.max(1, Math.round(region.width * width));
    const h = Math.max(1, Math.round(region.height * height));
    const x1 = Math.min(width, x0 + w);
    const y1 = Math.min(height, y0 + h);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        data[idx + 3] = 0; // alpha=0
      }
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export function buildVisionOCRPrompt(): string {
  return `Extract ALL text with precise locations (bbox, font, color, confidence).`;
}

export async function replaceTextPrecisely(
  input: PreciseReplaceInput,
  imageBuffer: Buffer,
  imageMetadata: { width: number; height: number },
): Promise<Buffer> {
  let result = imageBuffer;
  return result;
}

export async function getImageMetadata(
  imageBuffer: Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imageBuffer).metadata();
  return { width: metadata.width || 0, height: metadata.height || 0 };
}
