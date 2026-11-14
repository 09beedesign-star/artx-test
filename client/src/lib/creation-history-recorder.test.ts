/**
 * 🔒 2026-11-14 用户要求：AI 生成图一律**被动**自动落盘到本地创作历史文件夹，
 * 覆盖所有能力（不限格式），服务端图片过期后本地仍找得到。
 *
 * 主链路（画布）早已有全局 recorder；这里锁的是「旁路出口」电商画布，
 * 以及「权限失效不能静默跳过」这条隐性失败。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const recorder = readFileSync("client/src/lib/creation-history-recorder.ts", "utf8");
const ecommerce = readFileSync("client/src/pages/EcommerceCanvasPage.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");

describe("创作历史：所有 AI 生成出口都要被动落盘", () => {
  it("全局 recorder 由登录态启动，监听画布生成完成事件", () => {
    expect(app).toContain("startCreationHistoryRecorder(user.id)");
    expect(recorder).toContain('window.addEventListener("image-generator-submit", listener)');
  });

  it("电商画布生成完成也记入创作历史（两种模式的共同收口）", () => {
    expect(ecommerce).toContain("recordCompletedImages(accountId, {");
    expect(ecommerce).toContain('status: "completed"');
    expect(ecommerce).toContain("images: urls.map(src => ({ src }))");
    // 产品图 / 带货图文两条分支之后、写入 history 之前的共同位置。
    // ⚠️ 不能用 indexOf("recordCompletedImages") —— 命中的是顶部 import，恒在前。
    expect(ecommerce.indexOf("recordCompletedImages(accountId, {")).toBeGreaterThan(
      ecommerce.indexOf("if (urls.length === 0)"),
    );
  });

  it("⚠️ 电商页禁止派发 image-generator-submit（会被画布当成新生成请求）", () => {
    expect(ecommerce).not.toContain('dispatchEvent(new CustomEvent("image-generator-submit"');
  });

  it("已授权但权限掉回 prompt 时必须给用户可见提示，不能静默跳过", () => {
    expect(recorder).toContain("getDirectoryPermission(dir)");
    expect(recorder).toContain('toast("创作历史暂时没能写进本地文件夹"');
    expect(recorder).toContain("saveRecordToDirectory(record, dir)");
  });

  it("没设置文件夹时只留浏览器记录，不打扰用户", () => {
    expect(recorder).toContain("if (!dir) return;");
  });
});
