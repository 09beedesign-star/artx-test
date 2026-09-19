import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetBackgroundImageTaskStoreForTests,
  deleteBackgroundImageTask,
  failInterruptedBackgroundImageTasks,
  getBackgroundImageTask,
  saveBackgroundImageTask,
  type PersistedBackgroundImageTask,
} from "./background-image-task-store";
import { stripSourceComments, assertStripKeptSource } from "../shared/strip-source-comments";

function readSource(relativePath: string, maxLossRatio = 0.3) {
  const raw = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

function task(
  taskId: string,
  overrides: Partial<PersistedBackgroundImageTask> = {}
): PersistedBackgroundImageTask {
  const now = Date.now();
  return {
    taskId,
    status: "pending",
    input: { prompt: taskId },
    ownerUserId: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("background image task store", () => {
  beforeEach(() => {
    __resetBackgroundImageTaskStoreForTests();
  });

  it("保存后能按 taskId 读回来", async () => {
    await saveBackgroundImageTask(task("t-1"));
    const loaded = await getBackgroundImageTask("t-1");
    expect(loaded?.taskId).toBe("t-1");
    expect(loaded?.status).toBe("pending");
  });

  it("查不到的任务返回 undefined（而不是抛错）", async () => {
    expect(await getBackgroundImageTask("nope")).toBeUndefined();
    expect(await getBackgroundImageTask("")).toBeUndefined();
  });

  it("同一个 taskId 再次保存是整条覆盖", async () => {
    await saveBackgroundImageTask(task("t-1"));
    await saveBackgroundImageTask(
      task("t-1", { status: "completed", images: [{ src: "a.png", width: 1, height: 1 }] })
    );
    const loaded = await getBackgroundImageTask("t-1");
    expect(loaded?.status).toBe("completed");
    expect(loaded?.images).toHaveLength(1);
  });

  /**
   * ⚠️⚠️⚠️ 这条是本模块存在的核心理由的防护线。
   *
   * PostgresJsonDocumentStore.save() 是整文档 UPSERT 覆盖、没有行级锁，
   * 两个任务并发写回会互相整份抹掉。少了串行队列，下面这条会丢任务。
   */
  it("并发写入不同任务时互不覆盖", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) => saveBackgroundImageTask(task(`t-${index}`)))
    );
    for (let index = 0; index < 8; index += 1) {
      expect(await getBackgroundImageTask(`t-${index}`)).toBeDefined();
    }
  });

  it("删除后读不到", async () => {
    await saveBackgroundImageTask(task("t-1"));
    await deleteBackgroundImageTask("t-1");
    expect(await getBackgroundImageTask("t-1")).toBeUndefined();
  });

  it("超过 24 小时的任务会在下一次写入时被清掉", async () => {
    const stale = Date.now() - 25 * 60 * 60 * 1000;
    await saveBackgroundImageTask(task("old", { status: "completed", createdAt: stale, updatedAt: stale }));
    await saveBackgroundImageTask(task("fresh"));
    expect(await getBackgroundImageTask("old")).toBeUndefined();
    expect(await getBackgroundImageTask("fresh")).toBeDefined();
  });

  describe("启动清理：failInterruptedBackgroundImageTasks", () => {
    it("把遗留的 pending 任务标记为失败并带上原因", async () => {
      await saveBackgroundImageTask(task("pending-1"));
      const count = await failInterruptedBackgroundImageTasks();
      expect(count).toBe(1);
      const loaded = await getBackgroundImageTask("pending-1");
      expect(loaded?.status).toBe("failed");
      expect(loaded?.error).toContain("服务重启");
    });

    it("不动已经完成或已经失败的任务", async () => {
      await saveBackgroundImageTask(task("done", { status: "completed" }));
      await saveBackgroundImageTask(task("bad", { status: "failed", error: "原始原因" }));
      const count = await failInterruptedBackgroundImageTasks();
      expect(count).toBe(0);
      expect((await getBackgroundImageTask("done"))?.status).toBe("completed");
      expect((await getBackgroundImageTask("bad"))?.error).toBe("原始原因");
    });

    it("空库时返回 0 且不报错", async () => {
      expect(await failInterruptedBackgroundImageTasks()).toBe(0);
    });
  });

  /**
   * ⚠️⚠️ 接入侧的防护：server/index.ts 必须真的用上这个 store。
   *
   * 📌 只测 store 本身是「测纯函数 ≠ 测修复」—— 如果 index.ts 还留着
   *    内存 Map，上面所有用例照样全绿，而线上重启依旧丢任务。
   */
  describe("server/index.ts 接入", () => {
    const source = readSource("./index.ts");

    it("不再持有内存版任务表", () => {
      expect(source).not.toContain("backgroundImageTasks");
      expect(source).not.toContain("new Map<string, BackgroundImageTask>");
    });

    it("两个任务路由都走 store 的读写 API", () => {
      // 4 个写入点：创建 pending / 写回 completed / 写回 failed / 轮询时回写超时判定
      expect(source.split("saveBackgroundImageTask(").length - 1).toBe(4);
      // 2 个读取点：POST 查重入 / GET 轮询
      expect(source.split("await getBackgroundImageTask(").length - 1).toBe(2);
    });

    it("启动时调用了遗留任务清理", () => {
      expect(source).toContain("failInterruptedBackgroundImageTasks()");
    });
  });
});

/**
 * ⚠️⚠️⚠️ 超时三出口的顺序约束。
 *
 * 超时这件事有三个出口：nginx、服务端、前端轮询。
 * 2026-09-19 那次事故就是只改了服务端和前端、漏了 nginx，
 * 于是串行出图一超过 5 分钟就被 nginx 先掐断，后两层放得再宽也没用。
 *
 * 正确顺序：nginx >= 服务端 > 前端轮询。
 * 让前端先放弃、服务端后判定，nginx 永远不做那个先掐断的人。
 */
describe("超时三出口顺序约束", () => {
  function parseSeconds(text: string, pattern: RegExp) {
    const matched = text.match(pattern);
    expect(matched, `没有匹配到 ${pattern}`).toBeTruthy();
    return Number(matched![1]);
  }

  it("nginx >= 服务端 > 前端轮询", () => {
    const nginxConf = readFileSync(
      path.resolve(__dirname, "../deploy/tencent-cloud/artx-gray.nginx.conf"),
      "utf-8"
    );
    // nginx：取 location /api/ 块里的 proxy_read_timeout（/api/health 的 10s 不算）
    const apiBlock = nginxConf.slice(nginxConf.indexOf("location /api/ {"));
    const nginxSeconds = parseSeconds(apiBlock, /proxy_read_timeout\s+(\d+)s/);

    const serverSource = readSource("./index.ts");
    const serverMs = parseSeconds(
      serverSource,
      /BACKGROUND_IMAGE_TASK_TIMEOUT_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/
    );
    const serverSeconds = serverMs * 60;

    const aiSource = readSource("../client/src/lib/ai.ts");
    const attempts = parseSeconds(aiSource, /IMAGE_TASK_POLL_MAX_ATTEMPTS\s*=\s*(\d+)/);
    const intervalMs = parseSeconds(aiSource, /IMAGE_TASK_POLL_INTERVAL_MS\s*=\s*(\d+)/);
    const clientSeconds = (attempts * intervalMs) / 1000;

    expect(nginxSeconds).toBeGreaterThanOrEqual(serverSeconds);
    expect(serverSeconds).toBeGreaterThan(clientSeconds);
  });
});
