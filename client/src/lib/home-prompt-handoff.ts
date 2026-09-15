/**
 * 首页 → 画布的交接载荷（sessionStorage 通道）的唯一事实源。
 *
 * 【为什么要单独建这个文件】
 * 这个 payload 有两个写入方（首页发送）和一个消费方（CanvasAssistantPanel），
 * 字段一旦对不上就是「首页做了、画布没接住」的静默失效 —— 2026-09-13
 * 的「首页选的图片模型被当成纯装饰」就是这么来的：写入方加了字段，
 * 消费方只把它当参考、没真正驱动行为。
 *
 * 把类型和读写函数收口在这里，首页与画布引用同一份定义，字段改动一处即可。
 */

export const HOME_PROMPT_HANDOFF_KEY = "artx:pending-home-prompt";

export type HomePromptReference = {
  id: string;
  title: string;
  /** data:URL。画布侧会原样作为引用图片的 src。 */
  src: string;
};

export type HomePromptHandoff = {
  projectId?: string;
  prompt?: string;
  /**
   * 用户在首页选的出图模型。
   * "auto" 表示交给意图路由决定，具体模型 id 表示直接出图。
   */
  model?: string;
  shouldAutoRun?: boolean;
  createdAt?: string;
  /** 首页「添加参考图」带过来的图片，进画布后直接变成引用图片。 */
  references?: HomePromptReference[];
};

/**
 * sessionStorage 的安全水位。
 *
 * ⚠️⚠️ 这不是拍脑袋定的保守值，而是硬约束：浏览器给 sessionStorage 的配额
 * 普遍是 5MB（按 UTF-16 计，实际可用更少），而首页参考图是 base64 dataURL，
 * **体积比原图还大约 33%**。画布侧单张上限是 10MB —— 也就是说，
 * 只要照搬画布的限制，用户传一张 6MB 的图就会让 setItem 抛 QuotaExceededError，
 * 结果是**整个交接载荷写入失败，连提示词都丢了**：用户点发送，跳进画布，
 * 里面空空如也，而且没有任何报错。
 *
 * 所以这里必须有独立于画布的、更严格的体积闸门，并且在超限时
 * **优先保住提示词**（丢图不丢字），而不是让整条链路一起失败。
 */
export const HOME_REFERENCE_TOTAL_BUDGET_BYTES = 3 * 1024 * 1024;
/** 单张上限。与总预算一起卡，避免一张巨图直接吃满。 */
export const HOME_REFERENCE_SINGLE_BUDGET_BYTES = 2 * 1024 * 1024;
/** 参考图数量上限，与画布引用区的展示能力对齐。 */
export const HOME_REFERENCE_MAX_COUNT = 4;

/** dataURL 的近似字节数（base64 每 4 个字符还原 3 字节）。 */
export function estimateDataUrlBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * 按预算裁剪参考图列表。
 *
 * 返回被接受的图片和被丢弃的数量，调用方负责把丢弃情况告诉用户 ——
 * **静默丢图是不可接受的**，用户会以为图传上去了。
 */
export function fitReferencesToBudget(references: HomePromptReference[]) {
  const accepted: HomePromptReference[] = [];
  let usedBytes = 0;
  let droppedCount = 0;

  for (const reference of references) {
    if (accepted.length >= HOME_REFERENCE_MAX_COUNT) {
      droppedCount += 1;
      continue;
    }
    const bytes = estimateDataUrlBytes(reference.src);
    if (bytes > HOME_REFERENCE_SINGLE_BUDGET_BYTES) {
      droppedCount += 1;
      continue;
    }
    if (usedBytes + bytes > HOME_REFERENCE_TOTAL_BUDGET_BYTES) {
      droppedCount += 1;
      continue;
    }
    accepted.push(reference);
    usedBytes += bytes;
  }

  return { accepted, droppedCount };
}

/**
 * 写入交接载荷。
 *
 * ⚠️ 失败时**降级重试一次「不带参考图」的版本**，而不是直接放弃。
 * 理由见上面 budget 的注释：提示词是用户真正的意图，图只是附加信息，
 * 二者不该同生共死。
 */
export function writeHomePromptHandoff(payload: HomePromptHandoff) {
  if (typeof window === "undefined") return { ok: false, droppedReferences: false };
  const serialize = (value: HomePromptHandoff) => JSON.stringify(value);
  try {
    window.sessionStorage.setItem(HOME_PROMPT_HANDOFF_KEY, serialize(payload));
    return { ok: true, droppedReferences: false };
  } catch {
    try {
      const { references, ...rest } = payload;
      void references;
      window.sessionStorage.setItem(HOME_PROMPT_HANDOFF_KEY, serialize(rest));
      return { ok: true, droppedReferences: true };
    } catch {
      return { ok: false, droppedReferences: true };
    }
  }
}

/**
 * 读取并解析交接载荷。解析失败返回 null（调用方负责清理 key）。
 */
export function parseHomePromptHandoff(raw: string | null): HomePromptHandoff | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HomePromptHandoff;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 从载荷里取出可用的参考图。
 *
 * ⚠️ 必须过滤非法项：payload 来自 sessionStorage，可能被用户手动改过、
 * 也可能是旧版本写的。消费侧直接 map 会把 undefined 传进渲染层。
 */
export function readHandoffReferences(payload: HomePromptHandoff | null) {
  if (!payload?.references || !Array.isArray(payload.references)) return [];
  return payload.references.filter(
    (reference): reference is HomePromptReference =>
      Boolean(
        reference
        && typeof reference.id === "string"
        && typeof reference.src === "string"
        && reference.src.trim()
      )
  );
}
