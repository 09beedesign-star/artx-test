import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * 2026-10-29：生产首屏主包 2.9MB（gzip 845KB），香港线路晚高峰丢包时
 * 国内用户首屏白屏 =「站点打不开」。拆分后主包 gzip 约 263KB。
 * 这组断言防止有人把重页面改回静态 import，让主包重新膨胀。
 */
const app = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const main = readFileSync(resolve(__dirname, "main.tsx"), "utf8");

const lazyPages = [
  "Workspace", // 含 InfiniteCanvas，体积最大
  "EcommerceCanvasPage",
  "AdminPrototypePage",
  "WorkspaceDashboard",
  "BillingPage",
];

describe("路由级代码拆分", () => {
  it.each(lazyPages)("%s 必须懒加载，不得静态 import", (page) => {
    expect(app).not.toMatch(new RegExp(`^import ${page} from`, "m"));
    expect(app).toContain(`const ${page} = lazy(() => import("./pages/${page}"));`);
  });

  it("路由外层包了 Suspense，并有 loading 占位", () => {
    expect(app).toContain("<Suspense fallback={<RouteChunkFallback />}>");
    expect(app).toContain("function RouteChunkFallback()");
  });

  it("InfiniteCanvas 不会被 App 直接引入", () => {
    expect(app).not.toMatch(/^import[^\n]*InfiniteCanvas/m);
  });

  it("发版后旧分包 404 时自动刷新一次（带节流防死循环）", () => {
    expect(main).toContain("vite:preloadError");
    expect(main).toContain("sessionStorage");
  });
});
