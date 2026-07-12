# Free Attack Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and surface common hostile traffic without adding paid cloud products or changing normal ArtX business behavior.

**Architecture:** A focused detector module aggregates redacted request signals in bounded windows and writes qualifying events through the existing `recordRiskEvent` API. The Express service observes application-visible signals, while a root-owned timer parses Nginx logs and posts aggregate-only signals to a loopback-only internal endpoint. Existing risk-event, notification, and audit mechanisms provide the admin UI without a parallel alert data model.

**Tech Stack:** Node.js, TypeScript, Express, Vitest, Nginx, systemd timer, native `fetch`.

---

### Task 1: Detector Core

**Files:**
- Create: `server/security-events.ts`
- Create: `server/security-events.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("emits one high-severity probe event after three matching signals in ten minutes", async () => {
  const detector = createSecurityEventDetector({ now: () => clock.now });
  await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });
  await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });
  await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });
  expect(recorded).toEqual([expect.objectContaining({ severity: "high", count: 3 })]);
});

it("does not retain a raw source value or emit twice in one rule window", async () => {
  // Observe the threshold twice and assert one event whose detail excludes the IP.
});

it("accepts a collector signal only for a loopback peer with the matching secret", () => {
  expect(validateSecurityEventIngest({
    peerAddress: "127.0.0.1",
    providedSecret: "test-ingest-secret",
    expectedSecret: "test-ingest-secret",
    payload: { rule: "sensitive_path_probe", source: "203.0.113.10", count: 3 },
  })).toMatchObject({ accepted: true });
});

it("rejects a public peer, unknown rule, or missing ingest secret", () => {
  // Verify each rejected input has accepted: false and never reaches the recorder.
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run server/security-events.test.ts`

Expected: FAIL because `server/security-events.ts` does not exist.

- [ ] **Step 3: Implement the minimal detector**

```ts
export const SECURITY_EVENT_RULES = {
  sensitive_path_probe: { threshold: 3, windowMs: 10 * 60_000, severity: "high" },
  login_failure: { threshold: 5, windowMs: 15 * 60_000, severity: "high" },
  authorization_denial: { threshold: 10, windowMs: 10 * 60_000, severity: "warning" },
  rate_limited: { threshold: 20, windowMs: 5 * 60_000, severity: "warning" },
  server_error: { threshold: 5, windowMs: 5 * 60_000, severity: "critical" },
} as const;
```

