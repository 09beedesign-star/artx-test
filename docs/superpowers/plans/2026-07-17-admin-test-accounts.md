# 后台测试账号管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `/admin-prototype` 中发放、限额、注销测试账号，并审计每次 AI 使用的精确时间与可用计量。

**Architecture:** `auth-store` 只负责账户创建与禁用登录；`admin-store` 是测试档案、积分台账、每日预约额度、AI 审计与管理员操作审计的唯一 owner。`server/index.ts` 在所有 AI 入口调用统一的预检/完成/释放契约，前端只调用已有 `/api/admin/*` 的新增受控端点。

**Tech Stack:** TypeScript、Express、React、Vitest、现有 JSON/Postgres 文档存储适配器、Radix Dialog。

---

## 文件结构

- 修改：`server/auth-store.ts`，提供管理员安全创建测试账号与禁用账号的复用入口。
- 修改：`server/admin-store.ts`，定义 `testProfile`、额度预约、管理员 API、匿名注销与 AI 用量字段。
- 修改：`server/index.ts`，让同步、异步图像与文本 AI 路由在调用供应商前统一预检并在结束后结算预约。
- 修改：`client/src/pages/AdminPrototypePage.tsx`，在已有用户列表/详情页增加测试账号操作和用量展示。
- 创建：`server/admin-test-accounts.test.ts`，验证服务端账户生命周期、权限、额度与注销。
- 创建：`server/admin-test-account-usage.test.ts`，验证测试账号 AI 预检、预约释放与 Token/图像计量。
- 创建：`client/src/pages/AdminPrototypePage.test-account.test.tsx`，验证页面只在现有后台呈现测试账号筛选与危险操作入口。

### Task 1: 管理员创建与禁用测试账号

**Files:**
- Modify: `server/auth-store.ts:1-180, 583-662`
- Test: `server/auth-store.password.test.ts`

- [ ] **Step 1: 写失败测试，要求管理员创建的账号使用临时密码且默认不可管理后台。**

```ts
it("creates an active viewer account with a one-time temporary password", async () => {
  const result = await createAuthUserForAdmin({
    actorId: "super-admin",
    actorName: "root@artxsd.com",
    username: "qa-demo@artxsd.com",
  });

  expect(result.status).toBe(201);
  expect(result.body.user.role).toBe("viewer");
  expect(result.body.user.status).toBe("active");
  expect(result.body.temporaryPassword).toMatch(/^ArtX-/);
});
```

- [ ] **Step 2: 运行测试，确认因 `createAuthUserForAdmin` 尚不存在而失败。**

Run: `pnpm exec vitest run server/auth-store.password.test.ts`

Expected: FAIL，错误为 `createAuthUserForAdmin is not a function`。

- [ ] **Step 3: 实现最小 auth helper。**

```ts
export async function createAuthUserForAdmin(input: {
  actorId: string;
  actorName: string;
  username: string;
}) {
  const temporaryPassword = `ArtX-${crypto.randomBytes(9).toString("base64url")}`;
  // Reuse the existing normalized email, password-hash and audit helpers.
  // Persist role: "viewer" and status: "active" only.
  return { status: 201 as const, body: { user: publicUser(user), temporaryPassword } };
}
```

Do not append the temporary password to auth audit logs or return it from any list/detail API.

- [ ] **Step 4: 运行 auth 回归。**

Run: `pnpm exec vitest run server/auth-store.password.test.ts server/auth-store.session.test.ts`

Expected: PASS，临时密码只出现在创建响应，既有会话/密码测试不回归。

- [ ] **Step 5: 提交 auth 基础能力。**

```bash
git add server/auth-store.ts server/auth-store.password.test.ts
git commit -m "feat: add admin test account creation"
```

### Task 2: 测试档案、额度与注销管理 API

**Files:**
- Modify: `server/admin-store.ts:25-43, 136-175, 1578-1770, 1929-1985`
- Create: `server/admin-test-accounts.test.ts`

- [ ] **Step 1: 写失败测试，覆盖发放、调整、非超级管理员拒绝和不可恢复注销。**

