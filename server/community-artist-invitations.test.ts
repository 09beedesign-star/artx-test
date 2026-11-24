import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistInvitation } from "./community-store";
import type { StoredUser } from "./auth-store";

const persistence = vi.hoisted(() => ({
  documents: new Map<string, any>(),
  locks: new Map<string, Promise<unknown>>(),
  failSave: "",
  failCommit: "",
  active: 0,
  peak: 0,
  events: [] as string[],
}));

// 仅替换持久化：真实路由、状态机、auth 写锁和会话验证均执行。
vi.mock("./postgres-json-store", () => ({
  PostgresJsonDocumentStore: class {
    constructor(_url: string, private key: string) {}
    async load() { return structuredClone(persistence.documents.get(this.key) ?? null); }
    async transaction(fn: (tx: any) => Promise<unknown>) {
      persistence.active++;
      persistence.peak = Math.max(persistence.peak, persistence.active);
      const previous = persistence.locks.get(this.key) ?? Promise.resolve();
      let unlock!: () => void;
      const held = new Promise<void>(resolve => { unlock = resolve; });
      persistence.locks.set(this.key, held);
      await previous;
      let draft = await this.load();
      let dirty = false;
      try {
        const result = await fn({
          load: async () => {
            await new Promise<void>(resolve => setImmediate(resolve));
            return structuredClone(draft);
          },
          save: async (data: any) => {
            persistence.events.push(`save:${this.key}`);
            if (persistence.failSave === this.key) {
              persistence.failSave = "";
              throw new Error("模拟数据库写入失败");
            }
            draft = structuredClone(data);
            dirty = true;
          },
        });
        if (persistence.failCommit === this.key) {
          persistence.failCommit = "";
          throw new Error("模拟数据库提交失败");
        }
        if (dirty) persistence.documents.set(this.key, draft);
        persistence.events.push(`commit:${this.key}`);
        return result;
      } finally {
        persistence.active--;
        unlock();
      }
    }
  },
}));
vi.mock("./model-router", () => ({ listSelectableModelIds: () => [], normalizeAllowedModels: (v: unknown) => v }));
vi.mock("./notifications", () => ({ buildVerificationCodeEmailHtml: vi.fn(), sendUserEmailNotification: vi.fn() }));
vi.mock("./sms-service", () => ({ normalizeMainlandPhone: vi.fn(), sendSmsVerificationCode: vi.fn() }));

