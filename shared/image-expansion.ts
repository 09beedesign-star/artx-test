/**
 * 扩图（PicWish / 佐糖 advanced-image-expand）的共享约束。
 *
 * 背景：佐糖 advanced-image-expand 接口对 prompt 有 200 字符的硬上限。
 * 2026-09-12 实测（必须携带真实图片才会走到该校验，否则先卡在图片参数校验）：
 *   prompt 长度 200 -> HTTP 200 受理
 *   prompt 长度 201 -> HTTP 400 Invalid params 'prompt', length must not exceed 200
 *   prompt 长度 500 -> HTTP 400 同上
 *
 * 此前前后端各自硬编码了 500~600 字符的默认提示词，服务端又按 500 截断，
 * 导致扩图请求必定被佐糖拒绝。前后端统一引用本文件，切勿再各写一份。
 */

export const PICWISH_EXPANSION_PROMPT_MAX_LENGTH = 200;

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
