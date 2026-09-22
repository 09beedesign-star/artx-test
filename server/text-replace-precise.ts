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
    // 全局带检测在**全幅摄影海报**上会整张图判成一条带（每行都有人物/光影这类
    // 高对比内容，「偏离行背景中位数」恒为真，实测可分性仅 1.21，实用需 3+）。
    // 此时改用逐区域的主色吸附兜底 —— 它不依赖全局投影，只在各自粗框附近找
    // 「与本区域主色接近 + 水平成段」的行，对摄影背景鲁棒得多。
    return calibrateBySnappingInkColor(
      { data, width, height, channels },
      regions,
      debug,
    );
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
    // ⚠️ 主路径有**两个**放弃出口（带数不足 / 平均代价过高），兜底必须两个都接。
    // 只接第一个时，全幅摄影图会走到这里直接返回原框，表象是「兜底没生效」，
    // 而日志里主路径的放弃信息看起来完全正常 —— 零报错的静默失效。
    return calibrateBySnappingInkColor({ data, width, height, channels }, regions, debug);
  }

  const assign = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (from[i][j] >= 0) { assign[i - 1] = from[i][j]; i--; j--; }
    else j--;
  }
  if (assign.some(v => v < 0)) {
    if (debug) console.log(`[calibrate] 放弃：存在未匹配区域`);
    return calibrateBySnappingInkColor({ data, width, height, channels }, regions, debug);
  }

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
 * 兜底校正：按「区域主色 + 水平游程」逐区域吸附，不依赖全局行投影。
 *
 * 【为什么需要它】
 * 主路径（全局带检测）的判据是「像素偏离该行背景中位数」。这在文字压于
 * 相对干净背景时很好用，但在**全幅摄影海报**上每一行都有人物、篮球、光影
 * 这类高对比内容，判据恒为真 → 整张图被判成一条带 → 带数 1 < 区域数 → 放弃。
 * 实测该判据在这类图上的可分性仅 1.21（文字行 vs 非文字行的响应比），
 * 而实用至少要 3。**这是方法的天花板，不是阈值没调好**，放宽阈值只会把框
 * 挪到更错的位置。
 *
 * 【本函数的两条判据】
 * ① 主色自适应：从粗框内做粗量化直方图，取「离框外背景最远 × 体量足够」
 *    的那一簇作为文字色。不写死颜色，白字/金字/橙字通吃。
 * ② 水平游程约束：只统计连续 >= MIN_RUN 像素的命中段。文字笔画是成段的，
 *    摄影背景的同色像素是零散的 —— 这一条把背景噪声压下去。
 *
 * 【占用排除（关键）】
 * ⚠️ 粗框整体偏移一行高度时，第 2 行的框内**主要覆盖的是第 1 行的字**，
 * 主色会被推断成第 1 行的颜色，于是两行吸附到同一处。表象是「第 2 行校正
 * 失败」，根因是「第 1 行把信号借给了第 2 行」。所以按 y 序依次吸附，
 * 已吸附的带在后续区域的主色推断与行投影中都必须屏蔽。
 *
 * 实测（1284x857 篮球海报，粗框整体偏上约 100px）：
 *   平均误差 97.8px → 14.3px（白字 90→6，橙字 105.5→22.5）。
 */
