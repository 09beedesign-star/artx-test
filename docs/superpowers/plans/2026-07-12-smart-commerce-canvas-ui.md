# Smart Commerce Canvas UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed the cross-border commerce framework into the canvas smart product image dialog while preserving the existing image-generation path.

**Architecture:** Put market rules in a shared pure module, expose them through three thin server endpoints, keep client API and selection derivation in a focused library, and render the workflow in a dedicated dialog component. `InfiniteCanvas` remains the event owner and consumes only a composed generation payload.

**Tech Stack:** React 19, TypeScript, Vite, Express, Vitest, Playwright, Tailwind CSS, Lucide React.

---

### Task 1: Shared commerce contract and API

**Files:**
- Create: `shared/cross-border-commerce-agent.ts`
- Create: `server/cross-border-commerce-records.ts`
- Modify: `server/index.ts`
- Test: `server/cross-border-commerce-agent.test.ts`

- [ ] Write a failing test that asserts the markets payload includes Amazon, Shopee, TikTok Shop, Lazada and China platforms, and that `Shopee / Indonesia / home_living / campaign_promo` composes successfully.
- [ ] Run `pnpm exec vitest run server/cross-border-commerce-agent.test.ts` and confirm failure because the shared module does not exist.
- [ ] Add the minimal versioned market packages, placements, categories, templates, risk rules, compose function and audit record writer required by the design.
- [ ] Add `GET /markets`, `POST /risk-check`, and `POST /compose` routes without changing the AI orchestration provider.
- [ ] Re-run the test and confirm it passes.

### Task 2: Client selection and API layer

**Files:**
- Create: `client/src/lib/cross-border-commerce.ts`
- Test: `client/src/lib/cross-border-commerce.test.ts`

- [ ] Write failing tests for default selection, upstream selection repair, compatible template filtering, risk labels, and output ratio derivation.
- [ ] Run `pnpm exec vitest run client/src/lib/cross-border-commerce.test.ts` and confirm the module is missing.
- [ ] Implement typed API calls and pure derivation helpers with no UI dependencies.
- [ ] Re-run the tests and confirm they pass.

### Task 3: Smart commerce dialog

**Files:**
- Create: `client/src/components/canvas/SmartCommerceProductDialog.tsx`
- Test: `client/src/components/canvas/SmartCommerceProductDialog.test.ts`

- [ ] Write a failing source/contract test for the three-column regions, all required selectors, risk states, 2K/4K, counts 1-9, and compose-before-dispatch behavior.
- [ ] Run the test and confirm failure because the component does not exist.
- [ ] Implement the responsive dialog with existing ArtX colors, typography, upload interactions, platform icons, loading/error/empty states, debounced risk check and sticky footer.
- [ ] Re-run the test and confirm it passes.

### Task 4: Canvas integration

**Files:**
- Modify: `client/src/components/canvas/InfiniteCanvas.tsx`
- Modify: `client/src/lib/ai.ts`
- Modify: `server/image-generation.ts`
- Test: `client/src/components/canvas/InfiniteCanvas.prompt-controls.test.ts`

- [ ] Extend the existing canvas source test so it fails unless the toolbar label is `智能电商产品`, the dedicated dialog is mounted, the generated payload supports compose metadata, and image count is capped at 9.
- [ ] Replace only the old inline product-background dialog with `SmartCommerceProductDialog`; keep the existing `product-background-create` event and derived-image generation owner.
- [ ] Pass composed prompt, skill id, audit id and selected placement dimensions through the existing event, and raise only the existing image-count cap from 4 to 9.
- [ ] Run the focused canvas and dialog tests and confirm they pass.

### Task 5: Regression and rendered QA

**Files:**
- Modify only if a verified defect is found in task-owned files.

- [ ] Run `pnpm run check`.
- [ ] Run all new focused Vitest files plus `InfiniteCanvas.prompt-controls.test.ts`.
- [ ] Run `pnpm run build`.
- [ ] Start the local full server and open the canvas in the in-app Browser; verify page identity, nonblank render, no framework overlay and no relevant console errors.
- [ ] Verify desktop and narrow viewport layouts plus Amazon/US, Shopee/Indonesia, TikTok Shop/US and Xiaohongshu/China selection paths.
- [ ] Verify a blocked risk disables generation and a passing selection composes before dispatch.
- [ ] Capture screenshots outside the repository and inspect them with `view_image` for overlap, clipping, typography, icon alignment, stable control sizes and sticky footer.
- [ ] Review `git diff --stat` and `git status`; confirm no `.env`, payment, auth, billing, inspiration or unrelated canvas changes are present.
