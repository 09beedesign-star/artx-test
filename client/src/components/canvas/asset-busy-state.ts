/**
 * 图片节点「是否正在被 AI 处理」的唯一判定（2026-09-29）。
 *
 * 需求原文：「当针对某一张图片的局部重绘正在进行时，该图片的悬浮提示词输入框，
 * 此时应当提醒用户图片正在重绘中，并且右下角的生成按钮必须要等图片生成完成之后
 * 才能继续点击。避免用户多次重复点击造成 crash。」
 *
 * 为什么抽成纯函数：同一个判定有三个消费方 ——
 *   · 悬浮提示词框（选中图片 → 节点下方）的提示条 + 发送按钮禁用；
 *   · 双击快捷编辑弹层（同一个组件，另一个入口）；
 *   · 提交链路 handleAssetEditSubmit 自己的兜底闸门（防键盘回车 / 旁路调用）。
 * 三处各写一份条件必然漂移（本项目「多个出口」已栽十四次），所以收口在这里。
 *
 * ⚠️ 失败态（isGenerationFailed）**不算忙**：失败后用户正需要重新发一次，
 *    把它算进来会让按钮永久灰掉。
 */
export type AssetBusyState = {
  busy: boolean;
  /** 提示条标题，busy=false 时为空串 */
  title: string;
  /** 提示条说明 */
  description: string;
};

export const ASSET_IDLE_STATE: AssetBusyState = {
  busy: false,
  title: "",
  description: "",
};

export function getAssetBusyState(data: unknown): AssetBusyState {
  if (!data || typeof data !== "object") return ASSET_IDLE_STATE;
  const d = data as Record<string, unknown>;
  const done = "完成后才能继续生成，请勿重复提交";
  if (d.isGeneratingImage === true) {
    if (d.inPlaceRepainting === true) {
      return { busy: true, title: "图片正在局部重绘中", description: done };
    }
    return { busy: true, title: "图片正在生成中", description: done };
  }
  if (d.isErasingImage === true) {
    return { busy: true, title: "图片正在擦除处理中", description: done };
  }
  if (d.isRemovingBackground === true) {
    return { busy: true, title: "图片正在抠图处理中", description: done };
  }
  return ASSET_IDLE_STATE;
}
