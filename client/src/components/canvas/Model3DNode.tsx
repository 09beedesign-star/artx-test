import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { NodeResizer, useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { AlarmClock, Box, Download, FolderOpen, Focus, Move3d, X, Rotate3d, Scale3d, Trash2, Undo2, Zap } from "lucide-react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// ⚠️ three 没有 loaders 目录的 index 入口，必须按文件路径（带 .js）导入。
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  MODEL3D_FORMATS_LABEL,
  MODEL3D_FORMAT_NOTICE_ZH,
  MODEL3D_EXPIRED_CLEARED_NOTICE_ZH,
  MODEL3D_EXPIRY_WARNING_MS,
  MODEL3D_EXPIRY_WARNING_NOTICE_ZH,
  MODEL3D_RETENTION_HOURS,
  getModel3DExtension,
} from "@shared/model3d";
import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "@/lib/api-base-url";
import { readModel3DAuthToken } from "@/lib/model3d-client";
import {
  MODEL3D_CONTAINER_MIN_HEIGHT,
  MODEL3D_CONTAINER_MIN_WIDTH,
  MODEL3D_VIEWPORT_CLASS,
  getActiveUploadingCount,
  getContainerModels,
  getModel3DSceneColors,
  isSameModel3DTransform,
  MODEL3D_DELETE_CONFIRM_NOTICE_ZH,
  formatModel3DCountdown,
  getModel3DDownloadName,
  getModelsExpiringSoon,
  partitionExpiredModels,
  removeContainerModel,
  removeExpiredContainerModels,
  resolveModel3DShortcut,
  setContainerModelTransform,
  type Model3DItem,
  type Model3DTransform,
  type Model3DTransformMode,
} from "./model3d-container";

interface Model3DNodeProps {
  id: string;
  data: Record<string, unknown>;
  selected: boolean;
}

/** 让 InfiniteCanvas 打开文件选择框，选中的模型加载到指定的容器里。 */
export const MODEL3D_CONTAINER_PICK_EVENT = "model3d-container-pick";

/**
 * 点 3D 画布右上角闪电 → 让 InfiniteCanvas 选中该容器并激活下方的悬浮提示词框
 * （与图片节点下方的悬浮框是同一个组件 AssetEditPromptBar）。
 */
export const MODEL3D_COMPOSER_OPEN_EVENT = "model3d-composer-open";

/** 3D 视角一次拖拽结束（OrbitControls end）→ 悬浮输入框里的「已引用」缩略图跟着刷新。 */
export const MODEL3D_VIEW_CHANGE_EVENT = "model3d-view-change";

/**
 * 3D 画布里的位移/旋转/缩放/删除**改数据之前**派发 → InfiniteCanvas 调 pushHistory()。
 * 回退步数并入画布统一的历史栈，不做单独的 3D 回退分支。
 */
export const MODEL3D_HISTORY_PUSH_EVENT = "model3d-history-push";
/** 3D 画布标题栏的回退按钮 → InfiniteCanvas 调 undoCanvas()（与 ⌘/Ctrl+Z 同一个入口）。 */
export const MODEL3D_UNDO_EVENT = "model3d-undo";

const TRANSFORM_MODE_LABEL: Record<Model3DTransformMode, string> = {
  translate: "位移",
  rotate: "旋转",
  scale: "缩放",
};

function readTransform(obj: THREE.Object3D): Model3DTransform {
  return {
    position: obj.position.toArray() as [number, number, number],
    quaternion: obj.quaternion.toArray() as [number, number, number, number],
    scale: obj.scale.toArray() as [number, number, number],
  };
}

function applyTransform(obj: THREE.Object3D, t: Model3DTransform) {
  obj.position.fromArray(t.position);
  obj.quaternion.fromArray(t.quaternion);
  obj.scale.fromArray(t.scale);
  obj.updateMatrixWorld(true);
}

export type Model3DSnapshot = {
  /** JPEG dataURL */
  src: string;
  /** 视口 CSS 尺寸（决定生成图的画幅与落位尺寸） */
  width: number;
  height: number;
};

/**
 * 每个 3D 容器把「截取当前视角」的能力登记在这里，提交生成时由 InfiniteCanvas
 * 按 nodeId 现取 —— 必须在**点发送那一刻**截图，而不是打开输入框时：
 * 用户打开输入框后往往还会继续转视角，取早了就是旧视角，且零报错。
 */
const snapshotRegistry = new Map<string, () => Model3DSnapshot | null>();

/** 截取指定 3D 容器当前视角（不含网格）；容器不存在或没有模型时返回 null。 */
export function captureModel3DSnapshot(nodeId: string): Model3DSnapshot | null {
  const capture = snapshotRegistry.get(nodeId);
  if (!capture) return null;
  try {
    return capture();
  } catch {
    return null;
  }
}

type SceneHandles = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  grid: THREE.GridHelper;
  modelRoot: THREE.Group;
  transform: TransformControls;
  /** 选中模型的包围框高亮；未选中时为 null。 */
  selectionBox: THREE.BoxHelper | null;
};

type Model3DCtxMenu = { x: number; y: number; modelId: string };

/**
 * 3D 画布容器。
 *
 * 鼠标操作完全隔离：
 * - 视口（.model3d-viewport）内：左键旋转、中键/右键平移、滚轮推拉镜头（改变模型与相机的距离）；
 *   事件都在视口里拦截，不会传给原始画布。InfiniteCanvas 的捕获阶段监听器
 *   也会对这个 class 直接放行。
 * - 视口外（标题栏、边框）：属于原始画布，可以拖动节点；选中后拖动四角/四边可以调整容器大小。
 */
