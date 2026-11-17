import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getModel3DRoot, resolveModel3DForUser, storeModel3DFromUrl } from "./model3d-storage";
import {
  __resetThreeDTaskStoreForTests,
  getThreeDTask,
  handleThreeDGenerate,
  type ThreeDGenerationTask,
} from "./threed-generation";

/**
 * 2026-11-16：AI 生成的 3D 模型必须转存成画布 3D 容器能加载的 modelId。
 * 事故：后端只回外部 GitHub GLB URL，前端独立弹窗直连拉不到 → 预览一片空白，积分照扣。
 */
describe("3D 生成结果转存为画布 3D 容器可加载的 modelId", () => {
  let dir = "";
  const prevEnv = process.env.ARTX_UPLOADS_DIR;
  const glb = Buffer.from("glTF\u0002\u0000\u0000\u0000fake-binary-body");

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "artx-3dgen-"));
    process.env.ARTX_UPLOADS_DIR = dir;
    __resetThreeDTaskStoreForTests();
  });
  afterEach(async () => {
    vi.useRealTimers();
    if (prevEnv === undefined) delete process.env.ARTX_UPLOADS_DIR;
    else process.env.ARTX_UPLOADS_DIR = prevEnv;
    await rm(dir, { recursive: true, force: true });
  });

  const okFetch = (async () =>
    new Response(glb, { status: 200, headers: { "content-length": String(glb.length) } })) as typeof fetch;

  it("下载远程 GLB 落到该用户目录，并能被本人按 modelId 读回", async () => {
    const stored = await storeModel3DFromUrl({
      username: "alice",
      url: "https://example.com/Duck.glb",
      originalName: "小黄鸭.glb",
      fetchImpl: okFetch,
    });
    expect(stored.modelId).toMatch(/^[0-9a-f]{32}\.glb$/);
    expect(stored.size).toBe(glb.length);
    const resolved = await resolveModel3DForUser("alice", stored.modelId);
    expect(resolved).not.toBeNull();
    expect(await readFile(resolved!.filePath)).toEqual(glb);
    expect(resolved!.filePath.startsWith(path.join(getModel3DRoot(), "alice"))).toBe(true);
    // 别人拿到 modelId 也读不到
    expect(await resolveModel3DForUser("bob", stored.modelId)).toBeNull();
  });

  it("上游 404 → 抛错，不留半截文件", async () => {
    const notFound = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    await expect(
      storeModel3DFromUrl({ username: "alice", url: "https://x/y.glb", originalName: "y.glb", fetchImpl: notFound })
    ).rejects.toThrow(/HTTP 404/);
  });

  it("生成任务完成时带 modelId；转存失败 = 任务失败（走 onFailed，释放预扣不扣费）", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn(async (_t: ThreeDGenerationTask) => undefined);
    const onFailed = vi.fn(async (_t: ThreeDGenerationTask) => undefined);

    await handleThreeDGenerate(
      { prompt: "一只小黄鸭", model: "hunyuan3d-2.5", taskId: "t-ok" },
      "u1",
      onComplete,
      onFailed,
      async () => ({ modelId: `${"a".repeat(32)}.glb`, modelName: "一只小黄鸭.glb", expiresAt: 123 })
    );
    await handleThreeDGenerate(
      { prompt: "坏任务", model: "hunyuan3d-2.5", taskId: "t-bad" },
      "u1",
      onComplete,
      onFailed,
      async () => {
        throw new Error("下载生成的 3D 模型失败");
      }
    );
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(onComplete.mock.calls.length + onFailed.mock.calls.length).toBe(2));

    const ok = await getThreeDTask("t-ok");
    expect(ok?.status).toBe("completed");
    expect(ok?.modelId).toBe(`${"a".repeat(32)}.glb`);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const bad = await getThreeDTask("t-bad");
    expect(bad?.status).toBe("failed");
    expect(bad?.modelId).toBeUndefined();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});