```ts
async function getAdminAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const result = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  return `Bearer ${(result.body as { token: string }).token}`;
}

it("issues a test profile, records credit adjustments, and rejects non-super-admin writes", async () => {
  const auth = await import("./auth-store");
  const registered = await auth.handleAuthAction("register", {
    username: "support@example.com", password: "support-password",
  });
  const supportUser = (registered.body as { user: { id: string } }).user;
  await auth.updateAuthUserAdmin({
    actorId: "bootstrap-admin", actorName: "admin@example.com", userId: supportUser.id, role: "support",
  });
  const supportLogin = await auth.handleAuthAction("login", {
    username: "support@example.com", password: "support-password",
  });
  const support = `Bearer ${(supportLogin.body as { token: string }).token}`;
  const denied = await handleAdminApiRequest("POST", "/test-accounts", support, {
    email: "qa-demo@artxsd.com", initialCredits: 200, dailyCreditLimit: 50, expiresAt: "2026-08-17T15:59:59.000Z",
  });
  expect(denied.status).toBe(403);

  const superAdmin = await getAdminAuthorization();
  const issued = await handleAdminApiRequest("POST", "/test-accounts", superAdmin, {
    email: "qa-demo@artxsd.com", initialCredits: 200, dailyCreditLimit: 50, expiresAt: "2026-08-17T15:59:59.000Z",
  });
  expect(issued.status).toBe(201);
  expect(issued.body.user.testProfile.dailyCreditLimit).toBe(50);
});

it("cancels a test account by disabling login, clearing its credits, and anonymizing the admin projection", async () => {
  const result = await handleAdminApiRequest("POST", "/users/test-user/test-account/cancel", superAdmin, { confirm: true });
  expect(result.status).toBe(200);
  expect(result.body.user.status).toBe("cancelled");
  expect(result.body.user.credits).toBe(0);
  expect(result.body.user.email).toMatch(/^cancelled-/);
});
```

- [ ] **Step 2: 运行测试并确认失败。**

Run: `pnpm exec vitest run server/admin-test-accounts.test.ts`

Expected: FAIL，路由与 `testProfile` 尚未实现。

- [ ] **Step 3: 在 `AdminUserAccount` 中增加非权限性的测试档案。**

```ts
type TestAccountProfile = {
  issuedAt: string;
  expiresAt: string;
  initialCredits: number;
  dailyCreditLimit: number;
  usageDate: string;
  reservedCredits: number;
  cancelledAt?: string;
  cancelledBy?: string;
};

type AdminUserAccount = {
  // existing fields
  accountType?: "regular" | "test";
  testProfile?: TestAccountProfile;
};
```

Keep `role` unchanged. Extend status rendering with `cancelled` only in the admin projection; call `updateAuthUserAdmin({ status: "disabled" })` for the real login state.

- [ ] **Step 4: 添加受控 API 分支并复用现有积分台账。**

Implement `POST test-accounts`, `POST users/:id/test-profile`, and `POST users/:id/test-account/cancel` inside `handleAdminApiRequest`. Add a `requireSuperAdmin(actor)` guard before every mutation. Initial credits and later delta changes must create `CreditLedgerEntry` plus `appendAuditLog`; direct `credits` overwrite is forbidden. Cancellation requires `confirm === true`, clears balance/reservations, anonymizes admin display fields, appends an audit event, and disables auth login.

- [ ] **Step 5: 运行服务端账户回归。**

Run: `pnpm exec vitest run server/admin-test-accounts.test.ts server/admin-store.credit-notifications.test.ts server/admin-store.risk.test.ts server/auth-store.password.test.ts`

Expected: PASS，普通账户/既有积分赠送/风控逻辑仍通过。

- [ ] **Step 6: 提交测试账号管理域。**

```bash
git add server/admin-store.ts server/admin-test-accounts.test.ts
git commit -m "feat: manage test account limits and cancellation"
```

### Task 3: AI 请求预检、每日预约与用量审计

**Files:**
- Modify: `server/admin-store.ts:136-175, 2599-2710`
- Modify: `server/index.ts:433-499, 1012-1080, 1217-1228`
- Create: `server/admin-test-account-usage.test.ts`