export function Model3DNode({ id, data, selected }: Model3DNodeProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const viewportRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<SceneHandles | null>(null);

  const models = useMemo(() => getContainerModels(data), [data]);
  const modelsKey = models.map(m => m.modelId).join("|");
  const uploadingCount = getActiveUploadingCount(data);

  const [loadingCount, setLoadingCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const { setNodes } = useReactFlow();
  const expiredCleared = data.expiredCleared as { count?: number } | undefined;

  /**
   * 超过保留期（48h）的模型：服务器端已经/即将删除文件，前端同步把它从容器里移除，
   * 并在容器内常驻提示 + 弹一次全局 toast。两条触发路径：
   *  ① 本地按 expiresAt 判定（打开画布时 / 页面一直开着到点）；
   *  ② 下载时服务端返回 404 + expired（时钟偏差、旧数据没有 expiresAt 等兜底）。
   */
  const clearExpiredModels = useCallback(
    (modelIds: string[]) => {
      if (modelIds.length === 0) return;
      setNodes(nds =>
        nds.map(n =>
          n.id === id && n.type === "model3d"
            ? { ...n, data: removeExpiredContainerModels(n.data as Record<string, unknown>, modelIds) }
            : n
        )
      );
      toast(MODEL3D_EXPIRED_CLEARED_NOTICE_ZH, { id: "model3d-expired-cleared", duration: 5000 });
    },
    [id, setNodes]
  );

  const loadedRef = useRef(new Map<string, THREE.Object3D>());
  /** 加载时自动摆放的初始姿态；data 里没有 transform（回退到最初）时用它复原。 */
  const initialTransformRef = useRef(new Map<string, Model3DTransform>());
  /** 每加载完一个模型 +1，让操作轴 effect 在模型真正进场后再挂上。 */
  const [loadedTick, setLoadedTick] = useState(0);

  // ── 模型选中 / 操作轴 / 右键命令条 / 删除确认 ──
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<Model3DTransformMode>("translate");
  const [ctxMenu, setCtxMenu] = useState<Model3DCtxMenu | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // 场景初始化 effect 只跑一次，事件回调通过 ref 读最新值。
  const selectedModelIdRef = useRef<string | null>(null);
  selectedModelIdRef.current = selectedModelId;
  const modelsRef = useRef(models);
  modelsRef.current = models;

  const patchContainer = useCallback(
    (patch: (data: Record<string, unknown>) => Record<string, unknown>) => {
      setNodes(nds =>
        nds.map(n =>
          n.id === id && n.type === "model3d"
            ? { ...n, data: patch((n.data || {}) as Record<string, unknown>) }
            : n
        )
      );
    },
    [id, setNodes]
  );

  /** 改数据前入画布统一历史栈（不另起 3D 回退分支）。 */
  const pushCanvasHistory = useCallback(() => {
    window.dispatchEvent(new CustomEvent(MODEL3D_HISTORY_PUSH_EVENT, { detail: { nodeId: id } }));
  }, [id]);

  const handleUndo = useCallback(() => {
    window.dispatchEvent(new CustomEvent(MODEL3D_UNDO_EVENT, { detail: { nodeId: id } }));
  }, [id]);

  /** 选中模型并切到指定操作轴；同时选中外层 3D 画布节点，让键盘快捷键有归属。 */
  const selectModel = useCallback(
    (modelId: string | null, mode?: Model3DTransformMode) => {
      setSelectedModelId(modelId);
      if (mode) setTransformMode(mode);
      if (modelId) {
        setNodes(nds =>
          nds.some(n => n.id === id && !n.selected) || nds.some(n => n.id !== id && n.selected)
            ? nds.map(n => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id }))
            : nds
        );
      }
    },
    [id, setNodes]
  );

  const selectModelRef = useRef(selectModel);
  selectModelRef.current = selectModel;

  const requestDelete = useCallback((modelId: string) => {
    setCtxMenu(null);
    setPendingDeleteId(modelId);
  }, []);

  const confirmDelete = useCallback(() => {
    const modelId = pendingDeleteId;
    setPendingDeleteId(null);
    if (!modelId) return;
    pushCanvasHistory();
    patchContainer(d => removeContainerModel(d, modelId));
    setSelectedModelId(cur => (cur === modelId ? null : cur));
    toast("已从 3D 画布中删除模型", { description: "原本的模型文件不受影响，可用回退恢复" });
  }, [patchContainer, pendingDeleteId, pushCanvasHistory]);

  // 外层节点取消选中 → 模型也取消选中（与画布「点空白取消选中」一致）。
  useEffect(() => {
    if (!selected) {
      setSelectedModelId(null);
      setCtxMenu(null);
    }
  }, [selected]);

  // 选中的模型被删除 / 回退掉了 → 清掉选中态。
  useEffect(() => {
    if (selectedModelId && !models.some(m => m.modelId === selectedModelId)) {
      setSelectedModelId(null);
    }
  }, [models, selectedModelId]);

  // 操作轴挂载 / 模式切换 / 选中高亮框
  useEffect(() => {
    const h = handlesRef.current;
    if (!h) return;
    const obj = selectedModelId ? loadedRef.current.get(selectedModelId) : undefined;
    if (h.selectionBox) {
      h.scene.remove(h.selectionBox);
      h.selectionBox.geometry.dispose();
      (h.selectionBox.material as THREE.Material).dispose();
      h.selectionBox = null;
    }
    if (!obj) {
      h.transform.detach();
      return;
    }
    h.transform.setMode(transformMode);
    h.transform.attach(obj);
    const box = new THREE.BoxHelper(obj, 0xa78bfa);
    h.scene.add(box);
    h.selectionBox = box;
  }, [selectedModelId, transformMode, loadedTick]);

  // 快捷键：W 位移 / R 旋转 / S 缩放 / Delete·Backspace 删除（仅在 3D 画布选中且有选中模型时生效）
  useEffect(() => {
    if (!selected || !selectedModelId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const action = resolveModel3DShortcut(e);
      if (!action) return;
      if (pendingDeleteId) {
        // 确认框开着：吞掉快捷键，尤其不能让 Delete 落到画布「删除整个 3D 画布节点」。
        e.stopImmediatePropagation();
        return;
      }
      // 捕获阶段拦截：Delete/Backspace 不能落到画布「删除整个节点」的全局处理里。
      e.preventDefault();
      e.stopImmediatePropagation();
      if (action === "delete") requestDelete(selectedModelId);
      else setTransformMode(action);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pendingDeleteId, requestDelete, selected, selectedModelId]);

  // 右键命令条：点外部 / Esc 关闭
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-model3d-ctx-menu]")) return;
      setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  // ── 删除前 1 小时：倒计时提醒 + 立即下载到本地（可取消） ──
  const [now, setNow] = useState(() => Date.now());
  const [dismissedWarnIds, setDismissedWarnIds] = useState<string[]>([]);
  const [download, setDownload] = useState<{ modelId: string; percent: number | null } | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const warnedToastIdsRef = useRef(new Set<string>());

  const expiringSoon = useMemo(
    () => getModelsExpiringSoon(models, now, MODEL3D_EXPIRY_WARNING_MS),
    [models, now]
  );
  const warnTarget = expiringSoon.find(x => !dismissedWarnIds.includes(x.item.modelId)) ?? null;

  useEffect(() => {
    if (expiringSoon.length > 0) {
      // 进入 1 小时窗口：每秒走一次倒计时。
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }
    // 还没进窗口：在最早一个模型进入窗口的那一刻唤醒。
    const nextWarnAt = Math.min(
      ...models.map(m => (m.expiresAt > 0 ? m.expiresAt - MODEL3D_EXPIRY_WARNING_MS : Infinity))
    );
    if (!Number.isFinite(nextWarnAt)) return;
    const delay = Math.min(Math.max(0, nextWarnAt - Date.now()) + 500, 2 ** 31 - 1);
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [expiringSoon.length, models]);

  // 每个模型进入窗口时弹一次全局提醒（容器不在视野里也能看到）。
  useEffect(() => {
    for (const { item } of expiringSoon) {
      if (warnedToastIdsRef.current.has(item.modelId)) continue;
      warnedToastIdsRef.current.add(item.modelId);
      toast(`「${item.modelName}」即将被删除`, {
        id: `model3d-expiry-warning-${item.modelId}`,
        description: MODEL3D_EXPIRY_WARNING_NOTICE_ZH,
        duration: 10000,
        action: { label: "立即下载", onClick: () => downloadModelRef.current(item) },
      });
    }
  }, [expiringSoon]);

  const downloadModel = useCallback(async (item: Model3DItem) => {
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setDownload({ modelId: item.modelId, percent: 0 });
    try {
      const res = await fetch(
        `${getCanvasApiBaseUrl()}/api/models3d/${encodeURIComponent(item.modelId)}`,
        { headers: { Authorization: `Bearer ${readModel3DAuthToken()}` }, signal: controller.signal }
      );
      if (res.status === 404) throw new ExpiredModelError("模型已过期");
      if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）`);
      const total = Number(res.headers.get("Content-Length")) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setDownload({ modelId: item.modelId, percent: total ? Math.round((received / total) * 100) : null });
      }
      const url = URL.createObjectURL(new Blob(chunks as BlobPart[]));
      const a = document.createElement("a");
      a.href = url;
      a.download = getModel3DDownloadName(item);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast("模型已下载到本地", { description: getModel3DDownloadName(item) });
      setDismissedWarnIds(ids => (ids.includes(item.modelId) ? ids : [...ids, item.modelId]));
    } catch (err) {
      if (controller.signal.aborted) {
        toast("已取消下载");
      } else if (err instanceof ExpiredModelError) {
        clearExpiredModels([item.modelId]);
      } else {
        toast("模型下载失败", { description: err instanceof Error ? err.message : "请稍后重试" });
      }
    } finally {
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
        setDownload(null);
      }
    }
  }, [clearExpiredModels]);
  const downloadModelRef = useRef(downloadModel);
  downloadModelRef.current = downloadModel;

  const cancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
  }, []);

  useEffect(() => () => downloadAbortRef.current?.abort(), []);

  useEffect(() => {
    const { expired } = partitionExpiredModels(models);
    if (expired.length > 0) {
      clearExpiredModels(expired.map(m => m.modelId));
      return;
    }
    const next = Math.min(...models.map(m => (m.expiresAt > 0 ? m.expiresAt : Infinity)));
    if (!Number.isFinite(next)) return;
    // setTimeout 上限约 24.8 天，48h 保留期远小于它；+1s 避免边界上判成“还没到”。
    const delay = Math.min(Math.max(0, next - Date.now()) + 1000, 2 ** 31 - 1);
    const timer = window.setTimeout(() => {
      clearExpiredModels(partitionExpiredModels(models).expired.map(m => m.modelId));
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsKey, clearExpiredModels]);

  const ui = {
    border: selected ? "oklch(0.65 0.22 290)" : isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)",
    chrome: isDark ? "#121216" : "#f4f4f6",
    text: isDark ? "#c4c4ca" : "#1c1c28",
    sub: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
    divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    // 留存提示比普通辅助文字强化一档：两种主题下对比度都提高，但不抢主信息。
    notice: isDark ? "rgba(255,255,255,0.74)" : "rgba(0,0,0,0.68)",
  };

  // ── 场景初始化：只跟容器生命周期走，模型增减不重建 WebGL 上下文 ──
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      // 截图喂给 AI 生成需要它，只能在创建上下文时指定。
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const w0 = Math.max(1, viewport.clientWidth);
    const h0 = Math.max(1, viewport.clientHeight);
    renderer.setSize(w0, h0);
    Object.assign(renderer.domElement.style, {
      display: "block",
      width: "100%",
      height: "100%",
    });
    viewport.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, w0 / h0, 0.01, 10000);
    camera.position.set(6, 5, 8);

    const controls = new OrbitControls(camera, renderer.domElement);
    // 关闭阻尼：视角严格跟随鼠标，松开左键立即停止，不留惯性晃动。
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    // 左键旋转，中键平移，右键也是平移（触控板用户没有中键）。
    // 滚轮由 OrbitControls 处理推拉（dolly），即改变模型与相机的距离。
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.zoomToCursor = true;
    controls.minDistance = 0.05;
    controls.maxDistance = 5000;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444450, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 10, 7);
    scene.add(key);

    const colors = getModel3DSceneColors(isDark);
    scene.background = new THREE.Color(colors.background);
    const grid = new THREE.GridHelper(20, 20, colors.gridCenter, colors.gridLine);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    scene.add(grid);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    // 操作轴：W 位移 / R 旋转 / S 缩放。拖轴时停用轨道控制，避免同时转视角。
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.9);
    const gizmo = transform.getHelper();
    scene.add(gizmo);

    handlesRef.current = { scene, camera, renderer, controls, grid, modelRoot, transform, selectionBox: null };

    let dragStart: Model3DTransform | null = null;
    const onDraggingChanged = (e: { value: unknown }) => {
      controls.enabled = !e.value;
    };
    const onTransformDown = () => {
      dragStart = transform.object ? readTransform(transform.object) : null;
    };
    const onTransformChange = () => {
      handlesRef.current?.selectionBox?.update();
    };
    const onTransformUp = () => {
      const obj = transform.object;
      const modelId = selectedModelIdRef.current;
      if (!obj || !modelId || !dragStart) return;
      const next = readTransform(obj);
      if (isSameModel3DTransform(dragStart, next)) return;
      dragStart = null;
      // 先入历史栈（此刻节点 data 还是拖动前的姿态），再写回新姿态。
      window.dispatchEvent(new CustomEvent(MODEL3D_HISTORY_PUSH_EVENT, { detail: { nodeId: id } }));
      setNodes(nds =>
        nds.map(n =>
          n.id === id && n.type === "model3d"
            ? { ...n, data: setContainerModelTransform(n.data as Record<string, unknown>, modelId, next) }
            : n
        )
      );
    };
    transform.addEventListener("dragging-changed", onDraggingChanged);
    transform.addEventListener("mouseDown", onTransformDown);
    transform.addEventListener("objectChange", onTransformChange);
    transform.addEventListener("mouseUp", onTransformUp);

    // 点选模型：按下与抬起位移 < 4px 才算「点」，否则是转视角 / 平移。
    const raycaster = new THREE.Raycaster();
    const pickModelAt = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(modelRoot.children, true)[0];
      if (!hit) return null;
      let found: string | null = null;
      loadedRef.current.forEach((obj, mid) => {
        if (found) return;
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (o === obj) {
            found = mid;
            return;
          }
          o = o.parent;
        }
      });
      return found;
    };
    let down: { x: number; y: number; button: number } | null = null;
    const onPickDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
    };
    const onPickUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.button !== e.button) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      if (e.button === 0) {
        // 刚拖完操作轴的那次抬起不算点选。
        if (transform.dragging || transform.axis) return;
        selectModelRef.current(pickModelAt(e.clientX, e.clientY));
        setCtxMenu(null);
      } else if (e.button === 2) {
        const mid = pickModelAt(e.clientX, e.clientY);
        if (!mid) {
          setCtxMenu(null);
          return;
        }
        selectModelRef.current(mid);
        const rect = viewport.getBoundingClientRect();
        // 节点被画布缩放过：clientX 差值要换算回节点内的 CSS 像素。
        const scaleX = rect.width / Math.max(1, viewport.offsetWidth);
        const scaleY = rect.height / Math.max(1, viewport.offsetHeight);
        setCtxMenu({
          x: (e.clientX - rect.left) / scaleX,
          y: (e.clientY - rect.top) / scaleY,
          modelId: mid,
        });
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPickDown);
    renderer.domElement.addEventListener("pointerup", onPickUp);

    // 登记截图能力：临时隐藏网格再渲染一帧，避免网格线被 AI 当成画面内容。
    snapshotRegistry.set(id, () => {
      const h = handlesRef.current;
      if (!h || h.modelRoot.children.length === 0) return null;
      const gridVisible = h.grid.visible;
      const gizmoHelper = h.transform.getHelper();
      const gizmoVisible = gizmoHelper.visible;
      const boxVisible = h.selectionBox?.visible ?? false;
      h.grid.visible = false;
      gizmoHelper.visible = false;
      if (h.selectionBox) h.selectionBox.visible = false;
      h.renderer.render(h.scene, h.camera);
      const src = h.renderer.domElement.toDataURL("image/jpeg", 0.92);
      h.grid.visible = gridVisible;
      gizmoHelper.visible = gizmoVisible;
      if (h.selectionBox) h.selectionBox.visible = boxVisible;
      h.renderer.render(h.scene, h.camera);
      return {
        src,
        width: Math.max(1, viewport.clientWidth),
        height: Math.max(1, viewport.clientHeight),
      };
    });
    const onControlsEnd = () => {
      window.dispatchEvent(
        new CustomEvent(MODEL3D_VIEW_CHANGE_EVENT, { detail: { nodeId: id } })
      );
    };
    controls.addEventListener("end", onControlsEnd);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const ro = new ResizeObserver(() => {
      const w = Math.max(1, viewport.clientWidth);
      const h = Math.max(1, viewport.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(viewport);

    // ── 事件隔离：视口内的指针 / 滚轮 / 右键菜单都不冒泡到原始画布 ──
    const stop = (e: Event) => e.stopPropagation();
    const onWheel = (e: WheelEvent) => {
      // 阻止页面滚动和浏览器缩放；OrbitControls 自己在 canvas 上已经处理过这次滚轮。
      e.preventDefault();
      e.stopPropagation();
    };
    const onContextMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onAux = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault(); // 防止中键自动滚动
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
      e.stopPropagation();
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", stop);
    viewport.addEventListener("mousedown", onMouseDown);
    viewport.addEventListener("auxclick", onAux);
    viewport.addEventListener("contextmenu", onContextMenu);
    viewport.addEventListener("dblclick", stop);

    return () => {
      snapshotRegistry.delete(id);
      controls.removeEventListener("end", onControlsEnd);
      transform.removeEventListener("dragging-changed", onDraggingChanged);
      transform.removeEventListener("mouseDown", onTransformDown);
      transform.removeEventListener("objectChange", onTransformChange);
      transform.removeEventListener("mouseUp", onTransformUp);
      renderer.domElement.removeEventListener("pointerdown", onPickDown);
      renderer.domElement.removeEventListener("pointerup", onPickUp);
      transform.detach();
      transform.dispose();
      scene.remove(gizmo);
      cancelAnimationFrame(raf);
      ro.disconnect();
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", stop);
      viewport.removeEventListener("mousedown", onMouseDown);
      viewport.removeEventListener("auxclick", onAux);
      viewport.removeEventListener("contextmenu", onContextMenu);
      viewport.removeEventListener("dblclick", stop);
      controls.dispose();
      disposeObject(modelRoot);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === viewport) viewport.removeChild(renderer.domElement);
      handlesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题切换只改颜色，不重建场景。
  useEffect(() => {
    const h = handlesRef.current;
    if (!h) return;
    const colors = getModel3DSceneColors(isDark);
    h.scene.background = new THREE.Color(colors.background);
    h.scene.remove(h.grid);
    h.grid.geometry.dispose();
    (h.grid.material as THREE.Material).dispose();
    const grid = new THREE.GridHelper(20, 20, colors.gridCenter, colors.gridLine);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    h.scene.add(grid);
    h.grid = grid;
  }, [isDark]);

  // ── 模型加载：按 modelsKey 增量同步，已加载过的模型不重复下载 ──
  useEffect(() => {
    const h = handlesRef.current;
    if (!h) return;
    let cancelled = false;
    const wanted = new Set(models.map(m => m.modelId));

    // 容器里被移除的模型，从场景中删掉并释放资源
    loadedRef.current.forEach((obj, mid) => {
      if (!wanted.has(mid)) {
        if (h.transform.object === obj) h.transform.detach();
        initialTransformRef.current.delete(mid);
        h.modelRoot.remove(obj);
        disposeObject(obj);
        loadedRef.current.delete(mid);
      }
    });

    const pending = models.filter(m => !loadedRef.current.has(m.modelId));
    if (pending.length === 0) return;
    setLoadingCount(c => c + pending.length);

    (async () => {
      for (const item of pending) {
        if (cancelled) return;
        try {
          const obj = await fetchModelObject(item);
          if (cancelled || !handlesRef.current) {
            disposeObject(obj);
            return;
          }
          placeModel(obj, h.modelRoot);
          initialTransformRef.current.set(item.modelId, readTransform(obj));
          // 用户调过姿态（含回退/撤销删除后重新加载）→ 按存档复原。
          const saved = modelsRef.current.find(m => m.modelId === item.modelId)?.transform;
          if (saved) applyTransform(obj, saved);
          h.modelRoot.add(obj);
          loadedRef.current.set(item.modelId, obj);
          frameAll(handlesRef.current);
          setLoadedTick(t => t + 1);
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ExpiredModelError) {
            clearExpiredModels([item.modelId]);
          } else {
            const msg = err instanceof Error ? err.message : "加载失败";
            setErrors(list => [...list, `${item.modelName}：${msg}`]);
          }
        } finally {
          if (!cancelled) setLoadingCount(c => Math.max(0, c - 1));
        }
      }
    })();

    return () => {
      cancelled = true;
      setLoadingCount(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsKey]);

  // 节点 data 里的姿态变了（回退 / 撤销）→ 同步到场景里的模型。
  useEffect(() => {
    const h = handlesRef.current;
    if (!h) return;
    for (const m of models) {
      const obj = loadedRef.current.get(m.modelId);
      if (!obj) continue;
      const target = m.transform ?? initialTransformRef.current.get(m.modelId);
      if (target && !isSameModel3DTransform(target, readTransform(obj))) applyTransform(obj, target);
    }
    h.selectionBox?.update();
  }, [models]);

  const handleFrame = useCallback(() => {
    if (handlesRef.current) frameAll(handlesRef.current);
  }, []);

  const handlePick = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(MODEL3D_CONTAINER_PICK_EVENT, { detail: { nodeId: id } })
    );
  }, [id]);

  const handleAiGenerate = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(MODEL3D_COMPOSER_OPEN_EVENT, { detail: { nodeId: id } })
    );
  }, [id]);

  const isEmpty = models.length === 0 && uploadingCount === 0;
  const busyText =
    uploadingCount > 0
      ? `正在上传 ${uploadingCount} 个模型…`
      : loadingCount > 0
        ? "正在加载模型…"
        : null;
  const minRemainingMs = models.length
    ? Math.min(...models.map(m => (m.expiresAt || 0) - Date.now()))
    : null;

  const iconBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: ui.text,
    cursor: "pointer",
    opacity: 0.75,
  };

  return (
    <>
      {/* 选中后可拖动四边 / 四角，调整 3D 画布容器尺寸 */}
      <NodeResizer
        isVisible={selected}
        minWidth={MODEL3D_CONTAINER_MIN_WIDTH}
        minHeight={MODEL3D_CONTAINER_MIN_HEIGHT}
        color="oklch(0.65 0.22 290)"
        handleStyle={{ width: 10, height: 10, borderRadius: 3 }}
      />
      <div
        data-model3d-container={id}
        className="select-none"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: 10,
          border: `2px solid ${ui.border}`,
          background: ui.chrome,
          overflow: "hidden",
          boxShadow: isDark ? "0 10px 32px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* 标题栏：属于原始画布，拖动它就是移动整个 3D 画布 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px 6px 12px",
            borderBottom: `1px solid ${ui.divider}`,
            cursor: "grab",
            minHeight: 38,
          }}
        >
          <Box size={15} color={ui.text} strokeWidth={1.8} />
          <span style={{ fontSize: 13, fontWeight: 600, color: ui.text }}>3D 画布</span>
          <span
            style={{
              fontSize: 11,
              color: ui.sub,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {models.length > 0 ? `${models.length} 个模型` : "空"}
          </span>
          <div className="nodrag" style={{ display: "flex", gap: 2 }}>
            <button
              type="button"
              data-testid="model3d-undo"
              title="回退（⌘/Ctrl+Z）"
              style={iconBtn}
              onClick={handleUndo}
            >
              <Undo2 size={15} />
            </button>
            <button type="button" title={`添加模型（${MODEL3D_FORMATS_LABEL}）`} style={iconBtn} onClick={handlePick}>
              <FolderOpen size={15} />
            </button>
            <button type="button" title="视角归位" style={iconBtn} onClick={handleFrame}>
              <Focus size={15} />
            </button>
            <button
              type="button"
              title="AI 快速渲染"
              style={{ ...iconBtn, opacity: models.length ? 0.75 : 0.3 }}
              disabled={!models.length}
              onClick={handleAiGenerate}
            >
              <Zap size={15} />
            </button>
          </div>
        </div>

        {/* 3D 视口：这里的所有鼠标操作只作用于 3D 场景 */}
        <div
          ref={viewportRef}
          className={`nodrag nopan nowheel ${MODEL3D_VIEWPORT_CLASS}`}
          style={{ position: "relative", flex: 1, minHeight: 0, cursor: "grab" }}
        >
          {isEmpty && (
            <Overlay>
              <div style={{ textAlign: "center", color: "rgba(230,230,235,0.78)" }}>
                {expiredCleared?.count ? (
                  <div
                    data-testid="model3d-expired-cleared-notice"
                    style={{
                      maxWidth: 300,
                      margin: "0 auto 14px",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(255,170,60,0.16)",
                      border: "1px solid rgba(255,170,60,0.45)",
                      color: "#ffd9a8",
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: "normal",
                    }}
                  >
                    {MODEL3D_EXPIRED_CLEARED_NOTICE_ZH}
                  </div>
                ) : null}
                <Box size={34} strokeWidth={1.3} style={{ margin: "0 auto 10px" }} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>把 {MODEL3D_FORMATS_LABEL} 模型拖到这里</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                  或点右上角的文件夹按钮选择文件
                </div>
              </div>
            </Overlay>
          )}
          {busyText && (
            <div style={chipStyle("rgba(0,0,0,0.55)")}>{busyText}</div>
          )}
          {/* 删除前 1 小时：倒计时 + 立即下载 / 取消 */}
          {warnTarget && (
            <div
              data-testid="model3d-expiry-warning"
              onPointerDown={e => e.stopPropagation()}
              onContextMenu={e => e.stopPropagation()}
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 8,
                zIndex: 4,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(40,24,6,0.92)",
                border: "1px solid rgba(255,170,60,0.6)",
                color: "#ffe2bd",
                fontSize: 12,
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              }}
            >
              <AlarmClock size={16} color="#ffb454" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  「{warnTarget.item.modelName}」将在{" "}
                  <span
                    data-testid="model3d-expiry-countdown"
                    style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#ffb454" }}
                  >
                    {formatModel3DCountdown(warnTarget.remainingMs)}
                  </span>{" "}
                  后自动删除
                </div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  {expiringSoon.length > 1
                    ? `共 ${expiringSoon.length} 个模型即将删除，请尽快下载到本地保存`
                    : "请尽快下载到本地保存"}
                </div>
              </div>
              {download?.modelId === warnTarget.item.modelId ? (
                <>
                  <span style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    下载中{download.percent !== null ? ` ${download.percent}%` : "…"}
                  </span>
                  <button type="button" onClick={cancelDownload} style={warnBtnStyle(false)}>
                    取消下载
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="model3d-expiry-download"
                    onClick={() => void downloadModel(warnTarget.item)}
                    disabled={download !== null}
                    style={warnBtnStyle(true)}
                  >
                    <Download size={13} />
                    立即下载
                  </button>
                  <button
                    type="button"
                    title="取消（暂不下载）"
                    data-testid="model3d-expiry-dismiss"
                    onClick={() =>
                      setDismissedWarnIds(ids => [...ids, warnTarget.item.modelId])
                    }
                    style={{ ...warnBtnStyle(false), padding: 4 }}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          )}
          {/* 选中模型后：左上角显示当前操作轴模式，可直接点切换 */}
          {selectedModelId && !busyText && (
            <div
              data-testid="model3d-transform-toolbar"
              onPointerDown={e => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                display: "flex",
                gap: 2,
                padding: 3,
                borderRadius: 8,
                background: "rgba(20,20,24,0.78)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {modelToolItems.map(item => (
                <button
                  key={item.key}
                  type="button"
                  title={`${item.label}（${item.shortcut}）`}
                  onClick={() =>
                    item.key === "delete"
                      ? requestDelete(selectedModelId)
                      : setTransformMode(item.key)
                  }
                  style={{
                    ...toolBtnStyle,
                    background: item.key === transformMode ? "oklch(0.65 0.22 290)" : "transparent",
                    color: item.key === "delete" ? "#ff8a8a" : "#fff",
                  }}
                >
                  <item.Icon size={14} />
                </button>
              ))}
            </div>
          )}
          {/* 右键模型 → 悬浮命令条：位移 / 旋转 / 缩放 / 删除 */}
          {ctxMenu && (
            <div
              data-model3d-ctx-menu
              data-testid="model3d-ctx-menu"
              onPointerDown={e => e.stopPropagation()}
              onContextMenu={e => e.preventDefault()}
              style={{
                position: "absolute",
                left: Math.max(4, Math.min(ctxMenu.x, (viewportRef.current?.offsetWidth ?? 9999) - 156)),
                top: Math.max(4, Math.min(ctxMenu.y, (viewportRef.current?.offsetHeight ?? 9999) - 160)),
                minWidth: 148,
                padding: 4,
                borderRadius: 8,
                background: isDark ? "#232326" : "#ffffff",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
                boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
                zIndex: 5,
              }}
            >
              {modelToolItems.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (item.key === "delete") {
                      requestDelete(ctxMenu.modelId);
                      return;
                    }
                    selectModel(ctxMenu.modelId, item.key);
                    setCtxMenu(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "6px 8px",
                    border: "none",
                    borderRadius: 6,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 12,
                    color: item.key === "delete" ? "#e5484d" : ui.text,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <item.Icon size={14} />
                  <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: ui.sub }}>{item.shortcut}</span>
                </button>
              ))}
            </div>
          )}
          {!isEmpty && expiredCleared?.count ? (
            <div
              data-testid="model3d-expired-cleared-chip"
              title={MODEL3D_EXPIRED_CLEARED_NOTICE_ZH}
              style={{ ...chipStyle("rgba(150,90,10,0.82)"), top: "auto", bottom: errors.length > 0 ? 36 : 8 }}
            >
              {expiredCleared.count > 1 ? `${expiredCleared.count} 个模型：` : ""}
              {MODEL3D_EXPIRED_CLEARED_NOTICE_ZH}
            </div>
          ) : null}
          {errors.length > 0 && (
            <div style={{ ...chipStyle("rgba(180,30,30,0.75)"), top: "auto", bottom: 8 }}>
              {errors.join("；")}
            </div>
          )}
        </div>

        {/* 底栏：操作提示与留存时间 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "5px 12px",
            borderTop: `1px solid ${ui.divider}`,
            fontSize: 10.5,
            color: ui.sub,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {selectedModelId
              ? "W 位移 · R 旋转 · S 缩放 · Delete 删除 · 右键更多"
              : "左键旋转 · 点选模型可编辑 · 中键/右键平移 · 滚轮推拉镜头"}
          </span>
          {minRemainingMs !== null && (
            <span
              data-testid="model3d-retention-notice"
              title={
                minRemainingMs > 0
                  ? `距离自动删除还剩约 ${Math.ceil(minRemainingMs / 3600000)} 小时`
                  : undefined
              }
              style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11, fontWeight: 500, color: ui.notice }}
            >
              {minRemainingMs <= 0
                ? "模型已过期"
                : `该模型仅在画布当中保存 ${MODEL3D_RETENTION_HOURS} 小时`}
            </span>
          )}
        </div>
      </div>

      {/* 删除二次确认 */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)}>
        <AlertDialogContent data-testid="model3d-delete-confirm" onPointerDown={e => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              删除模型「{models.find(m => m.modelId === pendingDeleteId)?.modelName || "3D 模型"}」？
            </AlertDialogTitle>
            <AlertDialogDescription>{MODEL3D_DELETE_CONFIRM_NOTICE_ZH}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              style={{ background: "#e5484d", color: "#fff" }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const modelToolItems: {
  key: Model3DTransformMode | "delete";
  label: string;
  shortcut: string;
  Icon: typeof Move3d;
}[] = [
  { key: "translate", label: TRANSFORM_MODE_LABEL.translate, shortcut: "W", Icon: Move3d },
  { key: "rotate", label: TRANSFORM_MODE_LABEL.rotate, shortcut: "R", Icon: Rotate3d },
  { key: "scale", label: TRANSFORM_MODE_LABEL.scale, shortcut: "S", Icon: Scale3d },
  { key: "delete", label: "删除", shortcut: "Delete", Icon: Trash2 },
];

function warnBtnStyle(primary: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    padding: "4px 10px",
    borderRadius: 6,
    border: primary ? "none" : "1px solid rgba(255,226,189,0.35)",
    background: primary ? "#ff9f2e" : "transparent",
    color: primary ? "#1d1205" : "#ffe2bd",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

const toolBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}

function chipStyle(bg: string): React.CSSProperties {
  return {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    width: "fit-content",
    maxWidth: "calc(100% - 16px)",
    margin: "0 auto",
    padding: "4px 10px",
    borderRadius: 999,
    background: bg,
    color: "#fff",
    fontSize: 11,
    pointerEvents: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

class ExpiredModelError extends Error {}

async function fetchModelObject(item: Model3DItem): Promise<THREE.Object3D> {
  const ext = getModel3DExtension(item.modelId);
  if (!ext) throw new Error(MODEL3D_FORMAT_NOTICE_ZH);
  const baseUrl = getCanvasApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/models3d/${encodeURIComponent(item.modelId)}`, {
    headers: { Authorization: `Bearer ${readModel3DAuthToken()}` },
  });
  if (!res.ok) {
    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      if (body?.expired) throw new ExpiredModelError("模型已过期");
    }
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }
  const buffer = await res.arrayBuffer();
  const resourcePath = `${baseUrl}/api/models3d/`;
  switch (ext) {
    case "fbx":
      // FBX 外部贴图无法随单文件上传，只渲染内嵌贴图；缺失的贴图三方加载器会自行忽略。
      return new FBXLoader().parse(buffer, resourcePath);
    case "obj": {
      // OBJ 不读 .mtl，统一用默认材质，保证几何体可见。
      const obj = new OBJLoader().parse(new TextDecoder().decode(buffer));
      const fallback = new THREE.MeshStandardMaterial({ color: 0xd0d0d6, roughness: 0.6, metalness: 0.05 });
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) mesh.material = fallback;
      });
      return obj;
    }
    default: {
      const gltf = await new GLTFLoader().parseAsync(buffer, resourcePath);
      return gltf.scene;
    }
  }
}

