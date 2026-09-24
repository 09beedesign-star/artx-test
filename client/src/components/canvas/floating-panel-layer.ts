/**
 * 画布浮层面板的「层级」与「拖动位置」唯一事实源。
 *
 * ════════════════════════════════════════════════════════════════
 * 为什么要有这个文件
 * ════════════════════════════════════════════════════════════════
 *
 * 素材节点内部挂了好几个浮层面板（文字提取、提示词反推……），它们都写着
 * `zIndex: 110`。但那个 110 **跨不出节点**：
 *
 *   - 面板的 110 只在「它所在的那个素材节点」这个层叠上下文里排序；
 *   - 节点与节点之间谁压谁，由 ReactFlow 读 `node.zIndex` 决定。
 *
 * 两套标尺。结果就是：只要画布上另有一个 `node.zIndex` 更大的素材节点，
 * 它会**整块压在面板上面**，面板被遮住一半甚至全遮，而且零报错。
 *
 * ⚠️⚠️ 这个坑在本文件出现之前已经被修过一次了 —— 便签（noteOpen）在
 *    InfiniteCanvas 的 displayNodes 里被单独抬到 10000。但那是写死在
 *    一个 filter/map 里的一次性补丁，**后来新增的面板一个都没接上**，
 *    于是同一个 bug 又长了两回。本文件的存在就是把这条规则收口：
 *    以后新增浮层面板，只要往 FLOATING_PANEL_FLAGS 里加一个字段名，
 *    层级就自动对了，不需要再改 displayNodes。
 *
 * ════════════════════════════════════════════════════════════════
 * 为什么是纯函数、放在单独文件
 * ════════════════════════════════════════════════════════════════
 *
 * 本项目 vitest 跑在 `environment: "node"`，**组件渲染测不了**。
 * 把层级与拖动几何抽成不依赖 React / DOM 的纯函数，是让它们能被真正
 * 断言（而不是只能写源码字符串断言）的唯一办法。
 */

/**
 * 「这个节点开着浮层面板」的判定字段。
 *
 * ⚠️ 顺序无关，但**必须穷举**。漏一个 = 那个面板继续被覆盖且零报错。
 *    新增浮层面板时，在这里补上对应的 data 字段名。
 */
export const FLOATING_PANEL_FLAGS = [
  "noteOpen",
  "extractedTextPanelOpen",
  "reversePromptPanelOpen",
] as const;

export type FloatingPanelFlag = (typeof FLOATING_PANEL_FLAGS)[number];

/**
 * 开着浮层面板的节点被抬到的层级。
 *
 * 取 10000 是沿用便签原有的值，保持行为逐位一致；同时它远高于
 * 正常节点的 zIndex（`nextCanvasTopZ` 从 0 递增，实际是几十上百的量级），
 * 所以「开着面板的节点」一定压在「没开面板的节点」上面。
 */
export const FLOATING_PANEL_NODE_Z = 10000;

type NodeLike = {
  type?: string;
  zIndex?: number;
  data?: unknown;
};

/**
 * 这个节点是否开着浮层面板。
 *
 * ⚠️ 只认 `asset` 类型：浮层面板目前全部挂在素材节点上。若以后别的节点
 *    也挂面板，这里要放宽，但同时必须确认那种节点的 zIndex 语义一致。
 */
export function hasOpenFloatingPanel(node: NodeLike): boolean {
  if (node.type !== "asset") return false;
  const data = node.data;
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return FLOATING_PANEL_FLAGS.some(flag => Boolean(record[flag]));
}

/**
 * 算出节点最终该用的 zIndex。
 *
 * ⚠️ 用 `Math.max` 而不是直接赋值：节点自己的 zIndex 可能已经被
 *    「置于顶层」之类的操作抬得更高，直接赋值会把它压回去。
 */
export function resolveNodeZIndex(node: NodeLike): number | undefined {
  const own = typeof node.zIndex === "number" ? node.zIndex : undefined;
  if (!hasOpenFloatingPanel(node)) return own;
  return Math.max(FLOATING_PANEL_NODE_Z, own ?? 0);
}

/**
 * 把「开着面板的节点」排到数组末尾，并抬高它们的 zIndex。
 *
 * ⚠️⚠️ 数组顺序和 zIndex **两者都要动**：ReactFlow 同时用节点数组顺序
 *    和 zIndex 参与绘制（见 applyCanvasLayerAction 的注释）。只改 zIndex
 *    在部分版本上不生效，只改顺序则会被 zIndex 反压回去。
 *
 * ⚠️ 同组内部保持原有相对顺序（稳定），否则两个节点同时开着面板时，
 *    它们的前后关系会在每次 render 之间抖动。
 */
export function orderNodesForFloatingPanels<T extends NodeLike>(nodes: T[]): T[] {
  const plain: T[] = [];
  const elevated: T[] = [];
  for (const node of nodes) {
    if (hasOpenFloatingPanel(node)) {
      elevated.push({ ...node, zIndex: resolveNodeZIndex(node) } as T);
    } else {
      plain.push(node);
    }
  }
  return [...plain, ...elevated];
}

