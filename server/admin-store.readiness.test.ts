import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir = "";

async function loadAdminStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./admin-store");
}

async function getAdminAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const result = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(result.status).toBe(200);
  const body = result.body as { token?: string };
  expect(body.token).toBeTruthy();
  return `Bearer ${body.token}`;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-readiness-test-"));
  delete process.env.BKEEL_API_KEY;
  delete process.env.BKEEL_TOKEN;
  process.env.AI_IMAGE_API_KEY = "test-image-key";
  process.env.AI_IMAGE_BASE_URL = "https://token.example.test/v1";
  process.env.AI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
  process.env.BACKUP_LOCAL_DIR = "/var/backups/artx";
  process.env.BACKUP_RETENTION_DAYS = "14";
  process.env.BACKUP_CRON_SECRET = "test-backup-secret";
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD;
  delete process.env.AI_IMAGE_API_KEY;
  delete process.env.AI_IMAGE_BASE_URL;
  delete process.env.AI_IMAGE_MODEL;
  delete process.env.BACKUP_LOCAL_DIR;
  delete process.env.BACKUP_RETENTION_DAYS;
  delete process.env.BACKUP_CRON_SECRET;
  delete process.env.BKEEL_API_KEY;
  delete process.env.BKEEL_TOKEN;
});

