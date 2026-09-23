/**
 * 局部框选重绘 —— 选区 / 蒙版的**唯一事实源**（2026-09-23）。
 *
 * 需求（用户原话）：
 *   「点击该 icon 后鼠标变成选区状态，可以在该图片当中框选对应的内容。
 *     框选完内容之后，悬浮提示词输入框会出现该框选的内容的局部引用标签……
 *     必须保持局部引用标签内容的边缘在修改后要和整图的边缘完全融合在一起，
 *     不要出现明显的分割、割裂的效果。」
 *
 * 📌 为什么单独开文件而不是塞进 InfiniteCanvas.tsx：
 *    这些常量与纯函数被**三方**消费 —— 节点（画选框）、悬浮面板（画标签、
 *    生成蒙版）、测试。写在 3.7 万行的巨文件里，第二个消费方几乎必然会
 *    照抄一份数字出来，于是同一个"羽化半径"有了两个值且永远对不上。
 */

/** 框选完成事件：节点 → 悬浮提示词面板。detail: { nodeId, region } */
export const REGION_SELECT_COMMIT_EVENT = "asset-region-select-commit";

/** 进入 / 退出框选模式事件：悬浮提示词面板 → 画布。detail: { nodeId, active } */
export const REGION_SELECT_MODE_EVENT = "asset-region-select-mode";

/**
 * 有效选区的最小边长（占图片短边的比例）。
 *
 * ⚠️ 低于这个值一律判为「误点」而不是「小选区」：
 *    用户在框选模式下单击会产生 w=h=0 的退化矩形，生成出来是一张
 *    **零编辑区**的全黑蒙版。上游不会因此报错 —— 它会照常跑完、照常计费，
 *    然后返回一张和原图一模一样的结果。用户只会觉得"点了没反应"。
 */
export const REGION_SELECT_MIN_RATIO = 0.02;

/**
 * ⭐⭐⭐ 蒙版边缘羽化半径（占图片短边的比例）。
 *
 * 这是「边缘完全融合、不割裂」这条需求的**技术承载点**。
 *
 * 后端 `__testCompositeSourcePreservingImageEdit` 的贴回是
 * 逐像素按蒙版 alpha 做**加权混合**：
 *     输出 = 原图 × alpha + 模型输出 × (1 - alpha)
 * 所以蒙版边缘只要是硬边（alpha 从 255 直接跳到 0），贴回结果就会在
 * 选框边界上出现一条**一像素宽的硬切缝** —— 正是用户说的"明显的分割、割裂"。
 *
 * 羽化后 alpha 在边界上是连续渐变的，混合结果自然过渡，肉眼找不到接缝。
 *
 * 📌 判据：**羽化不是"美化"，是这条需求能否成立的前提。**
 *    去掉它功能照样跑通、照样出图、零报错 —— 只是每张图都带一圈框痕。
 */
export const REGION_SELECT_FEATHER_RATIO = 0.04;

/** 羽化半径的像素上下限：太小看得见缝，太大会把选区外的内容也卷进来 */
export const REGION_SELECT_FEATHER_MIN_PX = 8;
export const REGION_SELECT_FEATHER_MAX_PX = 96;

export type RegionSelectRect = {
  /** 左上角 x，占图片宽度的比例（0~1） */
  x: number;
  /** 左上角 y，占图片高度的比例（0~1） */
  y: number;
  /** 宽度，占图片宽度的比例（0~1） */
  w: number;
  /** 高度，占图片高度的比例（0~1） */
  h: number;
};

/**
 * 计算羽化半径（像素）。
 *
 * ⚠️ 额外用**选区自身尺寸**夹一道上限：小选区若套用大羽化，渐变带会吃掉
 *    整个选区，中心点的 alpha 都到不了 0 —— 表现是"框了但几乎没改"，零报错。
 */
export function resolveRegionFeatherPx(
  imageWidth: number,
  imageHeight: number,
  region: RegionSelectRect
) {
  const shortEdge = Math.max(1, Math.min(imageWidth, imageHeight));
  const base = shortEdge * REGION_SELECT_FEATHER_RATIO;
  const regionShortEdge = Math.max(
    1,
    Math.min(region.w * imageWidth, region.h * imageHeight)
  );
  return Math.round(
    Math.max(
      REGION_SELECT_FEATHER_MIN_PX,
      Math.min(REGION_SELECT_FEATHER_MAX_PX, base, regionShortEdge / 3)
    )
  );
}

/** 选区是否有效（两边都达到最小比例） */
export function isUsableRegionSelectRect(region: RegionSelectRect | null) {
  if (!region) return false;
  return (
    region.w >= REGION_SELECT_MIN_RATIO && region.h >= REGION_SELECT_MIN_RATIO
  );
}

