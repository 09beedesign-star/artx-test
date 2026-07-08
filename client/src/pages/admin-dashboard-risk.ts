type DashboardRiskMetrics = {
  paymentExceptions?: number;
  highRiskEvents?: number;
};

export function getDashboardRiskTarget(metrics: DashboardRiskMetrics): "risk" | "orders" {
  if ((metrics.highRiskEvents ?? 0) > 0) {
    return "risk";
  }

  if ((metrics.paymentExceptions ?? 0) > 0) {
    return "orders";
  }

  return "risk";
}
