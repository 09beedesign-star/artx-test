import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { restoreLocalProjectCovers } from "./workspace-sync";
import {
  mergeWorkspaceSync,
  stripInlineImagesForSync,
  type SyncedWorkspaceProject,
  type WorkspaceSyncPayload,
} from "../../../shared/workspace-sync";

const cover = `data:image/jpeg;base64,${"A".repeat(4000)}`;
const project = (id: string, patch: Partial<SyncedWorkspaceProject> = {}): SyncedWorkspaceProject => ({
  id,
  title: id,
  cover: null,
  updatedAt: "2026-10-31 10:00",
  nodeCount: 1,
  createdAt: "2026-10-31 09:00",
  ...patch,
});
const payload = (projects: SyncedWorkspaceProject[]): WorkspaceSyncPayload => ({
  projects,
  canvases: [],
  deletions: [],
  reactions: [],
  conversations: [],
});

describe("工作台同步不得清空本机项目封面（2026-10-31 线上回归）", () => {
  it("复现：base64 封面上行时被当成内联大图剥掉，合并结果里封面为 null", () => {
    const local = stripInlineImagesForSync(payload([project("p1", { cover, coverNodeId: "asset-1" })]));
    const merged = mergeWorkspaceSync(payload([]), local);
    expect(merged.projects[0].cover ?? null).toBeNull();
    expect(merged.projects[0].coverNodeId).toBe("asset-1");
  });

  it("回写本地时用本机原封面补回，不被云端的 null 覆盖", () => {
    const restored = restoreLocalProjectCovers(
      [project("p1"), project("p2")],
      new Map([["p1", { cover }]])
    );
    expect(restored[0].cover).toBe(cover);
    expect(restored[1].cover).toBeNull();
  });

  it("云端带回的封面（另一台设备设的）优先于本机旧封面", () => {
    const restored = restoreLocalProjectCovers(
      [project("p1", { cover: "/uploads/covers/u/p1/new.jpg", coverUpdatedAt: "2026-10-31T10:05:00.000Z" })],
      new Map([["p1", { cover, coverUpdatedAt: "2026-10-31T10:00:00.000Z" }]])
    );
    expect(restored[0].cover).toBe("/uploads/covers/u/p1/new.jpg");
  });

  it("本机刚换的封面（还在上传）比云端更新时，保留本机的", () => {
    const restored = restoreLocalProjectCovers(
      [project("p1", { cover: "/uploads/covers/u/p1/old.jpg", coverUpdatedAt: "2026-10-31T10:00:00.000Z" })],
      new Map([["p1", { cover, coverUpdatedAt: "2026-10-31T10:05:00.000Z" }]])
    );
    expect(restored[0].cover).toBe(cover);
  });

  it("writeLocalProjects 必须经过 restoreLocalProjectCovers 并广播刷新事件", () => {
    const source = readFileSync(resolve(__dirname, "workspace-sync.ts"), "utf-8");
    const writer = source.match(/function writeLocalProjects[\s\S]*?\n\}/)?.[0];
    expect(writer).toContain("restoreLocalProjectCovers(projects, readLocalProjectCovers())");
    expect(writer).toContain("WORKSPACE_PROJECTS_UPDATED_EVENT");
  });
});

describe("跨设备封面：云端地址能同步到其它设备", () => {
  it("/uploads/covers 地址不会被同步剥掉", () => {
    const local = stripInlineImagesForSync(payload([project("p1", { cover: "/uploads/covers/u/p1/a.jpg" })]));
    expect(local.projects[0].cover).toBe("/uploads/covers/u/p1/a.jpg");
  });

  it("同一分钟内：无封面那份先到、带封面 URL 那份后到，封面不能被吞掉", () => {
    const serverSide = payload([project("p1", { cover: null })]);
    const withCover = payload([
      project("p1", { cover: "/uploads/covers/u/p1/a.jpg", coverUpdatedAt: "2026-10-31T10:00:30.000Z" }),
    ]);
    const merged = mergeWorkspaceSync(serverSide, withCover);
    expect(merged.projects[0].cover).toBe("/uploads/covers/u/p1/a.jpg");
  });

  it("另一台设备拉取：本机无封面 + 云端有封面 → 显示云端封面", () => {
    const cloud = payload([project("p1", { cover: "/uploads/covers/u/p1/a.jpg", coverUpdatedAt: "2026-10-31T10:00:30.000Z" })]);
    const otherDevice = payload([project("p1", { cover: null, updatedAt: "2026-10-31 10:02" })]);
    const merged = mergeWorkspaceSync(cloud, otherDevice);
    expect(merged.projects[0].cover).toBe("/uploads/covers/u/p1/a.jpg");
    expect(merged.projects[0].updatedAt).toBe("2026-10-31 10:02");
  });

  it("两台设备各换过封面：取 coverUpdatedAt 更晚的那张", () => {
    const a = payload([project("p1", { cover: "/uploads/covers/u/p1/a.jpg", coverUpdatedAt: "2026-10-31T10:00:00.000Z", updatedAt: "2026-10-31 10:09" })]);
    const b = payload([project("p1", { cover: "/uploads/covers/u/p1/b.jpg", coverUpdatedAt: "2026-10-31T10:05:00.000Z" })]);
    expect(mergeWorkspaceSync(a, b).projects[0].cover).toBe("/uploads/covers/u/p1/b.jpg");
    expect(mergeWorkspaceSync(b, a).projects[0].cover).toBe("/uploads/covers/u/p1/b.jpg");
  });
});