function calibrateBySnappingInkColor<T extends DrawTextRegion>(
  image: { data: Buffer; width: number; height: number; channels: number },
  regions: T[],
  debug: boolean,
): T[] {
  const { data, width, height, channels } = image;
  // A/B 开关：设 ARTX_SNAP_CALIBRATE=off 可退回「主路径放弃就原样返回」的旧行为。
  // 用途是做效果对照实测（同一张图、同一套参数，只切这一个变量），
  // 避免「改了一堆东西后凭印象说变好了」。
  if (process.env.ARTX_SNAP_CALIBRATE === "off") {
    if (debug) console.log("[calibrate/snap] 已由 ARTX_SNAP_CALIBRATE=off 禁用");
    return regions;
  }
  const MIN_RUN = Math.max(3, Math.round(width * 0.005));
  const COLOR_TOL = 70; // RGB 欧氏距离容差
  const claimed: Array<{ y0: number; y1: number }> = [];

  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const order = regions
    .map((region, index) => ({ region, index }))
    .sort((a, b) => a.region.y - b.region.y);

  const result = regions.slice();
  let movedCount = 0;

  for (const { region, index } of order) {
    const x0 = Math.max(0, Math.round(region.x * width));
    const x1 = Math.min(width, Math.round((region.x + region.width) * width));
    const oy0 = Math.max(0, Math.round(region.y * height));
    const oy1 = Math.min(height, Math.round((region.y + region.height) * height));
    if (x1 - x0 < 4 || oy1 - oy0 < 4) continue;

    const isClaimed = (y: number) => claimed.some(b => y >= b.y0 && y <= b.y1);

    // 搜索窗：粗框上下各扩 80%。
    // ⚠️ 主色采样必须用**搜索窗**而不是粗框本身：偏移量若超过一个框高，
    // 文字会完全落在粗框之外，此时在粗框内采样只能采到背景噪声，
    // 主色被推断成背景色，吸附随即抓向错误位置（实测抓到 rgb(17,12,9) 暗噪声块）。
    // 采样范围必须覆盖「文字可能出现的地方」，而不是「模型声称它在的地方」。
    const boxH = oy1 - oy0;
    const sy0 = Math.max(0, oy0 - Math.round(boxH * 0.8));
    const sy1 = Math.min(height, oy1 + Math.round(boxH * 0.8));

    // --- ① 推断本区域的文字主色 ---
    const QUANT = 5; // 量化到 32 级
    const hist = new Map<number, { n: number; r: number; g: number; b: number }>();
    let sampled = 0;
    for (let y = sy0; y < sy1; y++) {
      if (isClaimed(y)) continue;
      for (let x = x0; x < x1; x++) {
        const [r, g, b] = px(x, y);
        sampled++;
        const key = ((r >> QUANT) << 10) | ((g >> QUANT) << 5) | (b >> QUANT);
        const e = hist.get(key);
        if (e) { e.n++; e.r += r; e.g += g; e.b += b; }
        else hist.set(key, { n: 1, r, g, b });
      }
    }
    if (sampled === 0) continue;

    // 背景参考取**搜索窗之外**的两条带。
    // 取窗内会把文字本身采成「背景」，主色与背景距离被算成 0，吸附直接放弃。
    const bgSamples: Array<[number, number, number]> = [];
    for (const yy of [Math.max(0, sy0 - 6), Math.min(height - 1, sy1 + 6)]) {
      for (let x = x0; x < x1; x += 3) bgSamples.push(px(x, yy));
    }
    if (bgSamples.length === 0) continue;
    const bg = bgSamples.reduce(
      (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as [number, number, number],
      [0, 0, 0] as [number, number, number],
    ).map(v => v / bgSamples.length) as [number, number, number];

    let best: { col: [number, number, number]; score: number; dist: number } | null = null;
    // 注：此处不用 for...of 遍历 Map.values()，因为项目 tsconfig 的 target 较低，
    // 直接迭代迭代器会触发 TS2802（需 downlevelIteration）。
    const buckets: Array<{ n: number; r: number; g: number; b: number }> = [];
    hist.forEach(e => buckets.push(e));
    for (const e of buckets) {
      const ratio = e.n / sampled;
      if (ratio < 0.03) continue;
      const col: [number, number, number] = [e.r / e.n, e.g / e.n, e.b / e.n];
      const dist = Math.hypot(col[0] - bg[0], col[1] - bg[1], col[2] - bg[2]);
      // 评分 = 离背景距离 × 占比^0.25。
      // ⚠️ 指数很关键：原本用 √ratio，实测在噪声背景上白字(距283/占5%)与
      // 暗噪声块(距148/占18%)得分 63.2 vs 62.8 —— 几乎打平，一点扰动就选错。
      // 文字天然是「颜色极端但面积小」，占比权重必须压低，否则大面积背景色永远赢。
      const score = dist * Math.pow(ratio, 0.25);
      if (!best || score > best.score) best = { col, score, dist };
    }
    // ⚠️ 主色与框外背景几乎同色 ⇒ 区域内根本没有可分辨的前景（纯色图 / 空白区）。
    // 此时若继续吸附，颜色判据会命中**所有**像素，行投影恒为满值，
    // 带会一路扩张到整个搜索窗 —— 表象是「校正把框挪了」，实则是在纯噪声上乱抓。
    // 检不出就不动，是这个函数唯一正确的行为。
    if (!best || best.dist < 24) {
      if (debug) {
        console.log(
          `[calibrate/snap] 区域 ${index} 主色与背景距离 ${(best?.dist ?? 0).toFixed(1)} 过小，保持原框`,
        );
      }
      continue;
    }
    const [ir, ig, ib] = best.col;

    // --- ② 在搜索窗内做游程行投影 ---
    const rows = new Float64Array(sy1 - sy0);
    for (let y = sy0; y < sy1; y++) {
      if (isClaimed(y)) continue;
      let count = 0;
      let run = 0;
      for (let x = x0; x < x1; x++) {
        const [r, g, b] = px(x, y);
        if (Math.hypot(r - ir, g - ig, b - ib) < COLOR_TOL) run++;
        else { if (run >= MIN_RUN) count += run; run = 0; }
      }
      if (run >= MIN_RUN) count += run;
      rows[y - sy0] = count / (x1 - x0);
    }

    let peak = 0;
    let peakIdx = -1;
    let rowSum = 0;
    for (let i = 0; i < rows.length; i++) {
      rowSum += rows[i];
      if (rows[i] > peak) { peak = rows[i]; peakIdx = i; }
    }
    // 峰值过弱说明窗口内根本没有成段的同色笔画，宁可不动
    if (peakIdx < 0 || peak < 0.02) {
      if (debug) console.log(`[calibrate/snap] 区域 ${index} 峰值过弱(${peak.toFixed(3)})，保持原框`);
      continue;
    }
    // 结构性判据：文字在行投影上是**集中**的（少数几行很强、其余接近 0），
    // 而弥散噪声是**均匀**的（每行差不多）。用峰均比区分，
    // 这条比单纯看颜色更可靠 —— 它描述的是「文字行长什么样」，与具体颜色无关。
    const meanRow = rowSum / rows.length;
    const peakRatio = meanRow > 0 ? peak / meanRow : Infinity;
    if (peakRatio < 1.8) {
      if (debug) {
        console.log(
          `[calibrate/snap] 区域 ${index} 峰均比 ${peakRatio.toFixed(2)} 过低（信号弥散，非文字），保持原框`,
        );
      }
      continue;
    }
    const thr = peak * 0.4;
    let a = peakIdx;
    while (a > 0 && rows[a - 1] >= thr) a--;
    let b2 = peakIdx;
    while (b2 < rows.length - 1 && rows[b2 + 1] >= thr) b2++;
    const newTop = sy0 + a;
    const newBottom = sy0 + b2;
    const newHeight = newBottom - newTop + 1;
    // 吸附结果高度与原框相差过于悬殊（>2.5x 或 <0.35x）说明抓错了目标
    const ratioH = newHeight / boxH;
    if (newHeight < 6 || ratioH > 2.5 || ratioH < 0.35) {
      if (debug) {
        console.log(
          `[calibrate/snap] 区域 ${index} 高度比 ${ratioH.toFixed(2)} 异常，保持原框`,
        );
      }
      continue;
    }

    claimed.push({ y0: newTop, y1: newBottom });
    const padY = Math.max(1, Math.round(newHeight * 0.08));
    const finalTop = Math.max(0, newTop - padY);
    const finalBottom = Math.min(height, newBottom + 1 + padY);
    const calibrated = { ...region } as T;
    calibrated.y = finalTop / height;
    calibrated.height = (finalBottom - finalTop) / height;
    result[index] = calibrated;
    if (Math.abs(finalTop - oy0) > 2) movedCount++;
    if (debug) {
      console.log(
        `[calibrate/snap] 区域 ${index} 主色 rgb(${ir.toFixed(0)},${ig.toFixed(0)},${ib.toFixed(0)}) ` +
          `y${oy0}-${oy1} → y${finalTop}-${finalBottom}`,
      );
    }
  }

  if (movedCount > 0) {
    console.log(`[ocr] bbox 主色吸附校正: ${movedCount}/${regions.length} 个区域被修正`);
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

/**
 * 自动估计原图文字行的倾斜角（度，顺时针为正，与 SVG rotate 同号）。
 *
 * 背景（2026-09-21 换路线）：篮球海报等斜排艺术字，OCR 只给轴对齐 bbox
 * （rotate 恒 0），确定性绘制若一律水平排版，新字会丢掉原图的动势方向。
 *
 * 算法：把墨迹点投影到「垂直于行方向」的分量 v 上。设行方向与 x 轴成 φ
 * （顺时针），则对任意候选角 θ：v = s·sin(φ−θ) + t·cos(φ−θ)（s=行内位置、
 * t=行内高度）。θ=φ 时 v 退化为纯行高散布，方差最小。在 [-30°, 30°] 扫描
 * 取方差最小者。
 *
 * 两道防线防误估（bbox 内常有同色背景噪声，如橙色字旁的橙色篮球）：
 * ① 墨迹点 < 80 直接放弃；② 最优角的方差相对 θ=0 基准改善不足 20% 视为
 * 无明显倾斜，返回 0 —— 短文本/噪声主导时宁可水平也不要转错方向。
 */
async function estimateTextRotation(
  originalBuffer: Buffer,
  region: DrawTextRegion,
  scaleX: number,
  scaleY: number,
  textColor: Rgb,
): Promise<number> {
  const mask = await readRegionInkMask(originalBuffer, region, scaleX, scaleY, textColor);
  if (!mask) return 0;
  const { ink, width, height } = mask;
  // 下采样控制计算量：目标 ~2 万点以内，角度扫描 61 次 × O(n) 依然很快
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 20000)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (ink[y * width + x]) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  const n = xs.length;
  if (n < 80) return 0;
  const cx = xs.reduce((sum, value) => sum + value, 0) / n;
  const cy = ys.reduce((sum, value) => sum + value, 0) / n;
  const varianceAt = (deg: number): number => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - cx;
      const dy = ys[i] - cy;
      const v = -sin * dx + cos * dy;
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
  };
  const baselineVariance = varianceAt(0);
  if (baselineVariance <= 0) return 0;
  let bestAngle = 0;
  let bestVariance = baselineVariance;
  for (let deg = -30; deg <= 30; deg += 1) {
    const variance = varianceAt(deg);
    if (variance < bestVariance) {
      bestVariance = variance;
      bestAngle = deg;
    }
  }
  // 改善不足 20%：无明显倾斜（或噪声主导），宁可水平不要转错方向
  if (bestVariance > baselineVariance * 0.8) return 0;
  return Math.abs(bestAngle) < 2 ? 0 : bestAngle;
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
    /**
     * 倾斜贴合（2026-09-21 换路线）：前端/OCR 显式给的 rotate 优先；
     * 未给（=0）时从原图墨迹自动估计行方向 —— 斜排艺术字若一律水平
     * 排版，新字会丢掉原图的动势，且与残影位置的错位感更刺眼。
     */
    const explicitRotate = region.rotate ?? 0;
    const rotate =
      Math.abs(explicitRotate) >= 1
        ? explicitRotate
        : await estimateTextRotation(originalBuffer, region, scaleX, scaleY, color);
    if (rotate !== 0) {
      console.log(`[text_edit] 倾斜贴合: "${originalText}" -> "${newText}" rotate=${rotate}°`);
    }
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

    /**
     * ⭐⭐⭐ 旋转包围盒回缩（2026-09-22 事故修复）。
     *
     * `fitFontSize` / `widthLimited` 都是按**轴对齐** drawWidth×drawHeight 量的，
     * 但文字最终是带 `transform="rotate(θ)"` 画上去的。一个 w×h 的文本框旋转 θ 后
     * 实际占据 `w·cosθ + h·sinθ` 宽、`w·sinθ + h·cosθ` 高 —— 恒大于 w×h。
     * 于是「按 bbox 算出来刚好放得下」的字号，旋转后必然溢出：
     * 实测篮球海报 rotate≈-8°，「欢乐中国年」右侧被裁出画面，
     * 且上下两行各自越界后互相侵入、糊成一团。**零报错**，只是图难看。
     *
     * 📌 判据：**任何"先按未旋转尺寸排版、再旋转"的链路，都必须把旋转后的
     *    包围盒重新算一遍并回缩**，否则角度越大溢出越狠。
     */
    if (rotate !== 0) {
      const rad = (Math.abs(rotate) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let maxLineWidth = 0;
      for (const line of lines) {
        const m = await measureText(line, fontFamily, fontSize, fontWeight);
        maxLineWidth = Math.max(maxLineWidth, m.width);
      }
      const blockHeight = lines.length * fontSize * 1.15;
      const rotatedW = maxLineWidth * cos + blockHeight * sin;
      const rotatedH = maxLineWidth * sin + blockHeight * cos;
      const shrink = Math.min(1, drawWidth / rotatedW, drawHeight / rotatedH);
      if (shrink < 1) {
        const before = fontSize;
        fontSize = Math.max(8, Math.floor(fontSize * shrink));
        console.log(
          `[text_edit] 旋转回缩: "${newText}" rotate=${rotate}° 字号 ${before} -> ${fontSize}` +
            `（旋转后 ${Math.round(rotatedW)}x${Math.round(rotatedH)} 超出 ${Math.round(drawWidth)}x${Math.round(drawHeight)}）`,
        );
      }
    }

    // 原图若为浅色字（可能压在复杂背景上），补一层细描边提升可读性。
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

  /** 生成 SVG 文字层：每个被修改的区域输出若干行 <text> */
  const textParts: string[] = [];
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
      const x = anchorX.toFixed(2);
      const y = lineY.toFixed(2);
      const font = `font-family="${escapeXml(item.fontFamily)}" font-size="${item.fontSize}"${weightAttr}`;
      const content = escapeXml(line);

      textParts.push(
        `<text x="${x}" y="${y}" ${font} fill="${fill}"${strokeAttr} ` +
          `text-anchor="${anchor}" dominant-baseline="central"${rotateAttr}>${content}</text>`,
      );
    });
  }
  const svgParts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}">`,
    ...textParts,
    `</svg>`,
  ];
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
 * 二值腐蚀 = 对补集做膨胀再取反（复用 separableDilate，保持 O(n) 复杂度）。
 */
