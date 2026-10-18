/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  readEcommerceTasks,
  writeEcommerceTasks,
  persistEcommerceTask,
  markEcommerceTaskBackgroundStarted,
  markEcommerceTaskCompleted,
  markEcommerceTaskFailed,
  markEcommerceTaskConsumed,
  cancelPendingEcommerceTaskRecovery,
  readPendingEcommerceTasks,
  consumeCompletedEcommerceTasks,
  type EcommercePersistedTask,
} from "./ecommerce-task-persistence";

// Node环境mock
const mockStorage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, value: string) => { mockStorage.set(key, value); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
  key: (_: number) => null,
  length: mockStorage.size,
} as Storage;

describe("ecommerce-task-persistence", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("should persist a product mode task", () => {
    const now = Date.now();
    persistEcommerceTask("user123", {
      generationId: "gen-1",
      mode: "product",
      prompt: "summer product background",
      model: "imagen-3.0",
      count: 4,
      sourceImageSrc: "data:image/png;base64,...",
      backgroundTaskInput: {
        capability: "smart_background",
        operation: "create-background",
        model: "imagen-3.0",
        count: 4,
        prompt: "summer product background",
        sourceImageDataUrl: "data:image/png;base64,...",
      },
    });

    const tasks = readEcommerceTasks("user123");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      generationId: "gen-1",
      accountId: "user123",
      mode: "product",
      status: "pending",
      prompt: "summer product background",
      count: 4,
    });
    expect(tasks[0].createdAt).toBeGreaterThanOrEqual(now);
  });

  it("should persist a post mode task", () => {
    persistEcommerceTask("user456", {
      generationId: "gen-2",
      mode: "post",
      prompt: "lifestyle scene",
      model: "imagen-3.0",
      count: 3,
      sourceImageSrc: "data:image/png;base64,...",
    });

    const tasks = readEcommerceTasks("user456");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].mode).toBe("post");
    expect(tasks[0].backgroundTaskInput).toBeUndefined();
  });

  it("should mark task as background started", () => {
    persistEcommerceTask("user1", {
      generationId: "gen-a",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 2,
    });

    markEcommerceTaskBackgroundStarted("user1", "gen-a");

    const tasks = readEcommerceTasks("user1");
    expect(tasks[0].backgroundStartedAt).toBeDefined();
    expect(tasks[0].backgroundStartedAt).toBeGreaterThan(0);
  });

  it("should mark task as completed with images", () => {
    persistEcommerceTask("user2", {
      generationId: "gen-b",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 3,
    });

    markEcommerceTaskCompleted("user2", "gen-b", [
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
    ]);

    const tasks = readEcommerceTasks("user2");
    expect(tasks[0].status).toBe("completed");
    expect(tasks[0].images).toHaveLength(3);
  });

  it("should mark task as failed with error", () => {
    persistEcommerceTask("user3", {
      generationId: "gen-c",
      mode: "post",
      prompt: "test",
      model: "imagen-3.0",
      count: 1,
    });

    markEcommerceTaskFailed("user3", "gen-c", "Network timeout");

    const tasks = readEcommerceTasks("user3");
    expect(tasks[0].status).toBe("failed");
    expect(tasks[0].error).toBe("Network timeout");
  });

  it("should return only pending unconsumed tasks", () => {
    persistEcommerceTask("user4", {
      generationId: "gen-d1",
      mode: "product",
      prompt: "test 1",
      model: "imagen-3.0",
      count: 2,
    });
    persistEcommerceTask("user4", {
      generationId: "gen-d2",
      mode: "product",
      prompt: "test 2",
      model: "imagen-3.0",
      count: 2,
    });
    persistEcommerceTask("user4", {
      generationId: "gen-d3",
      mode: "product",
      prompt: "test 3",
      model: "imagen-3.0",
      count: 2,
    });

    markEcommerceTaskCompleted("user4", "gen-d2", ["url1", "url2"]);
    markEcommerceTaskConsumed("user4", "gen-d3");

    const pending = readPendingEcommerceTasks("user4");
    expect(pending).toHaveLength(1);
    expect(pending[0].generationId).toBe("gen-d1");
  });

  it("should consume completed tasks and mark them", () => {
    persistEcommerceTask("user5", {
      generationId: "gen-e1",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 2,
    });
    persistEcommerceTask("user5", {
      generationId: "gen-e2",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 2,
    });

    markEcommerceTaskCompleted("user5", "gen-e1", ["url1"]);
    markEcommerceTaskCompleted("user5", "gen-e2", ["url2"]);

    const completed = consumeCompletedEcommerceTasks("user5");
    expect(completed).toHaveLength(2);

    const all = readEcommerceTasks("user5");
    expect(all.every(t => t.consumedAt && t.consumedAt > 0)).toBe(true);
  });

  it("should cancel all pending recovery", () => {
    persistEcommerceTask("user6", {
      generationId: "gen-f1",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 2,
    });
    persistEcommerceTask("user6", {
      generationId: "gen-f2",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 2,
    });
    markEcommerceTaskCompleted("user6", "gen-f2", ["url"]);

    cancelPendingEcommerceTaskRecovery("user6");

    const pending = readPendingEcommerceTasks("user6");
    expect(pending).toHaveLength(0);

    const all = readEcommerceTasks("user6");
    expect(all.every(t => t.consumedAt && t.consumedAt > 0)).toBe(true);
  });

  it("should auto-fail timed-out tasks when reading pending", () => {
    persistEcommerceTask("user7", {
      generationId: "gen-g",
      mode: "product",
      prompt: "test",
      model: "imagen-3.0",
      count: 2,
    });

    // 手动设置一个很旧的backgroundStartedAt
    const tasks = readEcommerceTasks("user7");
    const outdated = tasks.map(t => ({
      ...t,
      backgroundStartedAt: Date.now() - 400_000, // 6.67分钟前
    }));
    writeEcommerceTasks("user7", outdated);

    const pending = readPendingEcommerceTasks("user7");
    expect(pending).toHaveLength(0);

    const all = readEcommerceTasks("user7");
    expect(all[0].status).toBe("failed");
    expect(all[0].error).toContain("网络开了个小差");
  });

  it("should limit tasks to 60 最近的", () => {
    for (let i = 0; i < 70; i++) {
      persistEcommerceTask("user8", {
        generationId: `gen-${i}`,
        mode: "product",
        prompt: `test ${i}`,
        model: "imagen-3.0",
        count: 1,
      });
    }

    const tasks = readEcommerceTasks("user8");
    expect(tasks.length).toBe(60);
    // 最老的10个应该被丢弃
    expect(tasks.every(t => parseInt(t.generationId.split("-")[1]) >= 10)).toBe(true);
  });

  it("should separate tasks by account", () => {
    persistEcommerceTask("alice", {
      generationId: "alice-1",
      mode: "product",
      prompt: "alice task",
      model: "imagen-3.0",
      count: 2,
    });
    persistEcommerceTask("bob", {
      generationId: "bob-1",
      mode: "post",
      prompt: "bob task",
      model: "imagen-3.0",
      count: 1,
    });

    const aliceTasks = readEcommerceTasks("alice");
    const bobTasks = readEcommerceTasks("bob");

    expect(aliceTasks).toHaveLength(1);
    expect(bobTasks).toHaveLength(1);
    expect(aliceTasks[0].generationId).toBe("alice-1");
    expect(bobTasks[0].generationId).toBe("bob-1");
  });
});