/* ════════════════════════════════════════════════════════════════
 * 浮层面板拖动
 * ════════════════════════════════════════════════════════════════ */

export type PanelPosition = { left: number; top: number };

export type PanelDragOrigin = {
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
};

/**
 * 缩放下限。与 InfiniteCanvas 里 `stableUiScale = 1 / Math.max(0.2, zoom)`
 * 的下限保持一致 —— 两处不一致的话，极小缩放时鼠标位移和面板位移会对不上。
 */
export const MIN_DRAG_ZOOM = 0.2;

/**
 * 鼠标位移 → 面板新位置。
 *
 * ⚠️⚠️ **必须除以 zoom**。面板的 `left/top` 是画布坐标（节点内部坐标系），
 *    而 `event.clientX/Y` 是屏幕像素。画布缩小到 50% 时，鼠标走 100 屏幕像素
 *    对应画布里 200 —— 不除 zoom，面板就会「跟不上鼠标」，缩放越小越明显，
 *    而且这种错位不报错，只是手感不对。
 *
 * ⚠️ zoom 要夹下限：zoom 传 0 或负数时除法会得到 Infinity / 反向位移。
 */
export function nextPanelPosition(
  origin: PanelDragOrigin,
  clientX: number,
  clientY: number,
  zoom: number
): PanelPosition {
  const safeZoom = Math.max(MIN_DRAG_ZOOM, Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  return {
    left: origin.startLeft + (clientX - origin.startClientX) / safeZoom,
    top: origin.startTop + (clientY - origin.startClientY) / safeZoom,
  };
}

/**
 * 面板默认停靠位置：图片右侧留 14px 间隙。
 *
 * ⚠️ 间隙要乘 stableUiScale。面板整体套了 `transform: scale(stableUiScale)`
 *    做反缩放（让它在任意画布缩放下都保持同样的屏幕大小），间隙不跟着缩放，
 *    缩放变化时面板和图片之间的空隙就会忽宽忽窄。
 */
export function defaultPanelLeft(displayWidth: number, stableUiScale: number): number {
  return displayWidth + 14 * stableUiScale;
}

/**
 * 拖动是否应该被这次 pointerdown 触发。
 *
 * ⚠️⚠️ 交互元素上必须**不**起拖：标题栏里有关闭按钮，正文里有 textarea。
 *    不排除的话，用户点关闭按钮的瞬间会先进入拖动态，轻微抖一下手
 *    面板就跑了，而按钮的 click 还照常触发 —— 表现为「点关闭时面板乱跳」。
 *
 * ⚠️ 只认左键（button === 0）。右键要留给上下文菜单，中键留给平移。
 */
export const PANEL_DRAG_IGNORE_SELECTOR = "button,input,textarea,select,a,[data-panel-no-drag]";

export function shouldStartPanelDrag(
  button: number,
  isInteractiveTarget: boolean
): boolean {
  return button === 0 && !isInteractiveTarget;
}

/* ════════════════════════════════════════════════════════════════
 * 智能文案编辑面板 ↔ 悬浮提示词条（AssetEditPromptBar）：前后层切换
 * ════════════════════════════════════════════════════════════════
 *
 * 文案面板 2026-09-21 起 portal 到画布根容器渲染。原因：它原来渲染在
 * 节点内部，zIndex 写到天上去也被 ReactFlow viewport 的 transform 关在
 * 节点的层叠上下文里（本文件头注释说的「两套标尺」），永远压不住画布
 * 根层级的 AssetEditPromptBar（106）。portal 之后两个面板共用画布根这
 * 一个层叠上下文，z 值才真正可比。
 *
 * 切换语义：点中谁谁在最前面，另一个退到后面但保持可见可交互。
 * 切换信号走 window CustomEvent（面板与提示条分属不同组件子树，没有
 * 共同的就近父级 state；项目既有模式如 asset-regenerate-request）。
 */

/** 文案面板被点中，要求置前。 */
export const COPY_PANEL_FRONT_EVENT = "artx-copy-panel-front";
/** 悬浮提示条被点中（或文案面板关闭归还），要求置前。 */
export const PROMPT_BAR_FRONT_EVENT = "artx-prompt-bar-front";

/** 文案面板在前。110 沿用它在节点内时的旧值，语义仍是「比提示条靠前」。 */
export const COPY_PANEL_FRONT_Z = 110;
/** 文案面板退后。必须低于 PROMPT_BAR_FRONT_Z。 */
export const COPY_PANEL_BACK_Z = 100;
/** 悬浮提示条在前（历史默认值，未切换时行为与旧版逐位一致）。 */
export const PROMPT_BAR_FRONT_Z = 106;
/** 悬浮提示条退后。必须低于 COPY_PANEL_FRONT_Z。 */
export const PROMPT_BAR_BACK_Z = 100;

export function resolveCopyPanelZIndex(panelFront: boolean): number {
  return panelFront ? COPY_PANEL_FRONT_Z : COPY_PANEL_BACK_Z;
}

export function resolvePromptBarZIndex(promptBarOnTop: boolean): number {
  return promptBarOnTop ? PROMPT_BAR_FRONT_Z : PROMPT_BAR_BACK_Z;
}

/**
 * portal 后文案面板需要的补偿缩放。
 *
 * 面板在节点内时的总屏幕缩放 = zoom × stableUiScale
 * （stableUiScale = 1/max(0.2, zoom)，见 AssetNodeComponent）。
 * portal 出节点后 zoom 那一层没了，这里把它补回来：
 * zoom ≥ 0.2 时恒为 1（与旧行为逐位一致），zoom < 0.2 时为 zoom/0.2。
 */
export function copyPanelScreenScale(zoom: number): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 0;
  const denom = Math.max(MIN_DRAG_ZOOM, safeZoom || 1);
  return safeZoom / denom;
}

