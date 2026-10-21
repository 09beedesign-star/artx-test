/**
 * 画布缩略图鼠标样式测试
 * 
 * 验证当鼠标移动到左下角的 MiniMap 区域时，鼠标指针变成抓手样式，
 * 告诉用户这个区域可以拖动调整画布显示区域。
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("MiniMap 鼠标样式", () => {
  const cssPath = path.join(
    __dirname,
    "../../index.css"
  );
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("应该为 MiniMap 设置 grab 鼠标样式", () => {
    // 验证 .react-flow__minimap 有 cursor: grab
    const minimapStyleMatch = cssContent.match(
      /\.react-flow__minimap\s*\{[^}]*cursor:\s*grab[^}]*\}/s
    );
    expect(
      minimapStyleMatch,
      "MiniMap 应该有 cursor: grab 样式"
    ).toBeTruthy();
  });

  it("应该在拖动时显示 grabbing 样式", () => {
    // 验证 .react-flow__minimap:active 有 cursor: grabbing
    const activeStyleMatch = cssContent.match(
      /\.react-flow__minimap:active\s*\{[^}]*cursor:\s*grabbing[^}]*\}/s
    );
    expect(
      activeStyleMatch,
      "MiniMap 拖动时应该显示 cursor: grabbing 样式"
    ).toBeTruthy();
  });

  it("应该有说明注释解释鼠标样式的用途", () => {
    // 验证有注释说明这是抓手样式
    const commentMatch = cssContent.match(
      /小地图整体鼠标样式.*抓手|拖动|调整视口/s
    );
    expect(
      commentMatch,
      "应该有注释说明鼠标样式的用途"
    ).toBeTruthy();
  });

  it("不应该使用 crosshair 样式", () => {
    // 验证不再使用旧的 crosshair 样式
    const crosshairMatch = cssContent.match(
      /\.react-flow__minimap\s*\{[^}]*cursor:\s*crosshair[^}]*\}/s
    );
    expect(
      crosshairMatch,
      "不应该使用 crosshair 样式，应该改为 grab"
    ).toBeFalsy();
  });
});

describe("InfiniteCanvas MiniMap 组件", () => {
  const tsxPath = path.join(
    __dirname,
    "./InfiniteCanvas.tsx"
  );
  const tsxContent = fs.readFileSync(tsxPath, "utf-8");

  it("MiniMap 样式对象不应该包含内联 cursor 属性", () => {
    // 提取 MiniMap 的 style 对象
    const minimapMatch = tsxContent.match(
      /<MiniMap\s+style=\{(\{[^}]*\})\}/s
    );
    
    if (minimapMatch) {
      const styleContent = minimapMatch[1];
      // 验证 style 对象中不包含 cursor 属性
      const hasCursor = /cursor\s*:/.test(styleContent);
      expect(
        hasCursor,
        "MiniMap 的 style 不应该有内联 cursor，应该完全由 CSS 控制"
      ).toBeFalsy();
    }
  });

  it("应该保留 pannable 属性以支持拖动", () => {
    // 验证 MiniMap 有 pannable 属性
    const pannableMatch = tsxContent.match(
      /<MiniMap[^>]*pannable=\{!isCanvasLocked\}/s
    );
    expect(
      pannableMatch,
      "MiniMap 应该有 pannable 属性以支持拖动"
    ).toBeTruthy();
  });

  it("应该保留 zoomable 属性以支持缩放", () => {
    // 验证 MiniMap 有 zoomable 属性
    const zoomableMatch = tsxContent.match(
      /<MiniMap[^>]*zoomable[^>]*>/s
    );
    expect(
      zoomableMatch,
      "MiniMap 应该有 zoomable 属性"
    ).toBeTruthy();
  });
});
