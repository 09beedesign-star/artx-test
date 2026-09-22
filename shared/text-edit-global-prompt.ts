/**
 * 智能文案编辑（局部重绘 text_edit）的**全局提示词**。
 *
 * ── 这个文件解决什么问题 ────────────────────────────────────────
 * text_edit 的提示词全部硬编码在 server/image-generation.ts 里，
 * 分散在 textEditInstruction（基线 / 擦字成功后追加 / 目标文案）
 * 和 textEditNegativeInstruction 两处。想调整出图的通用倾向
 * （例如"字重再轻一点""不要加暗角"）必须去 3.7 万行文件里找那几个点，
 * 且极易只改一处 —— 本项目已经因"同一份逻辑多个出口"踩过十二次。
 *
 * 现在把「与具体某张图无关、每次出图都该生效」的那部分提示词集中到这里，
 * 作为**唯一事实源**。image-generation.ts 只负责把它拼进去。
 *
 * ── 边界：什么该写进来，什么不该 ──────────────────────────────
 * ✅ 该写：跨图片通用的**倾向与禁令**。
 * ❌ 不该写：与单次请求绑定的信息（具体文案、蒙版坐标、图片比例），
 *    那些是运行期计算的，仍然留在 image-generation.ts 里按请求拼装。
 *
 * ── ⚠️⚠️⚠️ 三条必须守住的硬约束 ──────────────────────────────
 *
 * ① **作用域只有 text_edit，不要扩大到全站出图。**
 *    text_edit 是**保真编辑**：蒙版外必须像素不变。
 *
 * ② **这段文字绝不能交给上游的 prompt 增强（enhancePrompt）。**
 *    VOD 的增强器是文生图导向的润色器，只保留"画什么"，
 *    把"不许动什么"整段丢弃 —— 零报错，只是给你另一张图。
 *    text_edit 链路上 enhancePrompt 已恒为 false
 *    （image-generation.ts），本文件的存在使这条约束更不能松动。
 *
 * ③ **提示词长度是有成本的。** 写倾向，不写清单。
 *
 * ── 为什么分成 positive / negative 两段 ────────────────────────
 * OpenAI 系图片编辑接口**没有 negative_prompt 字段**，负面约束只能以
 * "Avoid ..." 的形式并进正向提示词；而 VOD 链路有独立的 negativePrompt。
 * 分开存放，两条出口各取所需。
 */

/**
 * ════════════════════════════════════════════════════════════════
 * 2026-09-21 起，本文件内容**整体替换为用户提供的即梦 4.0 局部重绘配置**。
 *
 * 用户拍板的模型关键词配置（原始 JSON）：
 *   api = "火山即梦4.0 局部重绘inpaint"
 *   task = "局部重绘，文字擦除/文字替换，保留原图主体、光影、构图不变"
 *   prompt_global = 下方 TEXT_EDIT_GLOBAL_POSITIVE_PROMPT 的原文
 *   mask_prompt_templates = replace_cn_text / replace_en_text / remove_text 三段
 *
 * 即梦 4.0 无独立 negative_prompt 字段，负面约束按官方 tips 直接合并进
 * prompt_global，因此 TEXT_EDIT_GLOBAL_NEGATIVE_TERMS 已清空为占位。
 * ════════════════════════════════════════════════════════════════
 */

/**
 * 全局正向指令（即梦 4.0 官方 prompt_global 原文，逐字保留）。
 *
 * 命中上游是 vod-jimeng（即梦 4.0），即梦是国产模型，对中文提示词的
 * 遵循度高于等价英文表述 —— 提示词语言跟着上游模型的母语走。
 */
export const TEXT_EDIT_GLOBAL_POSITIVE_PROMPT = [
  "保持原图构图、光影、透视、色彩、质感不变，画面其余所有元素保持原样，仅修改蒙版选中区域。",
  "替换文字字体自然，文字大小匹配原图，文字边缘柔和，和原图光照融合，无变形扭曲，文字清晰可读，整体风格统一，干净边缘，不破坏背景。",
  "禁止文字错乱、乱码、扭曲字体、重复文字、物体移位、构图改变、光影突变、色彩偏移、多出物体、画面撕裂、模糊、水印、畸形、噪点、文字溢出蒙版区域。",
].join(" ");

