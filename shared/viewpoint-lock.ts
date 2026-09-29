/**
 * 视角 / 外形轮廓锁定 —— 唯一事实源（2026-09-29）。
 *
 * 用户原话：「局部重绘时原图的视角和外形轮廓不能发生任何的变化……
 * 我需要视角与原图保持完全一致。」
 *
 * ⚠️⚠️⚠️ 之前漂移的三个根因（全部零报错）：
 *   ① 前端 callLLM 改写指令写着「输出必须是一张新的结果图」→ 模型当成重画；
 *   ② 未框选时 finalPrompt 就是改写结果本身，没有任何增强后的硬约束
 *      （增强会洗掉「保持 / 不要改变 X」，记忆 cb247da）；
 *   ③ 后端 VOD 参考图路径写的是 "...camera angle... unless the user explicitly
 *      asks to change them" —— 用户一句「改成金属质感」都可能被模型读成许可；
 *      /images/edits 路径在没有参考图时干脆没有任何视角约束。
 *
 * 📌 判据：视角锁只对 camera_view（视角变换）豁免——那个能力的目的就是换视角。
 *    其余所有编辑一律上锁，默认值 = 锁（默认值反转，别让调用方逐个补）。
 */

/** 前端：加在 LLM 改写**之后**的中文硬约束。 */
export const VIEWPOINT_LOCK_PROMPT_ZH = [
  "你正在原图上做编辑，不是重新生成一张新图。",
  "以下内容必须与原图完全一致、不得有任何变化：",
  "镜头视角与拍摄方向、透视关系与消失点、焦距与畸变、取景范围与裁切、",
  "主体在画面中的位置和大小、主体及每个物体的外形轮廓与剪影边缘、姿态与朝向、整体构图。",
  "不得旋转、翻转、缩放、平移、重新构图，也不得改变任何物体的形状、比例或外轮廓。",
  "只修改用户明确要求的颜色、材质、纹理、光影或细节，其余一律保持原样。",
].join("\n");

/** 前端：LLM 改写指令里替换掉「输出必须是一张新的结果图」的那两行。 */
export const VIEWPOINT_LOCK_REWRITE_RULES_ZH = [
  "目标是在原图上做快捷编辑，不是重新生成一张新图。",
  "必须保持原图的镜头视角、透视、取景构图，以及主体和每个物体的外形轮廓完全不变，只根据用户要求修改。",
  "不要在提示词里加入任何改变视角、镜头、构图或物体形状的描述。",
];

export const VIEWPOINT_LOCK_INSTRUCTION_EN = [
  "HARD CONSTRAINT — geometry lock: this is an edit of the source image, not a new generation.",
  "Keep the camera angle, viewing direction, perspective and vanishing points, focal length, framing and crop exactly identical to the source image.",
  "Keep the subject's position and size in the frame, its pose and orientation, and the outer outline / silhouette and shape of every object exactly identical — do not rotate, flip, zoom, pan, re-compose, reshape, or redraw from another angle.",
  "Only change the colors, materials, textures, lighting, or details the user explicitly asks for; every edge and contour must stay where it is in the source image.",
].join(" ");

/**
 * 后端：按 operation 取英文视角锁。camera_view 返回空串（它本来就是换视角）。
 * ⚠️ 默认必须是「锁」—— 新增 operation 忘了登记时也要被锁住，而不是被放行。
 */
export function buildViewpointLockInstruction(operation?: string | null) {
  if (operation === "camera_view") return "";
  return VIEWPOINT_LOCK_INSTRUCTION_EN;
}