describe("production readiness", () => {
  it("removes legacy demo records from responses and persisted admin data", async () => {
    const legacyDemoData = {
      users: [
        {
          id: "usr_1028",
          name: "林澈",
          email: "lin@example.com",
          account: "lin@example.com",
          registeredAt: "2026-06-05 09:16",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Pro 20K",
          organization: "个人",
          credits: 18420,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 1299,
          totalConsumed: 1580,
          lastSeen: "3 分钟前",
          risk: "低",
        },
      ],
      orders: [
        {
          id: "ord_90341",
          userId: "usr_1028",
          user: "林澈",
          packageName: "Pro 20K",
          channel: "支付宝",
          amount: 1299,
          expectedCredits: 20000,
          issuedCredits: 20000,
          status: "paid",
          createdAt: "今天 11:24",
          event: "支付成功并入账",
          reconciliation: "matched",
        },
      ],
      credits: [
        {
          id: "cr_771",
          userId: "usr_1028",
          user: "林澈",
          type: "购买入账",
          delta: 20000,
          reason: "订单支付成功",
          source: "ord_90341",
          operator: "支付宝回调",
          createdAt: "今天 11:24",
        },
      ],
      aiTasks: [],
      providers: [],
      feedback: [],
      alerts: [],
      riskEvents: [],
      auditLogs: [],
      plans: [],
      capabilityStatus: [],
    };
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify(legacyDemoData, null, 2)}\n`);

    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const overviewResult = await handleAdminApiRequest("GET", "/overview", authorization);
    expect(overviewResult.status).toBe(200);
    const overviewBody = overviewResult.body as {
      users: Array<{ id: string; name: string; email: string }>;
      orders: Array<{ id: string; user: string }>;
      credits: Array<{ id: string; user: string }>;
    };
    expect(overviewBody.users).not.toContainEqual(expect.objectContaining({ id: "usr_1028" }));
    expect(overviewBody.users).not.toContainEqual(expect.objectContaining({ email: "lin@example.com" }));
    expect(overviewBody.orders).toHaveLength(0);
    expect(overviewBody.credits).toHaveLength(0);

    const persistedData = JSON.parse(await readFile(path.join(dataDir, "admin-data.json"), "utf-8"));
    expect(persistedData.users).not.toContainEqual(expect.objectContaining({ id: "usr_1028" }));
    expect(persistedData.orders).toHaveLength(0);
    expect(persistedData.credits).toHaveLength(0);
  });

  it("recognizes AI_IMAGE_* configuration for BKEEL image generation", async () => {
    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const readinessResult = await handleAdminApiRequest("GET", "/production-readiness", authorization);
    expect(readinessResult.status).toBe(200);
    const readinessBody = readinessResult.body as {
      productionReadiness: Array<{
        id: string;
        status: string;
        requiredKeys: string[];
        missingKeys: string[];
      }>;
    };
    const bkeelReadiness = readinessBody.productionReadiness.find((item) => item.id === "ai_bkeel");
    expect(bkeelReadiness).toMatchObject({
      status: "ready",
      requiredKeys: ["AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL", "AI_IMAGE_MODEL"],
      missingKeys: [],
    });

    const providersResult = await handleAdminApiRequest("GET", "/providers", authorization);
    expect(providersResult.status).toBe(200);
    const providersBody = providersResult.body as {
      providers: Array<{
        id: string;
        credentialStatus: string;
        configLocation: string;
      }>;
    };
    const bkeelProvider = providersBody.providers.find((item) => item.id === "ai_bkeel");
    expect(bkeelProvider).toMatchObject({
      credentialStatus: "configured",
      configLocation: "server env: AI_IMAGE_*",
    });
  });

  it("marks local backup and credit ledger capabilities as ready", async () => {
    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const readinessResult = await handleAdminApiRequest("GET", "/production-readiness", authorization);
    expect(readinessResult.status).toBe(200);
    const readinessBody = readinessResult.body as {
      productionReadiness: Array<{
        id: string;
        status: string;
        requiredKeys: string[];
        missingKeys: string[];
      }>;
    };
    const backupReadiness = readinessBody.productionReadiness.find((item) => item.id === "backup");
    expect(backupReadiness).toMatchObject({
      status: "ready",
      requiredKeys: ["BACKUP_LOCAL_DIR", "BACKUP_RETENTION_DAYS", "BACKUP_CRON_SECRET"],
      missingKeys: [],
    });

    const overviewResult = await handleAdminApiRequest("GET", "/overview", authorization);
    expect(overviewResult.status).toBe(200);
    const overviewBody = overviewResult.body as {
      capabilityStatus: Array<{
        id: string;
        status: string;
      }>;
    };
    expect(overviewBody.capabilityStatus.find((item) => item.id === "cap_credits")).toMatchObject({
      status: "ready",
    });
  });

  it("links registered user identity to payment display name and auto-issues credits when payment is confirmed", async () => {
    const { createCreditRechargeOrder, getBillingOrderForPayment, getBillingSnapshotForUser, handleAdminApiRequest, markBillingOrderPaid, recordBillingPaymentCreated } = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-payment-link-1";
    const username = "buyer-name@example.com";

    const created = await createCreditRechargeOrder({
      userId,
      username,
      amount: 50,
      paymentMethod: "wechat",
    });
    expect(created.status).toBe(200);
    const createdBody = created.body as { order: { id: string; credits: number } };

    await recordBillingPaymentCreated({
      orderId: createdBody.order.id,
      actorName: "wallyt",
      providerTransactionId: "txn_payment_name_001",
      paymentMethod: "wechat",
      payUrlType: "qr",
      service: "pay.weixin.native.intl",
      paymentDisplayName: "ArtX 积分充值 · buyer-name@example.com",
    });

    const pendingOrder = await getBillingOrderForPayment(createdBody.order.id);
    expect(pendingOrder).toMatchObject({
      userId,
      userAccount: username,
      paymentDisplayName: "ArtX 积分充值 · buyer-name@example.com",
      status: "pending",
    });

    const paid = await markBillingOrderPaid({
      orderId: createdBody.order.id,
      actorName: "wallyt-auto-query",
      expectedAmountCents: pendingOrder?.amountCents,
      providerTransactionId: "txn_payment_name_001",
      eventType: "wallyt_auto_query",
    });
    expect(paid.status).toBe(200);

    const snapshot = await getBillingSnapshotForUser(userId);
    expect(snapshot).toMatchObject({
      balance: createdBody.order.credits,
    });

    const detail = await handleAdminApiRequest("GET", `/orders/${createdBody.order.id}`, authorization);
    expect(detail.status).toBe(200);
    const detailBody = detail.body as {
      order: {
        user: string;
        userAccount?: string;
        paymentDisplayName?: string;
        issuedCredits: number;
        status: string;
      };
      paymentEvents: Array<{ type: string; message: string }>;
    };
    expect(detailBody.order).toMatchObject({
      user: "buyer-name",
      userAccount: username,
      paymentDisplayName: "ArtX 积分充值 · buyer-name@example.com",
      issuedCredits: createdBody.order.credits,
      status: "paid",
    });
    expect(detailBody.paymentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "wallyt_payment_created",
        message: expect.stringContaining(username),
      }),
      expect.objectContaining({
        type: "wallyt_auto_query",
      }),
    ]));
  });

  it("derives payment provider status from current Wallyt env instead of stale stored snapshots", async () => {
    process.env.WALLYT_DOMAIN_URL = "https://paycert.wepayez.com/pay/gateway";
    process.env.WALLYT_MCH_ID = "190000000167";
    process.env.WALLYT_SIGNATURE_KEY = "test-signature-key";
    process.env.WALLYT_NOTIFY_URL = "https://admin.artxsd.com/api/billing/wallyt/callback";
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
      users: [],
      orders: [],
      credits: [],
      aiTasks: [],
      providers: [
        { id: "pay_wallyt", name: "威富通", category: "聚合支付", state: "未配置", latencyMs: 0, owner: "Finance", configLocation: "server env: WALLYT_*", credentialStatus: "missing", lastCheckedAt: "旧快照" },
        { id: "pay_wechat", name: "微信支付", category: "国内支付", state: "未配置", latencyMs: 0, owner: "Finance", configLocation: "server env: WECHAT_PAY_*", credentialStatus: "missing", lastCheckedAt: "旧快照" },
        { id: "pay_alipay", name: "支付宝", category: "国内支付", state: "未配置", latencyMs: 0, owner: "Finance", configLocation: "server env: ALIPAY_*", credentialStatus: "missing", lastCheckedAt: "旧快照" },
      ],
      feedback: [],
      alerts: [],
      riskEvents: [],
      auditLogs: [],
      plans: [],
      capabilityStatus: [],
    }, null, 2)}\n`);

    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const providersResult = await handleAdminApiRequest("GET", "/providers", authorization);
    expect(providersResult.status).toBe(200);
    const providersBody = providersResult.body as {
      providers: Array<{
        id: string;
        state: string;
        credentialStatus: string;
        configLocation: string;
      }>;
    };
    expect(providersBody.providers.find((item) => item.id === "pay_wallyt")).toMatchObject({
      state: "在线",
      credentialStatus: "configured",
      configLocation: "server env: WALLYT_*",
    });
    expect(providersBody.providers.find((item) => item.id === "pay_wechat")).toMatchObject({
      state: "在线",
      credentialStatus: "configured",
      configLocation: "via Wallyt aggregate payment",
    });
    expect(providersBody.providers.find((item) => item.id === "pay_alipay")).toMatchObject({
      state: "在线",
      credentialStatus: "configured",
      configLocation: "via Wallyt aggregate payment",
    });

    delete process.env.WALLYT_DOMAIN_URL;
    delete process.env.WALLYT_MCH_ID;
    delete process.env.WALLYT_SIGNATURE_KEY;
    delete process.env.WALLYT_NOTIFY_URL;
  });
});
