import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetThreeDTaskStoreForTests,
  __setThreeDGeneratorForTests,
  getThreeDTask,
  handleThreeDGenerate,
  THREED_FALLBACK_MODEL_ID,
  type ThreeDGenerationTask,
} from "./threed-generation";

/**
 * 2026-11-17 用户规则：选任何 3D 模型，一旦该模型失效，立即切混元 3D 兜底。
 */
describe("3D 生成：所选模型失效 → 混元 3D 兜底", () => {
  const persist = async (_url: string, t: ThreeDGenerationTask) => ({
    modelId: `${"b".repeat(32)}.glb`,
    modelName: `${t.model}.glb`,
    expiresAt: 1,
  });
  const run = async (model: string, generator: (p: string, m: string) => Promise<{ modelUrl: string }>) => {
    __setThreeDGeneratorForTests(generator);
    const onComplete = vi.fn(async (_t: ThreeDGenerationTask) => undefined);
    const onFailed = vi.fn(async (_t: ThreeDGenerationTask) => undefined);
    const taskId = `t-${model}-${Math.random()}`;
    await handleThreeDGenerate({ prompt: "小白兔", model, taskId }, "u1", onComplete, onFailed, persist);
    await vi.waitFor(() => expect(onComplete.mock.calls.length + onFailed.mock.calls.length).toBe(1));
    return { task: await getThreeDTask(taskId), onComplete, onFailed };
  };

  beforeEach(() => __resetThreeDTaskStoreForTests());
  afterEach(() => __setThreeDGeneratorForTests(null));

  it("兜底模型就是混元 3D", () => {
    expect(THREED_FALLBACK_MODEL_ID).toBe("hunyuan3d-2.5");
  });

  it.each(["tripo3d-v2.5", "meshy-4", "stability3d-fast"])("%s 失效 → 自动改用混元 3D 并成功", async (model) => {
    const calls: string[] = [];
    const { task, onComplete } = await run(model, async (_p, m) => {
      calls.push(m);
      if (m !== "hunyuan3d-2.5") throw new Error(`${m} upstream 503`);
      return { modelUrl: "https://x/hunyuan.glb" };
    });
    expect(calls).toEqual([model, "hunyuan3d-2.5"]);
    expect(task?.status).toBe("completed");
    expect(task?.model).toBe("hunyuan3d-2.5");
    expect(task?.fallbackFrom).toBe(model);
    expect(task?.fallbackReason).toContain("503");
    expect(task?.modelName).toBe("hunyuan3d-2.5.glb");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("所选模型正常 → 不触发兜底", async () => {
    const calls: string[] = [];
    const { task } = await run("tripo3d-v2.5", async (_p, m) => {
      calls.push(m);
      return { modelUrl: "https://x/tripo.glb" };
    });
    expect(calls).toEqual(["tripo3d-v2.5"]);
    expect(task?.model).toBe("tripo3d-v2.5");
    expect(task?.fallbackFrom).toBeUndefined();
  });

  it("混元 3D 自己也失效 → 任务失败（走 onFailed 释放预扣）", async () => {
    const { task, onFailed } = await run("meshy-4", async (_p, m) => {
      throw new Error(`${m} down`);
    });
    expect(task?.status).toBe("failed");
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("用户选的就是混元 3D 且失效 → 不重复调用，直接失败", async () => {
    const calls: string[] = [];
    const { task } = await run("hunyuan3d-2.5", async (_p, m) => {
      calls.push(m);
      throw new Error("down");
    });
    expect(calls).toEqual(["hunyuan3d-2.5"]);
    expect(task?.status).toBe("failed");
  });
});
