/**
 * 2026-11-18 用户要求：「AI 生成 3D 模型」下架，不上正式环境。
 * 前端三个入口 + 后端生成接口必须读同一个开关；后端拦截必须早于预扣费。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THREED_GENERATION_PUBLIC, isThreeDGenerationEnabled } from "../shared/model3d";

const server = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../client/src/components/canvas/InfiniteCanvas.tsx", import.meta.url), "utf8");

describe("AI 生成 3D 下架", () => {
  it("开关默认关闭；本地开发仍可用", () => {
    expect(THREED_GENERATION_PUBLIC).toBe(false);
    expect(isThreeDGenerationEnabled(false)).toBe(false);
    expect(isThreeDGenerationEnabled(true)).toBe(true);
  });

  it("后端 /api/threed/generate 在预扣费之前 403", () => {
    const start = server.indexOf('app.post("/api/threed/generate"');
    expect(start).toBeGreaterThan(-1);
    const body = server.slice(start, start + 6000);
    const gate = body.indexOf("isThreeDGenerationEnabled(");
    const reserve = body.indexOf("reserveAiRouteUsage(");
    expect(gate).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(gate);
    expect(body.slice(gate, reserve)).toMatch(/status\(403\)/);
    expect(body.slice(gate, gate + 200)).toContain('process.env.NODE_ENV !== "production"');
  });

  it("前端三个入口全部接开关", () => {
    expect(canvas).toMatch(/const THREED_GENERATION_ON = isThreeDGenerationEnabled\(import\.meta\.env\.DEV\)/);
    // 图片右键菜单项 + 菜单动作
    expect(canvas).toMatch(/THREED_GENERATION_ON && menu\.nodeType === "asset" && selectedCount === 1/);
    expect(canvas).toMatch(/action === "generate-3d"\) \{\s*if \(!THREED_GENERATION_ON\) return;/);
    // 悬浮面板模型选择器
    expect(canvas).not.toContain("enable3D={true}");
    expect(canvas).toContain("enable3D={THREED_GENERATION_ON}");
    // composer 「3D」分类 tab
    expect(canvas).toContain(": THREED_GENERATION_ON && THREED_AI_MODEL_OPTIONS.length > 0).map(tab =>");
  });
});