function separableErode(
  source: Uint8Array,
  width: number,
  height: number,
  xRadius: number,
  yRadius: number,
): Uint8Array {
  const inverted = new Uint8Array(width * height);
  for (let i = 0; i < inverted.length; i++) inverted[i] = source[i] ? 0 : 1;
  const grown = separableDilate(inverted, width, height, xRadius, yRadius);
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

/**
 * 形态学闭运算：先膨胀再腐蚀。用于把「空心轮廓」型 mask 填成实心，
 * 且整体尺寸基本不变（膨胀撑大多少，腐蚀收回多少）。
 */
function morphClose(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const grown = separableDilate(source, width, height, radius, radius);
  return separableErode(grown, width, height, radius, radius);
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

  /**
   * ⭐⭐⭐ 2026-09-22 换算法：逐行 x 向线性插值 → 二维扩散填充。
   *
   * 旧实现每行独立取左右外侧中位数再沿 x 插值，**行与行之间零约束**，
   * 于是填充区变成一叠颜色各异的纯色横条 —— 用户看到的「横向拉丝色带」。
   * 现在把所有待擦区域统一收进一张 mask，一次性解拉普拉斯方程，
   * 填充结果在 2D 上连续，且自动继承上下左右真实背景的色彩与梯度。
   */
  const mask = new Uint8Array(width * height);
  let maskCount = 0;
  for (const region of targets) {
    /**
     * 外扩量改为「按比例算、但用绝对像素封顶」（2026-09-22）。
     *
     * 旧写法 `region.width * width * 0.04` 在**超宽 bbox**（整行标题占 64% 画宽）
     * 上会外扩到 30+ px，上下 8% 同理 —— 擦除区比文字本身大一大圈，
     * 把篮球下沿、人物手臂等无关背景一起抹成雾。外扩的唯一目的是盖住抗锯齿
     * 边缘（几个像素而已），与 bbox 多大无关。
     * 📌 判据：**「覆盖边缘」类的 padding 是绝对量，不该随区域尺寸线性放大。**
     */
    const padX = Math.min(6, Math.round(region.width * width * 0.01));
    const padY = Math.min(8, Math.round(region.height * height * 0.04));
    const x0 = Math.max(0, Math.round(region.x * width) - padX);
    const y0 = Math.max(0, Math.round(region.y * height) - padY);
    const x1 = Math.min(width, Math.round((region.x + region.width) * width) + padX);
    const y1 = Math.min(height, Math.round((region.y + region.height) * height) + padY);
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = y * width + x;
        if (!mask[p]) {
          mask[p] = 1;
          maskCount++;
        }
      }
    }
  }
  if (maskCount === 0) return imageBuffer;

  diffusionInpaint(out, data, width, height, ch, mask);

  return sharp(out, { raw: { width, height, channels: ch } }).png().toBuffer();
}

