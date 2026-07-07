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

  it("returns data-driven launch readiness checks for reconciliation, credit liability, secrets, and privileged access", async () => {
    process.env.WALLYT_MCH_ID = "190000000167";
    process.env.WALLYT_SIGNATURE_KEY = "test-signature-key";
    process.env.WALLYT_NOTIFY_URL = "https://admin.artxsd.com/api/billing/wallyt/callback";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_IMAGE_API_KEY = "test-image-key";
    process.env.PICWISH_API_KEY = "test-picwish-key";
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
      users: [
        {
          id: "user-liability-1",
          name: "liability-user",
          email: "liability@example.com",
          account: "liability@example.com",
          registeredAt: "2026-07-05 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Pro",
          organization: "个人",
          credits: 1200,
          frozenCredits: 100,
          expiredCredits: 30,
          totalRecharge: 500,
          totalConsumed: 80,
          lastSeen: "刚刚",
          risk: "低",
        },
      ],
      orders: [
        {
          id: "rch_ready_paid",
          userId: "user-liability-1",
          user: "liability-user",
          packageName: "积分充值",
          channel: "微信支付",
          amount: 100,
          expectedCredits: 1000,
          issuedCredits: 1000,
          status: "paid",
          createdAt: "2026-07-05T02:00:00.000Z",
          event: "支付成功并入账",
          reconciliation: "matched",
          providerTransactionId: "txn_ready_paid",
        },
        {
          id: "rch_ready_pending",
          userId: "user-liability-1",
          user: "liability-user",
          packageName: "积分充值",
          channel: "支付宝",
          amount: 50,
          expectedCredits: 500,
          issuedCredits: 0,
          status: "pending",
          createdAt: "2026-07-05T02:05:00.000Z",
          event: "等待支付",
          reconciliation: "pending",
        },
        {
          id: "rch_ready_mismatch",
          userId: "user-liability-1",
          user: "liability-user",
          packageName: "积分充值",
          channel: "微信支付",
          amount: 30,
          expectedCredits: 300,
          issuedCredits: 0,
          status: "failed",
          createdAt: "2026-07-05T02:10:00.000Z",
          event: "支付金额与本地订单不一致",
          reconciliation: "mismatch",
        },
      ],
      credits: [
        {
          id: "cr_ready_paid",
          userId: "user-liability-1",
          user: "liability-user",
          type: "购买入账",
          delta: 1000,
          reason: "订单支付成功",
          source: "rch_ready_paid",
          operator: "wallyt",
          createdAt: "2026-07-05T02:01:00.000Z",
        },
      ],
      aiTasks: [],
      providers: [],
      feedback: [],
      alerts: [],
      riskEvents: [
        {
          id: "risk_ready_high",
          title: "高危权限复核",
          detail: "测试高危权限事件",
          status: "open",
          severity: "high",
          target: "admin@example.com",
          createdAt: "2026-07-05T02:15:00.000Z",
        },
      ],
      auditLogs: [],
      plans: [],
      capabilityStatus: [],
    }, null, 2)}\n`);

    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const checksResult = await handleAdminApiRequest("GET", "/production-checks", authorization);
    expect(checksResult.status).toBe(200);
    const checksBody = checksResult.body as {
      productionChecks: Array<{
        id: string;
        status: string;
        metrics: Record<string, number>;
        metricLabels: Record<string, string>;
        actionTarget: string;
        evidence: string[];
      }>;
    };

    expect(checksBody.productionChecks.find((item) => item.id === "payment_reconciliation")).toMatchObject({
      status: "blocked",
      actionTarget: "orders",
      metrics: {
        totalOrders: 3,
        pendingReconciliation: 1,
        mismatchedOrders: 1,
        paidWithoutCredits: 0,
      },
      metricLabels: {
        totalOrders: "订单总数",
        pendingReconciliation: "待对账订单",
        mismatchedOrders: "异常订单",
        paidWithoutCredits: "已支付未足额入账",
      },
    });
    expect(checksBody.productionChecks.find((item) => item.id === "credit_liability")).toMatchObject({
      status: "ready",
      actionTarget: "credits",
      metrics: {
        activeUserCredits: 1200,
        frozenCredits: 100,
        expiredCredits: 30,
        paidUnconsumedCredits: 920,
      },
      metricLabels: {
        activeUserCredits: "用户可用积分",
        frozenCredits: "冻结积分",
        expiredCredits: "过期积分",
        paidUnconsumedCredits: "已发放未消耗积分",
      },
    });
    expect(checksBody.productionChecks.find((item) => item.id === "secret_governance")).toMatchObject({
      status: "partial",
      actionTarget: "integrations",
    });
    expect(checksBody.productionChecks.find((item) => item.id === "privileged_access")).toMatchObject({
      status: "blocked",
      actionTarget: "audit",
      metrics: {
        superAdminCount: 1,
        highRiskOpenEvents: 1,
      },
    });

    const overviewResult = await handleAdminApiRequest("GET", "/overview", authorization);
    expect(overviewResult.status).toBe(200);
    const overviewBody = overviewResult.body as {
      overview: {
        productionChecks: Array<{ id: string }>;
      };
    };
    expect(overviewBody.overview.productionChecks.map((item) => item.id)).toEqual([
      "payment_reconciliation",
      "credit_liability",
      "secret_governance",
      "privileged_access",
    ]);
  });

  it("lets a super admin assign and revoke support, finance, and admin roles without deleting the user", async () => {
    const { handleAdminApiRequest } = await loadAdminStore();
    const { handleAuthAction } = await import("./auth-store");
    const authorization = await getAdminAuthorization();

    const registered = await handleAuthAction("register", {
      username: "role-target@example.com",
      password: "role-target-password",
    });
    expect(registered.status).toBe(200);
    const targetUser = (registered.body as { user: { id: string; role: string; isAdmin: boolean } }).user;
    expect(targetUser).toMatchObject({ role: "viewer", isAdmin: false });

    for (const role of ["support", "finance", "admin"] as const) {
      const assigned = await handleAdminApiRequest("POST", `/users/${targetUser.id}/role`, authorization, { role });
      expect(assigned.status).toBe(200);
      const assignedBody = assigned.body as { users: Array<{ id: string; role: string }> };
      expect(assignedBody.users.find((item) => item.id === targetUser.id)).toMatchObject({ role });

      const revoked = await handleAdminApiRequest("POST", `/users/${targetUser.id}/role`, authorization, { role: "viewer" });
      expect(revoked.status).toBe(200);
      const revokedBody = revoked.body as { users: Array<{ id: string; role: string; email: string }> };
      expect(revokedBody.users.find((item) => item.id === targetUser.id)).toMatchObject({
        role: "viewer",
        email: "role-target@example.com",
      });
    }
  });

  it("prevents non-super admins from granting or revoking administrator roles", async () => {
    const { handleAdminApiRequest } = await loadAdminStore();
    const { handleAuthAction } = await import("./auth-store");
    const superAdminAuthorization = await getAdminAuthorization();

    const financeRegistration = await handleAuthAction("register", {
      username: "finance-operator@example.com",
      password: "finance-operator-password",
    });
    const targetRegistration = await handleAuthAction("register", {
      username: "admin-target@example.com",
      password: "admin-target-password",
    });
    expect(financeRegistration.status).toBe(200);
    expect(targetRegistration.status).toBe(200);
    const financeUser = (financeRegistration.body as { user: { id: string } }).user;
    const targetUser = (targetRegistration.body as { user: { id: string } }).user;

    const promoteFinance = await handleAdminApiRequest("POST", `/users/${financeUser.id}/role`, superAdminAuthorization, { role: "finance" });
    expect(promoteFinance.status).toBe(200);
    const promoteTarget = await handleAdminApiRequest("POST", `/users/${targetUser.id}/role`, superAdminAuthorization, { role: "admin" });
    expect(promoteTarget.status).toBe(200);

    const financeLogin = await handleAuthAction("login", {
      username: "finance-operator@example.com",
      password: "finance-operator-password",
    });
    expect(financeLogin.status).toBe(200);
    const financeAuthorization = `Bearer ${(financeLogin.body as { token: string }).token}`;

    const grantAdmin = await handleAdminApiRequest("POST", `/users/${financeUser.id}/role`, financeAuthorization, { role: "admin" });
    expect(grantAdmin.status).toBe(403);
    expect(grantAdmin.body).toMatchObject({ error: "只有 super_admin 可以分配或撤销管理员权限" });

    const revokeAdmin = await handleAdminApiRequest("POST", `/users/${targetUser.id}/role`, financeAuthorization, { role: "viewer" });
    expect(revokeAdmin.status).toBe(403);
    expect(revokeAdmin.body).toMatchObject({ error: "只有 super_admin 可以分配或撤销管理员权限" });
  });

  it("shows admin user plan names with the three billing page plan labels", async () => {
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
      users: [
        {
          id: "plan-user-pro",
          name: "pro-user",
          email: "pro-user@example.com",
          account: "pro-user@example.com",
          registeredAt: "2026-07-05 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Pro 20K",
          organization: "个人",
          credits: 100,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 0,
          totalConsumed: 0,
          lastSeen: "刚刚",
          risk: "低",
        },
        {
          id: "plan-user-starter",
          name: "starter-user",
          email: "starter-user@example.com",
          account: "starter-user@example.com",
          registeredAt: "2026-07-05 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Starter",
          organization: "个人",
          credits: 0,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 0,
          totalConsumed: 0,
          lastSeen: "刚刚",
          risk: "低",
        },
        {
          id: "plan-user-creator",
          name: "creator-user",
          email: "creator-user@example.com",
          account: "creator-user@example.com",
          registeredAt: "2026-07-05 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Creator 创作者版",
          organization: "个人",
          credits: 0,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 0,
          totalConsumed: 0,
          lastSeen: "刚刚",
          risk: "低",
        },
        {
          id: "plan-user-business",
          name: "business-user",
          email: "business-user@example.com",
          account: "business-user@example.com",
          registeredAt: "2026-07-05 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Business 团队版",
          organization: "个人",
          credits: 0,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 0,
          totalConsumed: 0,
          lastSeen: "刚刚",
          risk: "低",
        },
      ],
      orders: [],
      credits: [],
      aiTasks: [],
      providers: [],
      feedback: [],
      alerts: [],
      riskEvents: [],
      auditLogs: [],
      plans: [],
      capabilityStatus: [],
    }, null, 2)}\n`);

    const { getBillingSnapshotForUser, handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const overviewResult = await handleAdminApiRequest("GET", "/overview", authorization);
    expect(overviewResult.status).toBe(200);
    const overviewBody = overviewResult.body as {
      users: Array<{ id: string; plan: string }>;
    };
    expect(overviewBody.users.find((item) => item.id === "plan-user-pro")).toMatchObject({
      plan: "Pro 专业版",
    });
    expect(overviewBody.users.find((item) => item.id === "plan-user-starter")).toMatchObject({
      plan: "Lite 入门版",
    });
    expect(overviewBody.users.find((item) => item.id === "plan-user-creator")).toMatchObject({
      plan: "Lite 入门版",
    });
    expect(overviewBody.users.find((item) => item.id === "plan-user-business")).toMatchObject({
      plan: "Studio 工作室版",
    });

    await expect(getBillingSnapshotForUser("plan-user-pro")).resolves.toMatchObject({
      plan: "Pro 专业版",
    });
  });

  it("returns account-level payment, credit, note, and reconciliation history for the selected user", async () => {
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
      users: [
        {
          id: "account-detail-user",
          name: "account-user",
          email: "account-user@example.com",
          account: "account-user@example.com",
          registeredAt: "2026-07-05 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Pro",
          organization: "个人",
          credits: 1500,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 300,
          totalConsumed: 0,
          lastSeen: "刚刚",
          risk: "低",
        },
      ],
      orders: [
        {
          id: "account_order_1",
          userId: "account-detail-user",
          user: "account-user",
          packageName: "积分充值",
          channel: "微信支付",
          amount: 100,
          expectedCredits: 1000,
          issuedCredits: 1000,
          status: "paid",
          createdAt: "2026-07-05T02:00:00.000Z",
          paidAt: "2026-07-05T02:01:00.000Z",
          event: "支付成功并入账",
          reconciliation: "matched",
          providerTransactionId: "txn_account_1",
          paymentEvents: [
            {
              id: "payevt_account_1",
              type: "payment_success",
              status: "success",
              providerTransactionId: "txn_account_1",
              amount: 100,
              signatureValid: true,
              message: "渠道确认支付成功",
              createdAt: "2026-07-05T02:01:00.000Z",
            },
          ],
          notes: [
            {
              id: "note_account_1",
              actorId: "admin",
              actorName: "admin@example.com",
              content: "第一笔订单备注",
              createdAt: "2026-07-05T02:02:00.000Z",
            },
          ],
        },
        {
          id: "account_order_2",
          userId: "account-detail-user",
          user: "account-user",
          packageName: "Lite",
          channel: "支付宝",
          amount: 200,
          expectedCredits: 2000,
          issuedCredits: 0,
          status: "pending",
          createdAt: "2026-07-05T03:00:00.000Z",
          event: "等待支付",
          reconciliation: "pending",
          paymentEvents: [
            {
              id: "payevt_account_2",
              type: "payment_created",
              status: "pending",
              providerTransactionId: "txn_account_2",
              amount: 200,
              signatureValid: true,
              message: "支付码已创建",
              createdAt: "2026-07-05T03:01:00.000Z",
            },
          ],
          notes: [
            {
              id: "note_account_2",
              actorId: "finance",
              actorName: "finance@example.com",
              content: "第二笔订单备注",
              createdAt: "2026-07-05T03:02:00.000Z",
            },
          ],
        },
      ],
      credits: [
        {
          id: "cr_account_1",
          userId: "account-detail-user",
          user: "account-user",
          type: "购买入账",
          delta: 1000,
          reason: "订单支付成功",
          source: "account_order_1",
          operator: "wallyt",
          createdAt: "2026-07-05T02:01:30.000Z",
        },
      ],
      aiTasks: [],
      providers: [],
      feedback: [
        {
          id: "fb_account_1",
          userId: "account-detail-user",
          user: "account-user",
          title: "订单支付疑问",
          content: "为什么还没到账",
          module: "支付",
          status: "new",
          priority: "P1",
          linkedOrderId: "account_order_2",
          createdAt: "2026-07-05T03:03:00.000Z",
          updatedAt: "2026-07-05T03:03:00.000Z",
        },
      ],
      alerts: [],
      riskEvents: [],
      auditLogs: [
        {
          id: "aud_account_1",
          actorId: "admin",
          actorName: "admin@example.com",
          action: "新增订单处理备注",
          target: "account_order_1",
          reason: "第一笔订单备注",
          createdAt: "2026-07-05T02:02:30.000Z",
        },
      ],
      plans: [],
      capabilityStatus: [],
    }, null, 2)}\n`);

    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const ordersResult = await handleAdminApiRequest("GET", "/orders", authorization);
    expect(ordersResult.status).toBe(200);
    const ordersBody = ordersResult.body as {
      orders: Array<{ id: string; createdAt: string; paidAt?: string }>;
    };
    expect(ordersBody.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "account_order_1",
        createdAt: "2026/07/05 10:00:00",
        paidAt: "2026/07/05 10:01:00",
      }),
    ]));
    expect(ordersBody.orders.map((order) => `${order.createdAt} ${order.paidAt || ""}`).join(" ")).not.toContain("刚刚");

    const result = await handleAdminApiRequest("GET", "/users/account-detail-user/detail", authorization);
    expect(result.status).toBe(200);
    const body = result.body as {
      user: { id: string; plan: string; spent: number };
      orders: Array<{ id: string; createdAt: string; paidAt?: string }>;
      paymentEvents: Array<{ id: string; orderId: string }>;
      creditEntries: Array<{ id: string; source: string }>;
      notes: Array<{ id: string; orderId: string }>;
      feedbackEntries: Array<{ id: string; linkedOrderId: string }>;
      timeline: Array<{ id: string; orderId?: string }>;
    };

    expect(body.user).toMatchObject({ id: "account-detail-user", plan: "Pro 专业版", spent: 100 });
    expect(body.orders.map((order) => order.id).sort()).toEqual(["account_order_1", "account_order_2"]);
    expect(body.orders.find((order) => order.id === "account_order_1")).toMatchObject({
      createdAt: "2026/07/05 10:00:00",
      paidAt: "2026/07/05 10:01:00",
    });
    expect(body.paymentEvents.map((event) => event.orderId).sort()).toEqual(["account_order_1", "account_order_2"]);
    expect(body.creditEntries).toEqual([expect.objectContaining({ id: "cr_account_1", source: "account_order_1" })]);
    expect(body.notes.map((note) => note.orderId).sort()).toEqual(["account_order_1", "account_order_2"]);
    expect(body.feedbackEntries).toEqual([expect.objectContaining({ id: "fb_account_1", linkedOrderId: "account_order_2" })]);
    expect(body.timeline.some((item) => item.orderId === "account_order_1")).toBe(true);
    expect(body.timeline.some((item) => item.orderId === "account_order_2")).toBe(true);
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
      user: username,
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
