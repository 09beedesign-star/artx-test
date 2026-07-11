import { describe, expect, it } from "vitest";

import { classifyHighRiskType } from "./admin-risk";

describe("classifyHighRiskType", () => {
  it("uses short explicit labels for amount, payment, refund, attack, and system risks", () => {
    expect(classifyHighRiskType({ title: "支付订单异常", detail: "金额不一致", severity: "high" })).toBe("金额异常");
    expect(classifyHighRiskType({ title: "支付回调失败", detail: "支付渠道超时", severity: "high" })).toBe("支付异常");
    expect(classifyHighRiskType({ title: "退款处理失败", detail: "渠道退款超时", severity: "high" })).toBe("退款异常");
    expect(classifyHighRiskType({ title: "签名校验失败", detail: "疑似伪造回调", severity: "high" })).toBe("攻击告警");
    expect(classifyHighRiskType({ title: "服务访问异常", detail: "核心服务不可用", severity: "high" })).toBe("系统安全");
  });
});
