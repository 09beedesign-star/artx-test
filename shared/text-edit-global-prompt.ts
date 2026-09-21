/**
 * 智能文案编辑（局部重绘 text_edit）的**全局通用提示词**。
 *
 * ── 这个文件解决什么问题 ────────────────────────────────────────
 * 在此之前，text_edit 的提示词全部硬编码在 server/image-generation.ts 里，
 * 分散在 textEditInstruction（基线 5049 / 擦字成功后追加 5493 / 目标文案 5580）
 * 和 textEditNegativeInstruction（5059）四处。想调整出图的通用倾向
 * （例如"字重再轻一点""不要加暗角"）必须去 3.7 万行文件里找那四个点，
 * 且极易只改一处 —— 本项目已经因"同一份逻辑多个出口"踩过十二次。
 *
 * 现在把「与具体某张图无关、每次出图都该生效」的那部分提示词集中到这里，
 * 作为**唯一事实源**。image-generation.ts 只负责把它拼进去。
 *
 * ── 边界：什么该写进来，什么不该 ──────────────────────────────
 * ✅ 该写：跨图片通用的**倾向与禁令**。
 *    例："保持原有字重""不要给文字加底板""纯色背景保持纯色"
 * ❌ 不该写：与单次请求绑定的信息。
 *    例：具体要写的文案、蒙版坐标、图片比例 —— 那些是运行期计算的，
 *    仍然留在 image-generation.ts 里按请求拼装。
 * ❌ 不该写：只对某一类图成立的规则（例如"电商主图必须留白 15%"）。
 *    那种属于技能包（server/skills/*.md）或品牌包，不是全局层。
 *
 * ── ⚠️⚠️⚠️ 三条必须守住的硬约束 ──────────────────────────────
 *
 * ① **作用域只有 text_edit，不要扩大到全站出图。**
 *    text_edit 是**保真编辑**：蒙版外必须像素不变。而文生图追求的是
 *    "画得好看"。把这里的保真类措辞（"不要改动任何未标记区域"）
 *    注入文生图链路，会让模型畏手畏脚；反过来把文生图的审美类措辞
 *    （"电影感光影""丰富层次"）注入这里，模型会顺手给整张图重打光。
 *    📌 判据：这两类任务的目标是**互相冲突**的，共用一份全局提示词必错。
 *
 * ② **这段文字绝不能交给上游的 prompt 增强（enhancePrompt）。**
 *    VOD 的增强器是文生图导向的润色器，只保留"画什么"，
 *    把"不许动什么"整段丢弃 —— 零报错，只是给你另一张图。
 *    text_edit 链路上 enhancePrompt 已恒为 false
 *    （image-generation.ts:5949），本文件的存在使这条约束更不能松动。
 *
 * ③ **提示词长度是有成本的。**
 *    这里的内容会挤占模型对"本次具体要写什么字"的注意力。
 *    全局层越长，单次指令被稀释得越厉害。**写倾向，不写清单**：
 *    "保持原有字重" 是有效的方向；"画质要高要精美要专业" 模型无法执行。
 *    经验预算：英文指令 ≤ 6 句，负面词 ≤ 20 个。
 *
 * ── 为什么分成 positive / negative 两段 ────────────────────────
 * OpenAI 系图片编辑接口**没有 negative_prompt 字段**，负面约束只能以
 * "Avoid ..." 的形式并进正向提示词；而 VOD 链路有独立的 negativePrompt。
 * 分开存放，两条出口各取所需，避免出现"只有一条链路生效"的半吊子状态。
 */

/**
 * 全局通用正向指令（每次 text_edit 都会追加到提示词尾部）。
 *
 * 位置刻意放在**靠后**：模型对提示词尾部的注意力更高，而这些是
 * "无论改哪张图都成立"的底线要求，需要压过前面的场景化描述。
 */
