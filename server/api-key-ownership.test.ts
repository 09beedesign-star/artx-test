import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🔒 API key / MCP 计费归属锁。
 *
 * 业务规则（2026-10-24 用户拍板）：谁的 key，花谁的积分。
 * MCP `tools/call` 里的 `user` 完全取自 getApiKeyUserFromAuthorization 的返回，
 * 后续 reserveAiRouteUsage / recordAiRouteUsage 一律用 `user.id` 预占与扣费。
 * 所以只要这里「key → 主人」解析正确，扣费就一定落在 key 主人头上。
 *
 * 这条测试防的是：将来有人为了「方便」把 MCP 改成走固定账号 / 管理员账号 /
 * 环境变量里的平台账号，导致所有外部调用都扣同一个人的钱，且零报错。
 */

let dataDir = "";

async function loadAuthStore() {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  return import("./auth-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-api-key-owner-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
});

describe("API key 归属：谁的 key 扣谁的积分", () => {
  it("两个账号各自的 key 只解析到各自的账号", async () => {
    const store = await loadAuthStore();

    const register = async (username: string) => {
      const result = await store.handleAuthAction("register", { username, password: "pass-1234" });
      expect(result.status).toBe(200);
      const body = result.body as { token: string; user: { id: string } };
      return { token: body.token, userId: body.user.id };
    };

    const alice = await register("alice@example.com");
    const bob = await register("bob@example.com");
    expect(alice.userId).not.toBe(bob.userId);

    const createKey = async (token: string) => {
      const result = await store.createApiKeyForAuthorization(`Bearer ${token}`, { name: "agent" });
      expect(result.status).toBe(200);
      return (result.body as { key: { value: string } }).key.value;
    };

    const aliceKey = await createKey(alice.token);
    const bobKey = await createKey(bob.token);
    expect(aliceKey).not.toBe(bobKey);
    expect(aliceKey).toMatch(/^artx_sk_/);
    expect(aliceKey).toHaveLength(51);

    const resolve = async (key: string) => {
      const result = await store.getApiKeyUserFromAuthorization(`Bearer ${key}`);
      expect(result.status).toBe(200);
      return (result.body as { user: { id: string; username: string } }).user;
    };

    const aliceOwner = await resolve(aliceKey);
    const bobOwner = await resolve(bobKey);
    expect(aliceOwner.id).toBe(alice.userId);
    expect(aliceOwner.username).toBe("alice@example.com");
    expect(bobOwner.id).toBe(bob.userId);
    expect(bobOwner.username).toBe("bob@example.com");
  });

  it("每个账号只能看到自己的 key 列表", async () => {
    const store = await loadAuthStore();
    const a = await store.handleAuthAction("register", { username: "a@example.com", password: "pass-1234" });
    const b = await store.handleAuthAction("register", { username: "b@example.com", password: "pass-1234" });
    const aToken = (a.body as { token: string }).token;
    const bToken = (b.body as { token: string }).token;

    await store.createApiKeyForAuthorization(`Bearer ${aToken}`, { name: "a-key" });
    await store.createApiKeyForAuthorization(`Bearer ${bToken}`, { name: "b-key" });

    const aList = await store.listApiKeysForAuthorization(`Bearer ${aToken}`);
    const names = (aList.body as { keys: Array<{ name: string }> }).keys.map(k => k.name);
    expect(names).toEqual(["a-key"]);
  });

  it("没登录不能建 key；伪造 key 解析失败", async () => {
    const store = await loadAuthStore();
    const created = await store.createApiKeyForAuthorization(undefined, {});
    expect(created.status).toBe(401);

    const fake = await store.getApiKeyUserFromAuthorization(`Bearer artx_sk_${"x".repeat(43)}`);
    expect(fake.status).toBe(401);
  });
});