/**
 * 多尺度扩散填充（Laplace inpainting）。
 *
 * ⭐⭐⭐ 存在意义（2026-09-22 事故修复）：旧实现是「**逐行**取左右外侧中位数、
 * 沿 x 方向线性插值」。每一行都独立计算 ⇒ 行与行之间没有任何约束 ⇒ 相邻行颜色
 * 跳变，填充区呈现**横向拉丝色带**，在篮球/人物这类高频背景上尤其刺眼。
 *
 * 📌 判据：**一维逐行插值天然产生条纹，因为它在另一个维度上完全没有连续性约束。**
 *    要平滑就必须解二维问题。
 *
 * 这里解拉普拉斯方程 ∇²I = 0（边界条件 = 区域四周的真实像素），数值上就是
 * 「未知像素反复取四邻域平均」。直接在原分辨率迭代收敛极慢（信息每次只传播 1px），
 * 因此用**图像金字塔**：粗尺度上少量迭代就能把全局色彩传播到位，再逐级上采样细化。
 */
type InpaintPlane = {
  w: number;
  h: number;
  c: [Float32Array, Float32Array, Float32Array];
  m: Uint8Array; // 1 = 未知（待填充）
};

function downsamplePlane(p: InpaintPlane): InpaintPlane {
  const w = Math.max(1, p.w >> 1);
  const h = Math.max(1, p.h >> 1);
  const c: [Float32Array, Float32Array, Float32Array] = [
    new Float32Array(w * h),
    new Float32Array(w * h),
    new Float32Array(w * h),
  ];
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum0 = 0;
      let sum1 = 0;
      let sum2 = 0;
      let known = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sy = Math.min(p.h - 1, y * 2 + dy);
          const sx = Math.min(p.w - 1, x * 2 + dx);
          const si = sy * p.w + sx;
          if (!p.m[si]) {
            sum0 += p.c[0][si];
            sum1 += p.c[1][si];
            sum2 += p.c[2][si];
            known++;
          }
        }
      }
      const di = y * w + x;
      // 2x2 块里只要有一个已知像素，粗级就算已知（保住边界条件不被稀释掉）
      if (known > 0) {
        c[0][di] = sum0 / known;
        c[1][di] = sum1 / known;
        c[2][di] = sum2 / known;
      } else {
        m[di] = 1;
      }
    }
  }
  return { w, h, c, m };
}

/** 把粗级结果双线性放大，作为细级未知像素的初值（已知像素不动） */
function upsampleInto(coarse: InpaintPlane, fine: InpaintPlane): void {
  for (let y = 0; y < fine.h; y++) {
    const gy = Math.min(coarse.h - 1, y >> 1);
    for (let x = 0; x < fine.w; x++) {
      const fi = y * fine.w + x;
      if (!fine.m[fi]) continue;
      const gx = Math.min(coarse.w - 1, x >> 1);
      const gi = gy * coarse.w + gx;
      fine.c[0][fi] = coarse.c[0][gi];
      fine.c[1][fi] = coarse.c[1][gi];
      fine.c[2][fi] = coarse.c[2][gi];
    }
  }
}

/** Jacobi 迭代：未知像素取四邻域平均，已知像素固定不变 */
function jacobiRelax(p: InpaintPlane, iterations: number): void {
  const { w, h, m } = p;
  for (let k = 0; k < 3; k++) {
    const cur = p.c[k];
    let next = new Float32Array(cur);
    for (let it = 0; it < iterations; it++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const up = y > 0 ? cur[i - w] : cur[i];
          const down = y < h - 1 ? cur[i + w] : cur[i];
          const left = x > 0 ? cur[i - 1] : cur[i];
          const right = x < w - 1 ? cur[i + 1] : cur[i];
          next[i] = (up + down + left + right) * 0.25;
        }
      }
      cur.set(next);
    }
    p.c[k] = cur;
  }
}

function solveInpaint(p: InpaintPlane, iterations: number): void {
  if (p.w <= 8 || p.h <= 8) {
    jacobiRelax(p, 80);
    return;
  }
  const coarse = downsamplePlane(p);
  solveInpaint(coarse, iterations);
  upsampleInto(coarse, p);
  jacobiRelax(p, iterations);
}

/**
 * 对 raw 像素缓冲区按 mask 做扩散填充，就地写回 out。
 * @param mask 长度 width*height，1 表示该像素需要被重建
 */
function diffusionInpaint(
  out: Buffer,
  source: Buffer | Uint8Array,
  width: number,
  height: number,
  ch: number,
  mask: Uint8Array,
): void {
  const plane: InpaintPlane = {
    w: width,
    h: height,
    c: [
      new Float32Array(width * height),
      new Float32Array(width * height),
      new Float32Array(width * height),
    ],
    m: mask,
  };
  for (let p = 0; p < width * height; p++) {
    const i = p * ch;
    plane.c[0][p] = source[i];
    plane.c[1][p] = source[i + 1];
    plane.c[2][p] = source[i + 2];
  }
  solveInpaint(plane, 24);
  for (let p = 0; p < width * height; p++) {
    if (!mask[p]) continue;
    const i = p * ch;
    out[i] = Math.max(0, Math.min(255, Math.round(plane.c[0][p])));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(plane.c[1][p])));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(plane.c[2][p])));
  }
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
 * 笔画级本地擦除（2026-09-21 换路线配套，全确定性 local 链路的第一步）。
 *
 * 背景：local 模式此前依赖上游（即梦背景修复）出「干净底图」，但实测
 * ①每次脑补的背景颜色随机（白灰/蓝色底板事故）、②复杂纹理擦不净（残影）。
 * 本函数彻底摆脱上游：只把**原字笔画像素**（前景色提取+膨胀+羽化）替换为
 * 「沿 x 线性插值背景」（eraseTextRegionsLocally 的整块插值结果只取笔画处），
 * 笔画之外的一切背景像素原样保留 —— 插值补丁只出现在笔画形状内，
 * 颜色来自原图本身，不再有任何上游脑补。
 *
 * 兜底：某 region 墨迹提取不到（<bbox 0.5%）时，该 region 回退整块 bbox
 * 插值（eraseTextRegionsLocally 旧行为），保证擦除不比现状差。
 */
