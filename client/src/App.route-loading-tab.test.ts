import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-19 用户要求：电商画布「带货图文 / 产品图」Tab 切换不能出现全屏跳转 loading。
 * 根因：RouteLoadingGate 只要路径变化就盖 720ms 全屏 loading，Tab 切换会改 URL → 被误伤。
 */
const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

function extractMatcher(): RegExp {
  const m = source.match(/const ecommercePostOrProduct = (\/.+\/);/);
  if (!m) throw new Error("ecommercePostOrProduct not found");
  const body = m[1];
  return new RegExp(body.slice(1, body.lastIndexOf("/")));
}

describe("RouteLoadingGate 同页 Tab 切换", () => {
  it("路径变化时先判同页切换再决定是否 loading", () => {
    const gate = source.slice(source.indexOf("function RouteLoadingGate"));
    const skipAt = gate.indexOf("if (isSamePageTransition(prev, routePath)) return;");
    const setAt = gate.indexOf("setLoadingPath(shouldShowRouteLoading(routePath)");
    expect(skipAt).toBeGreaterThan(0);
    expect(setAt).toBeGreaterThan(skipAt);
  });

  it("电商工作台三种路径互相切换视为同页，其他页面不算", () => {
    const re = extractMatcher();
    for (const p of ["/ecommerce-canvas", "/ecommerce-canvas/", "/ecommerce-canvas/post", "/ecommerce-canvas/product"]) {
      expect(re.test(p)).toBe(true);
    }
    for (const p of ["/ecommerce-canvas/history", "/ecommerce-canvas/templates", "/ecommerce-canvas/post/x", "/inspiration"]) {
      expect(re.test(p)).toBe(false);
    }
  });
});
