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

/**
 * 跨平台 CJK 字体候选链。
 *
 * 背景：原实现把 `Microsoft YaHei / SimHei / SimSun` 放在候选首位，这些字体只存在于
 * Windows。在 macOS/Linux 上 Pango 找不到会**静默回退到默认字体**（实测三者渲染签名
 * 与 sans-serif 完全一致），字形与原图差异明显。这里按平台把真实存在的字体排在前面。
 */
const CJK_SANS_STACK = [
  "PingFang SC",      // macOS 默认中文黑体
  "Hiragino Sans GB", // macOS 备选
  "Heiti SC",         // macOS 旧版
  "Microsoft YaHei",  // Windows
  "Noto Sans CJK SC", // Linux
  "Source Han Sans SC",
  "WenQuanYi Zen Hei",
  "sans-serif",
];

const CJK_SERIF_STACK = [
  "Songti SC",         // macOS 宋体
  "STSong",
  "SimSun",            // Windows
  "Noto Serif CJK SC", // Linux
  "serif",
];

/** 常用中文字体名 -> 跨平台候选链 */
const FONT_FAMILY_MAP: Record<string, string[]> = {
  微软雅黑: CJK_SANS_STACK,
  雅黑: CJK_SANS_STACK,
  黑体: ["Heiti SC", "STHeiti", "SimHei", ...CJK_SANS_STACK],
  苹方: CJK_SANS_STACK,
  宋体: CJK_SERIF_STACK,
  新宋体: CJK_SERIF_STACK,
  楷体: ["Kaiti SC", "STKaiti", "KaiTi", ...CJK_SERIF_STACK],
  仿宋: ["STFangsong", "FangSong", ...CJK_SERIF_STACK],
  等线: CJK_SANS_STACK,
  隶书: ["Libian SC", "LiSu", ...CJK_SANS_STACK],
  思源黑体: ["Noto Sans CJK SC", "Source Han Sans SC", ...CJK_SANS_STACK],
  思源宋体: ["Noto Serif CJK SC", "Source Han Serif SC", ...CJK_SERIF_STACK],
  arial: ["Arial", "Helvetica", "sans-serif"],
  helvetica: ["Helvetica", "Arial", "sans-serif"],
};

/**
 * 缓存 Pango 实际可解析的字体族。
 * 通过对比"待测字体"与"必定回退到默认字体的乱码族名"的渲染签名判断是否命中：
 * 签名相同 => 该字体不存在，Pango 回退了。
 */
const fontAvailabilityCache = new Map<string, boolean>();
let defaultFontSignature: string | null = null;

