import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 图片命令条（AssetFloatingToolbar）2026-09-20 改版的回归锁。
 *
 * 需求：
 *   1. 命令条由竖向改横向
 *   2. 浮在图片上方 8px，与图片左右居中
 *   3. 旋转与反转 / 去背景 / 橡皮工具 / HD 4K / 去水印 / 扩展 收进「更多」
 *   4. 顶部工具盘的「智能注释」移入图片命令条
 *
 * ⚠️ 这些都是源码文本断言，必须配合变异自证使用 —— 光跑绿说明不了任何问题。
 */

const SOURCE_PATH = join(__dirname, "InfiniteCanvas.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

/**
 * 从某个顶层声明切到下一个顶层声明为止。
 * 不用固定行数，避免组件长度变化后断言范围悄悄越界 /
 * 切太短导致断言看不到目标代码（那样测试会变成恒绿）。
 */
function sliceFunction(marker: string): string {
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`定位锚点失效，找不到：${marker}`);
  }
  const rest = source.slice(start + marker.length);
  const nextTop = rest.search(/\n(?:function |const [A-Za-z]+ = |type |export )/);
  return rest.slice(0, nextTop === -1 ? rest.length : nextTop);
}

const toolbar = sliceFunction("function AssetFloatingToolbar(");

describe("图片命令条：横向布局", () => {
  it("命令条容器必须是 flex-row，不能残留 flex-col", () => {
    // 锚点：命令条本体那个带 toolBg 背景的容器
    const containerStart = toolbar.indexOf(
      'className="flex flex-row items-center rounded-[var(--radius-md-design)]"'
    );
    expect(
      containerStart,
      "命令条容器不是 flex-row —— 横向布局没生效"
    ).toBeGreaterThan(-1);

    // 整个命令条组件内不应再有竖排容器
    expect(
      toolbar,
      "命令条里还残留 flex-col，会导致按钮仍然竖排"
    ).not.toContain("flex flex-col items-center rounded-[var(--radius-md-design)]");
  });

  it("分隔线必须转成竖线（窄高），否则横条里会变成压扁的横杠", () => {
    const divider = toolbar.slice(
      toolbar.indexOf("const renderDivider"),
      toolbar.indexOf("const renderButton")
    );
    expect(divider.length, "renderDivider 片段为空，锚点失效").toBeGreaterThan(50);
    expect(divider, "分隔线宽度应为 2（竖线）").toContain("width: 2,");
    expect(divider, "分隔线高度应为 22（竖线）").toContain("height: 22,");
    // 旧的横线写法必须消失
    expect(divider, "分隔线还是旧的横线尺寸").not.toContain("width: 22,");
  });
});

describe("图片命令条：定位到图片上方并左右居中", () => {
  it("组件外层 transform 必须是 translate(-50%, -100%)", () => {
    expect(
      toolbar,
      "外层 transform 不对：X 要 -50%（左右居中），Y 要 -100%（整条在上方）"
    ).toContain('transform: "translate(-50%, -100%)"');
    // 旧的左挂写法必须消失
    expect(
      toolbar,
      "还残留竖条时代的 translate(-100%, -50%)，命令条会挂在图片左侧"
    ).not.toContain('transform: "translate(-100%, -50%)"');
  });

  it("坐标必须用 centerX + 上边缘减 8px", () => {
    const position = source.slice(
      source.indexOf("const attachedImageToolbarPosition"),
      source.indexOf("const displayNodesBase")
    );
    expect(
      position.length,
      "attachedImageToolbarPosition 片段为空，锚点失效"
    ).toBeGreaterThan(100);

    expect(position, "left 必须用 centerX 才能左右居中").toContain(
      "selectedImageBounds.centerX * viewport.zoom + viewport.x"
    );
    expect(position, "top 必须基于图片上边缘").toContain(
      "const screenTop = selectedImageBounds.y * viewport.zoom + viewport.y"
    );
    expect(position, "必须减去 8px 间距").toContain(
      "const desiredTop = screenTop - imageToolbarGap"
    );
    expect(
      source,
      "间距常量必须是 8"
    ).toContain("const imageToolbarGap = 8;");

    // 旧的左挂坐标必须消失
    expect(
      position,
      "还残留竖条时代的 left = x - 8（贴左边缘）"
    ).not.toContain("selectedImageBounds.x * viewport.zoom + viewport.x - 8");
  });
});