/* ════════════════════════════════════════════════════════════════
 * 节点命令条 ↔ 顶部工具盘：不许重叠
 * ════════════════════════════════════════════════════════════════
 *
 * 事故（2026-09-23 本地点测时抓到，用户也会遇到）：
 * 「画板一键规整」按钮点不动。Playwright 真实点击直接超时，
 * `document.elementFromPoint(按钮中心)` 返回的是**顶部工具盘的「铅笔」按钮**。
 *
 * 根因是两个数字撞上了，两边单看都"没错"：
 *   · 顶部工具盘：`top: 68`、高约 44 → 占据屏幕 y ∈ [68, 112]，zIndex 110
 *   · 节点命令条：贴在所选节点上方，贴顶时被夹到 `minTop = 8 + 44 = 52`
 *     → 占据 y ∈ [52, 96]，zIndex **也是 110**
 *
 * 区间 [68, 96] 重叠，且 z-index 相同 —— CSS 规则是「同层后来者在上」，
 * 工具盘在 DOM 里更靠后，于是它赢了。命令条画得出来、看得见、
 * `getBoundingClientRect` 一切正常，**只是点不到**。
 *
 * 📌⭐⭐⭐ 判据：**「元素存在 + 可见 + 有尺寸」都不等于「点得到」。**
 *    验可点击性唯一可靠的办法是 `elementFromPoint(中心)` 回指自己，
 *    或用带命中检测的真实点击（Playwright locator.click）。合成
 *    `el.click()` 会绕过命中检测 —— 它照样"成功"，所以测不出这个 bug。
 *
 * 📌⭐⭐ 判据：同一屏上两个浮层写同一个 zIndex，等于把层级交给 DOM 顺序
 *    这种隐式的东西决定。要么给出明确高低，要么保证几何不重叠。
 *    这里选后者：命令条本来就该避开工具盘，重叠着也没法用。
 */

/** 顶部工具盘的上边缘（与 InfiniteCanvas 里 `top: 68` 必须一致）。 */
export const CANVAS_TOOL_PALETTE_TOP = 68;

/** 顶部工具盘的高度估值（含内边距，按实测 40 + 边框余量取 44）。 */
export const CANVAS_TOOL_PALETTE_HEIGHT = 44;

/** 命令条与工具盘之间至少留的间距。 */
export const TOOLBAR_PALETTE_CLEARANCE = 8;

/**
 * 节点命令条被夹到视口顶部时允许的最小 `top`（屏幕坐标）。
 *
 * 语义：命令条用 `translateY(-100%)` 定位，所以它的**底边**就是这个 top 值；
 * 返回值保证底边落在工具盘下沿之下，整条不与工具盘相交。
 *
 * @param toolbarHeight 命令条自身高度（屏幕像素）
 * @param viewportPadding 距视口顶部的最小留白
 */
export function minNodeToolbarTop(
  toolbarHeight: number,
  viewportPadding: number
): number {
  /*
   * ⚠️ 两条下限取**较大**者，不是二选一：
   *   · 视口下限：光贴着视口顶还不够，命令条自身高度要能放下（老逻辑）
   *   · 工具盘下限：底边必须在工具盘下沿 + 间距之下（本次新增）
   * 少了前者会飞出视口，少了后者会被工具盘吃掉点击 —— 都必须同时满足。
   */
  const viewportFloor = viewportPadding + toolbarHeight;
  const paletteFloor =
    CANVAS_TOOL_PALETTE_TOP +
    CANVAS_TOOL_PALETTE_HEIGHT +
    TOOLBAR_PALETTE_CLEARANCE +
    toolbarHeight;
  return Math.max(viewportFloor, paletteFloor);
}

/**
 * 命令条与顶部工具盘是否相交（测试与自检用的判据）。
 *
 * `top` 是命令条**底边**的屏幕 y（配合 translateY(-100%)）。
 */
export function overlapsToolPalette(top: number, toolbarHeight: number): boolean {
  const barBottom = top;
  const barTop = top - toolbarHeight;
  const paletteTop = CANVAS_TOOL_PALETTE_TOP;
  const paletteBottom = CANVAS_TOOL_PALETTE_TOP + CANVAS_TOOL_PALETTE_HEIGHT;
  return barTop < paletteBottom && barBottom > paletteTop;
}