async function renderSignature(fontFamily: string): Promise<string> {
  const { data, info } = await sharp({
    text: {
      text: "字Ag",
      font: `${fontFamily} 32`,
      rgba: true,
    },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let alphaSum = 0;
  for (let i = 3; i < data.length; i += 4) alphaSum += data[i];
  return `${info.width}x${info.height}:${alphaSum}`;
}

async function isFontAvailable(fontFamily: string): Promise<boolean> {
  const key = fontFamily.trim();
  if (!key) return false;
  const cached = fontAvailabilityCache.get(key);
  if (cached !== undefined) return cached;
  try {
    if (defaultFontSignature === null) {
      // 一个几乎不可能存在的族名，Pango 必定回退到默认字体
      defaultFontSignature = await renderSignature("__artx_missing_font__");
    }
    const signature = await renderSignature(key);
    // 泛族名本身就是有效目标，不参与回退判定
    const generic = /^(sans-serif|serif|monospace)$/i.test(key);
    const available = generic || signature !== defaultFontSignature;
    fontAvailabilityCache.set(key, available);
    return available;
  } catch {
    fontAvailabilityCache.set(key, false);
    return false;
  }
}

/**
 * 解析出**当前系统真实可用**的单个字体族名（Pango 的 font 参数只认单个族名 + 字号，
 * 不像 CSS 支持逗号候选链，因此必须自己挑出第一个可用的）。
 */
async function resolveFontFamily(name?: string): Promise<string> {
  const candidates: string[] = [];
  const trimmed = name?.trim();
  if (trimmed) {
    candidates.push(trimmed);
    const key = Object.keys(FONT_FAMILY_MAP).find(k =>
      trimmed.toLowerCase().includes(k.toLowerCase()),
    );
    if (key) candidates.push(...FONT_FAMILY_MAP[key]);
  }
  candidates.push(...CJK_SANS_STACK);

  for (const candidate of candidates) {
    if (await isFontAvailable(candidate)) return candidate;
  }
  return "sans-serif";
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

/**
 * 用真实像素把视觉大模型给出的粗略 bbox「吸附」到实际文字带上。
 *
 * 背景：视觉 OCR（vision-chat）返回的是模型估计的归一化坐标，实测存在系统性偏移，
 * 且偏移量随行序递增（实测一张 1024x640 海报：第 1/2/3 行分别偏上 49px / 86px / 100px）。
 * 模型倾向于把版面「均匀铺满」整幅画布，而不是按真实像素定位。
 *
 * 后果非常严重且隐蔽：擦除擦在空白处、绘制画在空白处，
 * 表现为「擦字成功但新文字看不见」，最终触发质量校验降级到 AI 叠字，
 * AI 又把原文字还原回去 —— 用户看到的现象是「改了等于没改」。
 *
 * 做法分两步：
 * 1) 全图水平投影，切出所有连续「文字带」（行）；
 * 2) 把 regions 与 bands 都按 y 排序后做**保序一一分配**。
 *
 * 第 2 步是关键。逐区域各自就近吸附是错的：因为偏移量递增，
 * 每个 bbox 的最近邻都是它上方那条带，会出现多个 region 抢同一条带、
 * 整体串行错位。而 OCR 的阅读顺序与真实版面的上下顺序必然一致，
 * 这个「保序」约束足以消除歧义 —— 用动态规划求代价最小的保序匹配。
 *
 * 安全性：带数与区域数不匹配、或匹配代价过高时原样返回，绝不会比校正前更差。
 */
export async function calibrateTextRegions<T extends DrawTextRegion>(
  imageBuffer: Buffer,
  regions: T[],
): Promise<T[]> {
  if (regions.length === 0) return regions;
  let data: Buffer;
  let width: number;
  let height: number;
  let channels: number;
  try {
    const out = await sharp(imageBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    data = out.data;
    width = out.info.width;
    height = out.info.height;
    channels = out.info.channels;
  } catch {
    return regions;
  }
  if (width < 8 || height < 8) return regions;

  // ---- 步骤 1：按「偏离局部背景」投影，切出所有文字带 ----
  //
  // 这里刻意不依赖 extractTextColor 采样文字色。原因是存在鸡生蛋问题：
  // 采准颜色需要准确的 bbox，而准确的 bbox 正是本函数要求解的目标。
  // 实测偏移 147px 的区域整个落在纯背景上，采样只会得到背景色，
  // 于是异色文字行（金色行动号召）永远检不出来，最终放弃全部校正。
  //
  // 改为颜色无关的判据：逐行统计「与该行背景色差异显著」的像素。
  // 行背景色取该行的中位数颜色 —— 文字只占一行的少数像素，中位数必然是背景。
  // 这样白字、金字、深色字都能一视同仁地检出。
  const bgOf = (y: number): Rgb => {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    // 每隔 4 像素采样一次即可，省去一次全宽排序的开销
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * channels;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
    rs.sort((a, b) => a - b);
    gs.sort((a, b) => a - b);
    bs.sort((a, b) => a - b);
    const mid = rs.length >> 1;
    return { r: rs[mid], g: gs[mid], b: bs[mid] };
  };

  const rowBg: Rgb[] = [];
  for (let y = 0; y < height; y++) rowBg.push(bgOf(y));

  const isInkAnyColor = (x: number, y: number): boolean => {
    const i = (y * width + x) * channels;
    const bg = rowBg[y];
    const d =
      Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b);
    // 阈值 90：足以区分文字与渐变背景的缓慢过渡
    return d > 90;
  };

  const rowThreshold = Math.max(2, Math.round(width * 0.004));
  const isInkRow = new Uint8Array(height);
  const rowCount = new Int32Array(height);
  const rowSpan = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    let minX = width;
    let maxX = -1;
    for (let x = 0; x < width; x++) {
      if (isInkAnyColor(x, y)) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    rowCount[y] = count;
    rowSpan[y] = maxX >= minX ? maxX - minX + 1 : 0;
    if (count > rowThreshold) isInkRow[y] = 1;
  }

  const segments: Array<{ y0: number; y1: number }> = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    if (isInkRow[y]) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start >= 3) segments.push({ y0: start, y1: y - 1 });
      start = -1;
    }
  }
  if (start >= 0 && height - start >= 3) segments.push({ y0: start, y1: height - 1 });

  // 先按「段」剔除装饰性实心块（圆形、色条、图标等），再做间隙合并。
  //
  // 顺序很关键：若先合并，实心装饰会被并进相邻文字段里，
  // 之后无论怎么算平均填充率都已经被文字稀释、无法再识别出来。
  // 判据是「行填充率」：命中像素占其水平跨度的比例。
  // 文字笔画稀疏（多在 0.2~0.6），实心装饰接近 1.0。
  const fillOf = (y: number): number => (rowSpan[y] === 0 ? 0 : rowCount[y] / rowSpan[y]);

  // 把每一段按行填充率再切一次，剥离与文字**投影相连**的装饰。
  // 仅靠段间空白切不开这种情况：海报上的圆形装饰常常紧贴标题，
  // 中间没有任何空白行，投影上就是一整段（实测 y=50~189，标题实际只占 132~185）。
  const textSegments: Array<{ y0: number; y1: number }> = [];
  for (const seg of segments) {
    let subStart = -1;
    for (let y = seg.y0; y <= seg.y1 + 1; y++) {
      const isTextRow = y <= seg.y1 && fillOf(y) <= 0.8;
      if (isTextRow) {
        if (subStart < 0) subStart = y;
      } else if (subStart >= 0) {
        if (y - subStart >= 4) textSegments.push({ y0: subStart, y1: y - 1 });
        subStart = -1;
      }
    }
  }

  // 合并小间隙：同一行文字内部可能出现空白行
  // （例如「三」「二」这类字的笔画之间，或抗锯齿导致的弱行）。
  // 不合并的话一行字会被切成多段，带数虚增后保序分配必然错配。
  //
  // 间隙阈值自适应：取「两段中较矮者高度的 30%」，
  // 只合并明显属于同一行内部的缝隙，避免把相邻行粘连。
  const rawBands: Array<{ y0: number; y1: number }> = [];
  for (const seg of textSegments) {
    const last = rawBands[rawBands.length - 1];
    if (last) {
      const gap = seg.y0 - last.y1 - 1;
      const minHeight = Math.min(last.y1 - last.y0 + 1, seg.y1 - seg.y0 + 1);
      if (gap <= Math.max(1, Math.round(minHeight * 0.3))) {
        last.y1 = seg.y1;
        continue;
      }
    }
    rawBands.push({ ...seg });
  }

  // 合并后再兜底过滤一次：极矮的残留段（分隔线等）不作为文字带。
  const bands = rawBands.filter(band => band.y1 - band.y0 + 1 >= 4);

  // 带数少于区域数说明仍有文字带没被检出（低对比度、纹理背景等），
  // 此时保序分配会强行错配，反而更糟 —— 直接放弃校正。
  // 诊断开关：设 ARTX_CALIBRATE_DEBUG=1 可打印文字带检出与匹配代价，
  // 排查「校正未生效」时很有用（默认静默，不污染正常日志）。
  const debug = !!process.env.ARTX_CALIBRATE_DEBUG;
  if (debug) console.log(`[calibrate] 检出带=${JSON.stringify(bands)}`);
  if (bands.length < regions.length) {
    if (debug) console.log(`[calibrate] 放弃：带数 ${bands.length} < 区域数 ${regions.length}`);
    return regions;
  }

  // ---- 步骤 2：保序一一分配（动态规划） ----
  const order = regions
    .map((region, index) => ({ region, index }))
    .sort((a, b) => a.region.y - b.region.y);

  const n = order.length;
  const m = bands.length;
  const cost = (ri: number, bi: number): number => {
    const region = order[ri].region;
    const band = bands[bi];
    const by0 = region.y * height;
    const by1 = (region.y + region.height) * height;
    const bandHeight = band.y1 - band.y0 + 1;
    const boxHeight = Math.max(1, by1 - by0);
    // 中心距离（按图高归一）+ 高度不相似度，两者都是越小越好
    const centerDelta = Math.abs((band.y0 + band.y1) / 2 - (by0 + by1) / 2) / height;
    const heightRatio = Math.min(bandHeight, boxHeight) / Math.max(bandHeight, boxHeight);
    return centerDelta + (1 - heightRatio) * 0.5;
  };

  const INF = Number.POSITIVE_INFINITY;
  // dp[i][j] = 前 i 个区域匹配到前 j 条带中的最小代价
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
  for (let j = 0; j <= m; j++) dp[0][j] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      // 选择：把第 i 个区域配给第 j 条带，或跳过第 j 条带
      const take = dp[i - 1][j - 1] + cost(i - 1, j - 1);
      const skip = dp[i][j - 1];
      if (take <= skip) { dp[i][j] = take; from[i][j] = j - 1; }
      else { dp[i][j] = skip; from[i][j] = -1; }
    }
  }
  if (!Number.isFinite(dp[n][m])) return regions;
  // 平均代价过高说明整体匹配不可信（例如图上文字带与 OCR 结果对不上）。
  // 阈值 0.5 由实测标定：一张偏移量高达 100px+ 的海报，
  // 正确匹配的平均代价约 0.25~0.32（偏移越大 centerDelta 越大，这是正常的），
  // 而错配通常会显著超过 0.6。
  if (debug) console.log(`[calibrate] 平均代价=${(dp[n][m] / n).toFixed(3)}`);
  if (dp[n][m] / n > 0.5) {
    if (debug) console.log(`[calibrate] 放弃：平均代价过高`);
    return regions;
  }

  const assign = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (from[i][j] >= 0) { assign[i - 1] = from[i][j]; i--; j--; }
    else j--;
  }
  if (assign.some(v => v < 0)) return regions;

  const result = regions.slice();
  for (let k = 0; k < n; k++) {
    const { region, index } = order[k];
    const band = bands[assign[k]];
    const bandHeight = band.y1 - band.y0 + 1;

    // 横向收敛：只在该带内、且限定在原 bbox 左右放宽 25% 的范围里找真实墨迹边界，
    // 放宽是因为 x 也可能有偏移，但不能全宽扫描，否则会把同一行的其他元素并进来。
    const bx0 = Math.max(0, Math.round(region.x * width));
    const bx1 = Math.min(width, bx0 + Math.max(1, Math.round(region.width * width)));
    const padScan = Math.round((bx1 - bx0) * 0.25);
    const scanX0 = Math.max(0, bx0 - padScan);
    const scanX1 = Math.min(width, bx1 + padScan);

    let inkMinX = scanX1;
    let inkMaxX = scanX0 - 1;
    for (let y = band.y0; y <= band.y1; y++) {
      for (let x = scanX0; x < scanX1; x++) {
        if (isInkAnyColor(x, y)) {
          if (x < inkMinX) inkMinX = x;
          if (x > inkMaxX) inkMaxX = x;
        }
      }
    }

    const calibrated = { ...region } as T;
    // 上下各留 8% 行高的呼吸空间，保证擦除能盖住抗锯齿边缘
    const padY = Math.max(1, Math.round(bandHeight * 0.08));
    const newY0 = Math.max(0, band.y0 - padY);
    const newY1 = Math.min(height, band.y1 + 1 + padY);
    calibrated.y = newY0 / height;
    calibrated.height = (newY1 - newY0) / height;
    if (inkMaxX >= inkMinX) {
      const padXInk = Math.max(1, Math.round((inkMaxX - inkMinX + 1) * 0.02));
      const newX0 = Math.max(0, inkMinX - padXInk);
      const newX1 = Math.min(width, inkMaxX + 1 + padXInk);
      calibrated.x = newX0 / width;
      calibrated.width = (newX1 - newX0) / width;
    }
    result[index] = calibrated;
  }
  return result;
}