export async function eraseTextInkLocally(
  imageBuffer: Buffer,
  textRegions: DrawTextRegion[],
  editedText: string,
  width: number,
  height: number,
): Promise<Buffer> {
  // 参考背景：整块 bbox 沿 x 插值的结果（只取笔画处像素）
  const interpolated = await eraseTextRegionsLocally(
    imageBuffer,
    textRegions,
    editedText,
    width,
    height,
  );
  const [origRaw, interpRaw] = await Promise.all([
    sharp(imageBuffer, { limitInputPixels: false })
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(interpolated, { limitInputPixels: false })
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  const ch = origRaw.info.channels;

  /**
   * 笔画判定（2026-09-21 换路线改版）：与插值背景的色距，而非前景色聚类。
   *
   * 旧版用 extractTextColor(K-means) 取主色再按色距提取墨迹 —— 在多色
   * 艺术字（橙字+白描边+灰蓝背景）上 K-means 经常取到背景簇，墨迹 mask
   * 抓反（背景被判成笔画、笔画留在原地），实测表现就是「地表最强集结」
   * 整行残影零报错存活。改为「偏离即将填入的插值背景 ⇒ 是笔画」：
   * 与颜色数量/描边/渐变无关，口径自洽（填的就是插值色）。
   */
  const INK_DIFF_THRESHOLD = 150;
  const alpha = Buffer.alloc(width * height, 0);
  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);
  // 实际被修改的区域（择优阶段只在这些区域上量残留）
  const changedRegions: DrawTextRegion[] = [];

  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    const originalText = (region.text || "").trim();
    const newText =
      typeof region.targetText === "string"
        ? region.targetText.trim()
        : replacementMap.get(i);
    if (newText === undefined || newText === originalText) continue;
    changedRegions.push(region);

    const x0 = Math.max(0, Math.round(region.x * width));
    const y0 = Math.max(0, Math.round(region.y * height));
    const w = Math.max(1, Math.round(region.width * width));
    const h = Math.max(1, Math.round(region.height * height));
    const x1 = Math.min(width, x0 + w);
    const y1 = Math.min(height, y0 + h);
    if (x1 <= x0 || y1 <= y0) continue;

    // bbox 内逐像素比对原图与插值背景（略微外扩覆盖抗锯齿边缘）
    // 同 eraseTextRegionsLocally：外扩是为盖住抗锯齿边缘，属绝对量，需封顶
    const padX = Math.min(6, Math.round(w * 0.03));
    const padY = Math.min(8, Math.round(h * 0.06));
    const ex0 = Math.max(0, x0 - padX);
    const ey0 = Math.max(0, y0 - padY);
    const ex1 = Math.min(width, x1 + padX);
    const ey1 = Math.min(height, y1 + padY);
    const bw = ex1 - ex0;
    const bh = ey1 - ey0;
    const ink = new Uint8Array(bw * bh);
    let inkCount = 0;
    /**
     * 笔画判定基准 = **局部窗口中位数**，不是整行 x 向插值。
     *
     * 整块 bbox 沿 x 插值在「复杂纹理背景 + 斜体大字」上会让背景自身
     * 相对插值结果就差很多（实测 diff>90 的像素占 63~75%），把大片背景
     * 误判成笔画 —— 擦除退化成整块矩形抹平，正是用户看到的「大色块」。
     * 局部中位数只反映「这一小片背景大致什么颜色」，笔画因为面积小
     * 不会污染中位数，于是「偏离局部中位数」才是真正的笔画信号。
     */
    const WIN = Math.max(4, Math.min(12, Math.round(Math.min(bw, bh) * 0.06)));
    const localMedian = (cx: number, cy: number): [number, number, number] => {
      const samples: Array<[number, number, number]> = [];
      const sx0 = Math.max(ex0, cx - WIN);
      const sx1 = Math.min(ex1, cx + WIN);
      const sy0 = Math.max(ey0, cy - WIN);
      const sy1 = Math.min(ey1, cy + WIN);
      const stepX = Math.max(1, Math.floor((sx1 - sx0) / 12));
      const stepY = Math.max(1, Math.floor((sy1 - sy0) / 12));
      for (let y = sy0; y < sy1; y += stepY) {
        for (let x = sx0; x < sx1; x += stepX) {
          const i = (y * width + x) * ch;
          samples.push([origRaw.data[i], origRaw.data[i + 1], origRaw.data[i + 2]]);
        }
      }
      return medianColor(samples);
    };
    // 中位数按网格预计算再双线性取用，避免逐像素重算导致 O(n²) 卡死
    const GRID = Math.max(8, Math.round(WIN / 2));
    const gw = Math.ceil(bw / GRID) + 1;
    const gh = Math.ceil(bh / GRID) + 1;
    const gridMed: Array<[number, number, number]> = new Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        gridMed[gy * gw + gx] = localMedian(
          Math.min(ex1 - 1, ex0 + gx * GRID),
          Math.min(ey1 - 1, ey0 + gy * GRID),
        );
      }
    }
    /**
     * ⭐⭐⭐ 双基准取并集（2026-09-22）。
     *
     * 单看「偏离局部中位数」抓不全描边艺术字：橙字+白描边+深色投影三层颜色，
     * 总有一层碰巧接近局部中位数而被判成背景 —— mask 空心，扩散填充时
     * 空洞处的原字像素反被当成边界条件保护下来，表象是擦完留一圈白色幽灵轮廓。
     *
     * 加第二个基准：**整块扩散填充的结果**（interpRaw）。它是解拉普拉斯方程得到的
     * 真实背景估计，天然平滑且继承四周真实色彩；原字无论哪一层，相对它都有明显色差。
     * 两个基准取并集，互补覆盖。
     * 📌 判据：**多色/描边目标不存在单一"背景色"，单基准判据必然漏层。**
     */
    for (let y = ey0; y < ey1; y++) {
      const gy = Math.min(gh - 1, Math.round((y - ey0) / GRID));
      for (let x = ex0; x < ex1; x++) {
        const gx = Math.min(gw - 1, Math.round((x - ex0) / GRID));
        const base = gridMed[gy * gw + gx];
        const p = (y * width + x) * ch;
        const diffMed =
          Math.abs(origRaw.data[p] - base[0]) +
          Math.abs(origRaw.data[p + 1] - base[1]) +
          Math.abs(origRaw.data[p + 2] - base[2]);
        const diffInterp =
          Math.abs(origRaw.data[p] - interpRaw.data[p]) +
          Math.abs(origRaw.data[p + 1] - interpRaw.data[p + 1]) +
          Math.abs(origRaw.data[p + 2] - interpRaw.data[p + 2]);
        if (diffMed > INK_DIFF_THRESHOLD || diffInterp > INK_DIFF_THRESHOLD) {
          ink[(y - ey0) * bw + (x - ex0)] = 1;
          inkCount++;
        }
      }
    }

    const ratio = inkCount / (bw * bh);
    /**
     * 两侧兜底都退回「整块 bbox 抹平」：
     * - 过少(<2%)：判据没抓到笔画（空白区 / 拟合异常）；
     * - 过多(>45%)：笔画与背景不可分离（大字占满 + 高纹理），
     *   此时按笔画擦只会擦出一堆碎斑，整块插值反而更干净。
     * 📌 「没量到」和「量爆了」都必须显式定义行为，不能只处理一侧。
     */
    // 2026-09-22：笔画级改用扩散填充（边界条件是紧邻真实背景）后不再产生碎斑，
    // 上限从 0.45 放宽到 0.6；真正「不可分离」的极端情形仍由后面的择优兜住。
    if (ratio < 0.02 || ratio > 0.6) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) alpha[y * width + x] = 255;
      }
      continue;
    }
    /**
     * ⭐⭐ 闭运算填洞（2026-09-22）：diff 判据只抓「与背景色差大」的像素，
     * 于是**粗笔画内部**（颜色均匀、与局部中位数接近）和**描边夹层**会被判成背景，
     * mask 变成一圈空心轮廓。直接拿去扩散填充，空洞处的原字像素被当成边界条件
     * 反而被"保护"下来 —— 实测表象就是擦完留下一圈白色幽灵轮廓、橙字仍可辨。
     * 📌 判据：**空心的 mask 比没有 mask 更糟，因为它把要擦的东西当成了参照物。**
     * 闭运算（先大膨胀连通、再腐蚀回原尺寸）能把轮廓围出的内部一并纳入。
     */
    // 半径需封顶：太大会把相邻笔画之间的背景连片吞掉，糊成一块雾区。
    // 经验值 = 笔画粗细量级（约区域高的 3%），绝对上限 10px。
    const CLOSE_R = Math.max(3, Math.min(10, Math.round(bh * 0.03)));
    const closed = morphClose(ink, bw, bh, CLOSE_R);
    // 再外扩 3px 覆盖抗锯齿边缘
    const dilated = separableDilate(closed, bw, bh, 3, 3);
    for (let y = 0; y < bh; y++) {
      const fy = ey0 + y;
      for (let x = 0; x < bw; x++) {
        if (dilated[y * bw + x]) alpha[fy * width + ex0 + x] = 255;
      }
    }
  }

  /**
   * 羽化笔画边缘，混合时软过渡。
   *
   * ⚠️⚠️⚠️ 2026-09-22 事故修复：**sharp 回读 raw 单通道时不保证仍是单通道**。
   * 实测（probe-erase-ink3）喂 `channels: 1` 的 raw、blur 后 `.raw().toBuffer()`
   * 返回长度是 width*height*3（被当灰度图展开成 3 通道），而旧代码按
   * `softAlpha[p]`（像素索引）去读**字节数组**，等价于只取了前 1/3 画面且索引错位
   * —— alpha 几乎恒为 0，擦除改动率实测 0.00%，**零报错、零异常**，
   * 表象就是「原字整行残影存活」。
   *
   * 📌 判据：raw 像素缓冲区必须用「返回的实际 channels」换算下标，
   *    绝不能假设自己传进去的 channels 就是回读的 channels。
   */
  const softRaw = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(1.5)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const softAlpha = softRaw.data;
  const softCh = softRaw.info.channels;

  /**
   * ⭐⭐⭐ 2026-09-22 换法：笔画像素**单独做一次扩散填充**，而不是混合到整块插值图。
   *
   * 旧写法 `mix(原图, 整块插值图, alpha)` 的致命缺陷：整块插值图在笔画位置的取值
   * 来自「整行被抹平」的结果，所以哪怕 alpha 只圈住了笔画，填进去的颜色依然带着
   * **整块抹平的雾**，笔画级擦除因此永远继承整块的画质上限。
   *
   * 改成：以「膨胀后的笔画」为 mask 直接解拉普拉斯方程 —— 边界条件是**紧贴笔画的
   * 真实背景像素**（篮球纹理、人物边缘都还在），于是填充结果能自然接上周边细节，
   * 背景不会被抹平。
   * 📌 判据：**填充的质量取决于边界条件离得多近；先抹一大片再回取，等于自毁边界。**
   */
  const inkMask = new Uint8Array(width * height);
  let inkMaskCount = 0;
  for (let p = 0; p < width * height; p++) {
    // 羽化后 >8 即视为需要重建（保留一点边缘外扩，盖住抗锯齿）
    if (softAlpha[p * softCh] > 8) {
      inkMask[p] = 1;
      inkMaskCount++;
    }
  }
  const out = Buffer.from(origRaw.data);
  if (inkMaskCount > 0) {
    diffusionInpaint(out, origRaw.data, width, height, ch, inkMask);
  }
  const inkErased = await sharp(out, { raw: { width, height, channels: ch } })
    .png()
    .toBuffer();

  /**
   * ⭐⭐⭐ 自适应择优（2026-09-22）：笔画级擦除**不总是更好**。
   *
   * 实测（probe-erase-compare）在「复杂纹理背景 + 粗斜体艺术字」上，
   * 笔画级擦完残留边缘能量 16.4/17.5，而整块插值只有 8.1/4.4 ——
   * 笔画级擦出一堆碎斑、原字仍可读，反而更脏。
   *
   * 📌 判据：**「更精细的算法」不等于「结果更好」**，必须用可量化指标
   *    在运行时实测择优，而不是假设精细版恒优然后一路裸奔。
   * 这里用区域内平均梯度（原字还在 ⇒ 边缘多 ⇒ 能量高）做裁决。
   */
  if (changedRegions.length === 0) return inkErased;
  // 调试开关：强制返回某一路，便于隔离验收（生产不设此变量）
  const forced = process.env.ARTX_ERASE_FORCE;
  if (forced === "ink") return inkErased;
  if (forced === "interp") return interpolated;
  const [inkEnergy, interpEnergy] = await Promise.all([
    measureRegionEdgeEnergy(inkErased, changedRegions, width, height),
    measureRegionEdgeEnergy(interpolated, changedRegions, width, height),
  ]);

  /**
   * ⭐⭐⭐ 择优不能只看「擦得净不净」（2026-09-22 二次修正）。
   *
   * 边缘能量只衡量「原字还剩多少」，**完全衡量不了「背景保住了多少」** ——
   * 而后者恰恰是笔画级存在的理由。极端反例：把整个区域涂成纯色，
   * 边缘能量 = 0（"最干净"），但那显然是最差的结果。
   * 实测两路能量都已降到 1.0~3.1（残影都清干净了），此时真正的差别在于：
   * 整块插值把篮球纹理/人物手臂一起抹成雾，笔画级把它们留了下来。
   *
   * 📌 判据：**单指标择优必须检查"作弊解"是否会得满分**。会，就说明指标不完备，
   *    要补一个方向相反的指标。这里补「改动面积」：擦净度接近时，动得少的更优。
   */
  const inkChanged = countChangedPixels(origRaw.data, out, width, height, ch);
  const CLEAN_ENOUGH = 6; // 经验阈值：能量低于此即视为残影已清除
  if (inkEnergy <= CLEAN_ENOUGH && interpEnergy <= CLEAN_ENOUGH) {
    console.log(
      `[text_edit] 擦除择优: 两路均已擦净（笔画级 ${inkEnergy.toFixed(1)} / 整块 ${interpEnergy.toFixed(1)}）` +
        `，改动面积 ${(inkChanged * 100).toFixed(1)}% 取笔画级以保留背景细节`,
    );
    return inkErased;
  }
  if (interpEnergy < inkEnergy) {
    console.log(
      `[text_edit] 擦除择优: 整块插值更干净（能量 ${interpEnergy.toFixed(1)} < 笔画级 ${inkEnergy.toFixed(1)}）`,
    );
    return interpolated;
  }
  console.log(
    `[text_edit] 擦除择优: 笔画级更干净（能量 ${inkEnergy.toFixed(1)} <= 整块插值 ${interpEnergy.toFixed(1)}）`,
  );
  return inkErased;
}

