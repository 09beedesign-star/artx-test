import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🔒 社交登录后门防护测试
 *
 * 背景（2026-09-13 修复，原实现位于 auth-store.ts 的 action === "social" 分支）：
 * 原逻辑把账号名写死成 `${provider}@artx.social` 且完全不校验第三方凭据，导致
 *   1. 同一 provider 的所有人共用一个账号，积分/作品/订单全部共享；
 *   2. 只要 POST 一个 `{ provider: "google" }` 就能白嫖一个有效会话，
 *      无需密码、邮箱或验证码。
 *
 * 本文件分两层锁：
 *   ① 行为层 —— 接口必须拒绝，且绝不能签发 token / 建号；
 *   ② 源码层 —— 防止有人把「拼死账号名 + 自动建号」的写法改回去。
 * ⚠️ 只有行为层是不够的：将来若有人「修好了拒绝逻辑但把建号代码挪到别处」，
 *    行为层可能仍然通过。反之只有源码层则锁不住运行时真实结果。
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
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-social-ban-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
});

const PROVIDERS = ["google", "wechat", "apple", "github", "meta"] as const;

describe("第三方登录入口必须保持关闭（行为层）", () => {
  it.each(PROVIDERS)("provider=%s 一律拒绝且不签发会话", async (provider) => {
    const { handleAuthAction } = await loadAuthStore();

    const result = await handleAuthAction("social", { provider });

    // 501 = 功能未实现。不用 400，因为参数本身没错，是能力没开放。
    expect(result.status).toBe(501);

    // ⚠️ 最关键的一条：任何情况下都不能把 token 递出去。
    // 光看 status 不够 —— 曾经有过「返回错误码但仍然带上 token」的实现。
    expect(result.body).not.toHaveProperty("token");
    expect(result.body).not.toHaveProperty("user");
  });

  it("被拒绝后不得静默创建任何 @artx.social 账号", async () => {
    const { handleAuthAction, listAuthUsers } = await loadAuthStore();

    const before = await listAuthUsers();

    for (const provider of PROVIDERS) {
      await handleAuthAction("social", { provider });
    }
    // 多打几次，确认不是「第一次不建、第二次建」。
    await handleAuthAction("social", { provider: "google" });
    await handleAuthAction("social", { provider: "google" });

    const after = await listAuthUsers();
    const ghosts = after.filter((user) =>
      String(user.username || "").toLowerCase().includes("artx.social")
    );
    expect(ghosts).toHaveLength(0);
    // 总数也不能涨 —— 防止有人换个账号名继续静默建号。
    expect(after).toHaveLength(before.length);
  });

  it("非法 provider 同样拒绝，且不会因为参数不合法就走进别的分支", async () => {
    const { handleAuthAction } = await loadAuthStore();

    for (const provider of ["", "evil", null, undefined, 123, { a: 1 }]) {
      const result = await handleAuthAction("social", { provider } as Record<string, unknown>);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.body).not.toHaveProperty("token");
    }
  });

  it("两个不同的人调同一个 provider，不会拿到同一个身份", async () => {
    // 这条锁的是漏洞的本质：身份不能只由 provider 决定。
    // 现在的正确表现是两边都失败；将来真接了 OAuth，这条测试要改成
    // 「不同第三方 uid 必须得到不同 user.id」，而不是删掉。
    const { handleAuthAction } = await loadAuthStore();

    const first = await handleAuthAction("social", { provider: "google", uid: "user-a" });
    const second = await handleAuthAction("social", { provider: "google", uid: "user-b" });

    const firstUser = (first.body as { user?: { id?: string } }).user;
    const secondUser = (second.body as { user?: { id?: string } }).user;

    // 要么都没有身份（当前状态），要么身份必须不同（将来接入后）。
    // ❌ 绝不允许「两个人拿到同一个 user.id」。
    if (firstUser?.id || secondUser?.id) {
      expect(firstUser?.id).not.toBe(secondUser?.id);
    } else {
      expect(firstUser).toBeUndefined();
      expect(secondUser).toBeUndefined();
    }
  });
});

describe("第三方登录入口必须保持关闭（源码层）", () => {
  // ⚠️ 两步都不能省：
  //   ① 必须先切出 social 分支 —— 全文件 toContain 会命中别处字符串，等于没锁。
  //   ② 必须剥掉注释再断言 —— 本分支的注释里正好写了「将来应该怎么做」，
  //      里面含有 `${provider}` 这类代码片段，不剥注释会让断言恒挂。
  //      （写这个测试时当场踩中了，留此备忘：**注释不是实现，断言只能锚实现**。）
  async function readSocialBranch() {
    const sourcePath = fileURLToPath(new URL("./auth-store.ts", import.meta.url));
    const source = await readFile(sourcePath, "utf8");
    const start = source.indexOf('if (action === "social")');
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start);
    // 下一个顶层 action 分支作为结束边界
    const end = rest.indexOf('if (action === "me")');
    expect(end).toBeGreaterThan(-1);
    const branch = rest.slice(0, end);

    return branch
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
  }

  it("social 分支内不得出现写死的 @artx.social 账号名", async () => {
    const branch = await readSocialBranch();

    // 锚的是「模板字符串拼出账号名」这个具体动作，而不是裸文本 ——
    // 裸文本会命中本分支里解释「为什么删掉」的注释，导致断言恒挂。
    expect(branch).not.toMatch(/`\$\{\s*provider(Name)?\s*\}@artx\.social`/);
    expect(branch).not.toMatch(/loginKey\(\s*username\s*\)/);
  });

  it("social 分支内不得再出现建号与签发会话的调用", async () => {
    const branch = await readSocialBranch();

    // 反向断言：不点名具体出口，而是禁止这两类动作出现在本分支内。
    // 正向断言（比如「必须返回 501」）只能守住已知写法，挡不住换个写法绕过去。
    expect(branch).not.toMatch(/\bcreateUser\s*\(/);
    expect(branch).not.toMatch(/\bcreateSession\s*\(/);
    expect(branch).not.toMatch(/db\.users\.push\s*\(/);
  });

  it("social 分支必须显式拒绝", async () => {
    const branch = await readSocialBranch();
    expect(branch).toMatch(/status:\s*501/);
  });
});