/**
 * 读取原图指定区域的灰度掩码：与文字色接近的像素记为 1（文字笔画），其余为 0。
 * 用于测量字重与对齐方式——把「样式重建」从拍脑袋改成从原图观测。
 */
async function readRegionInkMask(
  originalBuffer: Buffer,
  region: DrawTextRegion,
  scaleX: number,
  scaleY: number,
  textColor: Rgb,
): Promise<{ ink: Uint8Array; width: number; height: number } | null> {
  const x = Math.max(0, Math.round(region.x * scaleX));
  const y = Math.max(0, Math.round(region.y * scaleY));
  const width = Math.max(1, Math.round(region.width * scaleX));
  const height = Math.max(1, Math.round(region.height * scaleY));
  try {
    const { data, info } = await sharp(originalBuffer)
      .extract({ left: x, top: y, width, height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const ink = new Uint8Array(info.width * info.height);
    for (let i = 0, p = 0; i < data.length; i += channels, p++) {
      const distance =
        Math.abs(data[i] - textColor.r) +
        Math.abs(data[i + 1] - textColor.g) +
        Math.abs(data[i + 2] - textColor.b);
      // 与文字主色的曼哈顿距离小于阈值即视为笔画像素
      if (distance < 140) ink[p] = 1;
    }
    return { ink, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/**
 * 测量原图区域内文字墨迹的实际包围盒（相对区域左上角的像素值）。
 * 用于反推真实字号与基线位置，避免直接按 OCR bbox 定字号导致文字偏大。
 */
async function measureRegionInkBounds(
  originalBuffer: Buffer,
  region: DrawTextRegion,
  scaleX: number,
  scaleY: number,
  textColor: Rgb,
): Promise<{ inkHeight: number; inkWidth: number; centerOffsetY: number } | null> {
  const mask = await readRegionInkMask(originalBuffer, region, scaleX, scaleY, textColor);
  if (!mask) return null;
  const { ink, width, height } = mask;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxY < 0 || maxX < 0) return null;
  const inkCenterY = (minY + maxY) / 2;
  return {
    inkHeight: maxY - minY + 1,
    inkWidth: maxX - minX + 1,
    // 墨迹中心相对区域中心的偏移（用于把新文字放回同一视觉基线）
    centerOffsetY: inkCenterY - height / 2,
  };
}

/**
 * 由笔画像素占比推断字重。
 * 常规字重的笔画覆盖率大致在 10%~18%，粗体明显更高。
 */
async function estimateFontWeight(
  originalBuffer: Buffer,
  region: DrawTextRegion,
  scaleX: number,
  scaleY: number,
  textColor: Rgb,
): Promise<number> {
  const mask = await readRegionInkMask(originalBuffer, region, scaleX, scaleY, textColor);
  if (!mask) return 400;
  let inkCount = 0;
  for (let i = 0; i < mask.ink.length; i++) inkCount += mask.ink[i];
  const total = mask.width * mask.height;
  if (total === 0) return 400;
  const coverage = inkCount / total;
  if (coverage > 0.28) return 700;
  if (coverage > 0.2) return 600;
  return 400;
}

/**
 * 由笔画像素的左右留白推断水平对齐方式。
 * 原实现一律居中，导致左对齐的正文回填后位置偏移。
 */
async function estimateAlignment(
  originalBuffer: Buffer,
  region: DrawTextRegion,
  scaleX: number,
  scaleY: number,
  textColor: Rgb,
): Promise<"left" | "center" | "right"> {
  const mask = await readRegionInkMask(originalBuffer, region, scaleX, scaleY, textColor);
  if (!mask) return "center";
  const { ink, width, height } = mask;
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < 0) return "center";
  const leftGap = minX;
  const rightGap = width - 1 - maxX;
  // 两侧留白差异小于区域宽度 8% 视为居中
  const tolerance = width * 0.08;
  if (Math.abs(leftGap - rightGap) <= tolerance) return "center";
  return leftGap < rightGap ? "left" : "right";
}

/** 粗略估算（仅用于测量失败时的兜底，正常路径走 Pango 实测） */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch === " ") width += fontSize * 0.5;
    else if (/[\x00-\x7F]/.test(ch)) width += fontSize * 0.55;
    else width += fontSize;
  }
  return width;
}

