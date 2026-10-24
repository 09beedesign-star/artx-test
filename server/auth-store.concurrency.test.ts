import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🔒 auth-users 并发写不丢数据（2026-10-24）。
 *
 * auth-users 是一整行 JSON，所有写入都是「读整份 → 改 → 写整份」。
 * 修复前线上实测：同账号并发建 10 把 key，全部返回 200，只落库 7 把。
 * 修复：withAuthWriteLock（进程内串行队列 + Postgres 事务 advisory lock）。
 *
 * 另外锁住 lastUsedAt 节流：同一把 key 5 分钟内只写一次库。
 */

const docs = new Map<string, unknown>();
const nakedSaves: string[] = [];
const transactions: string[] = [];
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

// 模拟 Postgres：load/save 都插入真实异步间隙，不加锁时必然交错丢写。
vi.mock("./postgres-json-store", () => ({
  PostgresJsonDocumentStore: class {
    constructor(_url: string, private readonly key: string) {}
    async load() {
      await tick();
      const value = docs.get(this.key);
      return value ? JSON.parse(JSON.stringify(value)) : null;
    }
    async save(data: unknown) {
      nakedSaves.push(this.key);
      await tick();
      docs.set(this.key, JSON.parse(JSON.stringify(data)));
    }
    async transaction<R>(fn: (tx: { load(): Promise<unknown>; save(data: unknown): Promise<void> }) => Promise<R>) {
      transactions.push(this.key);
      return fn({
        load: async () => {
          await tick();
          const value = docs.get(this.key);
          return value ? JSON.parse(JSON.stringify(value)) : null;
        },
        save: async (data: unknown) => {
          await tick();
          docs.set(this.key, JSON.parse(JSON.stringify(data)));
        },
      });
    }
  },
}));

let dataDir = "";

async function loadAuthStore(backend: "json" | "postgres") {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = backend;
  process.env.ARTX_ADMIN_DATA_BACKEND = backend;
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  return import("./auth-store");
}

async function registerUser(store: Awaited<ReturnType<typeof loadAuthStore>>, username: string) {
  const result = await store.handleAuthAction("register", { username, password: "pass-1234" });
  expect(result.status).toBe(200);
  return (result.body as { token: string; user: { id: string } });
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-concurrency-"));
});

afterEach(async () => {
  vi.useRealTimers();
  docs.clear();
  nakedSaves.length = 0;
  transactions.length = 0;
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
});

describe.each(["json", "postgres"] as const)("auth-users 并发写（%s 后端）", (backend) => {
  it("同账号并发建 10 把 key，10 把全部落库", async () => {
    const store = await loadAuthStore(backend);
    const { token } = await registerUser(store, "race@example.com");

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => store.createApiKeyForAuthorization(`Bearer ${token}`, { name: `k${i}` })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);

    const list = await store.listApiKeysForAuthorization(`Bearer ${token}`);
    const names = (list.body as { keys: Array<{ name: string }> }).keys.map((k) => k.name).sort();
    expect(names).toEqual(Array.from({ length: 10 }, (_, i) => `k${i}`).sort());
  });

  it("注册、建 key、改积分快照并发混跑，互不覆盖", async () => {
    const store = await loadAuthStore(backend);
    const owner = await registerUser(store, "owner@example.com");

    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => store.handleAuthAction("register", { username: `u${i}@example.com`, password: "pass-1234" })),
      ...Array.from({ length: 5 }, (_, i) => store.createApiKeyForAuthorization(`Bearer ${owner.token}`, { name: `mix${i}` })),
      store.updateAuthUserCreditsSnapshot(owner.user.id, 777),
    ]);

    const users = await store.listAuthUsers();
    expect(users.map((u) => u.username).sort()).toEqual(
      ["owner@example.com", ...Array.from({ length: 5 }, (_, i) => `u${i}@example.com`)].sort(),
    );
    const list = await store.listApiKeysForAuthorization(`Bearer ${owner.token}`);
    expect((list.body as { keys: unknown[] }).keys).toHaveLength(5);

    if (backend === "postgres") {
      const doc = docs.get("auth-users") as { users: Array<{ id: string; credits?: number }> };
      expect(doc.users.find((u) => u.id === owner.user.id)?.credits).toBe(777);
      // 所有写入都必须走带锁事务，任何裸 save 都是漏包的写入路径。
      expect(nakedSaves).toEqual([]);
      expect(transactions.length).toBeGreaterThan(0);
    }
  });

  it("lastUsedAt 节流：5 分钟内重复调用不再写库", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
    const store = await loadAuthStore(backend);
    const { token } = await registerUser(store, "throttle@example.com");
    const created = await store.createApiKeyForAuthorization(`Bearer ${token}`, { name: "agent" });
    const keyValue = (created.body as { key: { value: string } }).key.value;

    const lastUsed = async () => {
      const list = await store.listApiKeysForAuthorization(`Bearer ${token}`);
      return (list.body as { keys: Array<{ lastUsedAt?: string }> }).keys[0].lastUsedAt;
    };

    expect((await store.getApiKeyUserFromAuthorization(`Bearer ${keyValue}`)).status).toBe(200);
    expect(await lastUsed()).toBe("2026-10-24T00:00:00.000Z");

    vi.setSystemTime(new Date("2026-10-24T00:04:59Z"));
    const txBefore = transactions.length;
    expect((await store.getApiKeyUserFromAuthorization(`Bearer ${keyValue}`)).status).toBe(200);
    expect(await lastUsed()).toBe("2026-10-24T00:00:00.000Z");
    if (backend === "postgres") expect(transactions.length).toBe(txBefore);

    vi.setSystemTime(new Date("2026-10-24T00:05:00Z"));
    expect((await store.getApiKeyUserFromAuthorization(`Bearer ${keyValue}`)).status).toBe(200);
    expect(await lastUsed()).toBe("2026-10-24T00:05:00.000Z");
  });
});
