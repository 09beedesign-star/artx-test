import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetWorkspaceSyncForTests,
  getWorkspaceSyncDocument,
  mergeWorkspaceSyncDocument,
} from "./workspace-sync-store";
import { stripSourceComments, assertStripKeptSource } from "../shared/strip-source-comments";

/**
 * @param maxLossRatio 允许被注释吃掉的比例上限。
 *
 * ⚠️ 默认 0.3 是**全局默认值，不要去改它** —— 它挡的是
 *    「正则把代码当注释吃掉」这类会让断言恒绿的事故（2026-09-17 实测
 *    贪心正则吃掉 server/index.ts 的 41.8%）。
 *
 * 📌 放宽阈值前必须先证明「是真注释被剥掉，不是代码被误吃」：
 *    workspace-sync-store.ts 经独立统计，纯注释行占 36.7%，
 *    与剥离器量到的 36.5% 吻合；且 runExclusive / mergeWorkspaceSync(
 *    / stripInlineImagesForSync / from "../shared/workspace-sync"
 *    四个锚点在剥离后逐一验证仍然存在 —— 样本有效，可以放宽。
 *
 * ⚠️⚠️ 只对这一个调用点放宽，**绝不改 assertStripKeptSource 的默认值**。
 *    「放宽阈值求绿」和「正确放宽」结果长得一模一样，
 *    唯一的区别就是有没有先做上面那次取证。
 */
