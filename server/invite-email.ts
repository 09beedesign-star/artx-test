/**
 * 邀请邮件发送 —— 防滥用与限频
 *
 * ⚠️ 本接口会向站外真实投递邮件，必须带严格限频，否则会被当成免费群发器：
 *   1. 发信域名被标记成垃圾邮件源 → 验证码邮件也进垃圾箱，影响所有用户登录
 *   2. Resend 额度被烧光
 *
 * 限频规则：
 *   - 单用户每日上限 10 封
 *   - 同一收件人 7 天内只发 1 次（防骚扰）
 *   - 收件人已注册 → 拒发（不泄露注册状态给站外，也省额度）
 *   - 发给自己 → 拒
 */

/**
 * ⚠️ 刻意不从 auth-store 导入 StoredUser。
 *
 * 该类型在 auth-store 内部是非导出的，且携带 passwordHash / salt /
 * resetTokenHash 等敏感字段。为了一个只读三个字段的工具模块把它导出，
 * 等于把凭据类型扩散到全 server 层。
 *
 * 这里只声明本模块真正需要的最小形状；TS 结构化类型会让 StoredUser[]
 * 直接兼容传入，调用方无需任何转换。
 */
type InviteAudienceUser = {
  id: string;
  username?: string;
  loginKey?: string;
};

export type InviteEmailSendLog = {
  id: string;
  senderId: string;
  recipientEmail: string;
  sentAt: string;
};

const INVITE_EMAIL_DAILY_LIMIT = 10;
const INVITE_EMAIL_RECIPIENT_COOLDOWN_DAYS = 7;

/** 限频：单用户每日发信上限 */
export function checkDailyLimit(logs: InviteEmailSendLog[], senderId: string, now = new Date()): boolean {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCount = logs.filter(
    (log) => log.senderId === senderId && new Date(log.sentAt) >= todayStart
  ).length;
  return todayCount < INVITE_EMAIL_DAILY_LIMIT;
}

/** 限频：同一收件人冷却期（7 天内只发 1 次） */
export function checkRecipientCooldown(
  logs: InviteEmailSendLog[],
  recipientEmail: string,
  now = new Date()
): boolean {
  const normalized = recipientEmail.trim().toLowerCase();
  const cooldownStart = new Date(now.getTime() - INVITE_EMAIL_RECIPIENT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recent = logs.find(
    (log) => log.recipientEmail.toLowerCase() === normalized && new Date(log.sentAt) >= cooldownStart
  );
  return !recent;
}

/** 防自发：不能发给自己 */
export function isSelfInvite(users: InviteAudienceUser[], senderId: string, recipientEmail: string): boolean {
  const sender = users.find((u) => u.id === senderId);
  if (!sender) return false;
  const normalized = recipientEmail.trim().toLowerCase();
  return (
    sender.loginKey?.toLowerCase() === normalized ||
    sender.username?.toLowerCase() === normalized
  );
}

/** 防重复注册：收件人已注册 */
export function isAlreadyRegistered(users: InviteAudienceUser[], recipientEmail: string): boolean {
  const normalized = recipientEmail.trim().toLowerCase();
  return users.some(
    (u) =>
      u.loginKey?.toLowerCase() === normalized ||
      u.username?.toLowerCase() === normalized
  );
}

/** 生成邀请邮件 HTML */
export function buildInviteEmailHtml(input: {
  inviterName: string;
  inviteLink: string;
  inviterCredits: number;
  inviteeCredits: number;
}): string {
  const { inviterName, inviteLink, inviterCredits, inviteeCredits } = input;
  const escapedName = escapeHtml(inviterName);
  const escapedLink = escapeHtml(inviteLink);
  
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#18181b;">
    <div style="width:100%;padding:40px 16px;box-sizing:border-box;background:#f4f4f6;">
      <div style="max-width:520px;margin:0 auto;background:#18181b;border-radius:18px;padding:32px 28px;box-sizing:border-box;box-shadow:0 24px 80px rgba(24,24,27,0.18);">
        <h1 style="margin:14px 0 10px;font-size:24px;line-height:32px;font-weight:760;color:#ffffff;letter-spacing:0;">${escapedName} 邀请你加入 ArtX</h1>
        <p style="margin:0;color:#d4d4d8;font-size:15px;line-height:24px;letter-spacing:0;">
          ArtX 是一个 AI 图像生成平台，支持文生图、图生图、扩图、抠图等多种能力。
        </p>
        <div style="margin:28px 0 22px;padding:18px;background:linear-gradient(135deg, oklch(0.65 0.19 150) 0%, oklch(0.58 0.22 290) 100%);border-radius:14px;">
          <div style="text-align:center;color:#ffffff;">
            <div style="font-size:13px;line-height:20px;font-weight:600;letter-spacing:0.02em;">🎁 注册并完成首次付费即可获得</div>
            <div style="margin-top:8px;font-size:32px;line-height:40px;font-weight:800;letter-spacing:0;">${inviteeCredits.toLocaleString("zh-CN")} 积分</div>
            <div style="margin-top:4px;font-size:12px;line-height:18px;opacity:0.85;">你的好友也将获得 ${inviterCredits.toLocaleString("zh-CN")} 积分</div>
          </div>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${escapedLink}" style="display:inline-block;padding:14px 32px;background:oklch(0.58 0.22 290);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;letter-spacing:0;">立即注册</a>
        </div>
        <p style="margin:14px 0 0;color:#71717a;font-size:12px;line-height:20px;letter-spacing:0;">如果你不感兴趣，请忽略此邮件。</p>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
