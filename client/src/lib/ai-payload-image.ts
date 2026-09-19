/*
 * 送往 AI 接口的图片载荷压缩 —— 唯一事实源。
 *
 * 【为什么需要这个模块】
 * 2026-09-19 线上实测，点「提示词反推」会报：
 *   「反推失败：AI 请求失败: AI 后端地址未正确连接，当前请求返回了网页内容，请稍后刷新后重试」
 *
 * 这句提示**完全指错了方向**。真实链路是：
 *   1. 画布把图转成 `canvas.toDataURL("image/png")` —— 无损 PNG，不降采样；
 *   2. 一张 4K 图（3840×2160，HD 高清化的标准产物）转出来约 28MB，
 *      base64 后更大；
 *   3. 服务端 `express.json({ limit: "25mb" })`（server/index.ts）直接拒收，
 *      返回 **HTTP 413 + Express 默认的 HTML 错误页**；
 *   4. 前端 `readJsonResponse` 只看到响应体以 `<!DOCTYPE` 开头，
 *      于是报「后端地址未正确连接」。
 *
 * 📌 后端连得好好的，OCR 和反推接口实测都是 200。
 *    纯粹是图太大被网关拒了，却被翻译成了一句"连不上"。
 *
 * 【为什么压缩是纯收益，不是妥协】
 * 2026-09-19 同一张图三档对照实测（线上 /api/images/ocr）：
 *   ① 原图 PNG 1080 宽   载荷 0.57MB   15.3s   regions=6
 *   ② 4K  PNG 3840 宽    载荷 3.26MB   12.0s   regions=6
 *   ③ 降采样 1600 宽 JPEG82  载荷 0.20MB    7.6s   regions=6
 * 三档读出的文案**完全一致**（「球场触地即燃」「地表最强集结」都在）。
 * 即载荷小了 16 倍、快了一半，识别结果不变。
 *
 * 原因：视觉模型侧本来就会把图缩到自己的 patch 网格
 * （通常长边 1024~1568），送 4K 进去多出来的像素根本不参与推理，
 * 只是白白占满请求体、拖慢上传。
 *
 * ⚠️⚠️ 因此长边阈值**不能设得比模型网格还小**，否则才是真的丢字。
 *    1600 是「比模型网格略大一点」的安全值，留出余量。
 */

/** 送往 AI 的图片长边上限（像素）。见文件头实测：1600 与 4K 识别结果一致。 */
export const AI_PAYLOAD_IMAGE_MAX_EDGE = 1600;

/**
 * 单张图片 base64 后的体积上限（字节）。
 *
 * ⚠️ 这个值必须**明显小于**服务端 `express.json({ limit: "25mb" })`：
 *    一次请求可能带多张图（参考图链路最多带若干张），再加上提示词正文与
 *    其他字段，留不出余量就还是会撞 413。
 *    6MB 是「单张图撑满也能塞下 3 张 + 正文」的保守值。
 */
export const AI_PAYLOAD_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

/**
 * 整个请求体的体积上限（字节）。超过就说明还有别的字段在撑体积，
 * 需要让调用方看到明确报错而不是一句"连不上"。
 *
 * ⚠️ 必须与 server/index.ts 的 `express.json({ limit: "25mb" })` 对齐。
 *    有一条测试盯着这两个数字的关系，改一边忘另一边会变红。
 */
export const AI_REQUEST_BODY_LIMIT_BYTES = 25 * 1024 * 1024;

/** 压缩后统一用 JPEG：同画质下比 PNG 小一个数量级，且所有视觉模型都认。 */
const COMPRESSED_MIME = "image/jpeg";

/**
 * 逐级降质量重试的档位。
 *
 * 为什么要多档而不是一次定死：图片内容差异很大（纯色海报 vs 高噪点照片），
 * 同样 1600 宽、同样质量，出来的体积能差好几倍。
 * 从高画质开始试，够小就停 —— 宁可多压一次，也不要一上来就压成马赛克。
 */
const QUALITY_STEPS = [0.9, 0.82, 0.72, 0.6, 0.5];

/** 判断一个 src 是不是 data URL（只有 data URL 才需要我们在前端压） */
export function isDataUrl(src: string) {
  return typeof src === "string" && src.trim().startsWith("data:");
}

/**
 * 估算 data URL 解码后的真实字节数。
 *
 * ⚠️ 不能直接用 `src.length` 当字节数：base64 会把 3 字节编码成 4 字符，
 *    直接拿字符串长度判断会**高估 33%**，导致本来不用压的图也被压，
 *    白白掉画质。
 */
export function estimateDataUrlBytes(src: string) {
  const commaIndex = src.indexOf(",");
  if (commaIndex < 0) return src.length;
  const base64Length = src.length - commaIndex - 1;
  const padding = src.endsWith("==") ? 2 : src.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Length * 3) / 4) - padding);
}