/**
 * 统一模型尺度并摆放到网格上：最长边缩放到约 4 个单位，底面贴住地面；
 * 多个模型沿 X 轴依次排开，避免互相重叠。
 */
function placeModel(obj: THREE.Object3D, root: THREE.Group) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 4 / maxDim;
  obj.scale.multiplyScalar(scale);
  const scaled = new THREE.Box3().setFromObject(obj);
  const center = scaled.getCenter(new THREE.Vector3());
  let offsetX = 0;
  if (root.children.length > 0) {
    const rootBox = new THREE.Box3().setFromObject(root);
    const width = scaled.max.x - scaled.min.x;
    offsetX = rootBox.max.x + 0.6 + width / 2;
  }
  obj.position.x += offsetX - center.x;
  obj.position.z -= center.z;
  obj.position.y -= scaled.min.y;
}

/** 视角归位：相机拉到能看到所有模型的位置；没有模型时看网格中心。 */
function frameAll(h: SceneHandles) {
  const box = new THREE.Box3().setFromObject(h.modelRoot);
  const empty = box.isEmpty();
  const center = empty ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
  const radius = empty ? 5 : box.getBoundingSphere(new THREE.Sphere()).radius;
  const fov = (h.camera.fov * Math.PI) / 180;
  const dist = (radius / Math.sin(fov / 2)) * 1.15;
  const dir = new THREE.Vector3(0.6, 0.5, 0.8).normalize();
  h.camera.position.copy(center).addScaledVector(dir, dist);
  h.camera.near = Math.max(0.01, dist / 1000);
  h.camera.far = dist * 100;
  h.camera.updateProjectionMatrix();
  h.controls.target.copy(center);
  h.controls.update();
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(m => {
      Object.values(m).forEach(v => {
        if (v instanceof THREE.Texture) v.dispose();
      });
      m.dispose();
    });
  });
}

/**
 * ⚠️ 必须与 InfiniteCanvas.getCanvasApiBaseUrl 同口径：上传走那边、下载走这边。
 */
function getCanvasApiBaseUrl(): string {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_AI_API_BASE_URL || ""
  );
  if (configured) return configured;
  return defaultApiBaseUrlForCurrentHost(
    typeof window !== "undefined" ? window.location.origin : ""
  );
}