function readSource(relativePath: string, maxLossRatio = 0.3) {
  const raw = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

function project(id: string, updatedAt: string) {
  return { id, title: id, cover: null, updatedAt, nodeCount: 1, createdAt: updatedAt };
}

describe("workspace sync store", () => {
  beforeEach(() => {
    __resetWorkspaceSyncForTests();
  });

  it("returns an empty document for a user who never synced", async () => {
    const document = await getWorkspaceSyncDocument("user-1");
    expect(document.projects).toEqual([]);
    expect(document.revision).toBe(0);
  });

  it("merges an upload and bumps the revision", async () => {
    const first = await mergeWorkspaceSyncDocument("user-1", {
      projects: [project("canvas-a", "2026-09-17T01:00:00.000Z")],
    });
    expect(first.revision).toBe(1);
    expect(first.projects.map(item => item.id)).toEqual(["canvas-a"]);

    const second = await mergeWorkspaceSyncDocument("user-1", {
      projects: [project("canvas-b", "2026-09-17T02:00:00.000Z")],
    });
    expect(second.revision).toBe(2);
    expect(second.projects.map(item => item.id).sort()).toEqual(["canvas-a", "canvas-b"]);
  });

  /*
   * ⚠️⚠️⚠️ 这条是整个服务端实现的**核心防线**。
   *
   * postgres-json-store 的 save() 是整文档 UPSERT 覆盖，没有行级锁。
   * 两个请求并发进来会 read-modify-write 竞态：
   *   A: load(rev=0) ─────→ save(只含A)
   *   B:    load(rev=0) ─────→ save(只含B)   ← 把 A 抹了
   *
   * 用户现象：「我在另一台电脑新建的画布过一会儿自己没了」，服务端零报错。
   *
   * 去掉 workspace-sync-store.ts 里的 runExclusive 串行队列，这条必红。
   */
  it("does not lose concurrent uploads from two devices", async () => {
    const uploads = Array.from({ length: 8 }, (_, index) =>
      mergeWorkspaceSyncDocument("user-1", {
        projects: [project(`canvas-${index}`, `2026-09-17T0${index}:00:00.000Z`)],
      })
    );
    await Promise.all(uploads);

    const document = await getWorkspaceSyncDocument("user-1");
    expect(document.projects.map(item => item.id).sort()).toEqual([
      "canvas-0",
      "canvas-1",
      "canvas-2",
      "canvas-3",
      "canvas-4",
      "canvas-5",
      "canvas-6",
      "canvas-7",
    ]);
    expect(document.revision).toBe(8);
  });

  /*
   * ⚠️ 服务端必须**自己再剥一次** base64，不能只信客户端剥过了。
   *    一个旧版本前端、或者被改过的请求，就能往 PG 的一行 jsonb 里
   *    塞几十 MB，把这个用户的同步文档搞到再也 load 不动。
   */
  it("strips inline base64 images even when the client did not", async () => {
    const big = `data:image/png;base64,${"A".repeat(5000)}`;
    const document = await mergeWorkspaceSyncDocument("user-1", {
      projects: [project("canvas-a", "2026-09-17T01:00:00.000Z")],
      canvases: [
        {
          projectId: "canvas-a",
          nodes: [{ id: "n1", data: { localSrc: big } }],
          edges: [],
          updatedAt: "2026-09-17T01:00:00.000Z",
        },
      ],
    });

    expect(JSON.stringify(document)).not.toContain("AAAAAAAAAA");
  });

  it("keeps each user's document isolated", async () => {
    await mergeWorkspaceSyncDocument("user-1", { projects: [project("mine", "2026-09-17T01:00:00.000Z")] });
    await mergeWorkspaceSyncDocument("user-2", { projects: [project("theirs", "2026-09-17T01:00:00.000Z")] });

    expect((await getWorkspaceSyncDocument("user-1")).projects.map(i => i.id)).toEqual(["mine"]);
    expect((await getWorkspaceSyncDocument("user-2")).projects.map(i => i.id)).toEqual(["theirs"]);
  });

  it("ignores requests without a user id instead of writing a shared bucket", async () => {
    const document = await mergeWorkspaceSyncDocument("", {
      projects: [project("canvas-a", "2026-09-17T01:00:00.000Z")],
    });
    expect(document.projects).toEqual([]);
    expect(document.revision).toBe(0);
  });

  it("tolerates garbage payloads without throwing", async () => {
    await expect(mergeWorkspaceSyncDocument("user-1", "not an object")).resolves.toBeTruthy();
    await expect(mergeWorkspaceSyncDocument("user-1", null)).resolves.toBeTruthy();
  });
});

describe("workspace sync routes", () => {
  /*
   * ⚠️⚠️ 身份必须恒取自会话，绝不能读请求体里的 userId ——
   *    否则任何登录用户都能读写别人的工作台和画布。
   *    这与 /api/invite/toggle-accept 是同一条防线。
   */
  it("resolves the user from the session, never from the request body", () => {
    const source = readSource("./index.ts");
    const routeBlock = source.slice(
      source.indexOf('app.get("/api/workspace/sync"'),
      source.indexOf('app.post("/api/brand-kits/parse"')
    );

    expect(routeBlock.length).toBeGreaterThan(200);
    expect(routeBlock).toContain("requireSessionUser");
    expect(routeBlock).toContain("getWorkspaceSyncDocument(user.id)");
    expect(routeBlock).toContain("mergeWorkspaceSyncDocument(user.id");
    expect(routeBlock).not.toMatch(/req\.body[\s.?]*\.?userId/);
  });

  /*
   * ⚠️ PUT 必须走 merge 而不是 replace。
   *    若有人日后把路由改成直接 save 整份 body，两台电脑就会互相抹掉，
   *    这条断言是那次改动的拦截点。
   */
  it("uses merge semantics on upload rather than overwriting the stored document", () => {
    // 0.45：该文件注释密度高（实测真注释占 36.7%），已逐条验证锚点未被吃掉。
    const store = readSource("./workspace-sync-store.ts", 0.45);
    expect(store).toContain("runExclusive");
    expect(store).toContain("mergeWorkspaceSync(");
    expect(store).toContain("stripInlineImagesForSync");
    // 合并算法必须来自 shared 唯一事实源，不许在服务端另写一份。
    expect(store).toContain('from "../shared/workspace-sync"');
  });
});
