/**
 * 图片保留期与过期提醒的共享契约。
 *
 * ⚠️⚠️⚠️ 为什么要有这个文件：
 * 「保留多少天」这个数字曾经同时出现在至少 4 个地方——服务端清理逻辑、
 * 服务端体积上限的注释、前端告知弹窗的标题、前端弹窗正文。这是典型的
 * 「同一份数据的多个出口」：改其中一个不会报错，只会让用户看到
 * 「弹窗说 10 天、实际 15 天才删」这种自相矛盾的界面。
 *
 * 因此：
 * - 服务端的**权威值**在 server/local-image-storage.ts（可被环境变量覆盖）；
 * - 前端**不允许**写死天数，必须通过 /api/uploads/expiry 读取服务端下发的值；
 * - 本文件只提供「类型定义 + 纯展示函数 + 兜底常量」，不提供业务判断。
 *
 * 兜底常量仅用于接口尚未返回时的首屏渲染，一旦接口返回就必须以接口为准。
 */

/** 接口不可用时的兜底展示值。⚠️ 不是权威值，权威值在服务端。 */
export const FALLBACK_RETENTION_DAYS = 15;
export const FALLBACK_WARNING_DAYS = 5;

/** 单张图片的过期状态，由 /api/uploads/expiry 下发。 */
export type UploadExpiryEntry = {
  /** 公网可访问的相对路径，形如 /uploads/images/<user>/<file>.png */
  src: string;
  /** 剩余天数，向上取整。0 表示今天之内就会被清理。 */
  daysLeft: number;
  /** 预计被清理的时刻（ISO 字符串），用于展示精确时间。 */
  expiresAt: string;
  /** 是否已进入提醒窗口（daysLeft <= warningDays）。由服务端判定，前端不要自己算。 */
  isWarning: boolean;
};

export type UploadExpiryResponse = {
  /** 服务端当前生效的保留天数（已含环境变量覆盖）。 */
  retentionDays: number;
  /** 服务端当前生效的提醒窗口天数。 */
  warningDays: number;
  /** 仅包含已进入提醒窗口的图片；未进入的不下发，避免无谓的载荷。 */
  entries: UploadExpiryEntry[];
  /** 进入提醒窗口的图片总数，等于 entries.length，冗余出来便于前端直接展示。 */
  warningCount: number;
  /** 其中最紧急的一张还剩几天；没有待提醒图片时为 null。 */
  minDaysLeft: number | null;
};

/**
 * 把剩余天数转成给用户看的短文案。
 *
 * ⚠️ 0 天必须说「今天」而不是「0 天后」——后者读起来像「已经过期了」，
 * 会让用户以为图已经没了从而放弃下载，而实际上这时候还能下载。
 */
export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft <= 0) return "今天内清除";
  if (daysLeft === 1) return "明天清除";
  return `${daysLeft} 天后清除`;
}

/** 角标上的极简文案，空间有限只放数字。 */
export function formatDaysLeftBadge(daysLeft: number): string {
  if (daysLeft <= 0) return "今天";
  return `${daysLeft} 天`;
}

/**
 * 紧急程度分级，用于决定角标配色。
 * 分界点刻意不可配置：这是视觉语义，不是业务参数。
 */
export function getExpiryUrgency(daysLeft: number): "critical" | "warning" {
  return daysLeft <= 1 ? "critical" : "warning";
}