/** Pango 实测文本尺寸缓存：同一「文本+字体+字号+字重」只测一次 */
const textMetricsCache = new Map<string, { width: number; height: number }>();

/**
 * 渲染一段文本并测量其**墨迹高度**（实际字形上下边界，不含行距空白）。
 * measureText 返回的是 Pango 排版盒高度（含 ascender/descender 留白），
 * 而我们要跟原图里观测到的字形高度对齐，必须用墨迹高度。
 */
const inkHeightCache = new Map<string, number>();
async function renderedInkHeight(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
): Promise<number> {
  const key = `${fontFamily}|${fontSize}|${fontWeight}|${text}`;
  const cached = inkHeightCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const weightSuffix = fontWeight >= 600 ? " Bold" : "";
    const { data, info } = await sharp({
      text: {
        text: escapeXml(text),
        font: `${fontFamily}${weightSuffix} ${fontSize}`,
        rgba: true,
      },
    })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let minY = info.height;
    let maxY = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * ch + (ch - 1)] > 40) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          break;
        }
      }
    }
    const height = maxY < 0 ? Math.round(fontSize * 0.7) : maxY - minY + 1;
    inkHeightCache.set(key, height);
    return height;
  } catch {
    return Math.round(fontSize * 0.7);
  }
}

/**
 * 反推原图中文字的真实字号：
 * 二分搜索字号，使「用该字号渲染原文得到的墨迹高度」逼近「在原图中观测到的墨迹高度」。
 *
 * 这是把字号从「区域高度 × 0.65 + 16」这种经验公式，换成真正基于原图观测的关键一步——
 * OCR bbox 往往比字形本身高出不少（含行距/内边距），直接按 bbox 定字号会明显偏大。
 */
