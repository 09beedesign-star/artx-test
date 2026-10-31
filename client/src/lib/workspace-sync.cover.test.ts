import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { restoreLocalProjectCovers } from "./workspace-sync";
import {
  mergeWorkspaceSync,
  stripInlineImagesForSync,
  type SyncedWorkspaceProject,
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

describe("工作台同步不得清空本机项目封面（2026-10-31 线上回归）", () => {
  it("复现：封面上行时被当成内联大图剥掉，合并结果里封面为 null", () => {
    const local = stripInlineImagesForSync({
      projects: [project("p1", { cover, coverNodeId: "asset-1" })],
      canvases: [],
      deletions: [],
      reactions: [],
      conversations: [],
    });
    const merged = mergeWorkspaceSync(
      { projects: [], canvases: [], deletions: [], reactions: [], conversations: [] },
      local
    );
    expect(merged.projects[0].cover ?? null).toBeNull();
    // 手动封面标记是普通字符串，同步能带上
    expect(merged.projects[0].coverNodeId).toBe("asset-1");
  });

  it("回写本地时用本机原封面补回，不被云端的 null 覆盖", () => {
    const restored = restoreLocalProjectCovers(
      [project("p1"), project("p2")],
      new Map([["p1", cover]])
    );
    expect(restored[0].cover).toBe(cover);
    expect(restored[1].cover).toBeNull();
  });

  it("云端带回的封面（如 http 地址）优先保留", () => {
    const restored = restoreLocalProjectCovers(
      [project("p1", { cover: "https://cdn.example.com/c.jpg" })],
      new Map([["p1", cover]])
    );
    expect(restored[0].cover).toBe("https://cdn.example.com/c.jpg");
  });

  it("writeLocalProjects 必须经过 restoreLocalProjectCovers", () => {
    const source = readFileSync(resolve(__dirname, "workspace-sync.ts"), "utf-8");
    const writer = source.match(/function writeLocalProjects[\s\S]*?\n\}/)?.[0];
    expect(writer).toContain("restoreLocalProjectCovers(projects, readLocalProjectCovers())");
  });
});
