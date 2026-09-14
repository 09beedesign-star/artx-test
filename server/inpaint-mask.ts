/**
 * 局部重绘蒙版构建 —— 通道无关的通用实现。
 *
 * 由来（2026-09-13）：
 * 这段逻辑原本叫 `buildMeituMask`，住在 `server/meitu-client.ts` 里。但它跟美图没有
 * 任何关系 —— 做的是纯粹的 **alpha → 白/黑二值蒙版** 转换，而且佐糖擦除通道
 * （image-generation.ts 的"佐糖物体擦除"项）一直在复用它，理由是两家的 mask 契约相同：
 *   **白 = 重绘/擦除区，黑 = 保留区。**
 *
 * 移除美图通道时，如果跟着 meitu-client.ts 一起删掉，佐糖擦除会一并挂掉 ——
 * 所以先把它迁到这里、去掉对 `getMeituConfig()` 的依赖，再删美图。
 *
 * 📌 命名教训：以某个供应商命名一个其实通用的函数，会让"删除该供应商"变成
 * 牵一发动全身的改动。判断依据看**它读不读该供应商的专属配置**，而不是看名字。
 */

/** 蒙版调参。可用环境变量覆盖，一般无需改。 */
function getMaskConfig() {
  const clampPx = (value: number, fallback: number) => {
    const parsed = Number.isFinite(value) ? Number(value) : fallback;
    return Math.max(0, Math.min(Math.round(parsed), 30));
  };

  // 兼容旧键名：这两个参数历史上叫 MEITU_MASK_*，但它们调的是蒙版几何形状，
  // 跟具体走哪个上游无关，所以新键名去掉了供应商前缀。
  // 生产 .env.gray 里两个键都没设置，走默认值；本地 .env 可能还留着旧键。
  const expandRaw = process.env.INPAINT_MASK_EXPAND_PX ?? process.env.MEITU_MASK_EXPAND_PX;
  const featherRaw = process.env.INPAINT_MASK_FEATHER_PX ?? process.env.MEITU_MASK_FEATHER_PX;

  return {
    /** 白色（重绘）区域向外扩展像素数（建议 5-10，防止紧贴物体轮廓导致生成补丁感） */
    maskExpandPx: clampPx(Number(expandRaw), 6),
    /** 蒙版边缘羽化像素数（建议 4-8，硬边界会留下明显接缝） */
    maskFeatherPx: clampPx(Number(featherRaw), 6),
  };
}

/** 是否开启蒙版调试落盘（默认关闭，避免污染工作目录） */
function isMaskDebugEnabled(): boolean {
  return Boolean(getMaskDebugDir());
}

function getMaskDebugDir(): string {
  return (process.env.INPAINT_MASK_DEBUG_DIR ?? process.env.MEITU_DEBUG_MASK_DIR ?? "").trim();
}

/**
 * 调试蒙版落盘。
 *
 * ⚠️ 历史实现无条件往 process.cwd() 写 PNG，导致仓库根目录堆积上百个
 * debug-mask-*.png。现在必须显式配置目录才落盘。
 */
async function writeDebugMask(label: string, buffer: Buffer): Promise<void> {
  const dir = getMaskDebugDir();
  if (!dir) return;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `debug-mask-${label}-${Date.now()}.png`), buffer);
  } catch {
    /* 调试写盘失败不影响主流程 */
  }
}

/**
 * 二维 box-max（形态学膨胀）—— 两个一维滑动窗口最大值 pass（水平 + 垂直），O(width*height)。
 * 输入为单通道行优先数组，输出为每个像素在 radius 方形邻域内的最大值：
 * 白色(255)像素会把周边 radius 像素内的邻居"染白"，即白色区域向外扩展 radius 像素。
 */
function boxDilateBinary(
  singleChannel: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return singleChannel;
  const horizontal = new Uint8Array(singleChannel.length);
  // 水平 pass：窗口 [x-radius, x+radius] 的最大值
  for (let y = 0; y < height; y++) {
    const base = y * width;
    const deque: number[] = [];
    for (let right = 0; right < width; right++) {
      const value = singleChannel[base + right];
      while (deque.length > 0 && singleChannel[base + deque[deque.length - 1]] <= value) deque.pop();
      deque.push(right);
      while (deque.length > 0 && deque[0] < right - 2 * radius) deque.shift();
      const outX = right - radius;
      if (outX >= 0) horizontal[base + outX] = singleChannel[base + deque[0]];
    }
  }
  const output = new Uint8Array(singleChannel.length);
  // 垂直 pass：同样逻辑作用在列上
  for (let x = 0; x < width; x++) {
    const deque: number[] = [];
    for (let bottom = 0; bottom < height; bottom++) {
      const value = horizontal[bottom * width + x];
      while (deque.length > 0 && horizontal[deque[deque.length - 1] * width + x] <= value) deque.pop();
      deque.push(bottom);
      while (deque.length > 0 && deque[0] < bottom - 2 * radius) deque.shift();
      const outY = bottom - radius;
      if (outY >= 0) output[outY * width + x] = horizontal[deque[0] * width + x];
    }
  }
  return output;
}

