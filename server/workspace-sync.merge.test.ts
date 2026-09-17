import { describe, expect, it } from "vitest";
import {
  DELETION_TOMBSTONE_TTL_MS,
  enforceSyncDocumentBudget,
  mergeWorkspaceSync,
  normalizeWorkspaceSyncPayload,
  parseSyncTimestamp,
  stripInlineImagesForSync,
  type WorkspaceSyncPayload,
} from "../shared/workspace-sync";

function project(id: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `项目 ${id}`,
    cover: null,
    updatedAt,
    nodeCount: 1,
    createdAt: updatedAt,
    ...extra,
  } as WorkspaceSyncPayload["projects"][number];
}

function canvas(projectId: string, updatedAt: string, nodes: unknown[] = [{ id: "n1" }]) {
  return { projectId, nodes, edges: [], updatedAt };
}

function payload(partial: Partial<WorkspaceSyncPayload>): WorkspaceSyncPayload {
  return { projects: [], canvases: [], deletions: [], ...partial };
}

describe("mergeWorkspaceSync", () => {
  /*
   * 这是整个同步功能存在的理由，也是最容易被写错的一条。
   *
   * 服务端存储层 save() 是整文档覆盖：如果合并写成
   * `{...base, ...incoming}` 这种整体覆盖，两台电脑各建一个画布，
   * 后上行的那台会把先上行的那台**整个抹掉**，而且零报错。
   */
  it("keeps projects created on both devices instead of letting one overwrite the other", () => {
    const deviceA = payload({ projects: [project("canvas-a", "2026-09-17T01:00:00.000Z")] });
    const deviceB = payload({ projects: [project("canvas-b", "2026-09-17T02:00:00.000Z")] });

    const merged = mergeWorkspaceSync(deviceA, deviceB);

    expect(merged.projects.map(item => item.id).sort()).toEqual(["canvas-a", "canvas-b"]);
  });

  it("resolves same-id conflicts by keeping the newer updatedAt", () => {
    const older = payload({ projects: [project("canvas-1", "2026-09-17T01:00:00.000Z", { title: "旧标题" })] });
    const newer = payload({ projects: [project("canvas-1", "2026-09-17T05:00:00.000Z", { title: "新标题" })] });

    expect(mergeWorkspaceSync(older, newer).projects[0].title).toBe("新标题");
    // 合并结果必须与输入顺序无关，否则「谁先上行」会改变结果。
    expect(mergeWorkspaceSync(newer, older).projects[0].title).toBe("新标题");
  });

  it("keeps the newer canvas content when the same project was edited on both devices", () => {
    const base = payload({
      projects: [project("canvas-1", "2026-09-17T01:00:00.000Z")],
      canvases: [canvas("canvas-1", "2026-09-17T01:00:00.000Z", [{ id: "old" }])],
    });
    const incoming = payload({
      projects: [project("canvas-1", "2026-09-17T03:00:00.000Z")],
      canvases: [canvas("canvas-1", "2026-09-17T03:00:00.000Z", [{ id: "new" }])],
    });

    const merged = mergeWorkspaceSync(base, incoming);
    expect(merged.canvases).toHaveLength(1);
    expect(merged.canvases[0].nodes).toEqual([{ id: "new" }]);
  });

  /*
   * 没有墓碑，删除永远同步不过去 ——
   * 用户的现象是「在这台电脑删了，过一会儿自己回来了」。
   */
  it("honours deletion tombstones so a removed project does not come back", () => {
    const cloud = payload({
      projects: [project("canvas-1", "2026-09-17T01:00:00.000Z")],
      canvases: [canvas("canvas-1", "2026-09-17T01:00:00.000Z")],
    });
    const deletedLocally = payload({
      deletions: [{ id: "canvas-1", deletedAt: "2026-09-17T02:00:00.000Z" }],
    });

    const merged = mergeWorkspaceSync(cloud, deletedLocally);
    expect(merged.projects).toEqual([]);
    expect(merged.canvases).toEqual([]);
  });

  /*
   * 反过来：墓碑之后又在另一台设备上继续编辑，说明用户还在用它，
   * 应当复活。这是正确语义，不是 bug。
   */
  it("revives a project that was edited after the tombstone was recorded", () => {
    const cloud = payload({
      deletions: [{ id: "canvas-1", deletedAt: "2026-09-17T02:00:00.000Z" }],
    });
    const stillEditing = payload({
      projects: [project("canvas-1", "2026-09-17T06:00:00.000Z")],
    });

    expect(mergeWorkspaceSync(cloud, stillEditing).projects.map(item => item.id)).toEqual(["canvas-1"]);
  });

  it("expires tombstones older than the TTL so they do not accumulate forever", () => {
    const now = Date.parse("2026-09-17T00:00:00.000Z");
    const stale = new Date(now - DELETION_TOMBSTONE_TTL_MS - 1000).toISOString();
    const merged = mergeWorkspaceSync(
      payload({ deletions: [{ id: "old", deletedAt: stale }] }),
      payload({}),
      now
    );
    expect(merged.deletions).toEqual([]);
  });

  it("drops canvases whose project no longer exists", () => {
    const merged = mergeWorkspaceSync(
      payload({ canvases: [canvas("ghost", "2026-09-17T01:00:00.000Z")] }),
      payload({ projects: [project("canvas-1", "2026-09-17T01:00:00.000Z")] })
    );
    expect(merged.canvases).toEqual([]);
  });
});

