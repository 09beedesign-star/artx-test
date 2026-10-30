import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MODEL3D_RETENTION_MS } from "@shared/model3d";
import { cleanupExpiredModels3D, getModel3DRoot, resolveModel3DForUser } from "./model3d-storage";

/**
 * 后台 48 小时保留规则：超过 48h 的模型文件必须从服务器上物理删除。
 * 读取时（resolve）与定时清理（cleanup）两道闸都要生效。
 */
describe("3D 模型服务器端 48 小时自动删除", () => {
  let dir = "";
  const prevEnv = process.env.ARTX_UPLOADS_DIR;
  const id = (c: string) => `${c.repeat(32)}.glb`;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "artx-m3d-"));
    process.env.ARTX_UPLOADS_DIR = dir;
  });
  afterEach(async () => {
    if (prevEnv === undefined) delete process.env.ARTX_UPLOADS_DIR;
    else process.env.ARTX_UPLOADS_DIR = prevEnv;
    await rm(dir, { recursive: true, force: true });
  });

  async function put(user: string, modelId: string, ageMs: number) {
    const userDir = path.join(getModel3DRoot(), user);
    await mkdir(userDir, { recursive: true });
    const file = path.join(userDir, modelId);
    await writeFile(file, "glTF");
    const t = new Date(Date.now() - ageMs);
    await utimes(file, t, t);
    return file;
  }
  const exists = (f: string) => stat(f).then(() => true, () => false);

  it("定时清理：超过 48h 的删除，未满 48h 的保留", async () => {
    const old = await put("alice", id("a"), MODEL3D_RETENTION_MS + 60_000);
    const fresh = await put("alice", id("b"), MODEL3D_RETENTION_MS - 60_000);
    const result = await cleanupExpiredModels3D();
    expect(result.deletedFiles).toBe(1);
    expect(await exists(old)).toBe(false);
    expect(await exists(fresh)).toBe(true);
  });

  it("读取闸：过期模型读取时即删除并返回 null（路由回 404 + expired）", async () => {
    const old = await put("alice", id("c"), MODEL3D_RETENTION_MS + 1000);
    expect(await resolveModel3DForUser("alice", id("c"))).toBeNull();
    expect(await exists(old)).toBe(false);
  });

  it("未过期模型可正常读取", async () => {
    await put("alice", id("d"), 1000);
    expect(await resolveModel3DForUser("alice", id("d"))).not.toBeNull();
  });
});
