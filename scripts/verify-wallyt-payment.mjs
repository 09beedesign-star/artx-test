#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-wallyt-"));
process.env.ARTX_DATA_DIR = dataDir;
process.env.ARTX_ADMIN_DATA_BACKEND = "json";
process.env.ARTX_AUTH_DATA_BACKEND = "json";
process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
process.env.WALLYT_DOMAIN_URL = "https://mock.wallyt.example/pay/gateway";
process.env.WALLYT_MCH_ID = "190000000001";
process.env.WALLYT_SIGNATURE_KEY = "test-signature-key";
process.env.WALLYT_NOTIFY_URL = "https://api.example.com/api/billing/wallyt/callback";
process.env.WALLYT_WX_APP_ID = "wx-test-app";

const {
  createWallytPayment,
  getWallytConfigStatus,
  parseWallytXml,
  signWallytParams,
  toWallytXml,
  verifyWallytSignature,
} = await import("../server/wallyt-payment.ts");
const {
  createBillingOrder,
  getBillingOrderForPayment,
  getBillingSnapshotForUser,
  handleAdminApiRequest,
  markBillingOrderPaid,
  recordBillingPaymentFailure,
} = await import("../server/admin-store.ts");
const { handleAuthAction } = await import("../server/auth-store.ts");

try {
  const status = getWallytConfigStatus();
  assert.equal(status.configured, true, "Wallyt should be configured from env");
  assert.equal(status.mchId.endsWith("0001"), true, "merchant id should be masked");

  const sign = signWallytParams({
    service: "pay.weixin.native.intl",
    mch_id: "190000000001",
    out_trade_no: "ord_verify",
    total_fee: 100,
    empty_field: "",
  }, "test-signature-key");
  assert.equal(sign, sign.toUpperCase(), "signature should be uppercase MD5");
  assert.equal(verifyWallytSignature({
    service: "pay.weixin.native.intl",
    mch_id: "190000000001",
    out_trade_no: "ord_verify",
    total_fee: "100",
    empty_field: "",
    sign,
  }), true, "signature verification should ignore empty fields and sign itself");

  const xml = toWallytXml({
    mch_id: "190000000001",
    body: "ArtX & Design <Pay>",
    empty_field: "",
  });
  assert.equal(xml.includes("<empty_field>"), false, "empty XML fields should be omitted");
  assert.equal(parseWallytXml(xml).body, "ArtX & Design <Pay>", "XML parser should decode escaped values");

  let postedXml = "";
  globalThis.fetch = async (_url, options) => {
    postedXml = String(options.body || "");
    return {
      ok: true,
      status: 200,
      async text() {
        return [
          "<xml>",
          "<status>0</status>",
          "<result_code>0</result_code>",
          "<transaction_id>txn_mock_001</transaction_id>",
          "<code_img_url>https://pay.example.com/qr.png</code_img_url>",
          "</xml>",
        ].join("");
      },
    };
  };

  const payment = await createWallytPayment({
    orderId: "ord_verify",
    body: "ArtX verify order",
    amount: 1,
    paymentMethod: "wechat",
    clientIp: "127.0.0.1",
    mode: "native",
  });
  assert.equal(payment.provider, "wallyt");
  assert.equal(payment.payUrl, "https://pay.example.com/qr.png");
  const posted = parseWallytXml(postedXml);
  assert.equal(posted.service, "pay.weixin.native.intl", "native WeChat should use the documented Wallyt service");
  assert.equal(posted.mch_id, "190000000001", "merchant id should be included");
  assert.equal(posted.notify_url, "https://api.example.com/api/billing/wallyt/callback", "notify URL should be included");
  assert.equal(posted.total_fee, "100", "amount should be converted to cents");
  assert.equal(verifyWallytSignature(posted), true, "posted XML should contain a valid signature");

  const userRegister = await handleAuthAction("register", { username: "wallyt-user@example.com", password: "1234" });
  assert.equal(userRegister.status, 200);
  const ordinaryUser = userRegister.body.user;
  const orderResult = await createBillingOrder({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    planId: "creator",
    cycleId: "monthly",
    paymentMethod: "wechat",
  });
  assert.equal(orderResult.status, 200);
  const orderId = orderResult.body.order.id;
  const orderBefore = await getBillingOrderForPayment(orderId);
  assert.equal(orderBefore.status, "pending");
  const callback = await markBillingOrderPaid({
    orderId,
    actorName: "wallyt",
    expectedAmountCents: orderBefore.amountCents,
    providerTransactionId: "txn_callback_001",
    eventType: "wallyt_callback",
  });
  assert.equal(callback.status, 200, "valid callback should issue credits");
  const snapshot = await getBillingSnapshotForUser(ordinaryUser.id);
  assert.ok(snapshot.balance > 0, "valid Wallyt callback should increase credit balance");

  const failedOrder = await createBillingOrder({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    planId: "lite",
    cycleId: "monthly",
    paymentMethod: "alipay",
  });
  assert.equal(failedOrder.status, 200);
  const failure = await recordBillingPaymentFailure({
    orderId: failedOrder.body.order.id,
    actorName: "wallyt",
    message: "威富通回调验签失败",
    signatureValid: false,
    eventType: "wallyt_callback_failed",
  });
  assert.equal(failure.status, 200);
  const adminLogin = await handleAuthAction("login", { username: "admin@example.com", password: "secure-admin-password" });
  assert.equal(adminLogin.status, 200);
  const detail = await handleAdminApiRequest("GET", `/api/admin/orders/${failedOrder.body.order.id}`, `Bearer ${adminLogin.body.token}`, {});
  assert.equal(detail.status, 200);
  assert.equal(detail.body.order.status, "failed", "failed Wallyt callback should mark order failed");
  assert.ok(detail.body.paymentEvents.some((item) => item.type === "wallyt_callback_failed"), "failed Wallyt callback should be visible in order events");
  const overview = await handleAdminApiRequest("GET", "/api/admin/overview", `Bearer ${adminLogin.body.token}`, {});
  assert.ok(overview.body.alerts.some((item) => item.title.includes("威富通支付异常")), "failed Wallyt callback should create an ops alert");

  console.log("verify-wallyt-payment: ok");
} finally {
  delete globalThis.fetch;
  await rm(dataDir, { recursive: true, force: true });
}
