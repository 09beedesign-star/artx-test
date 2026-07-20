# Capability Margin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show capability-level AI gross margin from actual successful task credit charges and cost snapshots.

**Architecture:** Extend the existing `AiTaskRecord` summary functions in `admin-store` with capability grouping and time filters. Return capability rows with model drilldown in the existing overview payload, then render a dedicated admin section with KPIs, ranking, and selected-capability model rows.

**Tech Stack:** TypeScript, existing admin document store, Vitest, React, Tailwind.

---

### Task 1: Capability Margin Aggregation

**Files:**
- Modify: `server/admin-store.ts:1339-1380`
- Create: `server/admin-store.capability-margin.test.ts`

- [ ] Write failing tests with successful and failed tasks across two capabilities and models; assert successful tasks alone contribute charged credits/cost, margin equals `(credits - estimatedCost * 100) / credits`, and a 7-day filter excludes older records.
- [ ] Run `pnpm exec vitest run server/admin-store.capability-margin.test.ts` and verify failure because no capability aggregate exists.
- [ ] Add `summarizeCapabilityMargins(data, range)` and include `aiCostBreakdownByCapability` in `dashboard(data)`, with rows `{ key, label, chargedCredits, estimatedCost, grossProfitCredits, avgGrossMargin, successCount, failedCount, models }`.
- [ ] Run the focused test and `pnpm check`; commit `feat: summarize capability margins`.

### Task 2: Admin Capability Margin View

**Files:**
- Modify: `client/src/pages/AdminPrototypePage.tsx:45-300`, `client/src/pages/AdminPrototypePage.tsx:1280-1850`
- Create: `client/src/pages/AdminPrototypePage.capability-margin.test.ts`

- [ ] Write a failing client test that requires `能力毛利`, `aiCostBreakdownByCapability`, `毛利额`, `毛利率`, and selected-capability model drilldown labels.
- [ ] Run `pnpm exec vitest run client/src/pages/AdminPrototypePage.capability-margin.test.ts` and verify failure.
- [ ] Add a `capability_margin` navigation section and render a 7/30-day/all-time control, summary metrics, capability ranking table, and model drilldown using the returned snapshots. Label upstream figures `预估成本`; do not display plan revenue.
- [ ] Run the focused test and `pnpm check`; commit `feat: add capability margin dashboard`.

### Task 3: Verification And Formal Release

**Files:**
- Test: `server/admin-store.capability-margin.test.ts`
- Test: `client/src/pages/AdminPrototypePage.capability-margin.test.ts`

- [ ] Run focused aggregation, admin dashboard, AI usage, and model access tests, then run `pnpm check` and a production build.
- [ ] Deploy the built `dist` through the existing `/opt/artx` backup/restart flow; verify formal health, deployment manifest, and the authenticated admin overview payload contains capability rows.
- [ ] Push task commits without overwriting remote history.
