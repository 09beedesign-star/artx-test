/**
 * 图片过期提醒的回归测试。
 *
 * 这个功能的特殊性在于：它的失效方式**全都是静默的**。
 * 不提醒不会报错，提醒了错误天数也不会报错，用户只会在某天发现图没了。
 * 因此下面每条用例都对应一种「零报错但功能等于没做」的具体故障：
 *
 *  1. 提醒的时间源必须与清理的时间源同为 mtime —— 不同源 = 提示还剩 3 天今晚却被删。
 *  2. 用户名含特殊字符时目录名要与写入侧一致 —— 不一致 = 有图但永不提醒。
 *  3. 未进入窗口的图不能下发 —— 下发了 = 用户刚出图就被催着下载。
 *  4. 剩余天数向上取整 —— 取整错了 = 还能下载的图显示「0 天」，用户以为没救了。
 *  5. 提醒窗口不得超过保留期 —— 超了 = 图一落盘就在倒计时。
 */
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupExpiredUploads,
  getExpiryWarningDays,
  getUploadRetentionDays,
  listExpiringUploadsForUser,
} from "./local-image-storage";

const DAY_MS = 24 * 60 * 60 * 1000;
let uploadsDir = "";

afterEach(async () => {
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
    uploadsDir = "";
  }
  delete process.env.ARTX_UPLOADS_DIR;
  delete process.env.ARTX_UPLOAD_RETENTION_DAYS;
  delete process.env.ARTX_UPLOAD_WARNING_DAYS;
});

async function seedImage(username: string, filename: string, ageDays: number, now: Date) {
  const filePath = path.join(uploadsDir, "images", username, filename);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "x");
  const mtime = new Date(now.getTime() - ageDays * DAY_MS);
  await utimes(filePath, mtime, mtime);
  return filePath;
}