export const TEXT_EDIT_GLOBAL_POSITIVE_PROMPT = [
  "Global quality baseline for every text replacement, regardless of the specific image:",
  "Treat this as a professional designer retouching an existing published poster — the result must be indistinguishable from the original artwork, as if the new wording had been set by the same designer in the same design file.",
  "Keep the replacement lettering consistent with the surrounding design language: same visual era, same level of craft, same finish quality.",
  "Respect the original optical alignment: the new text must share the same baseline, centering and margin rhythm as the text it replaces, and must stay fully inside the editable area without touching or crossing its boundary.",
  "Preserve the original lighting logic on the glyphs — if the original lettering caught a highlight, a shadow or a reflection from the scene, reproduce that same treatment.",
  "When the replacement wording is shorter or longer than the original, adjust letter-spacing and glyph width naturally instead of stretching, squashing or arbitrarily enlarging the characters.",
  /**
   * ⚠️⚠️ 以下中文段是刻意保留中文的（2026-09-21 按用户提供的即梦模板补充）。
   *
   * 当前 text_edit 命中的上游是 **vod-jimeng（即梦 4.0）**，而即梦是国产模型，
   * 对中文提示词的遵循度高于等价英文表述 —— 同一条约束用中文写命中率更高。
   * 📌 判据：提示词语言要跟着**上游模型的母语**走，不是跟着代码库的语言习惯走。
   *
   * 不把上面的英文段一起翻译成中文，是因为那几句描述的是"设计意图"，
   * 英文表达更精确；这几句描述的是"硬性画面约束"，中文更不容易被模型忽略。
   */
  "保持原图构图、光影、透视、色彩、质感不变，画面其余所有元素保持原样，仅修改蒙版选中区域。",
  "替换文字字体自然，文字大小匹配原图，文字边缘柔和，和原图光照融合，无变形扭曲，文字清晰可读，整体风格统一，干净边缘，不破坏背景。",
].join(" ");

/**
 * 按目标文案语种给出的**行数与字形约束**（2026-09-21 新增）。
 *
 * ── 为什么需要这一条 ──────────────────────────────────────────
 * 用户提供的即梦模板里有一句 `一行中文，"{{target_text}}"`。这个"一行"是
 * **信息量最大**的部分：模型在蒙版较宽时倾向于把文案折行或拆成多行排版，
 * 而海报标题几乎总是单行。显式声明行数能直接掐掉这类自作主张。
 *
 * ⚠️⚠️ 但**不能无条件写死"一行"**：平台的 renderTargetText 可能包含多个
 * 被改动区域，用 `\n` 分隔（见 image-generation.ts 的 changedTexts.join("\n")）。
 * 那种情况下强行要求"一行"会让模型把多行挤成一行 —— 又是一个零报错的错。
 * 📌 判据：凡是从单一样例提炼出的约束，先确认它在**批量场景**下是否仍成立。
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
    ? `${lineHint}中文，字体简洁，颜色适配原图，排版规整，边缘柔和，匹配原图光影。`
    : `${lineHint}英文，字形标准，文字大小合适，颜色贴合画面，平整无扭曲。`;
}

/**
 * 全局通用负面词（每次 text_edit 都会并入负面约束）。
 *
 * ⚠️ 刻意与 image-generation.ts 里已有的 textEditNegativeInstruction **互补而非重复**。
 * 那里写的是本项目实测踩过的具体事故形态（底板/白色色块/文本框/16+ 角标…），
 * 属于"历史伤疤"；这里写的是跨场景的通用质量底线。
 * 重复堆叠同义负面词不会让模型更听话，只会稀释其他指令。
 */
export const TEXT_EDIT_GLOBAL_NEGATIVE_TERMS = [
  "低分辨率文字边缘",
  "锯齿",
  "字形变形",
  "笔画粘连",
  "字间距不均",
  "文字溢出可编辑区域",
  "文字被边缘裁切",
  "与原设计不符的字体风格",
  "AI 感的塑料质感",
  "整图色调偏移",
  "整图重新打光",
  /**
   * 2026-09-21 按用户提供的即梦模板补入的四条。
   * ⚠️ 只取模板里**本项目原有负面词未覆盖**的部分：
   * 模板里的「模糊/噪点/水印/画面变形/背景改动」等已在
   * image-generation.ts 的既有负面串中，重复写只会稀释权重。
   */
  "文字乱码",
  "重复文字",
  "物体移位",
  "画面撕裂",
];

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
