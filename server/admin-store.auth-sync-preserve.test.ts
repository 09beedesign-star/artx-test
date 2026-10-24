import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 🔒 积分同步不得抹掉 auth-users 的其他字段。
 *
 * 2026-10-24 线上事故：syncUserCreditsToAuthStore 写的是 `save({ users })`，
 * PostgresJsonDocumentStore.save() 又是整文档 UPSERT，于是每发一次积分，
 * auth-users 里的 apiKeys / sessions / auditLogs 全部清空 ——
 * 全站 API key 失效、MCP 外部调用 401，零报错。
 *
 * 这里 mock 掉存储类，用内存文档模拟 Postgres，直接走真实的发积分入口。
 */

const docs = new Map<string, unknown>();

vi.mock("./postgres-json-store", () => ({
  PostgresJsonDocumentStore: class {
    constructor(_url: string, private readonly key: string) {}
    async load() {
      const value = docs.get(this.key);
      return value ? JSON.parse(JSON.stringify(value)) : null;
    }
    async save(data: unknown) {
      docs.set(this.key, JSON.parse(JSON.stringify(data)));
    }
  },
}));

let dir = "";

afterEach(async () => {
  docs.clear();
  if (dir) await rm(dir, { recursive: true, force: true });
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
});

describe("syncUserCreditsToAuthStore 只改 users[].credits", () => {
  it("发注册积分后 apiKeys / sessions / auditLogs 原样保留", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-sync-"));
    process.env.ARTX_DATA_DIR = dir;
    process.env.ARTX_ADMIN_DATA_BACKEND = "json";

    const apiKeys = [{ id: "k1", userId: "u1", name: "agent", prefix: "artx_sk_abcdefgh", keyHash: "h", createdAt: "2026-10-24T00:00:00Z", status: "active" }];
    const sessions = [{ tokenHash: "t", userId: "u1", expiresAt: "2099-01-01T00:00:00Z" }];
    const auditLogs = [{ id: "a1", action: "developer.api_key.create" }];
    docs.set("auth-users", {
      users: [{ id: "u1", username: "u1@test", credits: 0 }],
      apiKeys,
      sessions,
      auditLogs,
      smsChallenges: [],
      emailChallenges: [],
    });

    vi.resetModules();
    const store = await import("./admin-store");
    const granted = await store.grantSignupInitialCredits({ userId: "u1", username: "u1@test" });
    expect(granted).toBeGreaterThan(0);

    const after = docs.get("auth-users") as Record<string, unknown> & { users: Array<{ credits?: number }> };
    expect(after.users[0].credits).toBe(granted);
    expect(after.apiKeys).toEqual(apiKeys);
    expect(after.sessions).toEqual(sessions);
    expect(after.auditLogs).toEqual(auditLogs);
  });
});