describe("parseSyncTimestamp", () => {
  /*
   * ⚠️ 这条挡的是一个真实会发生的静默失效：
   *    project-history.ts 用的是 `new Date(value.replace(/-/g, "/"))`，
   *    那是为 "2026-09-17 09:52" 这种非标准格式服务的。
   *    可画布存的是 ISO 串，先 replace 会变成 "2026/09/17T01:52:13.000Z"
   *    —— 解析出来是 NaN，后续所有 `a > b` 比较恒为 false，
   *    表现就是「云端数据永远不被采纳」，一声不吭。
   */
  it("parses ISO timestamps used by canvas state", () => {
    expect(parseSyncTimestamp("2026-09-17T01:52:13.000Z")).toBe(Date.parse("2026-09-17T01:52:13.000Z"));
  });

  it("parses the dash-separated format used by workspace project history", () => {
    expect(parseSyncTimestamp("2026-09-17 09:52")).toBeGreaterThan(0);
  });

  it("returns 0 instead of NaN for garbage so comparisons stay meaningful", () => {
    expect(parseSyncTimestamp("not a date")).toBe(0);
    expect(parseSyncTimestamp(undefined)).toBe(0);
    expect(Number.isNaN(parseSyncTimestamp("not a date"))).toBe(false);
  });
});

describe("stripInlineImagesForSync", () => {
  it("removes inline base64 payloads that would blow up the sync document", () => {
    const big = `data:image/png;base64,${"A".repeat(2000)}`;
    const stripped = stripInlineImagesForSync({
      nodes: [{ id: "n1", data: { localSrc: big, title: "保留" } }],
    }) as { nodes: Array<{ data: Record<string, unknown> }> };

    expect(stripped.nodes[0].data.localSrc).toBeUndefined();
    expect(stripped.nodes[0].data.title).toBe("保留");
    expect(stripped.nodes[0].data.inlineImageOmittedForSync).toBe(true);
  });

  /*
   * 服务端生成的图落盘在 <uploadsRoot>/images/ 并返回 http URL，
   * 那种图跨设备本来就能显示，**绝不能**被一起剥掉 ——
   * 否则同步等于把所有图都弄丢。
   */
  it("keeps http image urls because those already work across devices", () => {
    const stripped = stripInlineImagesForSync({
      data: { src: "https://backstage.artxsd.com/uploads/images/u/a.png" },
    }) as { data: Record<string, unknown> };

    expect(stripped.data.src).toBe("https://backstage.artxsd.com/uploads/images/u/a.png");
    expect(stripped.data.inlineImageOmittedForSync).toBeUndefined();
  });

  it("keeps short data uris such as tiny inline icons", () => {
    const tiny = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    const stripped = stripInlineImagesForSync({ data: { icon: tiny } }) as { data: Record<string, unknown> };
    expect(stripped.data.icon).toBe(tiny);
  });
});

describe("normalizeWorkspaceSyncPayload", () => {
  it("drops malformed entries instead of throwing", () => {
    const normalized = normalizeWorkspaceSyncPayload({
      projects: [{ id: "ok", title: "t" }, { title: "缺 id" }, null, 42],
      canvases: [{ projectId: "ok", nodes: [], edges: [] }, { projectId: "bad" }],
      deletions: [{ id: "gone", deletedAt: "2026-09-17T00:00:00.000Z" }, {}],
    });

    expect(normalized.projects.map(item => item.id)).toEqual(["ok"]);
    expect(normalized.canvases.map(item => item.projectId)).toEqual(["ok"]);
    expect(normalized.deletions.map(item => item.id)).toEqual(["gone"]);
  });

  it("returns empty collections for completely invalid input", () => {
    expect(normalizeWorkspaceSyncPayload(null)).toEqual({ projects: [], canvases: [], deletions: [] });
    expect(normalizeWorkspaceSyncPayload("nope")).toEqual({ projects: [], canvases: [], deletions: [] });
  });
});

describe("enforceSyncDocumentBudget", () => {
  it("drops the oldest canvases first and never drops projects", () => {
    const projects = ["a", "b", "c"].map((id, index) =>
      project(id, `2026-09-1${index + 1}T00:00:00.000Z`)
    );
    const canvases = ["a", "b", "c"].map((id, index) =>
      canvas(id, `2026-09-1${index + 1}T00:00:00.000Z`, [{ blob: "x".repeat(4000) }])
    );

    const trimmed = enforceSyncDocumentBudget({ projects, canvases, deletions: [] }, 9000);

    expect(trimmed.projects).toHaveLength(3);
    expect(trimmed.canvases.length).toBeLessThan(3);
    // 留下来的必须是最新的那个，而不是碰巧排在前面的。
    expect(trimmed.canvases[0]?.projectId).toBe("c");
  });

  it("falls back to dropping covers when even zero canvases exceed the budget", () => {
    const projects = Array.from({ length: 5 }, (_, index) =>
      project(`p${index}`, "2026-09-17T00:00:00.000Z", { cover: `data:image/png;base64,${"A".repeat(3000)}` })
    );
    const trimmed = enforceSyncDocumentBudget({ projects, canvases: [], deletions: [] }, 2000);
    expect(trimmed.projects.every(item => item.cover === null)).toBe(true);
  });
});
