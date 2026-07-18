# Third-Party Agent Billing Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal admin module that records and monitors external MCP/API-key use, including estimated HK$ upstream cost.

**Architecture:** The MCP route receives a non-secret API key ID and prefix from authentication, records each tool call as an external-agent event after the existing AI ledger write, and stores immutable USD estimates. `admin-store` aggregates those events by range/key/source/model/status and converts USD values using a persisted USD/HKD display rate. The admin client reads the aggregate API and renders a dedicated operational view with masked key identities.

**Tech Stack:** TypeScript, Express, PostgreSQL/JSON admin document store, Vitest, React, Tailwind, Lucide.

---

## File Structure

- Modify: `server/auth-store.ts` to return API-key record ID and safe prefix to MCP authentication.
- Modify: `server/admin-store.ts` to persist external-agent events, aggregate them, and expose admin monitor/config routes.
- Modify: `server/index.ts` to capture MCP request metadata and record successful/failed tool calls without changing MCP responses.
- Modify: `client/src/pages/AdminPrototypePage.tsx` to add the monitor section and HK$ exchange-rate control.
- Create: `server/external-agent-usage.test.ts` to test recording, aggregation, filtering, masking, and currency conversion.
- Create: `server/index.mcp-usage.test.ts` to test MCP instrumentation placement and safe metadata handling.
- Create: `client/src/pages/AdminPrototypePage.external-agent-usage.test.ts` to verify admin labels, masking, filters, and cost disclosure.

### Task 1: Persist And Aggregate External-Agent Usage

**Files:**
- Modify: `server/admin-store.ts:293-305`, `server/admin-store.ts:1435-1454`, `server/admin-store.ts:1613-1775`
- Create: `server/external-agent-usage.test.ts`

- [ ] **Step 1: Write failing aggregation tests**

```ts
it("groups external MCP usage by masked key and converts immutable USD estimates to HKD", async () => {
  await store.recordExternalAgentUsage({
    apiKeyId: "key-1", apiKeyPrefix: "artx_sk_abc123", agentSource: "Claude Desktop",
    toolName: "artx_generate_image", capability: "text_to_image", model: "og-image2-medium",
    status: "success", chargedCredits: 10, estimatedCostUsd: 0.4, outputUnits: 1,
  });
  const result = await store.getExternalAgentUsage({ range: "all" });
  expect(result.summary).toMatchObject({ calls: 1, chargedCredits: 10, estimatedCostUsd: 0.4, estimatedCostHkd: 3.12 });
  expect(result.byKey[0]).toMatchObject({ apiKey: "artx_sk_abc123...", agentSource: "Claude Desktop" });
});

it("does not fabricate tokens and filters by source and failed status", async () => {
  // Record one failed no-token event and one successful token event, then assert each filter's count.
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run server/external-agent-usage.test.ts`

Expected: FAIL because `recordExternalAgentUsage` and `getExternalAgentUsage` do not exist.

- [ ] **Step 3: Add the minimal data model and helpers**

```ts
type ExternalAgentUsageEvent = {
  id: string; apiKeyId: string; apiKeyPrefix: string; agentSource: string;
  toolName: string; capability: string; model: string; status: "success" | "failed";
  latencyMs: number; outputUnits: number; inputTokens?: number; outputTokens?: number;
  chargedCredits: number; estimatedCostUsd: number; failureCategory?: string; createdAt: string;
};

const DEFAULT_USD_TO_HKD_RATE = 7.8;

export async function recordExternalAgentUsage(input: Omit<ExternalAgentUsageEvent, "id" | "createdAt">) { /* append a capped event */ }
export async function getExternalAgentUsage(filter: ExternalAgentUsageFilter) { /* filter, group, and convert */ }
```

Add `externalAgentUsage?: ExternalAgentUsageEvent[]` and `usdToHkdRate?: number` to `AdminData`, preserve both in `normalizeDataAsync`, and cap event storage to the project’s existing 500-record convention. Mask only the stored safe prefix in responses; never store or return a raw key.

- [ ] **Step 4: Add admin routes and exchange-rate update validation**

```ts
if (method === "GET" && route === "external-agent-usage") {
  return { status: 200, body: await getExternalAgentUsageFromData(data, query) };
}
if (method === "POST" && route === "external-agent-usage/exchange-rate") {
  const rate = Number(body.usdToHkdRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return jsonError(400, "USD/HKD 汇率必须大于 0 且不超过 100");
  data.usdToHkdRate = rate;
  await saveAdminData(data);
  return { status: 200, body: { usdToHkdRate: rate } };
}
```

Require an authenticated admin for read access and `super_admin` for exchange-rate mutation. Return `estimatedCostUsd`, `estimatedCostHkd`, and `usdToHkdRate` separately so USD remains auditable.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `pnpm exec vitest run server/external-agent-usage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the server aggregation slice**

```bash
git add server/admin-store.ts server/external-agent-usage.test.ts
git commit -m "feat: aggregate third-party agent usage"
```

### Task 2: Instrument MCP Calls Safely

**Files:**
- Modify: `server/auth-store.ts:580-592`
- Modify: `server/index.ts:1625-1785`
- Create: `server/index.mcp-usage.test.ts`

- [ ] **Step 1: Write failing MCP instrumentation tests**

```ts
it("passes API-key identity but never the raw key into MCP usage recording", async () => {
  const source = await readFile(indexPath, "utf8");
  expect(source).toContain("apiKeyId: auth.body.apiKey.id");
  expect(source).toContain("apiKeyPrefix: auth.body.apiKey.prefix");
  expect(source).not.toContain("apiKeyValue:");
});

