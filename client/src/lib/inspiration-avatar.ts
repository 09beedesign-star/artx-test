/**
 * 灵感卡片的虚拟用户头像——**确定性映射的唯一事实源**。
 *
 * 【用户的硬约束】
 * 「不论在首页的灵感推荐板块或者是灵感推荐专题页内，每一个灵感推荐卡片的头像
 *   与灵感推荐的内容，必须保持一致，避免头像和内容在两个页面之间出现不一致，
 *   那样会很假。」
 *
 * 📌 所以头像**绝对不能用 Math.random()**：随机意味着同一张卡片每次渲染、
 * 每个页面都会换一张脸，正是用户明确要避免的「很假」。
 * 这里改成「内容 → 哈希 → 固定头像」的**纯函数映射**，同样的内容永远同一张脸。
 *
 * 【身份键为什么只能是 title】
 * ⚠️⚠️ 首页和专题页的数据源根本不是同一个：
 *   - 首页：本地 CSV（`ai_image_prompt_rank_50.csv`），rank 是 CSV 原始名次，
 *     而且渲染前还被 `shuffleInspirationRecommendations` 打乱过；
 *   - 专题页：远程 `/api/inspiration/references`，rank 是 `1000 + index` 现编的。
 * 同一条内容在两边的 rank **必然不同**，数组下标更是毫无关系。
 * imageUrl 也不行 —— 专题页走的是 proxy 前缀，首页是原始地址。
 * 📌 **唯一在两个页面间稳定的标识就是 title。**
 * 如果拿 rank 或 index 当 key，两页头像必然对不上，而且不会报任何错。
 */

/**
 * DiceBear 头像风格白名单。
 *
 * ⚠️ 用户要求「不包含真人的头像」。这里只收录**纯矢量、非写实**的风格：
 * 机器人、几何形状、表情符号、像素怪物。
 * 📌 刻意排除 `personas`/`avataaars`/`micah` 等拟人风格 —— 它们虽然也是插画，
 * 但长得像人脸，容易被当成真人头像。
 */
const AVATAR_STYLES = [
  "bottts-neutral",
  "shapes",
  "fun-emoji",
  "thumbs",
  "icons",
  "rings",
  "glass",
] as const;

/** DiceBear 公共 CDN。返回 SVG，体积极小且无需鉴权。 */
const AVATAR_ENDPOINT = "https://api.dicebear.com/9.x";

/**
 * 头像底色池。
 *
 * 用于 DiceBear 的 `backgroundColor` 参数，保证头像在深色卡片上也有辨识度，
 * 不会出现「透明底 + 深色图形」直接糊成一团的情况。
 */
const AVATAR_BACKGROUNDS = [
  "b6e3f4",
  "c0aede",
  "d1d4f9",
  "ffd5dc",
  "ffdfbf",
  "c6f6d5",
  "fde68a",
];

/**
 * 稳定字符串哈希（FNV-1a 变体）。
 *
 * ⚠️ 必须是纯函数且与运行环境无关：
 * 用 `String.prototype.hashCode` 之类的非标准实现、或掺入时间戳/随机数，
 * 都会让同一 title 在两个页面算出不同结果 —— 也就是用户说的「很假」。
 */
export function hashInspirationSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // 乘以 FNV prime 16777619，用移位加法避免 32 位溢出丢精度
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 归一化身份键。
 *
 * 去掉首尾空白并转小写：CSV 与接口返回的同一标题可能在空白/大小写上有出入，
 * 不归一化会让「看起来一样的标题」算出两个头像。
 */
export function normalizeInspirationIdentity(title: string | null | undefined): string {
  return (title || "").trim().toLowerCase();
}

/**
 * 取某条灵感内容对应的虚拟头像 URL。
 *
 * @param title 灵感卡片标题，**跨页面唯一稳定的身份键**
 */
export function getInspirationAvatarUrl(title: string | null | undefined): string {
  const identity = normalizeInspirationIdentity(title);
  const seed = hashInspirationSeed(identity);
  const style = AVATAR_STYLES[seed % AVATAR_STYLES.length];
  // 用 seed 的高位再取一次，避免风格和底色被同一段比特绑定（否则某风格永远配某色）
  const background = AVATAR_BACKGROUNDS[(seed >>> 8) % AVATAR_BACKGROUNDS.length];
  const query = new URLSearchParams({
    seed: identity || "artx",
    backgroundColor: background,
    radius: "50",
  });
  return `${AVATAR_ENDPOINT}/${style}/svg?${query.toString()}`;
}

/**
 * 虚拟头像展示用的显示名（无障碍标签用，不出现在界面上）。
 *
 * ⚠️ 用户要求头像**不可点**，所以这里只提供 alt 文案，
 * 不提供任何跳转链接或用户主页 id —— 免得将来有人顺手把它接成可点的。
 */
export function getInspirationAvatarAlt(title: string | null | undefined): string {
  return `${(title || "灵感").trim().slice(0, 20)} 的创作者头像`;
}
