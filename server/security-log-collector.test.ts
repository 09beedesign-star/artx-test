import { describe, expect, it } from "vitest";
import { getSecurityLogTargets, summarizeNginxSecurityLog } from "../scripts/security-log-collector.mjs";

describe("nginx security log collector", () => {
  it("classifies probes and response classes without returning raw IPs or paths", () => {
    const events = summarizeNginxSecurityLog([
      '203.0.113.10 - - [12/Jul/2026:19:00:00 +0800] "GET /.env HTTP/1.1" 404 153 "-" "scanner"',
      '203.0.113.10 - - [12/Jul/2026:19:00:01 +0800] "GET /wp-login.php HTTP/1.1" 404 153 "-" "scanner"',
      '203.0.113.11 - - [12/Jul/2026:19:00:02 +0800] "POST /api/images/generate HTTP/1.1" 429 153 "-" "client"',
      '203.0.113.12 - - [12/Jul/2026:19:00:03 +0800] "GET /api/health HTTP/1.1" 500 153 "-" "monitor"',
    ]);

    expect(events).toEqual(expect.arrayContaining([
      { rule: "sensitive_path_probe", count: 2 },
      { rule: "rate_limited", count: 1 },
    ]));
    expect(events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "server_error" }),
    ]));
    expect(JSON.stringify(events)).not.toContain("203.0.113.10");
    expect(JSON.stringify(events)).not.toContain("/.env");
  });

  it("allows deployment to limit collection to the endpoints that support ingestion", () => {
    expect(getSecurityLogTargets("/var/log/nginx/artx-admin.access.log|http://127.0.0.1:3001/internal/security-events")).toEqual([
      { logPath: "/var/log/nginx/artx-admin.access.log", endpoint: "http://127.0.0.1:3001/internal/security-events" },
    ]);
  });
});