it("records both successful and failed artx_generate_image calls after the existing AI ledger write", async () => {
  // Assert both paths call recordExternalAgentUsage after recordAiRouteUsage.
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run server/index.mcp-usage.test.ts`

Expected: FAIL because the MCP route has no external-agent recorder.

- [ ] **Step 3: Expose safe API-key identity from authentication**

```ts
return { status: 200 as const, body: {
  user: publicUser(user),
  apiKey: { id: key.id, prefix: key.prefix },
} };
```

Keep `keyHash` and the token value private.

- [ ] **Step 4: Record tool calls with normalized request-local agent metadata**

```ts
function mcpAgentSource(request: McpJsonRpcRequest) {
  const value = request.params?.meta?.agentSource;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : "未标识 Agent";
}
```

Use request-local metadata because HTTP MCP calls are stateless; do not assume `initialize` data survives later requests. Call `recordExternalAgentUsage` after `recordAiRouteUsage` in both success and failure branches. Derive estimated USD cost and charged credits from the returned usage record, and log recorder failures without changing the MCP response.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `pnpm exec vitest run server/index.mcp-usage.test.ts server/auth-store.session.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit MCP instrumentation**

```bash
git add server/auth-store.ts server/index.ts server/index.mcp-usage.test.ts
git commit -m "feat: record MCP API key usage"
```

### Task 3: Add The Admin Monitor View

**Files:**
- Modify: `client/src/pages/AdminPrototypePage.tsx:45-80`, `client/src/pages/AdminPrototypePage.tsx:500-690`, `client/src/pages/AdminPrototypePage.tsx:1280-1850`
- Create: `client/src/pages/AdminPrototypePage.external-agent-usage.test.ts`

- [ ] **Step 1: Write failing client source tests**

```ts
it("renders the third-party call monitor with explicit estimated HK$ labels", async () => {
  const source = await readFile(pagePath, "utf8");
  expect(source).toContain("第三方调用");
  expect(source).toContain("预估 HK$");
  expect(source).toContain("/api/admin/external-agent-usage");
  expect(source).toContain("usdToHkdRate");
  expect(source).toContain("artx_sk_");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run client/src/pages/AdminPrototypePage.external-agent-usage.test.ts`

Expected: FAIL because the monitor section and fetch path do not exist.

- [ ] **Step 3: Add monitor state, fetcher, and navigation entry**

```ts
type AdminSection = /* existing sections */ | "external_agents";
const [externalUsageFilter, setExternalUsageFilter] = useState({ range: "30d", apiKeyId: "", agentSource: "", model: "", status: "all" });
const [externalUsage, setExternalUsage] = useState<ExternalAgentUsageResponse | null>(null);
```

Fetch `/api/admin/external-agent-usage` with the current admin token and encoded filters whenever the section opens or a filter changes. Add `第三方调用` after `integrations` in the sidebar, using the existing operational navigation style.

- [ ] **Step 4: Render the compact operational monitor**

```tsx
<MetricCard label="预估 HK$ 成本" value={formatHkd(externalUsage.summary.estimatedCostHkd)} detail={`汇率 1 USD = ${externalUsage.usdToHkdRate} HKD`} />
```

Render five totals, a no-gradient bar trend, model distribution rows, filters, an API-key/agent summary table, and recent event table. Use `预估 HK$` consistently. The only mutable control is the super-admin exchange-rate numeric input plus save button; show the raw USD amount in a secondary table column.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `pnpm exec vitest run client/src/pages/AdminPrototypePage.external-agent-usage.test.ts client/src/pages/AdminPrototypePage.model-access.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the admin monitor**

```bash
git add client/src/pages/AdminPrototypePage.tsx client/src/pages/AdminPrototypePage.external-agent-usage.test.ts
git commit -m "feat: add third-party agent billing monitor"
```

### Task 4: Full Regression And Formal Release

**Files:**
- Test: `server/external-agent-usage.test.ts`
- Test: `server/index.mcp-usage.test.ts`
- Test: `client/src/pages/AdminPrototypePage.external-agent-usage.test.ts`

- [ ] **Step 1: Run focused behavior regression**

Run:
```bash
pnpm exec vitest run server/external-agent-usage.test.ts server/index.mcp-usage.test.ts server/auth-store.session.test.ts server/admin-store.credit-notifications.test.ts client/src/pages/AdminPrototypePage.external-agent-usage.test.ts
```

Expected: PASS with no raw API key values in assertions or output.

- [ ] **Step 2: Run type and production build checks**

Run:
```bash
pnpm check
VITE_API_BASE_URL=https://admin.artxsd.com VITE_AUTH_API_BASE_URL=https://admin.artxsd.com VITE_AI_API_BASE_URL=https://admin.artxsd.com VITE_TEST_BACKEND_URL=https://admin.artxsd.com VITE_TEST_FRONTEND_URL=https://admin.artxsd.com VITE_ADMIN_HOST=admin.artxsd.com pnpm build
```

Expected: both commands exit 0.

- [ ] **Step 3: Release and verify formal admin**

Deploy the built `dist` using the established `/opt/artx` backup-and-restart process. Verify `https://admin.artxsd.com/api/health`, `https://admin.artxsd.com/deployment.json`, authenticated `GET /api/admin/external-agent-usage`, and an MCP tool call with a test API key. Confirm the monitor event contains only its masked prefix, source, usage, credits, and estimated HK$ cost.

- [ ] **Step 4: Commit final verification metadata**

```bash
git status --short
git log -1 --oneline
```

Expected: task commits are present and no implementation files are unstaged.
