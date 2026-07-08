import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWorkspaceHistoryProject,
  readWorkspaceProjectHistory,
  touchWorkspaceProjectHistory,
  updateWorkspaceProjectHistory,
} from "./project-history";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return Array.from(values.keys())[index] || null;
    },
    getItem(key: string) {
      return values.get(key) || null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  } as Storage;
}

function setAuthUser(id: string, username = `${id}@example.com`) {
  window.localStorage.setItem("artx-auth-session", JSON.stringify({
    token: `token-${id}`,
    user: { id, username },
  }));
}

describe("workspace project history", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: createMemoryStorage(),
        sessionStorage: createMemoryStorage(),
      },
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("does not create a project history entry for the system blank workspace", () => {
    updateWorkspaceProjectHistory("__blank-workspace__", {
      title: "新建画布",
      nodeCount: 1,
    });
    touchWorkspaceProjectHistory("__blank-workspace__");

    expect(readWorkspaceProjectHistory()).toEqual([]);
  });

  it("still records real canvas projects", () => {
    const project = createWorkspaceHistoryProject("真实项目");

    expect(readWorkspaceProjectHistory()).toEqual([
      expect.objectContaining({
        id: project.id,
        title: "真实项目",
      }),
    ]);
  });

  it("keeps workspace history isolated per logged-in user", () => {
    setAuthUser("user-a");
    createWorkspaceHistoryProject("A 的项目");

    setAuthUser("user-b");
    expect(readWorkspaceProjectHistory()).toEqual([]);

    createWorkspaceHistoryProject("B 的项目");
    expect(readWorkspaceProjectHistory()).toEqual([
      expect.objectContaining({ title: "B 的项目" }),
    ]);

    setAuthUser("user-a");
    expect(readWorkspaceProjectHistory()).toEqual([
      expect.objectContaining({ title: "A 的项目" }),
    ]);
  });
});