async function inferOriginalFontSize(
  originalText: string,
  observedInkHeight: number,
  fontFamily: string,
  fontWeight: number,
  upperBound: number,
): Promise<number | null> {
  if (!originalText || observedInkHeight <= 0) return null;
  let low = 6;
  let high = Math.max(8, Math.ceil(upperBound));
  let best: number | null = null;
  let bestDiff = Infinity;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const ink = await renderedInkHeight(originalText, fontFamily, mid, fontWeight);
    const diff = Math.abs(ink - observedInkHeight);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = mid;
    }
    if (ink === observedInkHeight) return mid;
    if (ink < observedInkHeight) low = mid + 1;
    else high = mid - 1;
  }
  return best;
}

/**
 * 用 libvips/Pango 真实排版测量文本尺寸。
 * 相比按字符宽度估算，能正确处理 CJK/拉丁混排、字距、连字和实际字形宽度，
 * 这是把「+16 字号」「-10 高度」这类经验魔法数替换成测量驱动的基础。
 */
async function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
): Promise<{ width: number; height: number }> {
  const key = `${fontFamily}|${fontSize}|${fontWeight}|${text}`;
  const cached = textMetricsCache.get(key);
  if (cached) return cached;
  try {
    const weightSuffix = fontWeight >= 600 ? " Bold" : "";
    const metadata = await sharp({
      text: {
        text: escapeXml(text),
        font: `${fontFamily}${weightSuffix} ${fontSize}`,
        rgba: true,
      },
    }).metadata();
    const measured = {
      width: metadata.width || estimateTextWidth(text, fontSize),
      height: metadata.height || Math.round(fontSize * 1.2),
    };
    textMetricsCache.set(key, measured);
    return measured;
  } catch {
    return {
      width: estimateTextWidth(text, fontSize),
      height: Math.round(fontSize * 1.2),
    };
  }
}

/**
 * 二分搜索出「宽度和高度都能塞进目标框」的最大字号。
 * 替代原来的「按高度 *0.65 + 16 再按比例压缩」的经验公式。
 */
