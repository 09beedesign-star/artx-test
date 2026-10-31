import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectCoverError, storeProjectCover } from "./project-cover-storage";

const jpeg = (seed: string) => `data:image/jpeg;base64,${Buffer.from(`fake-jpeg-${seed}`).toString("base64")}`;

describe("项目封面落盘（跨设备封面）", () => {
  let root = "";
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "artx-cover-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("写到 covers/<用户>/<项目>/ 下并返回 /uploads/covers 地址", async () => {
    const { url } = await storeProjectCover({ userId: "u1", projectId: "proj-1", dataUrl: jpeg("a"), uploadsRoot: root });
    expect(url).toMatch(/^\/uploads\/covers\/u1\/proj-1\/[0-9a-f]{16}\.jpg$/);
    const file = path.join(root, url.replace("/uploads/", ""));
    expect((await readFile(file)).toString()).toBe("fake-jpeg-a");
  });

  it("不在 15 天清理范围（images / feedback）内", async () => {
    const { url } = await storeProjectCover({ userId: "u1", projectId: "p", dataUrl: jpeg("a"), uploadsRoot: root });
    expect(url.startsWith("/uploads/images/")).toBe(false);
    expect(url.startsWith("/uploads/feedback/")).toBe(false);
  });

  it("同内容幂等；换封面后删掉同项目旧文件，不碰其它项目", async () => {
    const a1 = await storeProjectCover({ userId: "u1", projectId: "p", dataUrl: jpeg("a"), uploadsRoot: root });
    const a2 = await storeProjectCover({ userId: "u1", projectId: "p", dataUrl: jpeg("a"), uploadsRoot: root });
    expect(a2.url).toBe(a1.url);
    await storeProjectCover({ userId: "u1", projectId: "p-2", dataUrl: jpeg("x"), uploadsRoot: root });
    const b = await storeProjectCover({ userId: "u1", projectId: "p", dataUrl: jpeg("b"), uploadsRoot: root });
    expect(await readdir(path.join(root, "covers/u1/p"))).toEqual([path.basename(b.url)]);
    expect(await readdir(path.join(root, "covers/u1/p-2"))).toHaveLength(1);
  });

  it("路径参数被清洗，无法目录穿越", async () => {
    const { url } = await storeProjectCover({ userId: "../evil", projectId: "../../etc", dataUrl: jpeg("a"), uploadsRoot: root });
    expect(url).not.toContain("..");
    expect(url.startsWith("/uploads/covers/")).toBe(true);
  });

  it("拒绝非图片、缺项目 ID 与超大文件", async () => {
    await expect(storeProjectCover({ userId: "u", projectId: "p", dataUrl: "data:text/html;base64,PGI+", uploadsRoot: root })).rejects.toBeInstanceOf(ProjectCoverError);
    await expect(storeProjectCover({ userId: "u", projectId: "", dataUrl: jpeg("a"), uploadsRoot: root })).rejects.toBeInstanceOf(ProjectCoverError);
    const big = `data:image/jpeg;base64,${Buffer.alloc(1024 * 1024 + 10).toString("base64")}`;
    await expect(storeProjectCover({ userId: "u", projectId: "p", dataUrl: big, uploadsRoot: root })).rejects.toMatchObject({ status: 413 });
  });

  it("路由用会话身份，不读请求体里的 userId", async () => {
    const source = await readFile(path.join(__dirname, "index.ts"), "utf-8");
    const route = source.slice(source.indexOf('app.post("/api/workspace/project-cover"'));
    const block = route.slice(0, route.indexOf("});\n") + 4);
    expect(block).toContain("requireSessionUser(req, res)");
    expect(block).toContain("userId: user.id");
    expect(block).not.toContain("req.body?.userId");
  });
});
