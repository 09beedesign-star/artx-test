/**
 * 后台「邀请管理」的纯函数：类型、分成估算、CSV 导出。
 *
 * 🔒🔒🔒 合规红线（用户 2026-09-28 明确要求）：
 * 分成**只按直接邀请（一层）计算**，绝不能按「下线的下线」计酬。
 * 《禁止传销条例》第七条：以下线的销售业绩为依据计算和给付上线报酬
 * （团队计酬）属于传销；多级（三级及以上）分成是其典型形态。
 * 所以这里的计算只读 `inviter.invitees`（后端已只返回一层），
 * 不存在任何递归、不存在层级参数、不存在「团队业绩」字段。
 */

export type InviteeState = "rewarded" | "refunded" | "paid_no_reward" | "pending" | "expired";

export type InviteReportInvitee = {
  id: string;
  username: string;
  registeredAt: string;
  invitedAt: string;
  status: string;
  hasPaid: boolean;
  state: InviteeState;
  paidOrders: number;
  paidHkd: number;
  refundedHkd: number;
  netPaidHkd: number;
  inviterRewardCredits: number;
  inviteeRewardCredits: number;
};

export type InviteReportInviter = {
  inviterId: string;
  inviterName: string;
  inviteCode: string;
  inviterStatus: string;
  acceptDisabled: boolean;
  directInviteCount: number;
  paidInviteCount: number;
  rewardedCount: number;
  pendingCount: number;
  remainingQuota: number;
  directNetPaidHkd: number;
  earnedRewardCredits: number;
  invitees: InviteReportInvitee[];
};

export type InviteRewardConfigView = {
  inviterCredits: number;
  inviteeCredits: number;
  maxRewardedInvitesPerUser: number;
  bindingValidDays: number;
  rewardCreditValidDays: number;
  minPaidAmountHkd: number;
  refundRateAlertThreshold: number;
  refundRateMinSamples: number;
  configVersion?: number;
};

export type InviteReport = {
  levels: 1;
  config: InviteRewardConfigView;
  totals: {
    inviterCount: number;
    inviteeCount: number;
    paidInviteeCount: number;
    netPaidHkd: number;
    rewardCreditsGranted: number;
  };
  inviters: InviteReportInviter[];
};

export const INVITEE_STATE_LABEL: Record<InviteeState, string> = {
  rewarded: "已付费·已发奖",
  refunded: "已退款·奖励已扣回",
  paid_no_reward: "已付费·未达发奖条件",
  pending: "已注册·待首付",
  expired: "绑定已过期",
};

/**
 * 单层分成估算：分成 = 直接邀请用户净付费 × 比例。
 *
 * ⚠️ 入参只有一个邀请人自己的 invitees，签名里**没有**层级/深度参数，
 * 也不接收整棵关系树 —— 刻意让「多级分成」在这里无法被表达。
 * 比例上限 30%：再高分成本身会成为主要收益来源，出现「拉人头」导向；
 * 且分成是真金白银，实际打款前务必先过财务与法务。
 */
export const MAX_COMMISSION_RATE_PERCENT = 30;

export function clampCommissionRate(ratePercent: unknown): number {
  const n = Number(ratePercent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_COMMISSION_RATE_PERCENT);
}

export function estimateDirectCommissionHkd(
  inviter: Pick<InviteReportInviter, "invitees">,
  ratePercent: number
): number {
  const rate = clampCommissionRate(ratePercent) / 100;
  const base = inviter.invitees.reduce((sum, row) => sum + Math.max(0, Number(row.netPaidHkd) || 0), 0);
  return Math.round(base * rate * 100) / 100;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // 防 CSV 公式注入：以 = + - @ 开头的单元格前置单引号。
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** 导出「邀请人 × 直接被邀请人」明细，一行一个被邀请人。带 BOM，Excel 打开中文不乱码。 */
export function buildInviteReportCsv(inviters: InviteReportInviter[], ratePercent: number): string {
  const rate = clampCommissionRate(ratePercent);
  const header = [
    "邀请人", "邀请码", "直接邀请人数", "付费人数", "直接邀请净付费(HKD)", `估算分成(HKD,${rate}%)`,
    "被邀请账号", "注册时间", "绑定时间", "状态", "付费订单数", "已付(HKD)", "已退(HKD)", "净付费(HKD)",
    "邀请人获得积分", "被邀请人获得积分",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const inviter of inviters) {
    const commission = estimateDirectCommissionHkd(inviter, rate);
    for (const row of inviter.invitees) {
      lines.push([
        inviter.inviterName, inviter.inviteCode, inviter.directInviteCount, inviter.paidInviteCount,
        inviter.directNetPaidHkd, commission,
        row.username, row.registeredAt, row.invitedAt, INVITEE_STATE_LABEL[row.state] || row.state,
        row.paidOrders, row.paidHkd, row.refundedHkd, row.netPaidHkd,
        row.inviterRewardCredits, row.inviteeRewardCredits,
      ].map(csvCell).join(","));
    }
  }
  return "\uFEFF" + lines.join("\r\n");
}