async function fitFontSize(
  text: string,
  fontFamily: string,
  fontWeight: number,
  maxWidth: number,
  maxHeight: number,
): Promise<number> {
  let low = 6;
  let high = Math.max(8, Math.ceil(maxHeight * 2));
  let best = low;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const { width, height } = await measureText(text, fontFamily, mid, fontWeight);
    if (width <= maxWidth && height <= maxHeight) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/**
 * 按可用宽度对文本自动换行（原实现完全没有换行，长文案会溢出或被压成极小字号）。
 * CJK 可在任意字符间断行；拉丁词优先按空格断行。
 */
async function wrapTextToWidth(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  maxWidth: number,
): Promise<string[]> {
  const { width } = await measureText(text, fontFamily, fontSize, fontWeight);
  if (width <= maxWidth) return [text];

  const lines: string[] = [];
  let current = "";
  // 以「CJK 单字」或「拉丁单词(含尾随空格)」为最小断行单元
  const tokens = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]|[^\s\u4e00-\u9fff]+\s*|\s+/g) || [text];

  for (const token of tokens) {
    const candidate = current + token;
    const measured = await measureText(candidate.trimEnd(), fontFamily, fontSize, fontWeight);
    if (measured.width > maxWidth && current.trim()) {
      lines.push(current.trimEnd());
      current = token.trimStart();
    } else {
      current = candidate;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.length > 0 ? lines : [text];
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
    /** 区域像素框（用于定位与旋转中心） */
    x: number;
    y: number;
    width: number;
    height: number;
    /** 换行后的多行文本 */
    lines: string[];
    fontSize: number;
    lineHeight: number;
    color: Rgb;
    rotate: number;
    fontFamily: string;
    fontWeight: number;
    align: "left" | "center" | "right";
    /** 描边（深色背景上的浅色字常带描边，用于保证可读性） */
    stroke?: { color: string; width: number };
    /** 原文墨迹中心相对区域中心的垂直偏移，用于对齐原始视觉基线 */
    baselineOffsetY: number;
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

    // OCR bbox 一般会带少量 padding。这里只做很小的对称内缩（2%），
    // 不再使用「-10px」这类与分辨率无关的绝对魔法数，避免小图被削掉过多。
    const padX = pixelWidth * 0.02;
    const padY = pixelHeight * 0.02;
    const drawX = region.x * scaleX + padX;
    const drawY = region.y * scaleY + padY;
    const drawWidth = Math.max(1, pixelWidth - padX * 2);
    const drawHeight = Math.max(1, pixelHeight - padY * 2);

    // 颜色优先级：用户指定 > OCR 返回 > K-means 自动提取
    const color =
      parseHexColor(region.fontColor || "") ||
      (await extractTextColor(originalBuffer, region, scaleX, scaleY));
    const rotate = region.rotate ?? 0;
    const fontFamily = await resolveFontFamily(region.fontFamily);

    // 从原图区域测量字重（笔画密度）与水平对齐方式，替代固定假设
    const fontWeight = await estimateFontWeight(originalBuffer, region, scaleX, scaleY, color);
    const align = await estimateAlignment(originalBuffer, region, scaleX, scaleY, color);

    // 「区域可容纳的最大字号」作为上界
    const maxFitSize = await fitFontSize(newText, fontFamily, fontWeight, drawWidth, drawHeight);

    // 优先按原图观测到的字形高度反推真实字号：
    // OCR bbox 通常比字形高（含行距/内边距），只按 bbox 定字号会让回填文字明显偏大。
    const inkBounds = await measureRegionInkBounds(
      originalBuffer,
      region,
      scaleX,
      scaleY,
      color,
    );
    let baselineOffsetY = 0;
    let fontSize = maxFitSize;
    if (inkBounds && originalText) {
      const inferred = await inferOriginalFontSize(
        originalText,
        inkBounds.inkHeight,
        fontFamily,
        fontWeight,
        Math.max(8, drawHeight * 2),
      );
      if (inferred) {
        // 用原字号渲染新文案，若超宽则等比缩小；同时不超过区域可容纳上界
        const measured = await measureText(newText, fontFamily, inferred, fontWeight);
        const widthLimited =
          measured.width > drawWidth
            ? Math.max(8, Math.floor(inferred * (drawWidth / measured.width)))
            : inferred;
        fontSize = Math.min(widthLimited, maxFitSize);
        baselineOffsetY = inkBounds.centerOffsetY;
      }
    }

    // 单行字号过小说明文案明显变长：改为多行排版，取「行高可容纳」的最大字号
    let lines = [newText];
    const singleLineTooSmall = fontSize < Math.max(10, drawHeight * 0.45);
    if (singleLineTooSmall) {
      const targetSize = Math.max(10, Math.round(drawHeight * 0.8));
      const wrapped = await wrapTextToWidth(
        newText,
        fontFamily,
        targetSize,
        fontWeight,
        drawWidth,
      );
      if (wrapped.length > 1) {
        // 多行时按行数压缩字号，保证整体高度不超过区域
        const perLineHeight = drawHeight / wrapped.length;
        let multi = targetSize;
        for (const line of wrapped) {
          const size = await fitFontSize(
            line,
            fontFamily,
            fontWeight,
            drawWidth,
            perLineHeight,
          );
          multi = Math.min(multi, size);
        }
        if (multi >= fontSize) {
          lines = wrapped;
          fontSize = multi;
        }
      }
    }

    // 原图若为浅色字（可能压在复杂背景上），补一层细描边提升可读性
    const stroke =
      luminance(color) > 180
        ? { color: "rgba(0,0,0,0.35)", width: Math.max(1, fontSize * 0.04) }
        : undefined;

    drawItems.push({
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
      lines,
      fontSize,
      lineHeight: fontSize * 1.15,
      color,
      rotate,
      fontFamily,
      fontWeight,
      align,
      stroke,
      baselineOffsetY: lines.length > 1 ? 0 : baselineOffsetY,
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
    const rotateAttr =
      item.rotate !== 0 ? ` transform="rotate(${item.rotate} ${cx} ${cy})"` : "";
    const fill = `rgb(${item.color.r},${item.color.g},${item.color.b})`;

    // 水平锚点：按测量出的对齐方式贴合原始版式，而不是一律居中
    const anchor =
      item.align === "left" ? "start" : item.align === "right" ? "end" : "middle";
    const anchorX =
      item.align === "left" ? item.x : item.align === "right" ? item.x + item.width : cx;

    // 垂直定位：以原文墨迹中心为基准（而非 bbox 几何中心），多行时整体块居中
    const totalHeight = item.lines.length * item.lineHeight;
    const anchorCy = cy + item.baselineOffsetY;
    const firstBaselineY = anchorCy - totalHeight / 2 + item.lineHeight / 2;

    const strokeAttr = item.stroke
      ? ` stroke="${item.stroke.color}" stroke-width="${item.stroke.width.toFixed(2)}" paint-order="stroke"`
      : "";
    const weightAttr = ` font-weight="${item.fontWeight}"`;

    item.lines.forEach((line, index) => {
      const lineY = firstBaselineY + index * item.lineHeight;
      svgParts.push(
        `<text x="${anchorX.toFixed(2)}" y="${lineY.toFixed(2)}" font-family="${escapeXml(item.fontFamily)}" ` +
          `font-size="${item.fontSize}"${weightAttr} fill="${fill}"${strokeAttr} ` +
          `text-anchor="${anchor}" dominant-baseline="central"${rotateAttr}>${escapeXml(line)}</text>`,
      );
    });
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

  // 可分离膨胀：先水平后垂直，各用一维滑动窗口最大值（单调队列），O(width*height)。
  // 原实现是 O(width*height*xRadius*yRadius) 的朴素邻域扫描，
  // 在 2K 图 + radius=21 时约需 数亿 次内循环，是链路里最重的一段。
  const dilated = separableDilate(working, width, height, xRadius, yRadius);

  const out = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) {
    if (dilated[i]) {
      const idx = i * 4;
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
      out[idx + 3] = 0;
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * 可分离二值膨胀：水平 pass + 垂直 pass，各自用单调队列求滑动窗口最大值。
 * 结果等价于矩形结构元膨胀，复杂度 O(width*height)，与半径无关。
 */
function separableDilate(
  source: Uint8Array,
  width: number,
  height: number,
  xRadius: number,
  yRadius: number,
): Uint8Array {
  const horizontal = new Uint8Array(width * height);
  if (xRadius > 0) {
    for (let y = 0; y < height; y++) {
      const base = y * width;
      // 用「最近一个 1 的位置」代替单调队列：二值场景下等价且更快
      let lastOne = -1;
      for (let x = 0; x < width; x++) {
        if (source[base + x]) lastOne = x;
        if (lastOne >= 0 && x - lastOne <= xRadius) horizontal[base + x] = 1;
      }
      lastOne = -1;
      for (let x = width - 1; x >= 0; x--) {
        if (source[base + x]) lastOne = x;
        if (lastOne >= 0 && lastOne - x <= xRadius) horizontal[base + x] = 1;
      }
    }
  } else {
    horizontal.set(source);
  }

  if (yRadius <= 0) return horizontal;

  const output = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let lastOne = -1;
    for (let y = 0; y < height; y++) {
      if (horizontal[y * width + x]) lastOne = y;
      if (lastOne >= 0 && y - lastOne <= yRadius) output[y * width + x] = 1;
    }
    lastOne = -1;
    for (let y = height - 1; y >= 0; y--) {
      if (horizontal[y * width + x]) lastOne = y;
      if (lastOne >= 0 && lastOne - y <= yRadius) output[y * width + x] = 1;
    }
  }
  return output;
}

/**
 * 本地内容感知擦除（不依赖任何外部服务）。
 *
 * 存在意义：确定性文字渲染是唯一能保证「文字内容零错误」的路径，但它需要一张
 * 干净底图。原实现只要美图擦字失败，整条链路就降级到 AI 叠字，文字准确性随之失守。
 * 这里提供纯像素兜底，让「拿到干净底图」不再依赖任何云服务可用性。
 *
 * 算法：逐行用区域**外侧**的背景像素重建区域内部。
 * 取左右外侧样本的中位数（对噪点和残留笔画稳健），再沿 x 方向线性插值，
 * 可较好还原纯色、水平渐变和柔和纹理背景。复杂纹理下弱于扩散模型，
 * 但显著优于「带着原文字直接叠新字」——后者会产生新旧文字重叠的废图。
 */
export async function eraseTextRegionsLocally(
  imageBuffer: Buffer,
  textRegions: DrawTextRegion[],
  editedText: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);

  const targets: DrawTextRegion[] = [];
  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    const originalText = (region.text || "").trim();
    const newText =
      typeof region.targetText === "string"
        ? region.targetText.trim()
        : replacementMap.get(i);
    if (newText === undefined || newText === originalText) continue;
    targets.push(region);
  }
  if (targets.length === 0) return imageBuffer;

  const { data, info } = await sharp(imageBuffer, { limitInputPixels: false })
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = Buffer.from(data);

  for (const region of targets) {
    // 略微外扩，覆盖抗锯齿边缘，避免残留原文字轮廓
    const padX = Math.round(region.width * width * 0.04);
    const padY = Math.round(region.height * height * 0.08);
    const x0 = Math.max(0, Math.round(region.x * width) - padX);
    const y0 = Math.max(0, Math.round(region.y * height) - padY);
    const x1 = Math.min(width, Math.round((region.x + region.width) * width) + padX);
    const y1 = Math.min(height, Math.round((region.y + region.height) * height) + padY);
    if (x1 <= x0 || y1 <= y0) continue;

    // 区域外左右各取一条竖带作为背景参考（文字一般不延伸到这里）
    const sampleWidth = Math.max(2, Math.round((x1 - x0) * 0.06));
    const leftStart = Math.max(0, x0 - sampleWidth);
    const rightEnd = Math.min(width, x1 + sampleWidth);

    for (let y = y0; y < y1; y++) {
      const leftSamples: Array<[number, number, number]> = [];
      for (let x = leftStart; x < x0; x++) {
        const i = (y * width + x) * ch;
        leftSamples.push([data[i], data[i + 1], data[i + 2]]);
      }
      const rightSamples: Array<[number, number, number]> = [];
      for (let x = x1; x < rightEnd; x++) {
        const i = (y * width + x) * ch;
        rightSamples.push([data[i], data[i + 1], data[i + 2]]);
      }

      let left: [number, number, number];
      let right: [number, number, number];
      if (leftSamples.length === 0 && rightSamples.length === 0) {
        // 区域贴边、无外侧样本：退化为用区域内该行的中位数颜色
        const inner: Array<[number, number, number]> = [];
        const step = Math.max(1, Math.floor((x1 - x0) / 64));
        for (let x = x0; x < x1; x += step) {
          const i = (y * width + x) * ch;
          inner.push([data[i], data[i + 1], data[i + 2]]);
        }
        const median = medianColor(inner);
        left = median;
        right = median;
      } else {
        left = medianColor(leftSamples.length > 0 ? leftSamples : rightSamples);
        right = medianColor(rightSamples.length > 0 ? rightSamples : leftSamples);
      }

      // 沿 x 方向线性插值，兼顾水平渐变背景
      const span = Math.max(1, x1 - x0 - 1);
      for (let x = x0; x < x1; x++) {
        const t = (x - x0) / span;
        const i = (y * width + x) * ch;
        out[i] = Math.round(left[0] * (1 - t) + right[0] * t);
        out[i + 1] = Math.round(left[1] * (1 - t) + right[1] * t);
        out[i + 2] = Math.round(left[2] * (1 - t) + right[2] * t);
      }
    }
  }

  return sharp(out, { raw: { width, height, channels: ch } }).png().toBuffer();
}

function medianColor(pixels: Array<[number, number, number]>): [number, number, number] {
  if (pixels.length === 0) return [128, 128, 128];
  const pick = (index: 0 | 1 | 2) => {
    const values = pixels.map(p => p[index]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return [pick(0), pick(1), pick(2)];
}

/**
 * 方案 B 的质量自检（对应技术方案「步骤 5：失败检测与智能兜底」）。
 *
 * 校验绘制结果是否真的把文字画进了目标区域：
 * - 每个应被修改的区域内必须出现足够的墨迹变化；
 * - 墨迹不应溢出区域边界太多。
 * 返回 false 时上层应放弃方案 B，降级到 AI 叠字，而不是把坏结果直接返回给用户。
 */
export async function verifyDrawnTextQuality(
  cleanedBuffer: Buffer,
  drawnBuffer: Buffer,
  textRegions: DrawTextRegion[],
  editedText: string,
  width: number,
  height: number,
): Promise<{ ok: boolean; reason?: string }> {
  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);

  const targets: DrawTextRegion[] = [];
  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    const originalText = (region.text || "").trim();
    const newText =
      typeof region.targetText === "string"
        ? region.targetText.trim()
        : replacementMap.get(i);
    if (newText === undefined || newText === "" || newText === originalText) continue;
    targets.push(region);
  }
  if (targets.length === 0) return { ok: true };

  let cleaned: { data: Buffer; channels: number };
  let drawn: { data: Buffer; channels: number };
  try {
    const a = await sharp(cleanedBuffer)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const b = await sharp(drawnBuffer)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    cleaned = { data: a.data, channels: a.info.channels };
    drawn = { data: b.data, channels: b.info.channels };
  } catch (error) {
    return { ok: false, reason: `质量校验读取失败: ${String(error)}` };
  }

  const ch = cleaned.channels;
  for (const region of targets) {
    const x0 = Math.max(0, Math.round(region.x * width));
    const y0 = Math.max(0, Math.round(region.y * height));
    const x1 = Math.min(width, x0 + Math.max(1, Math.round(region.width * width)));
    const y1 = Math.min(height, y0 + Math.max(1, Math.round(region.height * height)));
    let changed = 0;
    let total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * ch;
        const diff =
          Math.abs(drawn.data[i] - cleaned.data[i]) +
          Math.abs(drawn.data[i + 1] - cleaned.data[i + 1]) +
          Math.abs(drawn.data[i + 2] - cleaned.data[i + 2]);
        if (diff > 60) changed++;
        total++;
      }
    }
    if (total === 0) continue;
    const ratio = changed / total;
    // 文字墨迹通常覆盖区域 5%~60%；过低说明没画上，过高说明画成了色块
    if (ratio < 0.01) {
      return { ok: false, reason: `区域 "${region.text}" 未绘制出可见文字（墨迹占比 ${(ratio * 100).toFixed(2)}%）` };
    }
    if (ratio > 0.85) {
      return { ok: false, reason: `区域 "${region.text}" 绘制异常，疑似色块（墨迹占比 ${(ratio * 100).toFixed(2)}%）` };
    }
  }
  return { ok: true };
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

/**
 * 把「哪些区域被改成了什么」这一判定抽成公共口径。
 *
 * 背景：drawTextReplacement、createModifiedRegionsMask、eraseTextRegionsLocally
 * 三处各自内联了同一段逻辑（targetText 优先，否则回退 buildReplacementMap 行匹配）。
 * 新增的擦字通道如果自己再写一遍，一旦口径漂移就会出现
 * 「擦了 A 行、字写在 B 行」的错位。这里导出唯一实现供外部复用。
 *
 * 注意 targetText 的语义：前端只在**删除整行**时显式下发（空串），
 * 普通改字时是 undefined —— 所以不能只看 targetText 判断有没有改动。
 */
export function resolveRegionTargetTexts(
  textRegions: DrawTextRegion[],
  editedText: string,
): Array<{ region: DrawTextRegion; targetText: string | undefined; changed: boolean }> {
  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);

  return sortedRegions.map((region, index) => {
    const originalText = (region.text || "").trim();
    const targetText =
      typeof region.targetText === "string"
        ? region.targetText.trim()
        : replacementMap.get(index);
    return {
      region,
      targetText,
      changed: targetText !== undefined && targetText !== originalText,
    };
  });
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
