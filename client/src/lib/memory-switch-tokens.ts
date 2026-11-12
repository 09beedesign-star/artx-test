/**
 * 「记忆开关」药丸的配色事实源（2026-11-10）。
 *
 * 参照物：画布提示词输入框右上角的「上下文记忆」开关 ——
 *   黑药丸 `#161616` + 白色 Brain 图标 + `size="sm"` 黑白轨道的小开关。
 * 电商画布左栏的「电商画布记忆」提示条按用户要求复用同一套外观，
 * 只是多保留一行说明文字，且文字必须是白色（黑底上不可再用绿色或深灰）。
 *
 * ⚠️ 两处各自写死色值 = 改一处另一处静默跑偏且零报错。
 *    电商侧只允许从这里取；画布侧目前仍是字面量，
 *    `ecommerce-memory-switch.style.test.ts` 会逐项核对两边色值，
 *    哪天画布改了值，那条测试先报红，提醒两边一起改。
 */
export const MEMORY_SWITCH_SURFACE = {
  /** 药丸底色：与画布记忆开启态一致 */
  background: "#161616",
  /** 描边：深色画布上用半透明白把黑药丸勾出来；浅色页面与底色同色 */
  borderDark: "rgba(255,255,255,0.18)",
  borderLight: "#161616",
  /** Brain 图标与说明文字：黑底上必须白，绿色/深灰都会糊掉 */
  iconColor: "#ffffff",
  textColor: "#ffffff",
} as const;

/**
 * 与画布开关同尺寸、同激活色。
 * ⚠️ 不要用 className 在调用方压轨道：轨道 / thumb / 位移是一组数，
 *    只压轨道会让 thumb 顶出去（2026-11-10「开关有偏移」的成因）。
 */
export const MEMORY_SWITCH_SIZE = "sm" as const;
export const MEMORY_SWITCH_TONE = "default" as const;
