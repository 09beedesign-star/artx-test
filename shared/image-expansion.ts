/**
 * 扩图能力的共享约束。
 *
 * 当前供应商：**腾讯云 VOD Kling**（`SceneType: image_expand`，2026-09-13 切换）。
 * 此前为佐糖 PicWish advanced-image-expand，其约束保留在下方，因为
 * `expandImageWithPicWish` 仍在仓库中作为回退实现存在。
 *
 * 两家的 prompt 上限差了一个量级，**不要混用**：
 *   佐糖 200 字符（硬上限，201 即 400）
 *   Kling 2500 字符
 *
 * 佐糖 200 上限的实测记录（必须携带真实图片才会走到该校验，否则先卡在图片参数校验）：
 *   prompt 长度 200 -> HTTP 200 受理
 *   prompt 长度 201 -> HTTP 400 Invalid params 'prompt', length must not exceed 200
 *   prompt 长度 500 -> HTTP 400 同上
 *
 * 此前前后端各自硬编码了 500~600 字符的默认提示词，服务端又按 500 截断，
 * 导致扩图请求必定被佐糖拒绝。前后端统一引用本文件，切勿再各写一份。
 */

export const PICWISH_EXPANSION_PROMPT_MAX_LENGTH = 200;

/** Kling 扩图的 prompt 上限，官方文档口径。 */
export const VOD_EXPANSION_PROMPT_MAX_LENGTH = 2500;

/**
 * 扩图的模型标识与供应商名。
 *
 * 以前这两个串在 server/index.ts、ai-orchestrator.ts、client/src/lib/ai.ts、
 * InfiniteCanvas.tsx 里各硬编码一份（共 7 处），换供应商时极易漏改，
 * 漏掉的地方会让台账里记着旧供应商、对账时对不上。统一到这里。
 */
export const VOD_IMAGE_EXPANSION_MODEL = "vod-kling-image-expand";
export const VOD_IMAGE_EXPANSION_PROVIDER = "腾讯云 VOD Kling";

/**
 * 默认扩图提示词。
 *
 * ⚠️ 历史包袱：2026-09-13 之前这里是一条被硬挤到「恰好 200 字符」的英文串 ——
 * 那个长度不是内容需要，而是佐糖 PicWish 的硬上限逼出来的。为了塞进 200 字，
 * 当时砍掉了对「接缝过渡」「不得新增物体」等关键约束的描述。
 *
 * 现在实际走的是 Kling（上限 2500），没有理由继续沿用被阉割的版本。
 * 下面这版按 outpaint 任务的真实失败模式逐条写明约束，分组如下：
 *   1. 作用域 —— 只画新增区域，原图一个像素都不许动（扩图最常见的翻车是整图重绘）；
 *   2. 连续性 —— 背景/光照/阴影/色温/颗粒/透视要接得上，接缝不能看出来；
 *   3. 负向约束 —— 不复制主体、不镜像、不缩放、不凭空加人或物、不加文字水印边框。
 *
 * 📌 改这里就等于改所有入口：server/index.ts、ai-orchestrator.ts、client/src/lib/ai.ts、
 *    InfiniteCanvas.tsx、vite.config.ts 共 6 处引用全部指向本常量，不要再各写一份。
 * 📌 长度不再需要贴着 200；但若将来回退到佐糖，clampImageExpansionPrompt 会把它
 *    截到 200，届时**必须重新精简内容**，而不是任由中间被切断。
 */
export const DEFAULT_IMAGE_EXPANSION_PROMPT = [
  "Outpaint only the newly added blank area around the original image.",
  "Preserve every original pixel exactly as-is: do not redraw, restyle, recolor, denoise or upscale any part of the source image.",
  "Extend the existing scene naturally so the result reads as one continuous photograph:",
  "match the background content, perspective and vanishing lines, lighting direction and intensity,",
  "shadow falloff, color temperature, white balance, depth of field, focus falloff, film grain and noise level.",
  "Make the boundary between original and generated areas seamless and invisible, with no visible seam, band, blur ring or tonal step.",
  "Do not duplicate, mirror, repeat, shift, rescale or crop the main subject.",
  "Do not introduce any new people, animals, objects, logos, text, watermarks, captions, frames or borders.",
  "If the extended region would otherwise be empty, continue the existing background rather than inventing new focal elements.",
].join(" ");

/**
 * 把 prompt 收敛到佐糖允许的长度。
 * 按码点截断，避免把代理对（emoji / 部分中文扩展区字符）从中间切断产生非法字符，
 * 再按 UTF-16 length 兜底，保证最终值一定不超过上限。
 */
export function clampImageExpansionPrompt(prompt: string | undefined | null): string {
  const trimmed = (prompt ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= PICWISH_EXPANSION_PROMPT_MAX_LENGTH) return trimmed;
  let result = Array.from(trimmed).slice(0, PICWISH_EXPANSION_PROMPT_MAX_LENGTH).join("");
  while (result.length > PICWISH_EXPANSION_PROMPT_MAX_LENGTH && result.length > 0) {
    result = Array.from(result).slice(0, -1).join("");
  }
  return result;
}