/** 改动像素占比：衡量「背景被动了多少」，与边缘能量互为反向指标。 */
function countChangedPixels(
  a: Buffer | Uint8Array,
  b: Buffer | Uint8Array,
  width: number,
  height: number,
  ch: number,
): number {
  let changed = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * ch;
    const d =
      Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 30) changed++;
  }
  return changed / (width * height);
}

/**
 * 区域内平均梯度能量：衡量「原文字是否还残留」的客观指标。
 * 擦干净 ⇒ 区域变平滑 ⇒ 能量低；原字/碎斑还在 ⇒ 边缘多 ⇒ 能量高。
 */
export async function measureRegionEdgeEnergy(
  buffer: Buffer,
  regions: DrawTextRegion[],
  width: number,
  height: number,
): Promise<number> {
  if (regions.length === 0) return 0;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let sum = 0;
  let count = 0;
  for (const region of regions) {
    const x0 = Math.max(1, Math.round(region.x * width));
    const y0 = Math.max(1, Math.round(region.y * height));
    const x1 = Math.min(width - 1, x0 + Math.round(region.width * width));
    const y1 = Math.min(height - 1, y0 + Math.round(region.height * height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * ch;
        sum +=
          Math.abs(data[i + ch] - data[i - ch]) +
          Math.abs(data[i + width * ch] - data[i - width * ch]);
        count++;
      }
    }
  }
  return count ? sum / count : 0;
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

/**
 * ink 级贴回蒙版（2026-09-21 换路线配套）。
 *
 * 背景：createModifiedRegionsMask 把「被改 region 的整个 bbox 矩形」都交给
 * edited 图，而擦字图在 bbox 内的背景是即梦**脑补**的（复杂纹理背景常被
 * 补成错误色调，用户看到的就是「字周围一圈白灰底板」）。
 *
 * 本函数把合成粒度从 bbox 矩形细化到**笔画**：
 * - 新字墨迹 = drawn 相对擦字图的强差异像素（diff 检测，天然涵盖旋转/描边/投影）
 * - 原字墨迹 = 与该 region 前景色接近的像素（readRegionInkMask）
 * 两者膨胀后取并集才交给 edited 图，其余像素（=绝大多数背景）一律保原图 ——
 * 擦字脑补的背景根本没机会上屏。
 *
 * 兜底：某 region 两类墨迹都检测不到时，该 region 回退 bbox 矩形（旧行为），
 * 绝不比现状差。
 */
export async function createInkLevelEditMask(input: {
  originalBuffer: Buffer;
  cleanedBuffer: Buffer;
  drawnBuffer: Buffer;
  textRegions: DrawTextRegion[];
  editedText: string;
  width: number;
  height: number;
}): Promise<Buffer> {
  const { originalBuffer, cleanedBuffer, drawnBuffer, textRegions, editedText, width, height } = input;
  const lines = editedText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length === 0) {
    return sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
    })
      .png()
      .toBuffer();
  }

  const sortedRegions = [...textRegions].sort((a, b) => a.y - b.y || a.x - b.x);
  const originalLines = sortedRegions.map(r => (r.text || "").trim());
  const replacementMap = buildReplacementMap(originalLines, lines);

  const [origRaw, cleanedRaw, drawnRaw] = await Promise.all([
    sharp(originalBuffer)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(cleanedBuffer)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(drawnBuffer)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  const ch = cleanedRaw.info.channels;

  // alpha=255（用原图）；命中墨迹的位置写 0（用 edited）
  const data = Buffer.alloc(width * height * 4, 255);

  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];
    const originalText = (region.text || "").trim();
    const newText =
      typeof region.targetText === "string"
        ? region.targetText.trim()
        : replacementMap.get(i);
    if (newText === undefined || newText === originalText) continue;

    const x0 = Math.max(0, Math.round(region.x * width));
    const y0 = Math.max(0, Math.round(region.y * height));
    const w = Math.max(1, Math.round(region.width * width));
    const h = Math.max(1, Math.round(region.height * height));
    const x1 = Math.min(width, x0 + w);
    const y1 = Math.min(height, y0 + h);
    // bbox 外扩 6px：新字旋转后端点/描边/投影可能略越出 OCR bbox
    const ex0 = Math.max(0, x0 - 6);
    const ey0 = Math.max(0, y0 - 6);
    const ex1 = Math.min(width, x1 + 6);
    const ey1 = Math.min(height, y1 + 6);
    const bw = ex1 - ex0;
    const bh = ey1 - ey0;

    // 1) 新字墨迹：drawn 相对 cleaned 的强差异像素
    const newInk = new Uint8Array(bw * bh);
    let newCount = 0;
    for (let y = ey0; y < ey1; y++) {
      for (let x = ex0; x < ex1; x++) {
        const si = (y * width + x) * ch;
        const diff =
          Math.abs(drawnRaw.data[si] - cleanedRaw.data[si]) +
          Math.abs(drawnRaw.data[si + 1] - cleanedRaw.data[si + 1]) +
          Math.abs(drawnRaw.data[si + 2] - cleanedRaw.data[si + 2]);
        if (diff > 60) {
          newInk[(y - ey0) * bw + (x - ex0)] = 1;
          newCount++;
        }
      }
    }

    // 2) 原字墨迹：原图相对擦净图（本地擦除后）的差异像素 —— 与实际被擦除
    //    的范围自洽（eraseTextInkLocally 填了哪，这里就取哪）。不再用前景色
    //    聚类提取：多色艺术字上 K-means 取到背景簇时墨迹会抓反（残影事故）。
    let origInk: Uint8Array | null = null;
    let origCount = 0;
    {
      const ink = new Uint8Array(bw * bh);
      for (let y = ey0; y < ey1; y++) {
        for (let x = ex0; x < ex1; x++) {
          const si = (y * width + x) * ch;
          const diff =
            Math.abs(origRaw.data[si] - cleanedRaw.data[si]) +
            Math.abs(origRaw.data[si + 1] - cleanedRaw.data[si + 1]) +
            Math.abs(origRaw.data[si + 2] - cleanedRaw.data[si + 2]);
          if (diff > 60) {
            ink[(y - ey0) * bw + (x - ex0)] = 1;
            origCount++;
          }
        }
      }
      origInk = ink;
    }

    // 3) 两类墨迹都为空：该 region 回退 bbox 矩形（旧行为），保证不比现状差
    if (newCount === 0 && (origCount === 0 || !origInk)) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          data[(y * width + x) * 4 + 3] = 0;
        }
      }
      continue;
    }

    // 4) 分别膨胀后取并集：新字 +5px（描边/投影光效溢出），原字 +3px（擦除余量）
    const dilatedNew = newCount > 0 ? separableDilate(newInk, bw, bh, 5, 5) : newInk;
    const dilatedOrig = origInk && origCount > 0 ? separableDilate(origInk, bw, bh, 3, 3) : null;
    for (let y = ey0; y < ey1; y++) {
      for (let x = ex0; x < ex1; x++) {
        const p = (y - ey0) * bw + (x - ex0);
        if (dilatedNew[p] || (dilatedOrig && dilatedOrig[p])) {
          data[(y * width + x) * 4 + 3] = 0;
        }
      }
    }
  }

  // 轻微羽化：墨迹边界软过渡，避免笔画级硬边锯齿
  return sharp(data, { raw: { width, height, channels: 4 } })
    .blur(1.2)
    .png()
    .toBuffer();
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
 * 内容锚定的行匹配：先把「文本完全相同」的行钉死为未改动，剩下的才按顺序对齐。
 *
 * ⚠️⚠️⚠️ 2026-09-21 这一趟是必需的，不是优化。
 *
 * 【为什么不能直接 buildReplacementMap】
 * buildReplacementMap 的两条路径都**隐含假设「两个数组的行序一一对应」**：
 *   - n === m 时逐下标比对；
 *   - n !== m 时用 LCS，而 LCS 同样是顺序敏感的。
 * 但这个前提在真实前端链路上**根本不成立**：
 *   - textRegions 来自 OCR，本函数还会再按 y 重排；
 *   - editedText 来自大模型「按商业设计阅读层级整理」后的结果
 *     （InfiniteCanvas.tsx 的 commercial-ocr-copy-structure 提示词明确要求
 *      「保留主标题、副标题、卖点、按钮文案的阅读顺序」，还允许轻度去重清理）。
 * 两者是两套排序规则，行序天然不对应。
 *
 * 【实测后果】线上海报 9 个区域，用户只改了 1 行（大吉大利和平年→欢乐中国年），
 * 按 y 排序后的区域序是 16+/CADPA/适龄提示/PEACE/…，而 editedText 行序是
 * GAME FOR PEACE/欢乐中国年/…/适龄提示。n===m 走逐下标比对，
 * 判定结果是 **8/9 行「被改动」**，且每一行都配错了目标文案：
 *   16+ → GAME FOR PEACE、CADPA → 欢乐中国年、大吉大利和平年 → CADPA …
 * 📌 全程零报错。下游据此擦字/叠字，表现就是「改一行却动了大半张图」。
 *
 * 【为什么内容锚定是对的】
 * 「文本一模一样」是比「下标相同」强得多的证据，且与顺序无关。
 * 先用它钉住所有未改动行，剩下的残差再交给原有 LCS —— 既修了错位，
 * 又保留了「纯新增行 / 行数不等」这些老场景的既有行为。
 *
 * 一个都锚不住时原样回退 buildReplacementMap，保证不改变历史语义。
 */