/**
 * 将前端注释蒙版转换为局部重绘 / 物体擦除通用的 mask：
 * - 透明像素（= 注释编辑区）→ 白色（重绘区）
 * - 不透明像素（= 保留区）→ 黑色
 * - 白色区域向外扩展 maskExpandPx 像素（避免紧贴物体轮廓，防止补丁感）
 * - 边缘做 maskFeatherPx 像素羽化（避免硬边界生成后出现明显接缝）
 * 强制缩放至与目标图同尺寸，输出 JPEG。
 *
 * 佐糖 inpaint 与其它 inpainting 上游的 mask 契约一致（白=擦除区、黑=保留区），
 * 因此可以共用这一份实现。
 */
export async function buildInpaintMask(
  maskBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  await writeDebugMask(`raw-${width}x${height}`, maskBuffer);
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const providerMask = Buffer.alloc(width * height * 4);
  let whitePixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      // alpha < 250 视为编辑区。用 250 而不是 255 是为了容忍前端抗锯齿边缘。
      const editRegion = data[index + 3] < 250;
      const value = editRegion ? 255 : 0;
      if (editRegion) whitePixelCount += 1;
      providerMask[index] = value;
      providerMask[index + 1] = value;
      providerMask[index + 2] = value;
      providerMask[index + 3] = 255;
    }
  }

  // 白色（重绘）区域向外扩展：避免紧贴物体轮廓导致补丁感/错位
  const maskConfig = getMaskConfig();
  const expandPx = maskConfig.maskExpandPx;
  const maskRgba = expandPx > 0
    ? (() => {
        const single = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) single[i] = providerMask[i * 4];
        const dilated = boxDilateBinary(single, width, height, expandPx);
        const expanded = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          const value = dilated[i];
          expanded[i * 4] = value;
          expanded[i * 4 + 1] = value;
          expanded[i * 4 + 2] = value;
          expanded[i * 4 + 3] = 255;
        }
        return expanded;
      })()
    : providerMask;

  console.log(
    `[inpaint-mask] 输出: ${width}x${height}, ` +
    `重绘区(白)占比=${((whitePixelCount / Math.max(1, width * height)) * 100).toFixed(2)}%, ` +
    `扩展=${expandPx}px, 羽化=${maskConfig.maskFeatherPx}px`,
  );

  // 边缘羽化：Gaussian blur 让硬边界变软（避免生成后一圈接缝），再编码 JPEG
  const featherPx = maskConfig.maskFeatherPx;
  if (isMaskDebugEnabled()) {
    const debugBuf = await sharp(maskRgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
    await writeDebugMask(`final-${width}x${height}`, debugBuf);
  }
  return sharp(maskRgba, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })
    .blur(featherPx > 0 ? Math.max(0.5, featherPx / 2) : 0)
    .jpeg({ quality: 100 })
    .toBuffer();
}

export type MaskSurroundingFlatness = {
  /** 亮度标准差（0~255）。对离群值敏感，仅作参考，不参与分档。 */
  stdDev: number;
  /** 外环采样像素总数。0 表示蒙版外没有可采样的背景。 */
  sampleCount: number;
  /** 亮度 P90 - P10 极差：调用方判定背景复杂度的**主判据**。 */
  robustSpread: number;
  p10: number;
  p90: number;
  meanLuma: number;
};

