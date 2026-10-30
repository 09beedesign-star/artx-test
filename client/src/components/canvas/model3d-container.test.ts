import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendContainerModels,
  findModel3DContainerAt,
  getActiveUploadingCount,
  getContainerModels,
  getModel3DSceneColors,
  isInsideModel3DViewport,
  MODEL3D_VIEWPORT_CLASS,
  partitionExpiredModels,
  removeExpiredContainerModels,
  removeContainerModel,
  setContainerModelTransform,
  isSameModel3DTransform,
  resolveModel3DShortcut,
  MODEL3D_DELETE_CONFIRM_NOTICE_ZH,
  getModelsExpiringSoon,
  formatModel3DCountdown,
  getModel3DDownloadName,
} from "./model3d-container";
import {
  MODEL3D_EXPIRED_CLEARED_NOTICE_ZH,
  MODEL3D_RETENTION_HOURS,
  MODEL3D_RETENTION_MS,
  MODEL3D_RETENTION_NOTICE_ZH,
  MODEL3D_EXPIRY_WARNING_MS,
  MODEL3D_EXPIRY_WARNING_NOTICE_ZH,
} from "@shared/model3d";

const item = (id: string) => ({
  modelId: `${id.padEnd(32, "0")}.glb`,
  modelName: `${id}.glb`,
  uploadedAt: 1,
  expiresAt: 2,
});

describe("3D 画布容器数据", () => {
  it("新容器为空；旧版单模型节点兼容为一个模型", () => {
    expect(getContainerModels({ models: [] })).toEqual([]);
    const legacy = getContainerModels({ modelId: "a.glb", modelName: "a", uploadedAt: 1, expiresAt: 2 });
    expect(legacy).toHaveLength(1);
    expect(legacy[0].modelId).toBe("a.glb");
  });

  it("追加模型按 modelId 去重", () => {
    const a = item("a");
    const next = appendContainerModels({ models: [a] }, [a, item("b")]);
    expect(next.map(m => m.modelName)).toEqual(["a.glb", "b.glb"]);
  });

  it("上传计数超过 10 分钟视为陈旧（刷新后不会一直显示上传中）", () => {
    const now = 1_000_000_000;
    expect(getActiveUploadingCount({ uploadingCount: 2, uploadingSince: now - 1000 }, now)).toBe(2);
    expect(getActiveUploadingCount({ uploadingCount: 2, uploadingSince: now - 11 * 60_000 }, now)).toBe(0);
  });

  it("落点命中容器 → 进该容器；空白处 → null（由调用方新建容器）；重叠取最上层", () => {
    const rects = [
      { id: "low", x: 0, y: 0, width: 500, height: 400 },
      { id: "top", x: 100, y: 100, width: 500, height: 400 },
    ];
    expect(findModel3DContainerAt({ x: 50, y: 50 }, rects)).toBe("low");
    expect(findModel3DContainerAt({ x: 200, y: 200 }, rects)).toBe("top");
    expect(findModel3DContainerAt({ x: 900, y: 900 }, rects)).toBeNull();
  });

  it("场景配色：浅色深灰底、深色黑底、网格浅灰", () => {
    expect(getModel3DSceneColors(true).background).toBe(0x000000);
    const light = getModel3DSceneColors(false);
    expect(light.background).not.toBe(0x000000);
    expect(light.background).toBeLessThan(0x606060);
    expect(light.gridLine).toBeGreaterThan(0xa0a0a0);
  });
});

