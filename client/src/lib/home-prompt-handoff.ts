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
  /** 首页选择的技能 */
  skill?: { id: string; name: string };
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
 *
 * ──────────────────────────────────────────────────────────────
 * 【2026-11-10 二次事故：这两条闸门的计量单位是错的】
 *
 * 它们按「dataURL 解码后的**字节数**」卡（单张 2MB / 总量 3MB），
 * 而 sessionStorage 的配额按 **UTF-16 字符数**计（每字符 2 字节），
 * dataURL 本身又有 base64 的 4/3 膨胀。两者差 8/3 倍：
 *
 *     一张「刚好通过 2MB 单张闸门」的图（1.9MB）
 *     → base64 约 2.65M 字符
 *     → sessionStorage 实际要占 5.07MB
 *     → **比 5MB 配额本身还大 → setItem 必抛 → 降级丢图**
 *
 * 用户看到的就是「图片体积超出浏览器限制，请手动添加」。
 * 也就是说，**这条闸门在数学上从来就不可能放行任何接近上限的图**。
 *
 * 📌 判据：**闸门必须和它要保护的那个资源用同一个计量口径。**
 *    这里唯一有意义的量是「JSON.stringify 之后的字符数」，
 *    见下面的 `HOME_HANDOFF_MAX_CHARS`；上面这两个字节常量现在只用于
 *    **展示层与内存开销**（决定首页最多挂几张、单张多大值得挂），
 *    不再承担「能否写进 sessionStorage」的职责。
 * ──────────────────────────────────────────────────────────────
 */
export const HOME_REFERENCE_TOTAL_BUDGET_BYTES = 3 * 1024 * 1024;
/** 单张上限。与总预算一起卡，避免一张巨图直接吃满。 */
export const HOME_REFERENCE_SINGLE_BUDGET_BYTES = 2 * 1024 * 1024;
/** 参考图数量上限，与画布引用区的展示能力对齐。 */
export const HOME_REFERENCE_MAX_COUNT = 4;

/**
 * 交接载荷的**字符**水位 —— 这才是真正保护 sessionStorage 的那条闸门。
 *
 * 为什么是 1.2M：5MB 配额 ÷ 2 字节/字符 = 2.6M 字符是理论上限，
 * 这里取不到一半，把余量留给同 origin 下其它 key
 *（`artx-auth-session`、画布草稿等，都吃同一个配额池），
 * 也覆盖 Firefox 等配额更小的实现。
 *
 * ⚠️ 别把它调大：超过 2.6M 字符后，一张图就能独占整个配额池，
 *    表现是「第一次能进、第二次页面其它功能开始随机写失败」。
 */
export const HOME_HANDOFF_MAX_CHARS = 1_200_000;

/**
 * 超水位图片的二次通道：内存 Map。
 *
 * 【为什么不再走 sessionStorage / 也不上 IndexedDB】
 * 这条通道服务于**同一个标签页内的软跳转**（wouter 的 pushState），
 * 模块实例在整个 SPA 生命周期里是同一个，内存 Map 天然可用，
 * 而且是**同步**的 —— 消费方 `readHandoffReferences` 因此不必变成 async，
 * 「读交接载荷」这条高频路径就不会被拖成 Promise。
 *
 * 📌 代价：硬刷新 / 新标签页打开会丢图（此时走画布侧原有的
 *    「参考图未能载入」提示）。这是刻意取舍：交接是瞬时动作，
 *    正常使用不会在跳转那一瞬间刷新页面。
 *    相比之下，把图塞进 sessionStorage 是**每次都用小图也会随机失败**，
 *    取舍方向很清楚。
 */
const externalImageStore = new Map<string, string>();

/** payload 里用来指代「图在内存通道」的占位前缀。 */
export const HANDOFF_IMAGE_TOKEN_PREFIX = "artx-handoff:";

/**
 * 载荷超字符水位时，把图片的 src 从 payload 里挪到内存通道，
 * 只留一个 token 占位。
 *
 * ⚠️ 只外置图、不动其它字段：提示词 / 模型 / 技巧这些**都不能丢** ——
 * 它们才是用户的真实意图，图只是附加信息。
 */
