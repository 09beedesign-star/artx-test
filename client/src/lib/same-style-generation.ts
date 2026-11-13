/**
 * 「一键同款」出图的计费护栏（2026-11-14 用户要求：同款单张 ≤ 90 积分）。
 *
 * ── 实测的扣费链（线上 aiTasks 实录，用户 wwinios 2026-11-13）──────────────
 *   claude-opus-5 / chat            20   ← 图文混排强制走一次大模型路由
 *   vod-og25-sunburst-medium / 1k   70   ← 真正出图
 *   合计                            90   ← 刚好压线，任何一项上浮就超
 *
 * 会把它推过 90 的四个口子（每个都是零报错的静默加价）：
 *   1. 长期记忆附加费：路由 +5、出图 +5 → 100；
 *   2. 提示词里写了「4K / 高清 / A3」→ 输出档位 2k/4k/8k → 150 / 190 / 260（线上见过 260）；
 *   3. 再多引用一张图 → 走 image_edit 多图融合，按能力固定价 180，模型单价不生效；
 *   4. 路由本身 20 积分，是这条链里唯一「不出图也收钱」的环节。
 *
 * ✅ 同款模式下的处置（三条一起做，少一条就有一个口子没堵）：
 *   - 不走大模型路由（省 20）：模板图本身就是最强的约束，提示词由下面的
 *     buildSameStyleImagePrompt 直接拼，不需要大模型翻译「引用图 1」；
 *   - 不下发目标像素（锁 1k）：服务端只在收到 targetWidth/Height 时才向上游要高分辨率；
 *   - 不走 image_edit：多张引用图也按文生图 + 参考图下发（按模型单价 70 计费）。
 *   结果：单张 70，带长期记忆 75，恒 ≤ 90。
 */
import { INSPIRATION_SAME_STYLE_MODEL_ID } from "@shared/image-models";

/** 用户拍板的同款单张积分上限。 */
export const SAME_STYLE_MAX_CREDITS_PER_IMAGE = 90;

/**
 * 判定本次提交是不是「同款出图」。
 *
 * 四个条件缺一不可：
 *   - 图片页签 + 非 auto + 模型就是同款模型：用户手动换模型/开 auto 视为放弃同款，
 *     按他自己的选择计费（不越权）；
 *   - 输入框里还挂着同款模板图：用户把模板标签删了，就只是一次普通出图；
 *   - 没有激活技能：技能是用户显式选的另一种能力，走技能自己的链路。
 */
export function isSameStyleGeneration(input: {
  modelTab: "image" | "text";
  autoMode: boolean;
  imageModelId: string | undefined;
  referenceIds: readonly string[];
  sameStyleReferenceIds: ReadonlySet<string>;
  hasActiveSkill: boolean;
}) {
  if (input.hasActiveSkill) return false;
  if (input.modelTab !== "image" || input.autoMode) return false;
  if (input.imageModelId !== INSPIRATION_SAME_STYLE_MODEL_ID) return false;
  return input.referenceIds.some(id => input.sameStyleReferenceIds.has(id));
}

/**
 * 同款模式的出图提示词（替代大模型路由产出的 imagePrompt）。
 *
 * ⚠️ 不能直接用 routedPrompt：里面是「引用图 1：同款参考图」这种占位编号，
 * 原本要靠路由大模型翻译。这里明确告诉图片模型「第几张是模板、照它的什么」。
 */
export function buildSameStyleImagePrompt(input: {
  userText: string;
  referenceTitles: readonly string[];
  templateIndexes: readonly number[];
  extraContext?: string;
}) {
  const userText = input.userText.trim();
  const templateLabels = input.templateIndexes.map(index => `参考图 ${index + 1}`).join("、");
  const otherCount = input.referenceTitles.length - input.templateIndexes.length;
  return [
    `${templateLabels || "参考图"} 是用户选中的同款模板。请生成一张与模板风格、构图、配色、光影和质感保持一致的新图片。`,
    otherCount > 0 ? "其余参考图是用户补充的素材，请按用户需求融入画面。" : "",
    input.extraContext?.trim() || "",
    userText ? `用户需求：${userText}` : "用户没有补充需求：请直接生成一张同款图片。",
  ]
    .filter(Boolean)
    .join("\n");
}
