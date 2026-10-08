/**
 * 浏览器本地存储的「按账号隔离」唯一事实源。
 *
 * ⚠️⚠️⚠️【2026-09-27 用户拍板】「abc」和「abc@qq.com」是两个**完全独立**的账号，
 *    积分、画布、对话、模型偏好、个人资料……任何信息都不能有关联。
 *    服务端早已按 userId 隔离；漏的是浏览器这一侧 —— 同一台电脑先后登录两个账号，
 *    以前会读到同一份 `artx:canvas-state:p1` / `artx:creator-profile` 等，
 *    表现为「换了个号，画布和对话还是上一个号的」，零报错。
 *
 * 规则：
 *   - 登录态下 key 一律追加 `:${userId}`（与 project-history / workspace-sync 的
 *     既有口径完全一致，**不要另起格式**，否则同一份数据出现两种 key）。
 *   - 未登录时返回原 key（匿名使用是合法场景）。
 *   - 读取时若带账号的 key 不存在，回退读「老的不带账号 key」并**认领**：
 *     复制到带账号 key 后删除老 key。这样老用户数据不丢，
 *     而第二个账号登录时老 key 已经不在了，读不到第一个账号的东西。
 *
 * 📌 判据：key 用 userId，**绝不能用用户名或邮箱**——用户名大小写/邮箱前缀都可能撞。
 */

export const AUTH_SESSION_STORAGE_KEY = "artx-auth-session";

export function getStorageOwnerId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { user?: { id?: unknown } }) : null;
    const id = parsed?.user?.id;
    return typeof id === "string" && id.trim() ? id.trim() : "";
  } catch {
    return "";
  }
}

/** 给 key 追加当前账号后缀；未登录原样返回。 */
export function ownerScopedKey(baseKey: string, ownerId = getStorageOwnerId()): string {
  return ownerId ? `${baseKey}:${ownerId}` : baseKey;
}

/** 由带账号的 key 反推老的不带账号 key；不是当前账号的 key 则返回空串。 */
export function legacyKeyOf(scopedKey: string, ownerId = getStorageOwnerId()): string {
  if (!ownerId) return "";
  const suffix = `:${ownerId}`;
  return scopedKey.endsWith(suffix) ? scopedKey.slice(0, -suffix.length) : "";
}

/**
 * 读带账号的 key；缺失时认领老 key（复制 → 删除老 key）。
 *
 * ⚠️ 复制失败（配额满）时**不删老 key**：宁可暂时还能被别的账号读到，
 *    也不能把用户数据删没了。
 */
export function getOwnedItem(storage: Storage | undefined | null, scopedKey: string): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(scopedKey);
    if (value !== null) return value;
    const legacyKey = legacyKeyOf(scopedKey);
    if (!legacyKey) return null;
    const legacy = storage.getItem(legacyKey);
    if (legacy === null) return null;
    try {
      storage.setItem(scopedKey, legacy);
      storage.removeItem(legacyKey);
    } catch {
      /* 配额失败：保留老 key，见上方注释 */
    }
    return legacy;
  } catch {
    return null;
  }
}
