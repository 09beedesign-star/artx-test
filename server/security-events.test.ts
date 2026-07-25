import { describe, expect, it } from "vitest";
import {
  classifyApplicationSecuritySignal,
  createSecurityEventDetector,
  validateSecurityEventIngest,
} from "./security-events";

describe("security event detector", () => {
  it("emits one high-severity probe event after three matching signals in ten minutes", async () => {
    let now = 1_000;
    const recorded: Array<Record<string, unknown>> = [];
    const detector = createSecurityEventDetector({
      secret: "test-secret",
      now: () => now,
      record: async (event) => {
        recorded.push(event);
      },
    });

    await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });
    await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });
    await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });

    expect(recorded).toEqual([
      expect.objectContaining({
        rule: "sensitive_path_probe",
        count: 3,
        severity: "high",
        title: "疑似攻击路径扫描",
      }),
    ]);
    expect(JSON.stringify(recorded)).not.toContain("203.0.113.10");
  });

  it("does not emit twice for the same source and rule in one window", async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const detector = createSecurityEventDetector({
      secret: "test-secret",
      now: () => 1_000,
      record: async (event) => {
        recorded.push(event);
      },
    });

    for (let index = 0; index < 6; index += 1) {
      await detector.observe({ rule: "sensitive_path_probe", source: "203.0.113.10" });
    }

    expect(recorded).toHaveLength(1);
  });

  it("accepts a bounded collector signal only from loopback with the matching secret", () => {
    expect(validateSecurityEventIngest({
      peerAddress: "127.0.0.1",
      providedSecret: "test-ingest-secret",
      expectedSecret: "test-ingest-secret",
      payload: { rule: "sensitive_path_probe", source: "203.0.113.10", count: 3 },
    })).toEqual({
      accepted: true,
      signal: { rule: "sensitive_path_probe", source: "203.0.113.10", count: 3 },
    });
  });

  it("rejects public peers, unknown rules, missing secrets, and unbounded counts", () => {
    const base = {
      peerAddress: "127.0.0.1",
      providedSecret: "test-ingest-secret",
      expectedSecret: "test-ingest-secret",
      payload: { rule: "sensitive_path_probe", source: "203.0.113.10", count: 3 },
    };

    expect(validateSecurityEventIngest({ ...base, peerAddress: "203.0.113.10" }).accepted).toBe(false);
    expect(validateSecurityEventIngest({ ...base, providedSecret: "" }).accepted).toBe(false);
    expect(validateSecurityEventIngest({ ...base, payload: { ...base.payload, rule: "unknown" } }).accepted).toBe(false);
    expect(validateSecurityEventIngest({ ...base, payload: { ...base.payload, count: 1001 } }).accepted).toBe(false);
  });

  it("classifies only known sensitive paths and excludes health checks", () => {
    expect(classifyApplicationSecuritySignal({ path: "/.env", status: 404 })).toBe("sensitive_path_probe");
    expect(classifyApplicationSecuritySignal({ path: "/api/health", status: 200 })).toBeUndefined();
  });
});