const INVITATIONS = "community-artist-invitations";
let auth: typeof import("./auth-store");
let store: typeof import("./community-store");
let server: Server;
let origin: string;
const user = (id: string, extra: Partial<StoredUser> = {}): StoredUser => ({
  id, username: `${id}@example.test`, loginKey: `${id}@example.test`,
  passwordHash: "不可登录", salt: "测试盐", createdAt: "2026-01-01T00:00:00.000Z",
  role: "viewer", status: "active", ...extra,
});
const users = () => persistence.documents.get("auth-users").users as StoredUser[];
const target = () => users().find(u => u.id === "artist")!;
const invitations = () => (persistence.documents.get(INVITATIONS)?.invitations ?? []) as ArtistInvitation[];
const input = () => ({ userId: "artist", username: target().username, invitedBy: "admin", invitedByUsername: "admin@example.test" });
const seedInvitation = (status: ArtistInvitation["status"], id = crypto.randomUUID()) => {
  const item: ArtistInvitation = { ...input(), id, status, createdAt: new Date().toISOString() };
  persistence.documents.set(INVITATIONS, { invitations: [...invitations(), item] });
  return item;
};
async function request(method: string, route: string, token?: string, body?: unknown) {
  const response = await fetch(`${origin}/api/community${route}`, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
const confirm = (id: string) => request("POST", `/admin/artist-invitations/${id}/confirm`, "admin");

beforeAll(async () => {
  vi.stubEnv("ARTX_AUTH_DATA_BACKEND", "postgres");
  vi.stubEnv("DATABASE_URL", "postgres://community-test");
  vi.stubEnv("ARTX_BOOTSTRAP_ADMIN_USERNAME", "");
  vi.stubEnv("ARTX_BOOTSTRAP_ADMIN_PASSWORD", "");
  vi.stubEnv("ARTX_DEV_AUTO_LOGIN", "false");
  vi.stubEnv("ADMIN_SESSION_SECRET", "");
  auth = await import("./auth-store");
  store = await import("./community-store");
  const { default: router } = await import("./community-routes");
  const app = express();
  app.use(express.json());
  // 与生产挂载一致：先校验会话，再加载原始 StoredUser，绝不信任请求体角色。
  app.use("/api/community", async (req, _res, next) => {
    const result = await auth.getSessionUserFromAuthorization(req.headers.authorization);
    if (result.status === 200 && "user" in result.body) {
      (req as any).user = await auth.findUserById(result.body.user.id);
    }
    next();
  }, router);
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  persistence.documents.clear();
  persistence.locks.clear();
  persistence.failSave = persistence.failCommit = "";
  persistence.active = persistence.peak = 0;
  persistence.events = [];
  const seeded = [user("admin", { role: "super_admin" }), user("artist"), user("other"),
    user("special", { username: "09beedesign@gmail.com", role: "viewer" }),
    user("disabled-admin", { role: "super_admin", status: "disabled" })];
  persistence.documents.set("auth-users", {
    users: seeded,
    sessions: seeded.map(u => ({ userId: u.id, tokenHash: crypto.createHash("sha256").update(u.id).digest("hex"),
      createdAt: new Date().toISOString(), expiresAt: "2099-01-01T00:00:00.000Z" })),
  });
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  vi.unstubAllEnvs();
});

describe("艺术家异步授权 HTTP 边界", () => {
  it.each([
    ["POST", "/admin/invite-artist"], ["POST", "/admin/grant-artist"],
    ["GET", "/admin/artist-invitations"], ["POST", "/admin/artist-invitations/id/confirm"],
    ["POST", "/admin/artist-invitations/id/revoke"],
  ])("%s %s 拒绝匿名、伪造角色与非超管", async (method, route) => {
    expect((await request(method, route, undefined, { role: "super_admin" })).status).toBe(401);
    expect((await request(method, route, "invalid-session")).status).toBe(401);
    expect((await request(method, route, "artist", { role: "super_admin" })).status).toBe(403);
    expect((await request(method, route, "disabled-admin")).status).toBe(403);
    expect(invitations()).toEqual([]);
  });
  it.each([["GET", "/artist-invitations"], ["POST", "/artist-invitations/id/accept"], ["POST", "/artist-invitations/id/decline"]])(
    "%s %s 必须有真实会话", async (method, route) => {
      expect((await request(method, route)).status).toBe(401);
    });
  it("原始 viewer 的特殊超管与 publicUser 使用相同角色，公开社区字段", async () => {
    target().communityRole = "artist";
    target().communityStatus = "frozen";
    const list = await auth.listAuthUsers();
    expect(list.find(u => u.id === "special")).toMatchObject({ role: "super_admin", isAdmin: true });
    expect(list.find(u => u.id === "artist")).toMatchObject({ communityRole: "artist", communityStatus: "frozen" });
    expect((await request("GET", "/admin/artist-invitations", "special")).status).toBe(200);
  });
  it("注册账号校验与完整三步流程，接受前和确认前都没有权限", async () => {
    expect((await request("POST", "/admin/invite-artist", "admin", { account: "" })).status).toBe(400);
    expect((await request("POST", "/admin/invite-artist", "admin", { account: "不存在" })).status).toBe(404);
    expect((await request("POST", "/admin/invite-artist", "admin", { account: "admin@example.test" })).status).toBe(400);
    const sent = await request("POST", "/admin/invite-artist", "admin", { account: "  ARTIST@EXAMPLE.TEST  " });
    expect(sent.status).toBe(200);
    expect(sent.body.invitation.status).toBe("pending");
    const id = sent.body.invitation.id;
    expect(target().communityRole).toBeUndefined();
    expect((await confirm(id)).status).toBe(400);
    expect((await request("POST", `/artist-invitations/${id}/accept`, "artist")).body.invitation.status).toBe("accepted");
    expect(target().communityRole).toBeUndefined();
    const confirmed = await confirm(id);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.invitation).toMatchObject({ id, status: "granted", grantedAt: expect.any(String) });
    expect(target()).toMatchObject({ communityRole: "artist", communityStatus: "active", artistGrantedBy: "admin", artistGrantInvitationId: id });
    expect((await confirm(id)).body.invitation).toEqual(confirmed.body.invitation);
  });
  it("旧 grant-artist 入口只能邀请，不能直授", async () => {
    const result = await request("POST", "/admin/grant-artist", "admin", { userId: "artist" });
    expect(result.body.invitation.status).toBe("pending");
    expect(target().communityRole).toBeUndefined();
  });
  it("不能查看、接受或拒绝他人的邀请", async () => {
    const invitation = seedInvitation("pending");
    expect((await request("GET", "/artist-invitations", "other")).body.invitations).toEqual([]);
    for (const action of ["accept", "decline"]) {
      expect((await request("POST", `/artist-invitations/${invitation.id}/${action}`, "other")).status).toBe(404);
    }
    expect(invitations()[0].status).toBe("pending");
  });
  it.each(["declined", "revoked"] as const)("%s 邀请不能确认或再接受", async status => {
    const invitation = seedInvitation(status);
    expect((await confirm(invitation.id)).status).toBe(400);
    expect((await request("POST", `/artist-invitations/${invitation.id}/accept`, "artist")).status).toBe(400);
    expect(target().communityRole).toBeUndefined();
  });
  it("本人拒绝、管理员撤回与历史列表均遵守归属和终态", async () => {
    const first = seedInvitation("pending");
    expect((await request("POST", `/artist-invitations/${first.id}/decline`, "artist")).body.invitation.status).toBe("declined");
    const second = await store.createArtistInvitation(input());
    expect((await request("POST", `/admin/artist-invitations/${second.id}/revoke`, "admin")).body.invitation.status).toBe("revoked");
    expect((await request("POST", `/admin/artist-invitations/${second.id}/revoke`, "admin")).status).toBe(400);
    expect((await request("GET", "/artist-invitations", "artist")).body.invitations).toHaveLength(2);
    expect((await request("GET", "/admin/artist-invitations", "admin")).body.invitations).toHaveLength(2);
    expect((await confirm("missing")).status).toBe(404);
  });
  it("撤回与确认并发时不能出现已撤回但新增权限", async () => {
    const invitation = seedInvitation("accepted");
    const results = await Promise.all([confirm(invitation.id), request("POST", `/admin/artist-invitations/${invitation.id}/revoke`, "admin")]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    expect(invitations()[0].status === "granted").toBe(target().communityRole === "artist");
  });
  it("权限写入失败返回 500，邀请仍 accepted，重试成功", async () => {
    const invitation = seedInvitation("accepted");
    persistence.failSave = "auth-users";
    expect((await confirm(invitation.id)).status).toBe(500);
    expect(invitations()[0]).toMatchObject({ status: "accepted" });
    expect(invitations()[0].grantedAt).toBeUndefined();
    expect(target().communityRole).toBeUndefined();
    expect((await confirm(invitation.id)).body.invitation.status).toBe("granted");
  });
  it.each(["save", "commit"])("邀请 %s 失败时不显示完成，权限已落库也能幂等恢复", async phase => {
    const invitation = seedInvitation("accepted");
    if (phase === "save") persistence.failSave = INVITATIONS;
    else persistence.failCommit = INVITATIONS;
    expect((await confirm(invitation.id)).status).toBe(500);
    expect(invitations()[0].status).toBe("accepted");
    const grantedAt = target().artistGrantedAt;
    expect(target().communityRole).toBe("artist");
    const retry = await confirm(invitation.id);
    expect(retry.status).toBe(200);
    expect(retry.body.invitation).toMatchObject({ status: "granted", grantedAt });
    expect(target().artistGrantedAt).toBe(grantedAt);
    expect(persistence.events.indexOf("commit:auth-users")).toBeLessThan(persistence.events.indexOf(`save:${INVITATIONS}`));
  });
  it("auth 提交失败不能保存已完成邀请", async () => {
    const invitation = seedInvitation("accepted");
    persistence.failCommit = "auth-users";
    expect((await confirm(invitation.id)).status).toBe(500);
    expect(target().communityRole).toBeUndefined();
    expect(invitations()[0].status).toBe("accepted");
    expect((await confirm(invitation.id)).status).toBe(200);
  });
  it.each(["frozen", "disabled"])("邀请发出后被 %s，确认不能解冻或启用", async state => {
    const invitation = seedInvitation("accepted");
    if (state === "frozen") target().communityStatus = "frozen";
    else target().status = "disabled";
    expect((await confirm(invitation.id)).status).toBe(400);
    expect(target().communityRole).toBeUndefined();
    expect(invitations()[0].status).toBe("accepted");
    expect(state === "frozen" ? target().communityStatus : target().status).toBe(state);
  });
  it("撤权保留冻结状态，旧确认不能复活权限", async () => {
    const invitation = seedInvitation("accepted");
    expect((await confirm(invitation.id)).status).toBe(200);
    target().communityStatus = "frozen";
    expect((await request("POST", "/admin/revoke-artist", "admin", { userId: "artist" })).status).toBe(200);
    expect(target().communityStatus).toBe("frozen");
    target().communityStatus = "active";
    expect((await confirm(invitation.id)).status).toBe(400);
    expect(target().communityRole).toBeUndefined();
    expect((await request("POST", "/admin/invite-artist", "admin", { account: target().username })).status).toBe(200);
  });
});

describe("邀请 store 状态与并发", () => {
  it("空文档与 Partial 文档均可读取和创建", async () => {
    expect(await store.listAllArtistInvitations()).toEqual([]);
    persistence.documents.set(INVITATIONS, {});
    expect(await store.listArtistInvitationsForUser("artist")).toEqual([]);
    expect((await store.createArtistInvitation(input())).status).toBe("pending");
  });
  it.each(["pending", "accepted"] as const)("查全历史：首条 declined 不掩盖后面的 %s", async status => {
    seedInvitation("declined");
    seedInvitation(status);
    await expect(store.createArtistInvitation(input())).rejects.toThrow("已有待处理");
    expect(invitations()).toHaveLength(2);
  });
  it("granted 历史不永久阻挡撤权重邀，真实 artist 必须阻挡", async () => {
    seedInvitation("granted");
    const sent = await store.createArtistInvitation(input());
    await store.advanceArtistInvitation(sent.id, "pending", "revoked");
    target().communityRole = "artist";
    await expect(store.createArtistInvitation(input())).rejects.toThrow("已经是艺术家");
  });
  it.each(["frozen", "disabled"])("%s 用户不能发起新邀请", async state => {
    if (state === "frozen") target().communityStatus = "frozen";
    else target().status = "disabled";
    await expect(store.createArtistInvitation(input())).rejects.toThrow("已冻结或停用");
  });
  it("store 拒绝直接 granted、反向补偿及跨用户接受", async () => {
    const item = seedInvitation("pending");
    await expect(store.advanceArtistInvitation(item.id, "pending", "granted")).rejects.toThrow("不允许");
    await expect(store.advanceArtistInvitation(item.id, "pending", "accepted", {}, "other")).rejects.toThrow("邀请不存在");
    await store.advanceArtistInvitation(item.id, "pending", "accepted", {}, "artist");
    await expect(store.advanceArtistInvitation(item.id, "accepted", "pending")).rejects.toThrow("不允许");
    expect(invitations()[0].status).toBe("accepted");
  });
  it("20 个并发 HTTP 邀请只落一条，等待者不占满 pool", async () => {
    seedInvitation("declined");
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      request("POST", "/admin/invite-artist", "admin", { account: "artist@example.test" })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 400)).toHaveLength(19);
    expect(invitations().filter(i => i.status === "pending")).toHaveLength(1);
    expect(persistence.peak).toBeLessThan(5);
  });
  it("不同账号并发邀请都保留，事务保存失败后队列仍能继续", async () => {
    persistence.failSave = INVITATIONS;
    await expect(store.createArtistInvitation(input())).rejects.toThrow("模拟数据库写入失败");
    const results = await Promise.all([store.createArtistInvitation(input()), store.createArtistInvitation({ ...input(), userId: "other", username: "other@example.test" })]);
    expect(results).toHaveLength(2);
    expect(invitations().map(i => i.userId).sort()).toEqual(["artist", "other"]);
  });
  it("接受后目标账号被删除，不能假完成", async () => {
    const item = seedInvitation("accepted");
    persistence.documents.get("auth-users").users = users().filter(u => u.id !== "artist");
    expect((await confirm(item.id)).status).toBe(404);
    expect(invitations()[0].status).toBe("accepted");
  });
  it("并发确认幂等且保持邀请锁到 grant 完成，只写一次权限", async () => {
    const item = seedInvitation("accepted");
    const results = await Promise.all(Array.from({ length: 20 }, () => confirm(item.id)));
    expect(results.every(r => r.status === 200 && r.body.invitation.status === "granted")).toBe(true);
    expect(persistence.events.filter(e => e === "save:auth-users")).toHaveLength(1);
    expect(persistence.events.filter(e => e === `save:${INVITATIONS}`)).toHaveLength(1);
    expect(persistence.peak).toBeLessThan(5);
  });
  it("模块重载后仅依赖持久化标记恢复，不依赖内存补偿", async () => {
    const item = seedInvitation("accepted");
    persistence.failSave = INVITATIONS;
    expect((await confirm(item.id)).status).toBe(500);
    const grantedAt = target().artistGrantedAt;
    vi.resetModules();
    const restartedStore = await import("./community-store");
    const restartedAuth = await import("./auth-store");
    const recovered = await restartedStore.confirmArtistInvitation(item.id, i => restartedAuth.grantArtistFromInvitation(i, "admin"));
    expect(recovered).toMatchObject({ status: "granted", grantedAt });
    expect(persistence.events.filter(e => e === "save:auth-users")).toHaveLength(1);
  });
  it("撤权重邀后新邀请能完整生效，不被旧授权来源挡住", async () => {
    const old = seedInvitation("accepted");
    expect((await confirm(old.id)).status).toBe(200);
    await auth.updateUser("artist", { communityRole: undefined });
    const sent = await store.createArtistInvitation(input());
    await store.advanceArtistInvitation(sent.id, "pending", "accepted", {}, "artist");
    expect((await confirm(sent.id)).status).toBe(200);
    expect(target()).toMatchObject({ communityRole: "artist", artistGrantInvitationId: sent.id });
  });
  it("撤权重邀成功后，旧 granted 确认不能冒用新授权返回成功", async () => {
    const old = seedInvitation("accepted");
    expect((await confirm(old.id)).status).toBe(200);
    await auth.updateUser("artist", { communityRole: undefined });
    const sent = await store.createArtistInvitation(input());
    await store.advanceArtistInvitation(sent.id, "pending", "accepted", {}, "artist");
    expect((await confirm(sent.id)).status).toBe(200);
    const snapshot = structuredClone(target());
    const writes = persistence.events.filter(e => e === "save:auth-users").length;
    const stale = await confirm(old.id);
    expect(stale.status).toBe(400);
    expect(stale.body.error).toContain("权限已撤销");
    expect(target()).toEqual(snapshot);
    expect(persistence.events.filter(e => e === "save:auth-users")).toHaveLength(writes);
  });
  it.each(["frozen", "disabled"])("权限已落库而邀请保存失败后被 %s，重试也不得恢复账号状态", async state => {
    const item = seedInvitation("accepted");
    persistence.failSave = INVITATIONS;
    expect((await confirm(item.id)).status).toBe(500);
    if (state === "frozen") target().communityStatus = "frozen";
    else target().status = "disabled";
    const snapshot = structuredClone(target());
    expect((await confirm(item.id)).status).toBe(400);
    expect(target()).toEqual(snapshot);
    expect(invitations()[0].status).toBe("accepted");
  });
  it("授权事务保留已有会话、API key 和其他用户，不写 admin-data", async () => {
    const db = persistence.documents.get("auth-users");
    db.apiKeys = [{ id: "key", userId: "other", keyHash: "hash", prefix: "artx_sk_test", name: "测试", createdAt: "2026-01-01T00:00:00.000Z", status: "active" }];
    const sessions = structuredClone(db.sessions);
    const apiKeys = structuredClone(db.apiKeys);
    const other = structuredClone(await auth.findUserById("other"));
    const item = seedInvitation("accepted");
    expect((await confirm(item.id)).status).toBe(200);
    expect(persistence.documents.get("auth-users").sessions).toEqual(sessions);
    expect(persistence.documents.get("auth-users").apiKeys).toEqual(apiKeys);
    expect(await auth.findUserById("other")).toEqual(other);
    expect([...persistence.documents.keys()].sort()).toEqual(["auth-users", INVITATIONS].sort());
    expect(persistence.events.every(event => /:(auth-users|community-artist-invitations)$/.test(event))).toBe(true);
  });
  it("grant 抛错或中断不会预写 granted，事务回滚后仍能恢复", async () => {
    const item = seedInvitation("accepted");
    await expect(store.confirmArtistInvitation(item.id, async () => {
      expect(invitations()[0].status).toBe("accepted");
      throw new Error("模拟中断");
    })).rejects.toThrow("模拟中断");
    expect(invitations()[0].status).toBe("accepted");
    expect(persistence.events).not.toContain(`save:${INVITATIONS}`);
    expect((await store.confirmArtistInvitation(item.id, i => auth.grantArtistFromInvitation(i, "admin"))).status).toBe("granted");
  });
  it("权限落库但邀请保存失败后，不能仅撤回邀请留下孤立权限", async () => {
    const item = seedInvitation("accepted");
    persistence.failSave = INVITATIONS;
    expect((await confirm(item.id)).status).toBe(500);
    expect((await request("POST", `/admin/artist-invitations/${item.id}/revoke`, "admin")).status).toBe(400);
    expect(invitations()[0].status).toBe("accepted");
    expect((await confirm(item.id)).body.invitation.status).toBe("granted");
  });
  it("失败窗口撤权后可以撤回旧 accepted 并重新走完整授权", async () => {
    const item = seedInvitation("accepted");
    persistence.failSave = INVITATIONS;
    expect((await confirm(item.id)).status).toBe(500);
    await auth.updateUser("artist", { communityRole: undefined });
    expect((await request("POST", `/admin/artist-invitations/${item.id}/revoke`, "admin")).status).toBe(200);
    const sent = await request("POST", "/admin/invite-artist", "admin", { account: target().username });
    expect(sent.status).toBe(200);
    const id = sent.body.invitation.id;
    expect((await request("POST", `/artist-invitations/${id}/accept`, "artist")).status).toBe(200);
    expect((await confirm(id)).body.invitation.status).toBe("granted");
    expect(target().artistGrantInvitationId).toBe(id);
  });
  it("grant 等待期间撤回和新邀请不能越过邀请事务锁", async () => {
    const item = seedInvitation("accepted");
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const confirming = store.confirmArtistInvitation(item.id, async invitation => {
      entered();
      await waiting;
      return auth.grantArtistFromInvitation(invitation, "admin");
    });
    await started;
    const revoking = store.advanceArtistInvitation(item.id, "accepted", "revoked");
    const creating = store.createArtistInvitation(input());
    expect(invitations()[0].status).toBe("accepted");
    expect(persistence.active).toBe(1);
    release();
    const results = await Promise.allSettled([confirming, revoking, creating]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected", "rejected"]);
    expect(invitations()).toHaveLength(1);
    expect(invitations()[0].status).toBe("granted");
  });
  it("权限写入后邀请未保存又遭撤权，旧 accepted 确认也不能复活", async () => {
    const item = seedInvitation("accepted");
    persistence.failSave = INVITATIONS;
    expect((await confirm(item.id)).status).toBe(500);
    await auth.updateUser("artist", { communityRole: undefined });
    expect((await confirm(item.id)).status).toBe(400);
    expect(target().communityRole).toBeUndefined();
    expect(invitations()[0].status).toBe("accepted");
    // 已真正撤权后可结束残留邀请，再开始一轮新的授权。
    expect((await request("POST", `/admin/artist-invitations/${item.id}/revoke`, "admin")).status).toBe(200);
    expect((await store.createArtistInvitation(input())).status).toBe("pending");
  });
});