describe("鼠标操作隔离", () => {
  it("isInsideModel3DViewport 只认 3D 视口内的元素", () => {
    // node 测试环境没有 DOM：用最小 Element 桩模拟 closest()
    class FakeElement {
      constructor(private inside: boolean) {}
      closest(sel: string) {
        return sel === `.${MODEL3D_VIEWPORT_CLASS}` && this.inside ? this : null;
      }
    }
    const g = globalThis as { Element?: unknown };
    const prev = g.Element;
    g.Element = FakeElement;
    try {
      expect(isInsideModel3DViewport(new FakeElement(true) as unknown as Element)).toBe(true);
      expect(isInsideModel3DViewport(new FakeElement(false) as unknown as Element)).toBe(false);
      expect(isInsideModel3DViewport(null)).toBe(false);
    } finally {
      g.Element = prev;
    }
  });

  const canvasSrc = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");
  const nodeSrc = readFileSync(join(__dirname, "Model3DNode.tsx"), "utf8");

  it("原始画布的中键平移 / Ctrl+滚轮缩放 / 捏合都对 3D 视口放行", () => {
    const hits = canvasSrc.match(/if \(isInsideModel3DViewport\(event\.target\)\) return;/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it("3D 视口挂 nodrag/nopan/nowheel 并拦截滚轮、右键、中键", () => {
    expect(nodeSrc).toMatch(/className=\{`nodrag nopan nowheel \$\{MODEL3D_VIEWPORT_CLASS\}`\}/);
    expect(nodeSrc).toContain('viewport.addEventListener("wheel", onWheel, { passive: false })');
    expect(nodeSrc).toContain('viewport.addEventListener("contextmenu", onContextMenu)');
    expect(nodeSrc).toContain("MIDDLE: THREE.MOUSE.PAN");
    expect(nodeSrc).toContain("<NodeResizer");
    expect(nodeSrc).toContain("GridHelper");
    // 视角必须严格跟随鼠标，不允许阻尼惯性
    expect(nodeSrc).toContain("controls.enableDamping = false");
    expect(nodeSrc).not.toMatch(/enableDamping\s*=\s*true/);
    expect(nodeSrc).not.toContain("dampingFactor");
    // FBX / OBJ 加载器已接入
    expect(nodeSrc).toContain("FBXLoader");
    expect(nodeSrc).toContain("OBJLoader");
    // 底栏留存提示：明确文案 + 强化对比
    expect(nodeSrc).toContain("`该模型仅在画布当中保存 ${MODEL3D_RETENTION_HOURS} 小时`");
    expect(nodeSrc).not.toContain("`剩余 ${");
    expect(nodeSrc).toContain('notice: isDark ? "rgba(255,255,255,0.74)" : "rgba(0,0,0,0.68)"');
    // 超限全局 toast + 空画布格式说明
    expect(canvasSrc).toContain("toast.error(MODEL3D_SIZE_LIMIT_NOTICE_ZH");
    expect(canvasSrc).toContain("`（支持 ${MODEL3D_FORMATS_LABEL}）`");
  });

  it("闪电 → 激活复用的悬浮提示词框，用发送瞬间的 3D 视角出图", () => {
    // 3D 节点：闪电派发打开事件；截图隐藏网格；拖拽结束通知刷新缩略图
    expect(nodeSrc).toContain("new CustomEvent(MODEL3D_COMPOSER_OPEN_EVENT, { detail: { nodeId: id } })");
    expect(nodeSrc).toContain("h.grid.visible = false;");
    expect(nodeSrc).toContain('controls.addEventListener("end", onControlsEnd)');
    // 画布：监听事件 + 复用同一个 AssetEditPromptBar（无框选）
    expect(canvasSrc).toContain("window.addEventListener(MODEL3D_COMPOSER_OPEN_EVENT, onOpen)");
    const bar = canvasSrc.slice(canvasSrc.indexOf("key={`model3d-composer-"));
    expect(canvasSrc).toMatch(/<AssetEditPromptBar\s+key=\{`model3d-composer-/);
    expect(bar.slice(0, 800)).toContain("regionSelectEnabled={false}");
    expect(bar.slice(0, 800)).toContain("handleModel3DComposerSubmit(");
    // 提交：发送时现截，占位带三件套防恢复守护器误判为文生图；结果新建不就地重绘
    const submit = canvasSrc.slice(
      canvasSrc.indexOf("const handleModel3DComposerSubmit"),
      canvasSrc.indexOf("const handleSingleImageToolbarAction")
    );
    expect(submit).toContain("const snapshot = captureModel3DSnapshot(nodeId);");
    expect(submit).toContain("editMode: true,");
    expect(submit).toContain("sourceImageSrc: sourceSrc,");
    expect(submit).toContain('capability: "image_edit"');
    expect(submit).toContain("VIEWPOINT_LOCK_PROMPT_ZH");
    expect(submit).toContain("buildSkillPromptContext(skill)");
    expect(submit).not.toContain("inPlaceRepaintNodeId");
  });

  it("3D 悬浮框落在容器下方 8px、左右居中、清晰可见", () => {
    // 尺寸以 resize 后的 measured/width 为准，不能先读创建时的 style
    const size = canvasSrc.slice(canvasSrc.indexOf("function getCanvasNodeSize("));
    const m3d = size.indexOf('if (node.type === "model3d")');
    expect(m3d).toBeGreaterThan(0);
    expect(m3d).toBeLessThan(size.indexOf("const measuredWidth ="));
    // 与图片节点共用锚点：下边缘 + 8、centerX 居中
    expect(canvasSrc).toContain("getNodeComposerAnchor(getCanvasNodeBounds(model3dComposerNode))");
    // 底部空间不够时先平移画布，而不是让框压进 3D 视口
    expect(canvasSrc).toContain("MODEL3D_COMPOSER_ESTIMATED_HEIGHT");
    expect(canvasSrc).toMatch(/setViewport\(\s*\{ x: vp\.x, y: vp\.y - shift/);
    // 浅色模式不透明底
    expect(canvasSrc).toContain('...(opaqueSurface && !isDark ? { background: "#f4f4f6" } : {})');
    const bar = canvasSrc.slice(canvasSrc.indexOf("key={`model3d-composer-"));
    expect(bar.slice(0, 800)).toContain("opaqueSurface");
  });

  it("创建 3D 画布放置空容器，不再弹文件框", () => {
    expect(canvasSrc).not.toContain("workspace-upload-request-model3d");
    expect(canvasSrc.match(/workspace-create-model3d-container/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("3D 模型 48 小时过期自动清除", () => {
  const m = (id: string, expiresAt: number) => ({ modelId: `${id}.glb`, modelName: id, uploadedAt: 0, expiresAt });

  it("提示文案与需求一致", () => {
    expect(MODEL3D_EXPIRED_CLEARED_NOTICE_ZH).toBe(
      "为有效利用服务器存储量，该模型已超过 48 小时，已在画布中自动清除"
    );
  });

  it("按 expiresAt 拆分；expiresAt 缺失不在前端判过期", () => {
    const { alive, expired } = partitionExpiredModels([m("a", 100), m("b", 300), m("c", 0)], 200);
    expect(expired.map(x => x.modelId)).toEqual(["a.glb"]);
    expect(alive.map(x => x.modelId)).toEqual(["b.glb", "c.glb"]);
  });

  it("移除过期模型并累计清除数量", () => {
    const next = removeExpiredContainerModels({ models: [m("a", 1), m("b", 9)] }, ["a.glb"], 5);
    expect((next.models as unknown[]).length).toBe(1);
    expect(next.expiredCleared).toEqual({ count: 1, at: 5 });
    const again = removeExpiredContainerModels(next, ["b.glb"], 6);
    expect(again.models).toEqual([]);
    expect(again.expiredCleared).toEqual({ count: 2, at: 6 });
  });

  it("旧版单模型字段也被清掉，不会复活", () => {
    const next = removeExpiredContainerModels({ modelId: "a.glb", modelName: "a", expiresAt: 1 }, ["a.glb"]);
    expect(getContainerModels(next)).toEqual([]);
  });

  it("节点接入：本地到点 + 服务端 404 expired 两条路径都清除并提示", () => {
    const nodeSrc = readFileSync(join(__dirname, "Model3DNode.tsx"), "utf8");
    expect(nodeSrc).toContain("partitionExpiredModels(models)");
    expect(nodeSrc).toContain("clearExpiredModels([item.modelId])");
    expect(nodeSrc).toContain("toast(MODEL3D_EXPIRED_CLEARED_NOTICE_ZH");
    expect(nodeSrc).toContain('data-testid="model3d-expired-cleared-notice"');
    const canvasSrc = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");
    expect(canvasSrc).toContain("expiredCleared: undefined");
  });
});

describe("3D 模型编辑：操作轴 / 快捷键 / 删除 / 回退", () => {
  const m = (id: string) => ({ modelId: `${id}.glb`, modelName: id, uploadedAt: 0, expiresAt: 0 });
  const t = (x: number) => ({
    position: [x, 0, 0] as [number, number, number],
    quaternion: [0, 0, 0, 1] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  });

  it("快捷键：W 位移 / R 旋转 / S 缩放 / Delete·Backspace 删除；带修饰键不触发", () => {
    expect(resolveModel3DShortcut({ key: "w" })).toBe("translate");
    expect(resolveModel3DShortcut({ key: "R" })).toBe("rotate");
    expect(resolveModel3DShortcut({ key: "s" })).toBe("scale");
    expect(resolveModel3DShortcut({ key: "Delete" })).toBe("delete");
    expect(resolveModel3DShortcut({ key: "Backspace" })).toBe("delete");
    expect(resolveModel3DShortcut({ key: "s", metaKey: true })).toBeNull();
    expect(resolveModel3DShortcut({ key: "z", ctrlKey: true })).toBeNull();
    expect(resolveModel3DShortcut({ key: "q" })).toBeNull();
  });

  it("姿态写回节点 data（不可变更新，历史快照不被污染）", () => {
    const before = { models: [m("a"), m("b")] };
    const after = setContainerModelTransform(before, "a.glb", t(3));
    expect((after.models as any[])[0].transform).toEqual(t(3));
    expect((before.models[0] as any).transform).toBeUndefined();
    expect(isSameModel3DTransform(t(1), t(1))).toBe(true);
    expect(isSameModel3DTransform(t(1), t(2))).toBe(false);
  });

  it("删除只移出画布数据；旧版单模型字段一并清掉", () => {
    expect(getContainerModels(removeContainerModel({ models: [m("a"), m("b")] }, "a.glb")).map(x => x.modelId)).toEqual(["b.glb"]);
    expect(getContainerModels(removeContainerModel({ modelId: "a.glb", modelName: "a" }, "a.glb"))).toEqual([]);
    expect(MODEL3D_DELETE_CONFIRM_NOTICE_ZH).toContain("不会影响");
  });

  it("接入：操作轴、右键命令条、二次确认、回退并入统一历史栈", () => {
    const nodeSrc = readFileSync(join(__dirname, "Model3DNode.tsx"), "utf8");
    const canvasSrc = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");
    expect(nodeSrc).toContain("new TransformControls(camera, renderer.domElement)");
    expect(nodeSrc).toContain('data-testid="model3d-ctx-menu"');
    expect(nodeSrc).toContain('data-testid="model3d-delete-confirm"');
    expect(nodeSrc).toContain('data-testid="model3d-undo"');
    // 删除 / 拖完操作轴 都先入画布历史栈，再改数据
    expect(nodeSrc.match(/MODEL3D_HISTORY_PUSH_EVENT/g)!.length).toBeGreaterThanOrEqual(3);
    // 快捷键在捕获阶段拦截，Delete 不会落到「删除整个 3D 画布节点」
    expect(nodeSrc).toContain('window.addEventListener("keydown", onKey, true)');
    // 截图喂 AI 时隐藏操作轴与选中框
    expect(nodeSrc).toContain("gizmoHelper.visible = false");
    // 不做单独 3D 回退分支：两事件都落到 pushHistory / undoCanvas
    expect(canvasSrc).toContain("const onPush = () => pushHistory();");
    expect(canvasSrc).toContain("const onUndo = () => undoCanvas();");
  });

  it("保存时长 48 小时；到期前 1 小时提醒", () => {
    expect(MODEL3D_RETENTION_HOURS).toBe(48);
    expect(MODEL3D_RETENTION_MS).toBe(48 * 3600 * 1000);
    expect(MODEL3D_RETENTION_NOTICE_ZH).toContain("48");
    expect(MODEL3D_RETENTION_NOTICE_ZH).not.toContain("24");
    expect(MODEL3D_EXPIRY_WARNING_MS).toBe(3600 * 1000);
    expect(MODEL3D_EXPIRY_WARNING_NOTICE_ZH).toContain("1 小时");
  });

  it("即将到期：只挑 1 小时窗口内、未过期、到期时间已知的模型，按剩余升序", () => {
    const H = 3600 * 1000;
    const now = 1_000_000_000;
    const mk = (id: string, expiresAt: number) => ({ modelId: `${id}.glb`, modelName: id, uploadedAt: 1, expiresAt });
    const list = getModelsExpiringSoon(
      [mk("far", now + 2 * H), mk("late", now + 50 * 60 * 1000), mk("soon", now + 5 * 60 * 1000), mk("gone", now - 1), mk("unknown", 0)],
      now,
      H
    );
    expect(list.map(x => x.item.modelName)).toEqual(["soon", "late"]);
    expect(list[0].remainingMs).toBe(5 * 60 * 1000);
  });

  it("倒计时格式 MM:SS，负数归零", () => {
    expect(formatModel3DCountdown(3600 * 1000)).toBe("60:00");
    expect(formatModel3DCountdown(59 * 60 * 1000 + 8 * 1000)).toBe("59:08");
    expect(formatModel3DCountdown(500)).toBe("00:01");
    expect(formatModel3DCountdown(-10)).toBe("00:00");
  });

  it("下载文件名保留扩展名、过滤非法字符", () => {
    expect(getModel3DDownloadName({ modelId: "abc.fbx", modelName: "robot.fbx" })).toBe("robot.fbx");
    expect(getModel3DDownloadName({ modelId: "abc.glb", modelName: "robot" })).toBe("robot.glb");
    expect(getModel3DDownloadName({ modelId: "abc.obj", modelName: "a/b:c" })).toBe("a_b_c.obj");
  });

  it("接入：到期提醒条含倒计时、立即下载、可取消下载", () => {
    const nodeSrc = readFileSync(join(__dirname, "Model3DNode.tsx"), "utf8");
    expect(nodeSrc).toContain('data-testid="model3d-expiry-warning"');
    expect(nodeSrc).toContain('data-testid="model3d-expiry-countdown"');
    expect(nodeSrc).toContain('data-testid="model3d-expiry-download"');
    expect(nodeSrc).toContain("取消下载");
    expect(nodeSrc).toContain("AbortController");
    expect(nodeSrc).toContain("MODEL3D_EXPIRY_WARNING_MS");
    expect(nodeSrc).not.toMatch(/24\s*小时/);
  });
});
