/**
 * 2026-11-13 用户要求「灵感模板登录门禁改造」：
 *  1. 游客可看灵感图；点「一键同款」直接进画布并把图带进去，登录门禁只在点「生成」时触发。
 *  2. 灵感模板提示词**全站一律不展示**（登录与否都一样），详情弹窗右上角复制图标换成「一键同款」。
 *  3. 画布右侧灵感弹窗只显示图片，hover 正中「一键同款」，图进画布 + 输入框引用。
 *  4. 首页灵感板块同样适用。
 *
 * ⚠️ 源码断言前先剥注释：注释里大量写着「复制提示词」「item.prompt」这些旧词，不剥会恒红。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../shared/strip-source-comments";

const read = (rel: string) =>
  stripSourceComments(readFileSync(resolve(__dirname, rel), "utf-8"));

const APP = "../App.tsx";
const HOME = "../pages/HomePage.tsx";
const INSPIRATION = "../pages/InspirationPage.tsx";
const PROFILE = "../pages/ProfilePage.tsx";
const DIALOG = "../components/inspiration/InspirationPromptDialog.tsx";
const CANVAS = "../components/canvas/InfiniteCanvas.tsx";

describe("灵感模板：游客可进画布，门禁只在生成", () => {
  it("/project/:id 路由不再套 RequireLogin（RequireLogin 本身仍保留给其它页面）", () => {
    const app = read(APP);
    const start = app.indexOf('<Route path="/project/:id">');
    expect(start).toBeGreaterThan(-1);
    const block = app.slice(start, app.indexOf("</Route>", start));
    expect(block).toContain("<Workspace projectId={params.id} />");
    expect(block).not.toContain("RequireLogin");
    expect(app).toContain("function RequireLogin(");
    // 路由 loading 也要把画布当成游客可访问路径，否则游客进画布不出 loading
    expect(app).toContain('if (path.startsWith("/project/")) return true;');
  });

  it("画布生成入口仍然拦游客（门禁点没被一起拆掉）", () => {
    const canvas = read(CANVAS);
    expect(canvas).toContain('toast("请先登录", { description: "登录后即可使用 AI 能力" })');
    expect(canvas).toContain("onLoginRequest();");
  });
});

describe("灵感模板：提示词全站不展示", () => {
  for (const [name, file] of [
    ["首页", HOME],
    ["灵感专题页", INSPIRATION],
    ["个人中心", PROFILE],
    ["画布灵感弹窗", DIALOG],
  ] as const) {
    it(`${name}不渲染提示词、也没有复制提示词入口`, () => {
      const source = read(file);
      expect(source).not.toMatch(/\{\s*[A-Za-z]+\.prompt\s*\}/);
      expect(source).not.toContain("复制提示词");
      expect(source).not.toMatch(/clipboard\.writeText\([A-Za-z]*\.?prompt\)/);
    });
  }

  it("首页与专题页详情弹窗右上角是「一键同款」", () => {
    const home = read(HOME);
    const homeDetail = home.slice(home.indexOf("selectedHomeInspiration && ("));
    expect(homeDetail).toContain("data-home-inspiration-detail-same-style");
    expect(homeDetail).toContain("applyHomeInspirationSameStyle(selectedHomeInspiration)");

    const page = read(INSPIRATION);
    expect(page).toContain("data-inspiration-detail-same-style");
    expect(page).toContain("onClick={() => applySameStyle(selectedItem)}");
  });

  it("首页卡片 hover 出现居中「一键同款」，隐藏态不接点击，且不冒泡打开详情", () => {
    const home = read(HOME);
    const i = home.indexOf("data-home-inspiration-same-style");
    expect(i).toBeGreaterThan(-1);
    const around = home.slice(i - 600, i + 500);
    expect(around).toContain("pointer-events-none");
    expect(around).toContain("group-hover:pointer-events-auto");
    expect(around).toContain("group-hover:opacity-100");
    expect(around).toContain("event.stopPropagation();");
    expect(around).toContain("applyHomeInspirationSameStyle(item)");
    expect(home).toContain('from "@/lib/inspiration-same-style"');
  });

  it("个人中心点卡片不再复制提示词", () => {
    const profile = read(PROFILE);
    expect(profile).toContain("onOpen={() => applyReactionSameStyle(item)}");
    expect(profile).not.toContain("copyReactionPrompt");
  });

  it("画布灵感弹窗：只有图 + hover 居中一键同款，没有下载/导入/复制旧入口", () => {
    const dialog = read(DIALOG);
    expect(dialog).toContain("onApplySameStyle: (item: InspirationPromptItem) => void;");
    expect(dialog).not.toContain("onCopy");
    expect(dialog).not.toContain("onImport");
    expect(dialog).not.toContain("一键导入灵感");
    expect(dialog).not.toContain("Download");
    expect(dialog).toContain("data-inspiration-dialog-same-style");
    expect(dialog).toContain("data-inspiration-dialog-detail-same-style");
    expect(dialog).toContain(
      'pointerEvents: hoveredItemKey === `${item.rank}-${item.title}` ? "auto" : "none"'
    );
    expect(dialog).toContain("tabIndex={hoveredItemKey === `${item.rank}-${item.title}` ? 0 : -1}");
  });

  // 🔒 2026-11-13 用户要求：灵感模板的灵感总数不在前端显示
  it("does not render the inspiration total count on the page or in the canvas dialog", () => {
    const page = read(INSPIRATION);
    const dialog = read(DIALOG);
    expect(page).not.toMatch(/\{filteredItems\.length\}\s*个/);
    expect(dialog).not.toMatch(/\{scopedItems\.length\}/);
    expect(dialog).not.toMatch(/\{visibleItems\.length\}/);
  });
});
