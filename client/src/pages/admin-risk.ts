export type RiskSummary = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

export function classifyHighRiskType(risk: RiskSummary) {
  const source = `${risk.title} ${risk.detail}`.toLowerCase();
  if (/退款|refund/.test(source)) return "退款异常";
  if (/黑客|攻击|入侵|恶意|伪造|签名|token|credential|unauthorized|权限/.test(source)) return "攻击告警";
  if (/支付|订单|回调|交易|金额|威富通|wallyt|微信|支付宝/.test(source)) return "支付异常";
  return "系统安全";
}
