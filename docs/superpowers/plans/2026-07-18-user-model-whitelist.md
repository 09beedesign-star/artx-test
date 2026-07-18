# User Model Whitelist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user access control for frontend-selectable image and text models, managed from the admin account drawer and enforced by the server.

**Architecture:** Store an optional selectable-model allowlist with the authentication user. Treat a missing list as all models enabled for backwards compatibility. Publish the effective list through authentication, filter the canvas picker from that list, and enforce the canonical selected model before provider calls. Fixed backend function models are not catalog entries and bypass the allowlist.

**Tech Stack:** TypeScript, Express, PostgreSQL JSON document storage, React, Vitest.

---

### Task 1: Define the Selectable Model Access Contract

**Files:**
- Modify: `server/model-router.ts`
- Test: `server/model-router.test.ts`

- [ ] **Step 1: Write failing catalog and allowlist tests**

```ts
expect(listAvailableModels()).toEqual({
  image: expect.arrayContaining(["gpt-image-2"]),
  text: expect.arrayContaining(["gpt-5.4-mini"]),
});
expect(normalizeAllowedModels(["IMAGE2", "gpt-5.4-mini", "picwish-scale"])).toEqual([
  "gpt-image-2",
  "gpt-5.4-mini",
]);
expect(isSelectableModel("picwish-scale")).toBe(false);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm vitest run server/model-router.test.ts`

- [ ] **Step 3: Add exported catalog, normalization, and selectable-model helpers**

```ts
export function normalizeAllowedModels(models: unknown): string[] {
  return Array.from(new Set(
    (Array.isArray(models) ? models : [])
      .map(value => normalizeModelName(typeof value === "string" ? value : ""))
      .filter(isSelectableModel),
  )).sort();
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `pnpm vitest run server/model-router.test.ts`

### Task 2: Persist and Manage User Model Access

**Files:**
- Modify: `server/auth-store.ts`
- Modify: `server/admin-store.ts`
- Test: `server/auth-store.model-access.test.ts`
- Test: `server/admin-test-accounts.test.ts`

- [ ] **Step 1: Write failing tests for default access and an admin update**

```ts
expect(login.body.user.allowedAiModels).toEqual(expect.arrayContaining(["gpt-image-2"]));
const updated = await admin.handleAdminApiRequest("POST", `/users/${userId}/model-access`, authorization, {
  allowedAiModels: ["gpt-5.4-mini"],
});
expect(updated.status).toBe(200);
expect(updated.body.user.allowedAiModels).toEqual(["gpt-5.4-mini"]);
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `pnpm vitest run server/auth-store.model-access.test.ts server/admin-test-accounts.test.ts`

- [ ] **Step 3: Add `allowedAiModels` to stored users and expose effective access**

```ts
function effectiveAllowedAiModels(user: StoredUser) {
  return user.allowedAiModels === undefined
    ? listSelectableModelIds()
    : normalizeAllowedModels(user.allowedAiModels);
}
```

- [ ] **Step 4: Add the super-admin `/users/:id/model-access` handler**

Validate the submitted array with `normalizeAllowedModels`, update the authentication user, mirror the effective list into the admin account response, and append an audit entry containing only model IDs.

- [ ] **Step 5: Run the focused tests and confirm they pass**

Run: `pnpm vitest run server/auth-store.model-access.test.ts server/admin-test-accounts.test.ts`

### Task 3: Enforce Access Before Selectable Model Calls

**Files:**
- Modify: `server/index.ts`
- Test: `server/index.model-access.test.ts`

- [ ] **Step 1: Write failing route guard tests**

```ts
expect(await request("/api/images/generate", {
  model: "gpt-image-2-4k",
})).toMatchObject({ status: 403, body: { error: "当前账号无权使用该模型" } });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm vitest run server/index.model-access.test.ts`

- [ ] **Step 3: Add a single canonical-model guard**

Resolve the request model through `resolveModelRoute`, enforce it only when `isSelectableModel(route.model)` is true, and call it before usage reservation or provider work. Reuse the guard for direct routes, asynchronous image tasks, orchestration, and MCP request handling.

- [ ] **Step 4: Preserve fixed backend model behavior**

Add a test that a request whose route is a fixed PicWish model is not rejected by the selectable-model guard.

- [ ] **Step 5: Run the focused test and confirm it passes**

Run: `pnpm vitest run server/index.model-access.test.ts`

### Task 4: Add the Admin Controls and Filter the Canvas Picker

**Files:**
- Modify: `client/src/pages/AdminPrototypePage.tsx`
- Modify: `client/src/components/canvas/InfiniteCanvas.tsx`
- Test: `client/src/pages/AdminPrototypePage.model-access.test.ts`
- Test: `client/src/components/canvas/InfiniteCanvas.model-access.test.ts`

- [ ] **Step 1: Write failing admin drawer rendering tests**

```ts
expect(source).toContain("模型权限");
expect(source).toContain("allowedAiModels");
```

- [ ] **Step 2: Run focused client tests and confirm they fail**

Run: `pnpm vitest run client/src/pages/AdminPrototypePage.model-access.test.ts client/src/components/canvas/InfiniteCanvas.model-access.test.ts`

- [ ] **Step 3: Add per-model switches and save behavior to the account drawer**

Use the existing account detail fetch and admin POST helper. Initialize the switch state from the effective list; an untouched user renders every selectable model enabled.

- [ ] **Step 4: Filter image and text picker options from the authenticated effective list**

If a persisted browser selection is no longer permitted, select the first allowed model in the same category. When a category has no allowed models, remove that category from the picker and prevent dispatch.

- [ ] **Step 5: Run focused client tests and confirm they pass**

Run: `pnpm vitest run client/src/pages/AdminPrototypePage.model-access.test.ts client/src/components/canvas/InfiniteCanvas.model-access.test.ts`

### Task 5: Complete Regression Validation and Test Deployment

**Files:**
- Modify: relevant tests from Tasks 1-4 only

- [ ] **Step 1: Run full tests, typecheck, and production build**

Run: `pnpm vitest run && pnpm check && pnpm build`

- [ ] **Step 2: Commit the completed feature**

```bash
git add server client docs/superpowers
git commit -m "feat: add per-user selectable model access"
```

- [ ] **Step 3: Deploy the built artifact to the gray environment and run its health checks**

Use the existing gray deployment flow. Verify the model permission save endpoint, an allowed model call, a disabled model denial, and the gray page load.
