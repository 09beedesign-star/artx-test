# OpenAI-Compatible API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide authenticated OpenAI-compatible model discovery and non-streaming chat completions for ArtX selectable models.

**Architecture:** `server/index.ts` exposes `/v1/models` and `/v1/chat/completions` using existing API-key authentication and the AI orchestrator. A small adapter maps OpenAI message content into an orchestration request and maps text or generated images back to a Chat Completion response while preserving the existing credit and external-agent usage ledger.

**Tech Stack:** TypeScript, Express, Vitest, existing ArtX orchestrator and API-key auth.

---

### Task 1: Compatibility Route Tests

**Files:**
- Create: `server/openai-compatible-api.test.ts`
- Modify: `server/index.ts:1600-1800`

- [ ] Write failing tests for authenticated `GET /v1/models`, invalid-key rejection, `stream: true` rejection, text completion, image completion, and disabled-model rejection.
- [ ] Run `pnpm exec vitest run server/openai-compatible-api.test.ts` and verify failure because routes do not exist.
- [ ] Add `openaiModelList()` using `listSelectableModelIds()` and response helpers that emit `{ object: "chat.completion", choices: [...] }` without provider secrets.
- [ ] Add the two routes before the MCP route. Use `getApiKeyUserFromAuthorization`, `assertUserCanUseSelectableModel`, reservation/release, `orchestrator.run`, `recordAiRouteUsage`, and `recordExternalAgentUsage`.
- [ ] Reject `stream: true` with HTTP 400 and `{ error: { message, type: "invalid_request_error" } }`.
- [ ] Run `pnpm exec vitest run server/openai-compatible-api.test.ts server/index.mcp-usage.test.ts` and verify pass.
- [ ] Commit with `git add server/index.ts server/openai-compatible-api.test.ts && git commit -m "feat: add OpenAI-compatible API"`.

### Task 2: Full Verification And Release

**Files:**
- Test: `server/openai-compatible-api.test.ts`

- [ ] Run `pnpm check` and the focused API, model-access, and MCP monitoring tests.
- [ ] Build with production admin URL variables, deploy `dist` to `/opt/artx` using the existing backup/restart procedure, and verify `/api/health`, `/deployment.json`, `/v1/models`, and one authenticated non-streaming request.
- [ ] Push task commits to `origin/feature/interaction-framework` without overwriting remote work.
