/**
 * image2.6 专属操作按钮：「生成 GIF」和「导出 SVG」。
 *
 * 用途：挂在图片节点缩略图下方（NodeToolbar 同层），只有当前节点的模型是
 * image2.6（vod-og26-*）时才渲染。按下后向外派发 CustomEvent，让
 * InfiniteCanvas 里的 handleSubmit 收到 deliverable 字段并发起出图请求。
 *
 * ⚠️ 这里只管 UI，**不持有 fetch 逻辑**：交付物逻辑的唯一事实源在
 * shared/image-deliverable.ts。
 */
import { Film, Layers } from "lucide-react";
import { isImage26ModelId } from "../../../../shared/image-models";
import type { ImageDeliverable } from "../../../../shared/image-deliverable";
import { getImageDeliverableLabel } from "../../../../shared/image-deliverable";

export const IMAGE_DELIVERABLE_REQUEST_EVENT = "canvas-image-deliverable-request";

/** 通过 CustomEvent 触发时的数据结构。 */
export type ImageDeliverableRequestDetail = {
  /** 图片节点 id，由派发方填写，以便 canvas 路由到正确的节点。 */
  nodeId: string;
  /** 当前节点使用的模型 id（vod-og26-*）。 */
  model: string;
  /** 交付物类型。 */
  deliverable: ImageDeliverable;
  /** 节点当前展示的图片 URL，作为参考图传给出图接口。 */
  currentImageSrc?: string;
};

/**
 * 派发 IMAGE_DELIVERABLE_REQUEST_EVENT，让 InfiniteCanvas 里负责提交的逻辑
 * 接收并拼入 deliverable 字段后调用 /api/images/generate 或 /api/images/tasks。
 */
export function dispatchImageDeliverableRequest(detail: ImageDeliverableRequestDetail) {
  window.dispatchEvent(new CustomEvent(IMAGE_DELIVERABLE_REQUEST_EVENT, { detail }));
}

/**
 * 单个交付物按钮（GIF / SVG）。
 */
function DeliverableButton({
  deliverable,
  onClick,
  isDark,
}: {
  deliverable: ImageDeliverable;
  onClick: () => void;
  isDark: boolean;
}) {
  const label = getImageDeliverableLabel(deliverable);
  const icon = deliverable === "gif" ? <Film size={12} strokeWidth={2.2} /> : <Layers size={12} strokeWidth={2.2} />;
  // 🔒 2026-11-13：旧版浅色模式 bg 与文字同为 #161616 → 只剩两个黑方框、字完全看不见。
  // 与「再次生成」同款：黑底白字（用户要求再次生成保持黑色，这两个跟它一致）。
  void isDark;
  const bg = "#161616";
  const hoverBg = "#2a2a2a";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 30,
        padding: "0 9px",
        borderRadius: "var(--radius-md-design)",
        border: "1px solid rgba(255,255,255,0.18)",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        cursor: "pointer",
        background: bg,
        color: "#ffffff",
        transition: "background 0.12s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = bg;
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * 图片节点交付物操作栏。model 不是 image2.6 时返回 null。
 *
 * 使用方式：
 * ```tsx
 * <ImageDeliverableActions
 *   nodeId={node.id}
 *   model={currentModel}
 *   currentImageSrc={node.data.imageSrc}
 *   isDark={isDark}
 * />
 * ```
 */
export function ImageDeliverableActions({
  nodeId,
  model,
  currentImageSrc,
  isDark,
}: {
  nodeId: string;
  model: string;
  currentImageSrc?: string;
  isDark: boolean;
}) {
  if (!isImage26ModelId(model)) return null;

  const handleClick = (deliverable: ImageDeliverable) => {
    dispatchImageDeliverableRequest({ nodeId, model, deliverable, currentImageSrc });
  };

  return (
    <div className="flex items-center gap-1.5 nodrag nopan">
      <DeliverableButton deliverable="gif" onClick={() => handleClick("gif")} isDark={isDark} />
      <DeliverableButton deliverable="svg" onClick={() => handleClick("svg")} isDark={isDark} />
    </div>
  );
}

/**
 * GIF 节点渲染助手：GIF 必须用 <img> 而不是 canvas/drawImage，
 * 否则帧动画被冻结在第一帧，且零报错。
 *
 * 已实测：腾讯 VOD 返回的 GIF URL 可以直接 <img src=... />，
 * 浏览器自动循环播放。Canvas.drawImage 则只取快照第一帧。
 */
export function isAnimatedGifSrc(src?: string): boolean {
  if (!src) return false;
  return /\.gif(?:[?#]|$)/i.test(src) || /^data:image\/gif/i.test(src);
}

export function isSvgSrc(src?: string): boolean {
  if (!src) return false;
  return /\.svg(?:[?#]|$)/i.test(src) || /^data:image\/svg\+xml/i.test(src);
}
