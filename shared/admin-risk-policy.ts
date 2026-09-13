/**
 * 后台高危操作的风控口径（前后端共用）。
 *
 * ⚠️ 为什么要有这个文件：
 * 阈值原先在 `server/admin-store.ts` 和 `client/src/pages/AdminPrototypePage.tsx`
 * 各写了一遍 `10000` 字面量。两份常量各自漂移时，症状是「前端不提示但后端拦下」
 * 或「前端提示了后端却放行」，而且**两种都不报错**，只能靠人肉对账发现。
 * 本项目已多次踩过「同一份数据多个出口」，这里一次性收敛。
 *
 * ⚠️⚠️ 更重要的一条铁律：
 * **前端绝不能用「与后端相同的表达式」去自动计算 confirmHighRisk。**
 * 那样等于前端替操作员回答了「你确认吗」，后端的二次确认闸门永远不会触发，
 * 风控形同虚设（2026-09-13 修复，见 server/admin-high-risk-gate.test.ts）。
 * `confirmHighRisk` 只有一个合法来源：**操作员真的做了一次确认动作**。
 */

/** 触发二次确认的积分阈值（含）。人工调整看绝对值，批量赠送看 单人额度 × 人数。 */
export const ADMIN_HIGH_RISK_CREDIT_THRESHOLD = 10000;

/** 超过此值的人工调整升级为 high 级风险事件。 */
export const ADMIN_CRITICAL_RISK_CREDIT_THRESHOLD = 50000;

/** 人工积分调整是否属于高危（按绝对值，增减同样口径）。 */
export function isHighRiskCreditAdjustment(delta: number) {
  if (!Number.isFinite(delta)) return false;
  return Math.abs(delta) >= ADMIN_HIGH_RISK_CREDIT_THRESHOLD;
}

/** 批量赠送是否属于高危（总发放量 = 单人额度 × 人数）。 */
export function isHighRiskCreditGift(amountPerUser: number, userCount: number) {
  if (!Number.isFinite(amountPerUser) || !Number.isFinite(userCount)) return false;
  return amountPerUser * userCount >= ADMIN_HIGH_RISK_CREDIT_THRESHOLD;
}
