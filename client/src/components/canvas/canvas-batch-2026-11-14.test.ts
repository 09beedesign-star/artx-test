/**
 * 2026-11-14 第二批四项修改的守护：
 * 1. 版式工作台入口屏蔽  2. 创作历史删除二次确认
 * 3. 画布内点侧边栏「项目/最近」弹跳出确认  4. 图层重排黑屏
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LAYER_ROW_DRAG_MIME, isInternalCanvasDrag } from "@/lib/canvas-layers";

const read = (p: string) => readFileSync(p, "utf8");
const canvas = read("client/src/components/canvas/InfiniteCanvas.tsx");
const layers = read("client/src/components/canvas/CanvasLayersPanel.tsx");
const history = read("client/src/pages/CreationHistoryPage.tsx");
const shell = read("client/src/components/layout/AppShell.tsx");

function block(src: string, start: string, end: string) {
  const i = src.indexOf(start);
  expect(i, `起点不存在：${start}`).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(end, i + start.length);
  expect(j, `终点不存在：${end}`).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe("图层重排黑屏修复", () => {
  it("图层行拖拽被识别为内部拖拽，外部图片/文件拖拽仍然被识别", () => {
    expect(isInternalCanvasDrag([LAYER_ROW_DRAG_MIME, "text/uri-list", "text/html"])).toBe(true);
    expect(isInternalCanvasDrag(["application/x-artx-composer-token"])).toBe(true);
    // 变异防护：外部拖入不能被误判为内部，否则拖图进画布失效
    expect(isInternalCanvasDrag(["Files"])).toBe(false);
    expect(isInternalCanvasDrag(["text/uri-list", "text/html"])).toBe(false);
  });

  it("画布外部拖入判定接入了内部拖拽排除", () => {
    const fn = block(canvas, "function dataTransferMayContainExternalDrop(", "function dataTransferHasWebStringPayload");
    expect(fn).toContain("if (isInternalCanvasDrag(types)) return false;");
  });

  it("图层面板拖拽打标记，并在 dragover/drop 阻止冒泡（dragleave 不拦）", () => {
    const start = block(layers, "const handleDragStart", "const handleDragEnd");
    expect(start).toContain("e.dataTransfer.setData(LAYER_ROW_DRAG_MIME, id)");
    expect(block(layers, "const handleDragOver", "const handleDrop")).toContain("e.stopPropagation()");
    expect(block(layers, "const handleDrop", "const iconForRow")).toContain("e.stopPropagation()");
    expect(layers).not.toContain("onDragLeave");
  });
});

describe("版式工作台入口屏蔽", () => {
  it("tools 数组经开关过滤，入口代码保留", () => {
    expect(canvas).toContain('id: "templates"');
    expect(canvas).toContain('tool => tool.id !== "templates" || CANVAS_TEMPLATES_ENABLED');
  });
});

describe("创作历史删除二次确认", () => {
  it("单删与批量删都只登记待删，真正删除只在确认回调里", () => {
    const single = block(history, "const handleDelete = ", "const confirmPendingDelete");
    const batch = block(history, "const deleteSelected = ", "const releaseFolderFiles");
    expect(single).not.toContain("deleteCreationHistoryRecords");
    expect(batch).not.toContain("deleteCreationHistoryRecords");
    expect(single).toContain("setPendingDelete");
    expect(batch).toContain("setPendingDelete");
    // 唯一出口：整个页面只有一处调用删除
    expect(history.match(/await deleteCreationHistoryRecords\(/g)?.length).toBe(1);
    expect(block(history, "const confirmPendingDelete", "const handleDownload")).toContain("deleteCreationHistoryRecords(pending.ids)");
  });

  it("确认弹窗有取消与确认删除两个按钮", () => {
    const dialog = block(history, "data-history-delete-confirm=\"\"", "</AlertDialog>");
    expect(dialog).toContain("取消");
    expect(dialog).toContain("确认删除");
    expect(dialog).toContain("confirmPendingDelete");
  });
});

describe("画布内点侧边栏跳出确认", () => {
  it("项目与最近两处列表都走确认入口，不再直接 navigate", () => {
    expect(shell).toContain("onClick={() => navigateFromSidebarList(`/workspace?p=${folder.id}`)}");
    expect(shell).toContain("onClick={() => navigateFromSidebarList(`/project/${board.id}`)}");
    expect(shell).not.toContain("onClick={() => navigate(`/project/${board.id}`)}");
    expect(shell).not.toContain("onClick={() => navigate(`/workspace?p=${folder.id}`)}");
  });

  it("仅在画布内弹窗；文案与是/否按钮正确，点「是」才跳转", () => {
    const guard = block(shell, "const navigateFromSidebarList", "const confirmCanvasJump");
    expect(guard).toContain('location.startsWith("/project/")');
    const dialog = block(shell, 'data-canvas-jump-confirm=""', "</AlertDialog>");
    expect(dialog).toContain("是否跳到指定画布？");
    expect(dialog).not.toContain("是否暂时跳出当前画布？");
    expect(dialog).toMatch(/>\s*否\s*</);
    expect(dialog).toMatch(/>\s*是\s*</);
    expect(dialog).toContain("onClick={confirmCanvasJump}");
  });

  it("画布→画布跳转真的换画布：Workspace 跟随 projectId 并按 id 重挂载画布", () => {
    const ws = read("client/src/pages/Workspace.tsx");
    // 旧写法 useState(() => projectId) 只取首值，/project/a → /project/b 画面不变
    expect(ws).not.toMatch(/const \[activeProjectId\] = useState\(/);
    expect(ws).toContain("}, [projectId]);");
    expect(ws).toContain("<InfiniteCanvas key={activeProjectId} projectId={activeProjectId} />");
  });
});