- [ ] **Step 1: 写失败测试，覆盖限额、失败释放、真实 Token 和图像计量。**

```ts
it("reserves test-account credits before provider work and releases them after failure", async () => {
  await issueTestAccount({ userId: "test-user", dailyCreditLimit: 20, initialCredits: 100 });
  const reservation = await reserveTestAccountAiUsage({ userId: "test-user", estimatedCredits: 12, taskId: "task-1" });
  expect(reservation.status).toBe("reserved");
  await releaseTestAccountAiUsage({ userId: "test-user", taskId: "task-1" });
  expect((await getTestProfile("test-user")).reservedCredits).toBe(0);
});

it("rejects expired and over-limit test accounts before an AI provider is called", async () => {
  await issueTestAccount({ userId: "expired", expiresAt: "2020-01-01T00:00:00.000Z", dailyCreditLimit: 20 });
  await expect(reserveTestAccountAiUsage({ userId: "expired", estimatedCredits: 1, taskId: "task-2" }))
    .rejects.toThrow("测试账号已过期");
});

it("stores actual text token usage and image count without inventing image tokens", async () => {
  const text = await recordAiUsage({ userId: "test-user", username: "qa-demo@artxsd.com", capability: "文案生成", provider: "AI_TEXT", model: "gpt-5.4", status: "success", inputTokens: 812, outputTokens: 216 });
  expect(text.usage).toEqual({ usageKind: "tokens", promptTokens: 812, completionTokens: 216 });
});
```

- [ ] **Step 2: 运行测试并确认失败。**

Run: `pnpm exec vitest run server/admin-test-account-usage.test.ts`

Expected: FAIL，预约函数和 usage 字段尚不存在。

- [ ] **Step 3: 在 `admin-store` 实现统一预检/结算契约。**

```ts
export async function reserveTestAccountAiUsage(input: {
  userId: string;
  taskId: string;
  estimatedCredits: number;
}): Promise<{ status: "not_test" | "reserved" }>;

export async function settleTestAccountAiUsage(input: {
  userId: string;
  taskId: string;
  actualCredits: number;
}): Promise<void>;

export async function releaseTestAccountAiUsage(input: {
  userId: string;
  taskId: string;
}): Promise<void>;
```

Reset the daily bucket when the Asia/Shanghai calendar date changes. Reject cancelled, disabled, expired, insufficient-credit, and over-limit users before provider work. Persist task ID reservations so browser-background image tasks and synchronous routes share one cap.

- [ ] **Step 4: 将预检接入所有 AI 入口。**

In `handleTrackedAiRequest`, calculate the route quote before `handler(user)`, reserve it after session resolution, settle on `recordAiRouteUsage` success, and release in the catch block. In `/api/images/tasks`, reserve before creating `BackgroundImageTask`, then settle/release inside its existing promise callbacks. Wrap the existing `/api/ai/generate` text route at `server/index.ts:1217-1228` with the same helper. Do not place this check only in `recordAiUsage`, because that runs after provider consumption.

- [ ] **Step 5: 扩展审计计量与精确时间。**

Add `usage` to `AiTaskRecord` and `AiUsageRecordInput`. Text adapters pass provider `usage.prompt_tokens` / `usage.completion_tokens` only when present. Image adapters pass `usageKind: "images"` and the existing output count. Keep `createdAt` in ISO UTC and render it with seconds in the admin UI; never log prompts, keys or tokens.

- [ ] **Step 6: 运行 AI 计费与图像路由回归。**

Run: `pnpm exec vitest run server/admin-test-account-usage.test.ts server/background-image-tasks.test.ts server/image-generation.test.ts server/image-generation.smart-product.test.ts`

Expected: PASS，测试账号限额覆盖文本、同步图像和后台图像任务；既有智能产品图回归通过。

- [ ] **Step 7: 提交 AI 限额与审计。**

```bash
git add server/admin-store.ts server/index.ts server/admin-test-account-usage.test.ts
git commit -m "feat: enforce test account AI limits"
```

