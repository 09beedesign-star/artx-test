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

/** 默认扩图提示词，长度恰好 200，等于上限。修改后务必用 assert 校验长度。 */
export const DEFAULT_IMAGE_EXPANSION_PROMPT =
  "Outpaint only the blank extension area. Keep all original pixels unchanged. Match existing background, lighting, shadow, color, texture and perspective. Never duplicate, mirror or rescale the subject.";

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