/**
 * 全局通用负面词。
 *
 * 即梦 4.0 局部重绘无独立 negative_prompt 字段（官方 tips 明确），
 * 负面约束已合并进上方的 prompt_global，故此处**刻意留空**。
 * 保留该导出位是为了 image-generation.ts 的组装函数签名不因
 * 是否启用负面词而漂移 —— 空数组 join 后是空串，不影响提示词。
 */
export const TEXT_EDIT_GLOBAL_NEGATIVE_TERMS: string[] = [];

/**
 * 按目标文案语种给出的**行数与替换模板**（即梦 4.0 官方 mask_prompt_templates）。
 *
 * 官方模板原文：
 *   replace_cn_text = 一行中文，"【填入要生成的中文】"，字体简洁，颜色适配原图，排版规整，边缘柔和，匹配原图光影
 *   replace_en_text = 一行英文，"【填入要生成的英文】"，标准无衬线字体，文字大小合适，颜色贴合画面，平整无扭曲
 *   remove_text    = 还原背景纹理，和周边画面完全一致，无任何文字字符，色彩光影连续无痕
 *
 * ⚠️ "一行"是信息量最大的部分：模型在蒙版较宽时倾向折行/拆多行排版。
 *   但**不能无条件写死"一行"**：平台的 renderTargetText 可能含多个
 *   被改动区域，用 `\n` 分隔。那种情况下强行要求"一行"会把多行挤成一行。
 *   因此行数按实际换行数动态给出，模板其余措辞忠实保留官方文案。
 *
 * @param targetText 实际要渲染的目标文案（可能含换行）
 */
export function buildTextEditLanguageHint(targetText: string) {
  const trimmed = (targetText || "").trim();
  if (!trimmed) return "";
  const lineCount = trimmed.split("\n").filter(line => line.trim()).length;
  // 含 CJK 字符即按中文处理：中英混排的标题（如"龙年 2026"）也应走中文字形口径。
  const hasCjk = /[\u4e00-\u9fa5\u3040-\u30ff]/.test(trimmed);
  const lineHint = lineCount === 1 ? "一行" : `${lineCount}行`;
  return hasCjk
    ? `${lineHint}中文，"${trimmed}"，字体简洁，颜色适配原图，排版规整，边缘柔和，匹配原图光影`
    : `${lineHint}英文，"${trimmed}"，标准无衬线字体，文字大小合适，颜色贴合画面，平整无扭曲`;
}

/**
 * 纯删除模板（即梦 4.0 官方 mask_prompt_templates.remove_text）。
 *
 * 供「删除整行 / 只擦字不写字」的场景使用。当前擦字通道本身走的是
 * 生成式擦除（即梦背景修复 / 佐糖 / 本地像素擦除），此模板保留为
 * 全局层唯一事实源，方便日后若需要把删除语义显式注入时直接从这取。
 */
export const TEXT_EDIT_REMOVE_TEMPLATE =
  "还原背景纹理，和周边画面完全一致，无任何文字字符，色彩光影连续无痕";

/**
 * 供 image-generation.ts 调用的组装函数。
 *
 * @param enabled 是否启用全局层。留出开关是为了让线上出问题时
 *   能一键回退到「只用原有提示词」的行为，而不必回滚整次发布。
 *   ⚠️ 默认 true：如果默认 false，这个特性就等于没上线，
 *   而且"没生效"和"没效果"在用户那里长得一模一样，最难排查。
 */
export function buildTextEditGlobalPrompt(enabled = true) {
  if (!enabled) return { positive: "", negative: "" };
  return {
    positive: TEXT_EDIT_GLOBAL_POSITIVE_PROMPT,
    negative: TEXT_EDIT_GLOBAL_NEGATIVE_TERMS.join("、"),
  };
}