### Task 4: 现有后台用户管理界面

**Files:**
- Modify: `client/src/pages/AdminPrototypePage.tsx:477-750, 1270-1385, 2000-2029`
- Create: `client/src/pages/AdminPrototypePage.test-account.test.tsx`

- [ ] **Step 1: 写失败页面测试，约束现有页面内的入口与高危确认。**

```ts
it("keeps test account controls inside the existing users section", () => {
  const source = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");
  expect(source).toContain('"测试账号"');
  expect(source).toContain("/api/admin/test-accounts");
  expect(source).toContain("/test-account/cancel");
  expect(source).toContain("Dialog");
  expect(source).not.toContain('path="/test-accounts"');
});
```

- [ ] **Step 2: 运行页面测试并确认失败。**

Run: `pnpm exec vitest run client/src/pages/AdminPrototypePage.test-account.test.tsx`

Expected: FAIL，测试账号控件与 API 调用尚不存在。

- [ ] **Step 3: 扩展现有用户列表与详情侧栏。**

Add an account-type filter next to the existing status filter, a `测试账号` badge, and a create/issue dialog in the users section. Extend the existing account detail drawer with controlled inputs for credits, daily cap and expiry, plus an AI usage section. Use existing `Input`, `Button`, `Badge`, toast feedback and Radix `Dialog`; do not add global CSS or a new route.

The create dialog must display the returned temporary password once, provide no persistent storage for it, and close after explicit acknowledgement. The cancellation dialog must require a confirmation phrase and call only `POST /api/admin/users/:id/test-account/cancel`.

- [ ] **Step 4: 运行前端聚焦回归。**

Run: `pnpm exec vitest run client/src/pages/AdminPrototypePage.test-account.test.tsx client/src/pages/AdminPrototypePage.credit-adjustment.test.ts client/src/pages/AdminPrototypePage.pagination.test.ts client/src/pages/AdminPrototypePage.registration-time.test.ts`

Expected: PASS，测试账号控件只出现在现有后台用户管理；既有筛选、积分和时间显示不回归。

- [ ] **Step 5: 提交后台界面。**

```bash
git add client/src/pages/AdminPrototypePage.tsx client/src/pages/AdminPrototypePage.test-account.test.tsx
git commit -m "feat: add test account controls to admin"
```

### Task 5: 全量验证与测试环境发布

**Files:**
- No planned product-code changes; correct only regressions discovered by the commands below in the files from Tasks 1-4.

- [ ] **Step 1: 运行跨模块回归。**

Run:

```bash
pnpm exec vitest run \
  server/admin-test-accounts.test.ts \
  server/admin-test-account-usage.test.ts \
  server/admin-store.credit-notifications.test.ts \
  server/auth-store.password.test.ts \
  server/background-image-tasks.test.ts \
  server/image-generation.test.ts \
  client/src/pages/AdminPrototypePage.test-account.test.tsx \
  client/src/pages/AdminPrototypePage.credit-adjustment.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Expected: all tests pass, type check succeeds, production build succeeds.

- [ ] **Step 2: 在浏览器验证真实管理员流程。**

Use `/admin-prototype` with a `super_admin`: create a test account, acknowledge the one-time password, adjust credits/limit/expiry, inspect text/image usage records with seconds, then cancel it. Confirm a cancelled account cannot authenticate or start an AI task.

- [ ] **Step 3: 只暂存本任务文件并审查发布差异。**

```bash
git diff --check
git status --short
git diff --stat origin/feature/interaction-framework..HEAD
```

Expected: only test-account backend/frontend/tests/docs are included; no `.env`, build artifact, key or unrelated user-worktree change is staged.

- [ ] **Step 4: 按项目测试发布规范推送。**

Push only after the user asks to submit to test: commit the scoped branch, fast-forward `feature/interaction-framework`, then verify `https://09beedesign-star.github.io/artx-test/deployment.json`, `https://backstage.artxsd.com/deployment.json`, `https://backstage.artxsd.com/api/health`, and the touched admin API. Both manifests must show the same pushed `shortCommit`.
