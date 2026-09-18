/**
 * 灵感卡片的**身份键**——跨页面唯一稳定标识的事实源。
 *
 * 【这个文件原来叫什么、为什么改名】
 * 原名 `inspiration-avatar.ts`，因为它最早只服务于「虚拟创作者头像」。
 * 头像已按用户要求全站移除，但里面的两个函数**不是头像专用的**：
 * 点赞/收藏的计数与勾选态同样靠它们确定身份。
 * ⚠️ 留一个叫 avatar 却没有 avatar 的文件会误导后来的人（以为整个文件都是死代码，
 * 顺手删掉 → 点赞态和计数全线崩，而且不会有类型报错），所以改成现在的名字。
 *
 * 【身份键为什么只能是 title】
 * ⚠️⚠️ 首页和专题页的数据源根本不是同一个：
 *   - 首页：本地 CSV（`ai_image_prompt_rank_50.csv`），rank 是 CSV 原始名次，
 *     而且渲染前还被 `shuffleInspirationRecommendations` 打乱过；
 *   - 专题页：远程 `/api/inspiration/references`，rank 是 `1000 + index` 现编的。
 * 同一条内容在两边的 rank **必然不同**，数组下标更是毫无关系。
 * imageUrl 也不行 —— 专题页走的是 proxy 前缀，首页是原始地址。
 * 📌 **唯一在两个页面间稳定的标识就是 title。**
 * 如果拿 rank 或 index 当 key，两页的点赞数必然对不上，而且不会报任何错。
 */

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
 * 不归一化会让「看起来一样的标题」被当成两条不同内容（点赞态各算各的）。
 */
export function normalizeInspirationIdentity(title: string | null | undefined): string {
  return (title || "").trim().toLowerCase();
}
