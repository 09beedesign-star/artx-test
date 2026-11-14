/**
 * 画布底纹 / 磁铁接线锁。⚠️ 只加了面板没接上画布 = 功能等于没做（多出口事故 A）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
const controls = readFileSync("client/src/components/canvas/CanvasBackgroundControls.tsx", "utf8");

describe("三种底纹与透明度", () => {
  it("画布渲染的是自定义底纹层，不再是 ReactFlow 写死的 Dots", () => {
    expect(canvas).toContain("<CanvasBackgroundLayer pref={canvasBackgroundPref} isDark={isDark} />");
    expect(canvas).not.toContain("variant={BackgroundVariant.Dots}");
  });

  it("底纹层跟随 viewport 平移缩放，并应用当前底纹透明度", () => {
    expect(controls).toContain("useViewport()");
    expect(controls).toContain("backgroundSize: `${tile.w * zoom}px ${tile.h * zoom}px`");
    expect(controls).toContain("backgroundPosition: `${x}px ${y}px`");
    expect(controls).toContain("opacity,");
  });

  it("三种图案各自生成不同 SVG，且都有中文入口", () => {
    expect(controls).toContain("data-artx-canvas-pattern={item.id}");
    expect(controls).toContain('pattern === "checker"');
    expect(controls).toContain('pattern === "isometric"');
    // dots 是 else 分支（圆点），也要有独立图形
    expect(controls).toContain('<circle cx="1.5" cy="1.5" r="1.5"');
    expect(controls).toContain("点阵");
    expect(controls).toContain("棋盘格");
    expect(controls).toContain("轴测网格");
  });

  it("透明度滑块改的是当前底纹那一份", () => {
    expect(controls).toContain("opacity: { ...pref.opacity, [pref.pattern]: clampOpacity(e.target.value, currentOpacity) }");
    expect(controls).toContain('type="range"');
  });
});

describe("磁铁吸附", () => {
  it("命令栏旁有磁铁按钮（不是塞进 tools 数组，避免影响工具守卫）", () => {
    expect(controls).toContain('aria-label="吸附网格顶点"');
    expect(controls).toContain("<Magnet size={17} />");
    expect(canvas).toContain("<CanvasBackgroundControls isDark={isDark} pref={bgPref} onChange={onBgPrefChange} />");
  });

  it("偏好从 InnerCanvas 单一状态传下去并落盘", () => {
    expect(canvas).toContain("useState<CanvasBackgroundPreference>(readCanvasBackgroundPreference)");
    expect(canvas).toContain("writeCanvasBackgroundPreference(next)");
    expect(canvas).toContain("bgPref={canvasBackgroundPref}");
  });

  it("拖动结束时量化坐标，且跳过已嵌入画板的节点", () => {
    expect(canvas).toContain("canvasBackgroundPrefRef.current.snapEnabled");
    expect(canvas).toContain("snapToGrid(n.position.x, true)");
    expect(canvas).toContain("draggedIds.has(n.id) && !n.parentId");
  });
});
