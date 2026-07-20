# Capability Margin Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-backed search and combined filters for capability margin analysis.

**Architecture:** `admin-store` will filter `AiTaskRecord` entries before calculating detail rows, capability/model aggregates, and KPIs. `AdminPrototypePage` will fetch that filtered result and present compact controls for time, margin, model, account, and credit ranges.

**Tech Stack:** TypeScript, Express, existing admin data repository, Vitest, React.

---

### Task 1: Filtered Margin API

**Files:**
- Modify: `server/admin-store.ts`
- Create: `server/admin-store.capability-margin-filters.test.ts`

- [ ] Write failing tests for 1/3/7/15/30/90/180-day filters and combined model/account/credit/margin filters; assert task rows and aggregates use the same filtered records.
- [ ] Run `pnpm exec vitest run server/admin-store.capability-margin-filters.test.ts` and verify failure.
- [ ] Add authenticated `GET /api/admin/capability-margin` query handling and a shared `filterAiMarginTasks` helper. Return filtered task rows, KPI totals, capability rows, and model rows.
- [ ] Run the focused test and `pnpm check`; commit `feat: filter capability margin analysis`.

### Task 2: Admin Search Controls

**Files:**
- Modify: `client/src/pages/AdminPrototypePage.tsx`
- Create: `client/src/pages/AdminPrototypePage.capability-margin-filters.test.ts`

- [ ] Write a failing source test for the requested time labels, margin/model/account/credit controls, and `/api/admin/capability-margin` fetch.
- [ ] Run the focused test and verify failure.
- [ ] Add the controls and filtered task table to the capability margin section; refresh results on filter changes and preserve no-results states.
- [ ] Run the focused test and `pnpm check`; commit `feat: add capability margin search controls`.

### Task 3: Release

- [ ] Run focused margin, admin, and type checks, build production `dist`, deploy through the existing `/opt/artx` backup/restart flow, and verify the authenticated filtered API in formal admin.