function externalizeOversizedImages(payload: HomePromptHandoff): HomePromptHandoff {
  const references = payload.references;

  /*
   * ⚠️⚠️ 判据不能只看「这份载荷多大」。
   *
   * 一份**已经外置过**的载荷（src 是 token）本身就很小，如果只看体积
   * 就会被判成「内联载荷、内存通道用不上」，接着把 Map 清空 ——
   * 于是这份载荷里的 token 再也还原不回来，变成「写入成功、读出来零张图」。
   * 实测踩到：重复写入同一份载荷时必现（测试已锁）。
   *
   * 📌 「payload 小」≠「payload 自洽」。还要看它有没有引用外置资源。
   */
  const referencesExternalized = Boolean(
    references?.some(
      reference =>
        typeof reference?.src === "string"
        && reference.src.startsWith(HANDOFF_IMAGE_TOKEN_PREFIX)
    )
  );
  const oversized =
    Boolean(references?.length) &&
    (referencesExternalized ||
      JSON.stringify(payload).length > HOME_HANDOFF_MAX_CHARS);

  /*
   * 不需要外置 = 这份载荷完全自洽（图都内联在里面，没有任何 token 引用）。
   * 上一批留在内存里的图从此没人会读，直接释放 —— 一张就是好几 MB。
   */
  if (!oversized) {
    externalImageStore.clear();
    return payload;
  }
  if (!references) return payload;

  /*
   * ⚠️⚠️ 换新一批之前要先清掉旧的（同一个 key 只该有一个待消费载荷），
   * 但**不能先清后救**：如果同一份载荷被重复写入（字段已是 token），
   * 无脑 clear 会把上一次刚存进去的图删掉，于是「写入成功、读出来零张图」
   * —— 又回到静默丢图，而且这次连 toast 都没有。
   * 所以先把本批 payload 里已经引用到的 token 内容抢救出来，再清。
   */
  const carried = new Map<string, string>();
  for (const reference of references) {
    const src = typeof reference?.src === "string" ? reference.src : "";
    if (!src.startsWith(HANDOFF_IMAGE_TOKEN_PREFIX)) continue;
    const key = src.slice(HANDOFF_IMAGE_TOKEN_PREFIX.length);
    const existing = externalImageStore.get(key);
    if (existing) carried.set(key, existing);
  }
  externalImageStore.clear();
  carried.forEach((value, key) => externalImageStore.set(key, value));

  const compacted = references.map((reference, index) => {
    if (!reference || typeof reference !== "object") return reference;
    const src = typeof reference.src === "string" ? reference.src : "";
    // 已经是 token 就不再套一层。
    if (!src || src.startsWith(HANDOFF_IMAGE_TOKEN_PREFIX)) return reference;
    const token = `${HANDOFF_IMAGE_TOKEN_PREFIX}${reference.id || `ref-${index}`}`;
    externalImageStore.set(token.slice(HANDOFF_IMAGE_TOKEN_PREFIX.length), src);
    return { ...reference, src: token };
  });

  return { ...payload, references: compacted };
}

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
 * 三级保险，从「什么都不丢」到「至少保住意图」：
 *   1. 总量在字符水位内 → 原样写；
 *   2. 超水位 → 把图挪到内存通道（同一标签页软跳转仍能取回），提示词照常写；
 *   3. 连第 2 步都写不进去（隐私模式 / 配额被别的 key 吃干净）
 *      → 降级成「不带参考图」的版本，保住提示词与模型。
 *
 * ⚠️ 第 3 步是最后手段：图彻底没了，但用户至少不会「点了发送进到一个空画布」。
 */
export function writeHomePromptHandoff(payload: HomePromptHandoff) {
  if (typeof window === "undefined") return { ok: false, droppedReferences: false };

  /*
   * ⚠️ 不要在这里直接 `externalImageStore.clear()`。
   * 清理的时机在 `externalizeOversizedImages` 内部：它必须先把
   * 「本批 payload 里已经引用到的 token」抢救出来再清，
   * 否则重复写入同一份载荷时会把图删掉（先清后救 = 静默丢图）。
   */
  const effective = externalizeOversizedImages(payload);

  try {
    window.sessionStorage.setItem(HOME_PROMPT_HANDOFF_KEY, JSON.stringify(effective));
    return { ok: true, droppedReferences: false };
  } catch {
    try {
      const { references, ...rest } = effective;
      void references;
      window.sessionStorage.setItem(HOME_PROMPT_HANDOFF_KEY, JSON.stringify(rest));
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
 *
 * ⚠️⚠️ 还要**还原外置图**（src 是 `artx-handoff:` token 的那些）。
 *    这一步少了，超水位那条路径就变成「写入说 ok、读出来零张图」——
 *    又是一种静默丢图，而且比原来的报错更难查（连 toast 都没有）。
 *    📌 写入方和读取方的字段口径必须成对改，改一半等于没改。
 */
export function readHandoffReferences(payload: HomePromptHandoff | null) {
  if (!payload?.references || !Array.isArray(payload.references)) return [];

  const resolved: HomePromptReference[] = [];
  for (const reference of payload.references) {
    if (
      !reference
      || typeof reference !== "object"
      || typeof reference.id !== "string"
    ) {
      continue;
    }
    const rawSrc = typeof reference.src === "string" ? reference.src : "";
    if (!rawSrc.trim()) continue;

    let src = rawSrc;
    if (rawSrc.startsWith(HANDOFF_IMAGE_TOKEN_PREFIX)) {
      /*
       * 外置图只活在内存里。取不到（硬刷新 / 换了标签页）就当作**这张没带过来**，
       * 而不是把 token 原样交给画布 —— 那会让画布把 `artx-handoff:xxx`
       * 当成一个 URL 去请求，最后炸成一条与真正原因无关的网络错误。
       */
      src = externalImageStore.get(rawSrc.slice(HANDOFF_IMAGE_TOKEN_PREFIX.length)) ?? "";
    }
    if (!src.trim()) continue;

    resolved.push({ ...reference, src });
  }
  return resolved;
}