/** 估算一个任意 JSON 载荷序列化后的字节数（用于超限时给出人话提示） */
export function estimateJsonBytes(value: unknown) {
  try {
    const text = JSON.stringify(value);
    if (typeof text !== "string") return 0;
    // 载荷里绝大部分是 base64（纯 ASCII），用 Blob 拿准确的 UTF-8 字节数；
    // 拿不到 Blob（测试环境 / 老浏览器）就退化成字符数，量级足够判断。
    if (typeof Blob !== "undefined") return new Blob([text]).size;
    return text.length;
  } catch {
    return 0;
  }
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    // 同源 data URL 不需要 crossOrigin，但显式设置不会有副作用，
    // 且将来若换成 http 源可以直接复用。
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败"));
    image.src = src;
  });
}

/**
 * 把一张 data URL 图片压到「可以安全塞进请求体」的大小。
 *
 * 返回原串的情况（**刻意不压**）：
 *   · 不是 data URL（远程 URL 由服务端自己去取，前端压不了也不该压）
 *   · 本来就够小且长边不超限
 *   · 浏览器环境不可用（SSR / 测试）
 *   · 压缩过程中任何一步失败
 *
 * ⚠️⚠️ 失败时必须**返回原图而不是抛错**。
 *    压缩是优化手段，不是业务要求。为了压缩失败就让用户的反推整个挂掉，
 *    是拿一个小概率的优化去赌一个必现的功能 —— 不划算。
 *    真的超限时，让它照常发出去、由服务端 413 配合新文案告诉用户"图太大"，
 *    也比这里静默失败强。
 */
export async function compressImageForAiPayload(src: string): Promise<string> {
  if (!isDataUrl(src)) return src;
  if (typeof document === "undefined" || typeof Image === "undefined") return src;

  const originalBytes = estimateDataUrlBytes(src);

  try {
    const image = await loadImageElement(src);
    const naturalWidth = Math.max(1, image.naturalWidth || image.width);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height);
    const longestEdge = Math.max(naturalWidth, naturalHeight);

    const needsResize = longestEdge > AI_PAYLOAD_IMAGE_MAX_EDGE;
    const needsShrink = originalBytes > AI_PAYLOAD_IMAGE_MAX_BYTES;
    if (!needsResize && !needsShrink) return src;

    const scale = needsResize ? AI_PAYLOAD_IMAGE_MAX_EDGE / longestEdge : 1;
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;

    /*
     * ⚠️ JPEG 没有 alpha 通道。不先铺一层白底，原图的透明区域
     *    在转 JPEG 时会变成**黑色**，OCR 读白字会直接瞎掉。
     *    这一步是必须的，不是美化。
     */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    let best = "";
    for (const quality of QUALITY_STEPS) {
      const candidate = canvas.toDataURL(COMPRESSED_MIME, quality);
      if (!candidate || !isDataUrl(candidate)) break;
      best = candidate;
      if (estimateDataUrlBytes(candidate) <= AI_PAYLOAD_IMAGE_MAX_BYTES) break;
    }
    if (!best) return src;

    /*
     * 最后一道保险：压完反而更大就用原图。
     * 对已经是高压缩比 JPEG 的小图，重新编码确实可能变大 ——
     * 那种情况下压缩毫无意义，别帮倒忙。
     */
    return estimateDataUrlBytes(best) < originalBytes ? best : src;
  } catch {
    return src;
  }
}

/**
 * 遍历任意请求体，把其中所有「看起来是图片 data URL」的字段压一遍。
 *
 * ⚠️⚠️ 为什么做成通用递归而不是在每个 API 函数里单独调：
 *    client/src/lib/ai.ts 里有 18 个导出函数会把图片发给后端
 *    （generateImages / editImageWithPrompt / extractImageText / callLLM /
 *     eraseImageObjects / expandImageWithMask / enhanceImageToHd ...），
 *    字段名还各不相同（imageSrc / maskSrc / images[].src /
 *    referenceImages[] / sourceBackgroundSrc ...）。
 *    挨个接必然漏，而且以后新增一个出口又会漏一次。
 *    收口在 fetchAiJson 这**唯一一个真正发请求的地方**，天然覆盖全部。
 *
 * ⚠️ 不改原对象：直接改会污染调用方手里的状态
 *    （画布节点 data 里存的就是同一个字符串引用）。
 */
export async function compressAiRequestBody<T>(body: T): Promise<T> {
  if (!body || typeof body !== "object") return body;

  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string") {
      return isDataUrl(value) ? await compressImageForAiPayload(value) : value;
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map(walk));
    }
    if (value && typeof value === "object") {
      const entries = await Promise.all(
        Object.entries(value as Record<string, unknown>).map(
          async ([key, item]) => [key, await walk(item)] as const
        )
      );
      return Object.fromEntries(entries);
    }
    return value;
  };

  return (await walk(body)) as T;
}
