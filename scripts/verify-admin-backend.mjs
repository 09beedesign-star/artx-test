#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-backend-"));
process.env.ARTX_DATA_DIR = dataDir;
process.env.ARTX_ADMIN_DATA_BACKEND = "json";
process.env.ARTX_LOGIN_LOCK_THRESHOLD = "3";
process.env.ARTX_LOGIN_LOCK_MS = "60000";

const { handleAuthAction } = await import("../server/auth-store.ts");
const {
  createBillingOrder,
  getBillingSnapshotForUser,
  handleAdminApiRequest,
  markBillingOrderPaid,
  recordAiUsage,
} = await import("../server/admin-store.ts");

async function auth(action, payload) {
  return handleAuthAction(action, payload);
}

async function admin(method, pathName, token, payload = {}) {
  return handleAdminApiRequest(method, pathName, token ? `Bearer ${token}` : "", payload);
}

try {
  const adminLogin = await auth("login", { username: "09bee", password: "1234" });
  assert.equal(adminLogin.status, 200, "default super_admin should login");
  const adminToken = adminLogin.body.token;
  const adminUser = adminLogin.body.user;
  assert.equal(adminUser.role, "super_admin");
  assert.ok(adminUser.permissions.includes("admin:access"));

  const userRegister = await auth("register", { username: "billing-user@example.com", password: "1234" });
  assert.equal(userRegister.status, 200, "ordinary user should register");
  const ordinaryToken = userRegister.body.token;
  const ordinaryUser = userRegister.body.user;

  const forbidden = await admin("GET", "/api/admin/overview", ordinaryToken);
  assert.equal(forbidden.status, 403, "ordinary user must not access admin API");

  await auth("register", { username: "lock-user@example.com", password: "1234" });
  assert.equal((await auth("login", { username: "lock-user@example.com", password: "bad-1" })).status, 401);
  assert.equal((await auth("login", { username: "lock-user@example.com", password: "bad-2" })).status, 401);
  const locked = await auth("login", { username: "lock-user@example.com", password: "bad-3" });
  assert.equal(locked.status, 401);
  const lockedRetry = await auth("login", { username: "lock-user@example.com", password: "1234" });
  assert.equal(lockedRetry.status, 429, "locked user should be rate-limited even with the right password");

  const superAdminDowngrade = await admin("POST", `/api/admin/users/${adminUser.id}/role`, adminToken, { role: "admin" });
  assert.equal(superAdminDowngrade.status, 409, "last super_admin must not be downgraded");

  const superAdminDisable = await admin("POST", `/api/admin/users/${adminUser.id}/status`, adminToken, { status: "blocked" });
  assert.equal(superAdminDisable.status, 409, "last super_admin must not be disabled");

  const orderResult = await createBillingOrder({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    planId: "creator",
    cycleId: "monthly",
    paymentMethod: "wechat",
  });
  assert.equal(orderResult.status, 200, "billing order should be created");
  const orderId = orderResult.body.order.id;

  const detailBeforePay = await admin("GET", `/api/admin/orders/${orderId}`, adminToken);
  assert.equal(detailBeforePay.status, 200, "order detail should load before payment");
  assert.equal(detailBeforePay.body.order.id, orderId);

  const note = await admin("POST", `/api/admin/orders/${orderId}/notes`, adminToken, {
    content: "verify order note",
  });
  assert.equal(note.status, 200, "order note should be saved");
  assert.ok(note.body.notes.some((item) => item.content === "verify order note"), "order detail should include notes");

  const paid = await markBillingOrderPaid({
    orderId,
    actorName: "verify-admin-backend",
    providerTransactionId: "txn_verify_001",
    eventType: "verify_payment",
  });
  assert.equal(paid.status, 200, "billing order should be marked paid");
  const detailAfterPay = await admin("GET", `/api/admin/orders/${orderId}`, adminToken);
  assert.equal(detailAfterPay.status, 200, "order detail should load after payment");
  assert.equal(detailAfterPay.body.order.providerTransactionId, "txn_verify_001");
  assert.ok(detailAfterPay.body.paymentEvents.some((item) => item.providerTransactionId === "txn_verify_001"), "order detail should include payment event");
  assert.ok(detailAfterPay.body.creditEntries.some((entry) => entry.source === orderId && entry.delta > 0), "order detail should include credit entry");
  const snapshot = await getBillingSnapshotForUser(ordinaryUser.id);
  assert.ok(snapshot.balance > 0, "paid order should issue credits");
  assert.ok(snapshot.ledger.some((entry) => entry.source === orderId && entry.delta > 0), "paid order should write credit ledger");

  const beforeCredits = snapshot.balance;
  const successTask = await recordAiUsage({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    capability: "图片 OCR",
    capabilityKey: "image_ocr",
    provider: "OpenAI",
    model: "verify-ocr",
    status: "success",
    outputUnits: 1,
  });
  assert.ok(successTask.chargedCredits > 0, "successful AI task should charge credits");
  const afterSuccess = await getBillingSnapshotForUser(ordinaryUser.id);
  assert.equal(afterSuccess.balance, beforeCredits - successTask.chargedCredits, "successful AI task should deduct balance");
  assert.ok(afterSuccess.ledger.some((entry) => entry.source === successTask.generationId && entry.delta === -successTask.chargedCredits), "successful AI task should write negative ledger");

  const failedTask = await recordAiUsage({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    capability: "AI 扩图",
    capabilityKey: "image_expansion",
    provider: "OpenAI",
    model: "verify-expand",
    status: "failed",
    failureReason: "verify failure path",
  });
  assert.equal(failedTask.chargedCredits, 0, "failed AI task should not charge credits");
  const afterFailure = await getBillingSnapshotForUser(ordinaryUser.id);
  assert.equal(afterFailure.balance, afterSuccess.balance, "failed AI task should not deduct balance");

  const overviewBeforePolicy = await admin("GET", "/api/admin/overview", adminToken);
  assert.equal(overviewBeforePolicy.status, 200);
  const policies = overviewBeforePolicy.body.overview.aiBillingPolicies;
  const discounts = overviewBeforePolicy.body.overview.planDiscounts;
  const editedPolicies = policies.map((policy) => policy.capabilityKey === "text_generation"
    ? { ...policy, baseCredits: 9 }
    : policy
  );
  const missingPolicyConfirmation = await admin("POST", "/api/admin/ai-billing-policies/save", adminToken, {
    policies: [],
    planDiscounts: [],
  });
  assert.equal(missingPolicyConfirmation.status, 409, "policy save should require confirmation");

  const savePolicy = await admin("POST", "/api/admin/ai-billing-policies/save", adminToken, {
    policies: editedPolicies.map((policy) => ({
      capability: policy.capabilityKey || policy.capability,
      label: policy.capability,
      billingUnit: policy.unit === "按张" ? "per_image" : "per_request",
      baseCredits: policy.baseCredits,
      estimatedCostPerUnit: policy.estimatedCostPerUnit,
      providerDefault: policy.provider,
    })),
    planDiscounts: discounts,
    confirmation: "CONFIRM_AI_BILLING_POLICY",
  });
  assert.equal(savePolicy.status, 200, "policy save should succeed");
  assert.ok(savePolicy.body.auditLogs.some((entry) => entry.action === "更新 AI 扣分策略"), "policy save should write audit log");

  const textTask = await recordAiUsage({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    capability: "文案生成",
    capabilityKey: "text_generation",
    provider: "OpenAI",
    model: "verify-text",
    status: "success",
    outputUnits: 1,
  });
  assert.equal(textTask.chargedCredits, 9, "edited creator text policy should change charged credits");

  const selectedUserId = ordinaryUser.id;
  const unconfirmedLargeAdjustment = await admin("POST", "/api/admin/credits/adjust", adminToken, {
    userId: selectedUserId,
    delta: 20000,
    reason: "verify high risk confirmation",
  });
  assert.equal(unconfirmedLargeAdjustment.status, 409, "large credit adjustment should require confirmation");
  const confirmedLargeAdjustment = await admin("POST", "/api/admin/credits/adjust", adminToken, {
    userId: selectedUserId,
    delta: 20000,
    reason: "verify high risk confirmation",
    confirmHighRisk: true,
  });
  assert.equal(confirmedLargeAdjustment.status, 200, "confirmed large credit adjustment should pass");

  const refundMissingConfirmation = await admin("POST", `/api/admin/orders/${orderId}/refund`, adminToken, {
    reason: "verify refund missing confirmation",
  });
  assert.equal(refundMissingConfirmation.status, 409, "refund should require confirmation");
  const refund = await admin("POST", `/api/admin/orders/${orderId}/refund`, adminToken, {
    reason: "verify refund",
    confirmation: "CONFIRM_REFUND_ORDER",
  });
  assert.equal(refund.status, 200, "confirmed refund should pass");
  assert.equal(refund.body.order.status, "refunded", "refunded order should be marked refunded");
  assert.ok(refund.body.refundEvents.some((item) => item.reason === "verify refund"), "refund event should be recorded");
  assert.ok(refund.body.creditEntries.some((entry) => entry.type === "退款扣回"), "refund credit clawback should be recorded");

  const reissueOrder = await createBillingOrder({
    userId: ordinaryUser.id,
    username: ordinaryUser.username,
    planId: "lite",
    cycleId: "monthly",
    paymentMethod: "alipay",
  });
  assert.equal(reissueOrder.status, 200);
  const reissueMissingConfirmation = await admin("POST", `/api/admin/orders/${reissueOrder.body.order.id}/reissue`, adminToken, {
    reason: "verify reissue missing confirmation",
  });
  assert.equal(reissueMissingConfirmation.status, 409, "reissue should require confirmation");
  const reissue = await admin("POST", `/api/admin/orders/${reissueOrder.body.order.id}/reissue`, adminToken, {
    reason: "verify reissue",
    confirmation: "CONFIRM_REISSUE_ORDER",
  });
  assert.equal(reissue.status, 200, "confirmed reissue should pass");
  assert.equal(reissue.body.order.status, "paid", "reissued order should be paid");
  assert.ok(reissue.body.paymentEvents.some((item) => item.type === "manual_reissue"), "reissue event should be recorded");

  const finalOverview = await admin("GET", "/api/admin/overview", adminToken);
  assert.equal(finalOverview.status, 200);
  assert.ok(finalOverview.body.alerts.some((alert) => alert.title.includes("AI 任务失败")), "failed AI task should create alert");
  assert.ok(finalOverview.body.auditLogs.length > 0, "admin operations should leave audit logs");

  console.log("verify-admin-backend: ok");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