Use an HMAC fingerprint derived from `ADMIN_SESSION_SECRET`, retain only timestamps and the fingerprint in memory, and call an injected recorder once per source/rule/window. Emit a one-line JSON warning with no raw source or request content. Export a pure `validateSecurityEventIngest` helper that performs loopback-address, timing-safe secret, rule, count, and payload-bound checks before the detector is called.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm vitest run server/security-events.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/security-events.ts server/security-events.test.ts
git commit -m "feat: detect aggregated security events"
```

### Task 2: Application Signal Integration

**Files:**
- Modify: `server/index.ts:1-40, 600-680`

- [ ] **Step 1: Extend the failing detector tests for request classification**

```ts
it("classifies only known sensitive paths and excludes health checks", () => {
  expect(classifyApplicationSecuritySignal({ path: "/.env", status: 404 })).toBe("sensitive_path_probe");
  expect(classifyApplicationSecuritySignal({ path: "/api/health", status: 200 })).toBeUndefined();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run server/security-events.test.ts`

Expected: FAIL because request classification is absent.

- [ ] **Step 3: Implement request observation and the private endpoint**

Add a response-finish observer after JSON parsing. Classify only: recognized sensitive probe paths, authentication failures, `403`, `429`, and `5xx`; exclude `/api/health`, static assets, and the internal endpoint. Trust `X-Forwarded-For` only when the direct socket peer is loopback. Add `POST /internal/security-events`, call `validateSecurityEventIngest`, reject invalid input with `403` or `400`, and return `202` without exposing detector details. The server entry point remains unchanged and no HTTP test dependency is added.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm vitest run server/security-events.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/security-events.test.ts
git commit -m "feat: record application security signals"
```

### Task 3: Nginx Log Collector

**Files:**
- Create: `scripts/security-log-collector.mjs`
- Create: `scripts/security-log-collector.test.ts`
- Create: `deploy/security/artx-security-collector.service`
- Create: `deploy/security/artx-security-collector.timer`

- [ ] **Step 1: Write the failing parser tests**

```ts
it("classifies probe paths and response classes without returning raw IPs or paths", () => {
  const events = summarizeNginxSecurityLog([fixtureProbe, fixtureRateLimit]);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: "sensitive_path_probe", count: 1 }),
    expect.objectContaining({ rule: "rate_limited", count: 1 }),
  ]));
  expect(JSON.stringify(events)).not.toContain("203.0.113.10");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run scripts/security-log-collector.test.ts`

Expected: FAIL because the collector module is absent.

- [ ] **Step 3: Implement the collector and service units**

Parse only new lines from `/var/log/nginx/artx-admin.access.log` and `/var/log/nginx/artx-gray.access.log`, reset safely on rotation, and classify known probes plus `429` and `5xx`. Post aggregate records from the admin log only to `http://127.0.0.1:3001/internal/security-events` and records from the gray log only to `http://127.0.0.1:3002/internal/security-events`. The loopback recipient performs the keyed fingerprinting; raw sources remain only in the collector process memory and are never written to state or logs. Read the ingest secret from root-only `/etc/artx/security-events.env`; do not log it. The systemd oneshot service runs as root every minute, uses `NoNewPrivileges=true` and a restrictive systemd sandbox, and persists parser offsets under `/var/lib/artx/security-collector`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm vitest run scripts/security-log-collector.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/security-log-collector.mjs scripts/security-log-collector.test.ts deploy/security
git commit -m "feat: collect nginx security signals"
```

### Task 4: Production-Free Configuration and Verification

**Files:**
- Create: `/etc/nginx/conf.d/artx-security-limits.conf` on the Tencent Cloud host
- Modify: Nginx server configuration on the Tencent Cloud host
- Create: `/etc/artx/security-events.env` on the Tencent Cloud host (root-only, untracked)
- Install: `artx-security-collector.service` and `artx-security-collector.timer` on the Tencent Cloud host

- [ ] **Step 1: Validate Nginx configuration before changes**

Run: `nginx -t`

Expected: configuration is valid.

- [ ] **Step 2: Install only the Nginx limits, collector secret, and service units**

Create the HTTP-level `artx_security_api` zone at `120r/m` and the `artx_security_auth` zone at `10r/m`, both keyed by `$binary_remote_addr`, and return `429` on rejections. Add a dedicated exact or regex auth location before the general proxy location in both virtual hosts with `artx_security_auth` and `burst=10`; add `artx_security_api` with `burst=60` only to the existing gray `/api/` proxy location and an equivalent admin `/api/` proxy location. Keep `/api/health`, static assets, uploads, and the loopback-only collector endpoint outside these limits. Generate the ingest secret locally on the server, set mode `0600`, install unit files, create the state directory, run `nginx -t`, `systemctl daemon-reload`, and enable the timer. Do not print the secret or copy it into the repository.

- [ ] **Step 3: Validate the collector without synthetic public traffic**

Run the collector once, inspect only aggregate journal output, and confirm the loopback endpoint rejects unauthenticated access. Do not send probe traffic to public production URLs.

- [ ] **Step 4: Verify application and release checks**

Run: `pnpm check && pnpm vitest run server/security-events.test.ts scripts/security-log-collector.test.ts server/admin-store.risk.test.ts && pnpm build`

Expected: all commands pass.

- [ ] **Step 5: Commit and release**

```bash
git add server/index.ts server/security-events.ts server/security-events.test.ts scripts/security-log-collector.mjs scripts/security-log-collector.test.ts deploy/security
git commit -m "feat: add free attack detection"
git push origin feature/interaction-framework
```

Deploy the pushed commit independently to the admin service at `/opt/artx` and the gray service at `/opt/artx-gray-backend/current`, restart each only after its build succeeds, then verify both deployment manifests and `/api/health` according to `AGENTS.md`.
