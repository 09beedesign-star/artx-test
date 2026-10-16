import { afterEach, describe, expect, it } from "vitest";
import { getWallytConfig } from "./wallyt-payment";

// 🔒 威富通网关地址锁（2026-10-16 用户拍板：支付已跑通，保持不动）。
// 事故：地址写成 /pay/gate，网关回 status=404，全站付款失败约一天半，真实用户放弃 5 笔订单。
// 已用真实签名下单 + 真实 10 元支付（rch_mvb4aeus_119022 paid）验证 /pay/gateway 可用。
// 改这个地址前必须先问用户，并在生产上真实下单验证。
const LOCKED_GATEWAY = "https://gateway.wepayez.com/pay/gateway";

describe("威富通网关地址锁", () => {
  const saved = process.env.WALLYT_DOMAIN_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.WALLYT_DOMAIN_URL;
    else process.env.WALLYT_DOMAIN_URL = saved;
  });

  it("未配置 env 时默认网关必须是已验证可用的 /pay/gateway", () => {
    delete process.env.WALLYT_DOMAIN_URL;
    expect(getWallytConfig().gatewayUrl).toBe(LOCKED_GATEWAY);
  });

  it("默认网关不能是会 404 的 /pay/gate", () => {
    delete process.env.WALLYT_DOMAIN_URL;
    expect(getWallytConfig().gatewayUrl.endsWith("/pay/gate")).toBe(false);
  });
});
