/**
 * 项目（文件夹）登记表 —— 三级结构的数据层守卫。
 *
 * 这里守的是几条「错了也不报错」的规则：
 * 1. 空项目必须能存在（不能只在有画板时才被反推出来）；
 * 2. 画板上的 folderId 是分组能跨设备同步的前提；
 * 3. 登记表丢失（换设备 / 清缓存）时，画板上的冗余 folderName 必须能把项目反推回来，
 *    否则用户看到「项目全没了，画板全变成未归类」。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  assignWorkspaceProjectsToFolder,
  createWorkspaceHistoryProject,
  readWorkspaceProjectHistory,
} from "@/lib/project-history";
import {
  createWorkspaceFolder,
  deleteWorkspaceFolders,
  listUnfiledBoards,
  listWorkspaceFolders,
  renameWorkspaceFolder,
} from "@/lib/project-folders";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get length() { return this.map.size; }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
});

describe("项目（文件夹）登记表", () => {
  it("keeps an empty project visible before any board is added", () => {
    const folder = createWorkspaceFolder("建筑事务所");

    const folders = listWorkspaceFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe("建筑事务所");
    expect(folders[0].boardCount).toBe(0);
    expect(folders[0].boards).toHaveLength(0);
    expect(folder.id).toBe(folders[0].id);
  });

  it("counts boards that carry the folderId and keeps them off the unfiled list", () => {
    const folder = createWorkspaceFolder("视觉提案");
    const board = createWorkspaceHistoryProject("首页视觉", undefined, {
      id: folder.id,
      name: folder.name,
    });

    const [summary] = listWorkspaceFolders();
    expect(summary.boardCount).toBe(1);
    expect(summary.boards[0].id).toBe(board.id);
    expect(listUnfiledBoards()).toHaveLength(0);
  });

  it("derives the project from the board when the local registry is gone (换设备场景)", () => {
    const folder = createWorkspaceFolder("品牌资产");
    const board = createWorkspaceHistoryProject("KV", undefined, {
      id: folder.id,
      name: folder.name,
    });

    // 模拟「登记表没同步下来」：只清登记表，画板历史保留
    (globalThis as unknown as { window: { localStorage: MemoryStorage } })
      .window.localStorage.removeItem("artx:workspace-folders");

    const folders = listWorkspaceFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe(folder.id);
    expect(folders[0].name).toBe("品牌资产");
    expect(folders[0].boards[0].id).toBe(board.id);
  });

  it("renames both the registry and the redundant folderName on every board", () => {
    const folder = createWorkspaceFolder("旧名字");
    createWorkspaceHistoryProject("画板 A", undefined, { id: folder.id, name: folder.name });

    renameWorkspaceFolder(folder.id, "新名字");

    expect(listWorkspaceFolders()[0].name).toBe("新名字");
    expect(readWorkspaceProjectHistory()[0].folderName).toBe("新名字");
  });

  it("detach mode keeps the boards alive as unfiled when a project is deleted", () => {
    const folder = createWorkspaceFolder("要删的项目");
    createWorkspaceHistoryProject("留下来的画板", undefined, { id: folder.id, name: folder.name });

    const result = deleteWorkspaceFolders([folder.id], "detach");

    expect(result.deletedBoardIds).toHaveLength(0);
    expect(listWorkspaceFolders()).toHaveLength(0);
    expect(readWorkspaceProjectHistory()).toHaveLength(1);
    expect(listUnfiledBoards()).toHaveLength(1);
  });

  it("delete-boards mode hands the board ids back so the caller can tombstone them", () => {
    const folder = createWorkspaceFolder("整体删除");
    const board = createWorkspaceHistoryProject("画板", undefined, { id: folder.id, name: folder.name });

    const result = deleteWorkspaceFolders([folder.id], "delete-boards");

    expect(result.deletedBoardIds).toEqual([board.id]);
  });

  it("moves a board between projects without dropping the others", () => {
    const a = createWorkspaceFolder("项目 A");
    const b = createWorkspaceFolder("项目 B");
    const first = createWorkspaceHistoryProject("画板 1", undefined, { id: a.id, name: a.name });
    const second = createWorkspaceHistoryProject("画板 2", undefined, { id: a.id, name: a.name });

    assignWorkspaceProjectsToFolder([second.id], b.id, b.name);

    const byId = new Map(listWorkspaceFolders().map(folder => [folder.id, folder]));
    expect(byId.get(a.id)?.boards.map(board => board.id)).toEqual([first.id]);
    expect(byId.get(b.id)?.boards.map(board => board.id)).toEqual([second.id]);
  });
});