/**
 * 测量蒙版「紧邻外环」的背景复杂度。
 *
 * 存在意义（2026-09-13）：
 * text_edit 的擦字通道链里，佐糖是生成式 inpaint —— 它在照片 / 复杂纹理上回填质量不错，
 * 但在**平涂背景**上会脑补出色块、明暗不匀和接缝，这是用户反馈「纯色背景回填很一般」
 * 的直接来源；而本地像素擦除（eraseTextRegionsLocally：逐行取区域外侧中位色 + 沿 x 插值）
 * 在平涂上等价于精确常量填充，在柔和渐变上也能逐行跟上纵向变化，天然没有这类伪影。
 * 反过来，在**复杂纹理**上本地插值会拉出水平条纹，这时必须让佐糖优先。
 * 所以本函数的职责就是回答「这块背景该不该交给生成式模型」。
 *
 * 为什么主判据是 P90-P10 极差而不是标准差：
 * 标准差对方差二次敏感，离群值一压就爆 —— 外环只要有一小段压到人物/花纹，整圈读数
 * 就被拉高。实测 Lookbook 类样张的标题紧贴模特肩部，一圈里混进两成深色像素即可让
 * stdDev > 20，于是被误判成「复杂背景」交给佐糖，最终在平涂底上留下接缝。
 * P90-P10 砍掉两端各 10% 的样本，对这类局部污染免疫。
 *
 * 经验分档（亮度极差，0~255），与 image-generation.ts 的
 * classifyBackgroundComplexity 同步维护：
 *   < 12   平涂 / 近纯色（含 JPEG 噪点）→ 本地像素擦除优先
 *   12~26  柔和渐变 / 低对比度摄影底    → 本地像素擦除优先，佐糖兜底
 *   >= 26  照片 / 复杂纹理              → 佐糖优先
 * 该分档是 2026-09-13 的初值。`[text_edit] 背景判定` 日志会把实测极差打出来，
 * 后续按真实样张标定，不要凭感觉改。
 *
 * @param ringPx 外环宽度。应取「擦字实际外扩量」（即蒙版膨胀半径），
 *               这样采到的正是擦除通道真正会改写的那一圈背景。
 */
export async function measureMaskSurroundingFlatness(
  imageBuffer: Buffer,
  maskBuffer: Buffer,
  width: number,
  height: number,
  ringPx: number,
): Promise<MaskSurroundingFlatness> {
  const sharp = (await import("sharp")).default;
  const [imageRaw, maskRaw] = await Promise.all([
    sharp(imageBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(maskBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  const imageChannels = imageRaw.info.channels;
  const imagePixels = imageRaw.data;
  const maskPixels = maskRaw.data;

  // 与 buildInpaintMask 保持同一契约：alpha < 250 视为编辑区。
  const editRegion = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    editRegion[i] = maskPixels[i * 4 + 3] < 250 ? 255 : 0;
  }

  const radius = Math.max(1, Math.round(ringPx));
  const expanded = boxDilateBinary(editRegion, width, height, radius);

  // 亮度直方图（256 桶）：一次遍历同时得到均值/标准差和分位数。
  // 外环样本可达数万，排序取分位是 O(n log n)，直方图累加是 O(n)。
  const histogram = new Uint32Array(256);
  let sum = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  for (let i = 0; i < width * height; i++) {
    // 只取「编辑区之外、膨胀范围之内」的那一圈背景像素
    if (expanded[i] === 0 || editRegion[i] !== 0) continue;
    const offset = i * imageChannels;
    // removeAlpha 后灰度图只剩 1 个通道，这里做一次兜底避免越界读到相邻像素。
    const r = imagePixels[offset];
    const g = imageChannels >= 3 ? imagePixels[offset + 1] : r;
    const b = imageChannels >= 3 ? imagePixels[offset + 2] : r;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    histogram[Math.max(0, Math.min(255, Math.round(luma)))] += 1;
    sum += luma;
    sumSquares += luma * luma;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return { stdDev: 0, sampleCount: 0, robustSpread: 0, p10: 0, p90: 0, meanLuma: 0 };
  }
  const mean = sum / sampleCount;
  const variance = Math.max(0, sumSquares / sampleCount - mean * mean);
  const p10 = percentileFromHistogram(histogram, sampleCount, 0.1);
  const p90 = percentileFromHistogram(histogram, sampleCount, 0.9);
  return {
    stdDev: Math.sqrt(variance),
    sampleCount,
    robustSpread: p90 - p10,
    p10,
    p90,
    meanLuma: mean,
  };
}

/**
 * 从 256 桶亮度直方图取分位数（ratio ∈ [0,1]）。
 * 直方图的 luma 下标天然有序，所以不需要排序，累加到目标序号即得分位值。
 */
function percentileFromHistogram(
  histogram: Uint32Array,
  total: number,
  ratio: number,
): number {
  const target = Math.min(total - 1, Math.max(0, Math.floor(total * ratio)));
  let cumulative = 0;
  for (let luma = 0; luma < histogram.length; luma += 1) {
    cumulative += histogram[luma];
    if (cumulative > target) return luma;
  }
  return histogram.length - 1;
}
