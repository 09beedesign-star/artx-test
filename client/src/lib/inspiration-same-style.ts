/**
 * 灵感模板「一键同款」的**唯一实现**。
 *
 * 功能契约（用户 2026-11-10 原话）：
 *   点击 → 模板图被导入画布 → 并自动引用到提示词输入框里
 *   → 停在「等用户写提示词」这一步，由用户自己触发生成。
 *
 * ⚠️⚠️ 为什么必须是唯一实现：
 *    这个动作有两个入口（灵感模板专题页、个人中心的「我赞过的 / 我的收藏」），
 *    两边各写一份的话，改了一边另一边就是「点了没反应」——
 *    本项目的「同一份逻辑多个出口」已经踩过十四次，这里从源头收口。
 *
 * ⚠️ 只带图、不带文本：`shouldAutoRun: false`，绝不替用户按生成
 *    （一次生成要扣积分，涉及花钱的动作必须由用户自己点）。
 *
 * ── 【为什么图必须在这里就固化，不能把 URL 丢给画布】────────────────────
 * 2026-11-10 实测事故：点「一键同款」，画布弹出「同款参考图未能载入」。
 *
 * 原因有两层，叠在一起：
 *   1. 交接通道 `HomePromptReference.src` 的契约写得很清楚是 **data:URL**
 *      （画布侧原样塞进 `<img src>`），我上一版图省事直接塞了模板页的
 *      `imageUrl` —— 而兜底数据里的 imageUrl 是**相对路径**
 *      （`inspiration-images/prompt-01.jpg`）。相对路径在 `/inspiration`
 *      下解析正确，可画布在 `/project/<id>`，同一个字符串被解析成
 *      `/project/inspiration-images/...` → 404 → `Promise.all` 整体 reject
 *      → 一张都进不去。**URL 是相对谁而言的，换个页面就换了含义。**
 *   2. 就算写成绝对 URL，画布侧还要再赌一次「此刻网络/代理能拿到图」。
 *      模板图是远程资源，而这一步发生在**跳转之后**，失败时用户已经
 *      站在一块空画布上，只能看到一个「未能载入」的提示。
 *
 * 📌 判据：**能在数据产生的一侧把它变成自洽格式，就不要留到另一侧赌网络。**
 *    在列表页这一侧，图刚刚才被渲染出来（浏览器缓存里就有），
 *    转成 dataURL 几乎不花时间；而画布那一侧拿到 data: 之后
 *    `loadExternalImageWithProxyFallback` 直接走本地分支，零网络、零失败。
 */
import { toast } from "sonner";
import { createWorkspaceHistoryProject } from "./project-history";
import {
  HOME_REFERENCE_SINGLE_BUDGET_BYTES,
  estimateDataUrlBytes,
  writeHomePromptHandoff,
  type HomePromptReference,
} from "./home-prompt-handoff";

export type SameStyleSource = {
  title: string;
  /** 模板图。相对路径 / 绝对 URL / data:URL 都可以，这里统一固化。 */
  imageUrl?: string;
};

export type SameStyleResult =
  | { ok: true; projectId: string; inlined: boolean }
  | { ok: false; reason: "missing-image" | "handoff-failed" };

/**
 * 固化时的长边上限。
 *
 * 模板图在画布上只是「参考图」，不需要原图分辨率；缩到 1536 长边
 * 既看得清，又能让 dataURL 稳稳落进 sessionStorage 配额。
 */
const SAME_STYLE_MAX_EDGE = 1536;
/**
 * 固化后的体积上限。取交接通道的单张预算而不是自己另定一个数 ——
 * 两个值一旦分叉，就会出现「这里觉得没问题、那边写不进去」。
 */
const SAME_STYLE_MAX_BYTES = HOME_REFERENCE_SINGLE_BUDGET_BYTES;