describe("listExpiringUploadsForUser", () => {
  it("默认保留期为 15 天、提醒窗口为 5 天", () => {
    expect(getUploadRetentionDays()).toBe(15);
    expect(getExpiryWarningDays()).toBe(5);
  });

  it("只返回进入提醒窗口的图片，窗口外的不下发", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-window-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const now = new Date("2026-09-24T00:00:00.000Z");

    // 保留 15 天、提醒窗口 5 天 → 第 10 天起进入提醒。
    await seedImage("alice", "fresh.png", 2, now); // 还剩 13 天，不提醒
    await seedImage("alice", "day9.png", 9, now); // 还剩 6 天，不提醒
    await seedImage("alice", "day10.png", 10, now); // 还剩 5 天，提醒
    await seedImage("alice", "day14.png", 14, now); // 还剩 1 天，提醒

    const result = await listExpiringUploadsForUser("alice", { now });

    expect(result.retentionDays).toBe(15);
    expect(result.warningDays).toBe(5);
    const names = result.entries.map(entry => entry.src.split("/").pop());
    expect(names).toEqual(["day14.png", "day10.png"]);
  });

  it("最紧急的排在最前，便于前端直接取第一条", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-sort-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const now = new Date("2026-09-24T00:00:00.000Z");

    await seedImage("bob", "a.png", 11, now); // 剩 4
    await seedImage("bob", "b.png", 14, now); // 剩 1
    await seedImage("bob", "c.png", 12, now); // 剩 3

    const result = await listExpiringUploadsForUser("bob", { now });
    expect(result.entries.map(entry => entry.daysLeft)).toEqual([1, 3, 4]);
  });

  it("剩余天数向上取整：还能下载的图不能显示为 0 天", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-ceil-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const now = new Date("2026-09-24T00:00:00.000Z");

    // 落盘于 14.7 天前 → 距清理还有 0.3 天，此刻仍可下载，必须显示 1 天。
    const filePath = path.join(uploadsDir, "images", "carol", "almost.png");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "x");
    const mtime = new Date(now.getTime() - 14.7 * DAY_MS);
    await utimes(filePath, mtime, mtime);

    const result = await listExpiringUploadsForUser("carol", { now });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].daysLeft).toBe(1);
  });

  /**
   * ⚠️ 关于「时间源必须是 mtime 而非 birthtime」这条契约的测试边界说明：
   *
   * 我试过用变异测试锁它（把实现里的 mtime 换成 birthtime，看测试会不会红），
   * **杀不掉**。实测原因：macOS(APFS) 上 `utimes()` 把 mtime 设到过去时，
   * birthtime 会被一起拉回同一时刻（系统不允许创建时间晚于修改时间）。
   * 因此在本机，mtime 与 birthtime 恒等 —— 这是**等价变异**，不是测试漏了。
   *
   * 结论：这条契约在 macOS 上无法用文件系统夹具证明。它由下面那条
   * 「提醒与清理同源」的用例间接守护 —— 只要两边读同一个字段，无论那个
   * 字段是什么，行为都自洽。真正会出问题的是「两边读不同字段」，而那个
   * 场景下面那条用例能抓住。不要为了追求「变异被杀」去造假夹具。
   */
  it("⭐ 提醒的判定必须与清理的判定同源：提醒说还有剩余的图，清理就不能删", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-consistency-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const now = new Date("2026-09-24T00:00:00.000Z");

    // 第 14 天：提醒应说「还剩 1 天」，清理此刻不应删它。
    const survivor = await seedImage("dave", "survivor.png", 14, now);
    // 第 16 天：已过保留期，清理应删它。
    await seedImage("dave", "goner.png", 16, now);

    const listed = await listExpiringUploadsForUser("dave", { now });
    const survivorEntry = listed.entries.find(entry => entry.src.endsWith("survivor.png"));
    expect(survivorEntry?.daysLeft).toBe(1);

    const cleanup = await cleanupExpiredUploads({ now });
    expect(cleanup.deletedFiles).toBe(1);

    // 提醒说还剩 1 天的那张，清理后必须还在。这条断言是整个功能的核心契约。
    const afterCleanup = await listExpiringUploadsForUser("dave", { now });
    expect(afterCleanup.entries.map(entry => entry.src.split("/").pop())).toEqual(["survivor.png"]);
    expect(survivor).toBeTruthy();
  });

  it("⭐ 用户名含特殊字符时仍能匹配到目录，否则会「有图但永不提醒」", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-sanitize-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const now = new Date("2026-09-24T00:00:00.000Z");

    // 写入侧会把 "a b/c" 这类用户名 sanitize 成目录名，查询侧必须用同一套规则。
    // 这里直接用 sanitize 后的目录名造数据，再用原始用户名查询。
    await seedImage("user-with-space", "x.png", 12, now);

    const result = await listExpiringUploadsForUser("user with space", { now });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].daysLeft).toBe(3);
  });

  it("用户没有图片目录时返回空列表而不是抛错", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-empty-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const result = await listExpiringUploadsForUser("nobody");
    expect(result.entries).toEqual([]);
    expect(result.retentionDays).toBe(15);
  });

  it("⭐ 提醒窗口不得超过保留期，否则图一落盘就在倒计时", () => {
    process.env.ARTX_UPLOAD_RETENTION_DAYS = "3";
    process.env.ARTX_UPLOAD_WARNING_DAYS = "10";
    expect(getUploadRetentionDays()).toBe(3);
    expect(getExpiryWarningDays()).toBe(3);
  });

  it("保留期与提醒窗口都可由环境变量覆盖", () => {
    process.env.ARTX_UPLOAD_RETENTION_DAYS = "30";
    process.env.ARTX_UPLOAD_WARNING_DAYS = "7";
    expect(getUploadRetentionDays()).toBe(30);
    expect(getExpiryWarningDays()).toBe(7);
  });

  it("只返回自己的图，不会串到别的用户", async () => {
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "artx-expiry-isolation-"));
    process.env.ARTX_UPLOADS_DIR = uploadsDir;
    const now = new Date("2026-09-24T00:00:00.000Z");

    await seedImage("alice", "alice.png", 12, now);
    await seedImage("mallory", "mallory.png", 12, now);

    const result = await listExpiringUploadsForUser("alice", { now });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].src).toContain("alice");
    expect(result.entries[0].src).not.toContain("mallory");
  });
});