function buildContentAnchoredReplacementMap(
  original: string[],
  updated: string[],
): Map<number, string> {
  const usedUpdated = new Set<number>();
  const anchoredOriginal = new Set<number>();
  for (let i = 0; i < original.length; i++) {
    const text = original[i];
    if (!text) continue;
    for (let j = 0; j < updated.length; j++) {
      if (usedUpdated.has(j)) continue;
      if (updated[j] === text) {
        usedUpdated.add(j);
        anchoredOriginal.add(i);
        break;
      }
    }
  }
  /*
    注意：这里**不需要**再写一条「anchoredOriginal 为空就回退 buildReplacementMap」。
    零锚点时残差集合恒等于全集（residualIndexes 覆盖所有下标、residualUpdated 覆盖所有行），
    下面这段的入参与直接调 buildReplacementMap 完全相同，回退分支是死代码。
    2026-09-21 变异测试证实：删掉它测试不会变红 —— 属等价变异，而不是"没测到"。
    留着反而会让人误以为存在一条独立的保护路径。
  */
  const residualIndexes = original.map((_, i) => i).filter(i => !anchoredOriginal.has(i));
  const residualOriginal = residualIndexes.map(i => original[i]);
  const residualUpdated = updated.filter((_, j) => !usedUpdated.has(j));
  const residualMap = buildReplacementMap(residualOriginal, residualUpdated);

  const map = new Map<number, string>();
  residualMap.forEach((text, residualIdx) => {
    const originalIdx = residualIndexes[residualIdx];
    if (originalIdx !== undefined) map.set(originalIdx, text);
  });
  return map;
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
  // ⚠️ 必须走内容锚定：区域按 y 排序、文案按阅读层级排序，两者行序不对应。
  const replacementMap = buildContentAnchoredReplacementMap(originalLines, lines);

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