describe("图片命令条：6 个命令收进「更多」菜单", () => {
  const movedActions = [
    ["flip-rotate", "旋转与反转"],
    ["remove-background", "去背景"],
    ["erase", "橡皮工具"],
    ["upscale", "HD 4K"],
    ["remove-watermark", "去水印"],
    ["expand", "扩展"],
  ] as const;

  const assetTools = toolbar.slice(
    toolbar.indexOf("const assetTools"),
    toolbar.indexOf("const frameTools")
  );
  const moreItems = toolbar.slice(
    toolbar.indexOf("const moreItems"),
    toolbar.indexOf("useEffect(() => {")
  );

  it("切片锚点有效（片段非空）", () => {
    expect(assetTools.length, "assetTools 片段为空").toBeGreaterThan(200);
    expect(moreItems.length, "moreItems 片段为空").toBeGreaterThan(200);
  });

  it.each(movedActions)(
    "%s（%s）必须只在「更多」里，不能留在主条",
    (action, label) => {
      expect(
        moreItems,
        `「${label}」没有进入更多菜单`
      ).toContain(`action: "${action}"`);
      expect(
        assetTools,
        `「${label}」仍留在主命令条 —— 会出现两个入口`
      ).not.toContain(`action: "${action}"`);
    }
  );

  it("主条保留项不能被误删", () => {
    for (const action of [
      "move-object",
      "crop",
      "introduce-to-chat",
      "edit-elements",
      "edit-text",
      "reverse-prompt",
      "camera-view",
      "more",
      "mockup",
      "download",
    ]) {
      expect(
        assetTools,
        `主命令条丢失了 ${action}`
      ).toContain(`action: "${action}"`);
    }
  });
});

describe("智能注释：从顶部工具盘移入图片命令条", () => {
  it("必须出现在图片命令条的主条里", () => {
    const assetTools = toolbar.slice(
      toolbar.indexOf("const assetTools"),
      toolbar.indexOf("const frameTools")
    );
    expect(assetTools, "智能注释没进图片命令条").toContain('action: "annotate"');
    expect(assetTools, "智能注释缺少 label").toContain('label: "智能注释"');
  });

  it("必须从顶部工具盘移除", () => {
    const palette = source.slice(
      source.indexOf("function CanvasTopToolPalette")
    );
    const toolsStart = palette.indexOf("const tools = [");
    const toolsEnd = palette.indexOf("];", toolsStart);
    const paletteTools = palette.slice(toolsStart, toolsEnd);
    expect(paletteTools.length, "顶部工具盘 tools 片段为空").toBeGreaterThan(100);
    expect(
      paletteTools,
      "智能注释仍留在顶部工具盘 —— 会出现两个入口"
    ).not.toContain('id: "annotate"');
  });

  it("点击必须派发 tool-mode-change 而不是自己改 state", () => {
    const handler = source.slice(
      source.indexOf("const handleSingleImageToolbarAction"),
      source.indexOf('if (action === "introduce-to-chat")')
    );
    expect(handler.length, "action 分发片段为空").toBeGreaterThan(200);
    expect(handler, "缺少 annotate 分支，按钮会点了没反应").toContain(
      'if (action === "annotate")'
    );
    expect(handler, "必须走 tool-mode-change 统一出口").toContain(
      '"tool-mode-change"'
    );
    expect(handler, "必须切到 annotate 模式").toContain('mode: "annotate"');
  });

  it("toolMode annotate 的落点逻辑不能被误删", () => {
    expect(
      source,
      "注释落点逻辑被删了，智能注释会变成空壳"
    ).toContain('if (toolMode !== "annotate") return;');
    expect(source, "annotation-create 事件被删了").toContain(
      '"annotation-create"'
    );
  });
});
