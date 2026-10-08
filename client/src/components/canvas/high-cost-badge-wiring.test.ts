import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 「高消耗」角标 + 免费锁的前端接线（2026-10）。
 *
 * 模型清单有三个渲染出口：ModelSelector 本体、画布 ImageGeneratorPopover、
 * AI 助手模型菜单。只接一个 = 另外两处用户无感知地选到 300 积分模型（多出口事故族）。
 */
const selectorSource = readFileSync("client/src/components/canvas/ModelSelector.tsx", "utf8");
const canvasSource = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");

function countMatches(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("高消耗角标：三个模型清单出口全部接入", () => {
  it("ModelSelector 行内渲染 HighCostBadge", () => {
    const rowsStart = selectorSource.indexOf("{models.map(m => (");
    expect(rowsStart).toBeGreaterThan(-1);
    expect(selectorSource.slice(rowsStart)).toContain("<HighCostBadge model={m.id} />");
  });

  it("画布里另外两个清单（生图弹层 + 助手菜单）都渲染 HighCostBadge", () => {
    expect(canvasSource).toContain("<HighCostBadge model={item.id} />");
    expect(canvasSource).toContain("<HighCostBadge model={model.id} />");
    expect(countMatches(canvasSource, "<HighCostBadge")).toBe(2);
  });

  it("角标口径来自 shared 的 isHighCostImageModel，不在前端写死模型名", () => {
    expect(selectorSource).toMatch(/if \(!isHighCostImageModel\(model\)\) return null;/);
  });
});

describe("免费锁：选择器不传 models 时也必须看权益", () => {
  it("models 默认不再是静态 IMAGE_AI_MODEL_OPTIONS", () => {
    expect(selectorSource).not.toMatch(/models = IMAGE_AI_MODEL_OPTIONS,/);
    expect(selectorSource).toContain("const models = modelsProp ?? entitledModels;");
  });

  it("选中项被置灰时自动切回默认档（节点悬浮条默认即梦的场景）", () => {
    expect(selectorSource).toMatch(/if \(!selected\?\.disabled\) return;/);
    expect(selectorSource).toContain("m.id === DEFAULT_IMAGE_MODEL_ID && !m.disabled");
  });

  it("权益缓存按账号隔离", () => {
    expect(selectorSource).toContain("modelOptionsCache.owner === owner");
  });
});