/**
 * 把选区渲染成后端可用的蒙版 data URL。
 *
 * ⚠️⚠️⚠️ 蒙版语义必须与后端逐字一致：**黑色不透明 = 保留原图，
 *    透明 = 允许 AI 重绘**。这与直觉相反（直觉是"白色 = 要改的区域"），
 *    写反了不会报错 —— 只会把整张图的"选区之外"全部交给模型重画。
 *    口径来源：AnnotationMaskPreviewDialog 的 onConfirm 注释 + 后端
 *    buildInpaintMask 按 alpha < 250 判编辑区。
 *
 * 羽化实现：先用 destination-out 挖出实心矩形，再用 canvas filter 做高斯模糊，
 * 让矩形边界的 alpha 连续过渡。
 */
export async function createRegionSelectMask(
  imageSrc: string,
  region: RegionSelectRect
): Promise<{ maskSrc: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const width = Math.max(1, image.naturalWidth || image.width || 1024);
      const height = Math.max(1, image.naturalHeight || image.height || 1024);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建局部框选蒙版"));
        return;
      }

      // 底：全黑不透明 = 整图默认保留
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fillRect(0, 0, width, height);

      const feather = resolveRegionFeatherPx(width, height, region);
      const rectX = region.x * width;
      const rectY = region.y * height;
      const rectW = region.w * width;
      const rectH = region.h * height;

      /*
       * 挖洞 = 把选区内的 alpha 打到 0（允许重绘）。
       * filter 的模糊作用在"被挖的形状"上，于是洞的边缘 alpha 连续过渡。
       *
       * ⚠️ 挖之前把矩形**内缩**一个羽化半径：模糊会让影响范围向外扩散
       *    约一个半径，不内缩的话实际可编辑区会比用户框的大一圈，
       *    用户会觉得"AI 改到框外面去了"。
       */
      const inset = feather / 2;
      const innerX = rectX + inset;
      const innerY = rectY + inset;
      const innerW = Math.max(1, rectW - inset * 2);
      const innerH = Math.max(1, rectH - inset * 2);

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.filter = `blur(${feather / 2}px)`;
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.restore();

      resolve({
        maskSrc: canvas.toDataURL("image/png"),
        width,
        height,
      });
    };
    image.onerror = () => reject(new Error("无法读取待框选的图片"));
    image.src = imageSrc;
  });
}

/**
 * 把选区裁成一张缩略图，供「局部引用标签」显示。
 *
 * 📌 标签里必须显示**框选到的那块内容**，而不是整图缩略图 —— 否则用户
 *    框了三次会看到三个一模一样的标签，分不清哪个是哪个。
 */
export async function cropRegionThumbnail(
  imageSrc: string,
  region: RegionSelectRect,
  maxEdge = 96
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const width = Math.max(1, image.naturalWidth || image.width || 1024);
      const height = Math.max(1, image.naturalHeight || image.height || 1024);
      const sx = Math.round(region.x * width);
      const sy = Math.round(region.y * height);
      const sw = Math.max(1, Math.round(region.w * width));
      const sh = Math.max(1, Math.round(region.h * height));
      const scale = Math.min(1, maxEdge / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法裁剪局部缩略图"));
        return;
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("无法读取待裁剪的图片"));
    image.src = imageSrc;
  });
}

/**
 * 局部重绘提示词前缀。
 *
 * ⚠️⚠️⚠️ 这段约束**不能只靠蒙版**。实测（记忆：VOD 12 模型横评）上游模型
 *    普遍不真正遵守蒙版，会整图重绘；蒙版只在**本地贴回**那一步才真正生效。
 *    所以提示词侧也要说清"只改这一小块"，两道防线各挡一半：
 *      · 提示词：让模型尽量别乱改 → 减少贴回时的内容冲突
 *      · 蒙版贴回：模型真乱改了，框外也会被原图盖回来
 *
 * 📌 判据：「上游承诺了约束」永远不能替代「自己再还原一次」。
 */
export function buildRegionEditPromptPrefix(region: RegionSelectRect) {
  const centerX = (region.x + region.w / 2) * 100;
  const centerY = (region.y + region.h / 2) * 100;
  return [
    "你正在执行图片的局部编辑，不是重新生成一张新图。",
    "必须把原图作为唯一基础画布，只在用户框选的矩形区域内做修改。",
    `框选区域：左上角 x=${(region.x * 100).toFixed(1)}%、y=${(region.y * 100).toFixed(1)}%，` +
      `宽 ${(region.w * 100).toFixed(1)}%、高 ${(region.h * 100).toFixed(1)}%，` +
      `中心点 x=${centerX.toFixed(1)}%、y=${centerY.toFixed(1)}%。`,
    "框选区域之外的所有内容——人物、文字、构图、背景、镜头、比例、光影、颜色、风格——必须逐像素保持不变。",
    "修改区域的边缘必须与周围原图自然衔接：光照方向、色温、噪点颗粒、材质纹理、透视关系都要延续周围像素，",
    "不允许出现可见的矩形边框、拼接缝、色块边界、明暗突变或任何割裂感，让人看不出这里被单独修改过。",
    "输出完整的新图，但视觉上应像原图只在这一小块发生了自然的变化。",
  ].join("\n");
}