/** 把相对路径按**当前页面**解析成绝对地址。跨页面之后它才有确定含义。 */
function toAbsoluteUrl(src: string) {
  if (typeof window === "undefined") return src;
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string | null>(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = event => {
      const result = event.target?.result;
      resolve(typeof result === "string" && result ? result : null);
    };
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

/**
 * 图片按长边上限重采样成 jpeg dataURL。
 *
 * ⚠️ 先铺白底：模板图里可能有透明区域，直接画到 canvas 上会变成黑色，
 * 而用户看不出这是「透明被压掉」，只会觉得同款参考图色不对。
 */
function renderImageDataUrl(image: HTMLImageElement, quality: number) {
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const scale = Math.min(1, SAME_STYLE_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // 跨域图未带 CORS 头时 canvas 被污染，toDataURL 抛 SecurityError。
    return null;
  }
}

/**
 * 拉一张图并转成体积可控的 dataURL。拿不到就返回 null。
 *
 * ⚠️⚠️ 必须校验 `content-type`。
 *    本地 dev 没有后端，`/api/images/proxy` 会被 SPA fallback 接走、
 *    返回 **200 + text/html**。只看 `response.ok` 的话，这段 HTML
 *    会被当成图片 dataURL 一路传下去，最后在画布侧炸成
 *    「同款参考图未能载入」——现象离真正的原因隔了三层。
 */
async function fetchImageDataUrl(url: string) {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const blob = await response.blob();
    if (blob.size === 0) return null;

    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadHtmlImage(objectUrl);
      // 先按 0.9 出一版；超预算再降质量重画，而不是直接放弃这张图。
      const first = renderImageDataUrl(image, 0.9);
      if (!first) return null;
      if (estimateDataUrlBytes(first) <= SAME_STYLE_MAX_BYTES) return first;
      const second = renderImageDataUrl(image, 0.72);
      if (second && estimateDataUrlBytes(second) <= SAME_STYLE_MAX_BYTES) {
        return second;
      }
      return null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

/**
 * 模板图 → 可以塞进交接载荷的 `src`。
 *
 * 依次尝试：原地址（同源时直接拿到字节）→ 同源图片代理（跨域图没带
 * CORS 头时唯一能拿到字节的路）。两条都失败就退回绝对 URL：
 * 至少它比相对路径正确，画布侧还有最后一次机会。
 */
export async function resolveSameStyleImageSrc(imageUrl: string) {
  const raw = (imageUrl || "").trim();
  if (!raw) return { src: "", inlined: false };
  if (raw.startsWith("data:")) return { src: raw, inlined: true };

  const absolute = toAbsoluteUrl(raw);
  const candidates = [absolute];
  if (/^https?:\/\//i.test(absolute)) {
    candidates.push(`/api/images/proxy?url=${encodeURIComponent(absolute)}`);
  }

  for (const candidate of candidates) {
    const dataUrl = await fetchImageDataUrl(candidate);
    if (dataUrl) return { src: dataUrl, inlined: true };
  }
  return { src: absolute, inlined: false };
}

/**
 * ⚠️ 取图是异步的，双击会建出两块画板（各带一张同样的图）。
 * 模块级互斥就够了：这个动作同一时刻只可能有一个入口在被点。
 */
let inflight = false;

/**
 * 把模板图带进一块新画布，并挂到提示词输入框的引用区。
 *
 * @param navigate wouter 的跳转函数（页面自己持有，lib 不直接依赖路由）
 */
export async function applyInspirationSameStyle(
  source: SameStyleSource,
  navigate: (to: string) => void
): Promise<SameStyleResult> {
  const rawImageUrl = (source.imageUrl || "").trim();
  if (!rawImageUrl) {
    toast("这张模板没有可用图片", { description: "换一张模板再试试" });
    return { ok: false, reason: "missing-image" };
  }
  if (inflight) return { ok: false, reason: "handoff-failed" };
  inflight = true;

  try {
    const resolved = await resolveSameStyleImageSrc(rawImageUrl);

    // 标题只用来在工作台里认出这块画板，不塞进输入框 —— 输入框要留给用户写。
    const project = createWorkspaceHistoryProject(source.title || "同款创作");

    const references: HomePromptReference[] = [
      {
        id: `same-style-${Date.now()}`,
        title: source.title || "同款参考图",
        src: resolved.src,
      },
    ];

    const written = writeHomePromptHandoff({
      projectId: project.id,
      model: "auto",
      shouldAutoRun: false,
      createdAt: project.createdAt,
      references,
    });

    if (!written.ok) {
      toast("导入失败", { description: "浏览器存储空间不足，请清理后重试" });
      return { ok: false, reason: "handoff-failed" };
    }

    /*
     * ⚠️ droppedReferences = 交接载荷超配额，写入方为了保住提示词把图丢了。
     *    这里没有提示词，所以丢图等于「进画布啥也没有」——必须说出来，
     *    否则用户会以为是自己点错了。
     */
    if (written.droppedReferences) {
      toast("参考图未能带入画布", { description: "图片体积超出浏览器限制，请手动添加" });
      return { ok: false, reason: "handoff-failed" };
    }

    toast("已导入同款参考图", {
      description: resolved.inlined
        ? "在提示词框里写下你的想法，即可生成同款"
        : "图片已按原链接引用，若未显示可手动添加",
    });
    navigate(`/project/${project.id}`);
    return { ok: true, projectId: project.id, inlined: resolved.inlined };
  } catch {
    // 调用点一律 `void` 掉这个 Promise，这里必须自己兜住，
    // 否则本地存储写失败（比如隐私模式）会变成一条没人看见的 unhandled rejection。
    toast("导入失败", { description: "请稍后重试，或手动把图片拖进画布" });
    return { ok: false, reason: "handoff-failed" };
  } finally {
    inflight = false;
  }
}
