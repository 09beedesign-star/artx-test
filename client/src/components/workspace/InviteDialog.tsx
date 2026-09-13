/**
 * InviteDialog — 邀请好友得积分
 *
 * ⚠️ 这个弹窗**只展示，不发放**。
 * 奖励的唯一发放点在后端订单支付成功链路（server/admin-store.ts 的
 * markBillingOrderPaid），前端没有、也不应该有任何"领取"按钮 ——
 * 本项目注册链路零成本（无邮箱验证/无手机号/无验证码），
 * 任何由用户主动触发的发放都会重新打开刷号缺口。
 * 详见 server/invite-rewards.ts 顶部说明。
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2, Users, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "@/lib/api-base-url";
import { useTheme } from "@/contexts/ThemeContext";

export interface InviteSummary {
  inviteCode: string;
  rewardedCount: number;
  pendingCount: number;
  remainingQuota: number;
  maxQuota: number;
  earnedCredits: number;
  inviterCredits: number;
  inviteeCredits: number;
  bindingValidDays: number;
  rewardCreditValidDays: number;
  minPaidAmountHkd: number;
}

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInviteApiBaseUrl() {
  if (typeof window === "undefined") return ART_X_TEST_API_BASE_URL;
  const configured = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (configured) return configured;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith("github.io")) {
    return ART_X_TEST_API_BASE_URL;
  }
  return window.location.origin.replace(/\/+$/, "");
}

function getInviteAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

/** 邀请链接指向注册页并带上邀请码，注册页读取后随注册请求一起提交。 */
function buildInviteLink(code: string) {
  if (typeof window === "undefined" || !code) return "";
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
}

async function copyText(text: string) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走 execCommand 兜底：HTTP 环境或权限被拒时 clipboard API 不可用。
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export default function InviteDialog({ open, onOpenChange }: InviteDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState<"link" | "code" | "">("");
  const [emailInput, setEmailInput] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const load = useCallback(async () => {
    const token = getInviteAuthToken();
    if (!token) {
      setError("请先登录后再邀请好友");
      setSummary(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${getInviteApiBaseUrl()}/api/invite/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "邀请信息加载失败");
        setSummary(null);
        return;
      }
      setSummary(payload as InviteSummary);
    } catch {
      setError("网络异常，请稍后重试");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const inviteLink = summary ? buildInviteLink(summary.inviteCode) : "";

  const handleCopy = async (field: "link" | "code") => {
    const text = field === "link" ? inviteLink : summary?.inviteCode || "";
    const ok = await copyText(text);
    if (!ok) {
      toast.error("复制失败", { description: "请手动选中后复制" });
      return;
    }
    setCopiedField(field);
    toast.success(field === "link" ? "邀请链接已复制" : "邀请码已复制");
    window.setTimeout(() => setCopiedField(""), 2000);
  };

  const handleSendEmail = async () => {
    const email = emailInput.trim();
    if (!email || !email.includes("@")) {
      toast.error("请输入有效的邮箱地址");
      return;
    }
    setSendingEmail(true);
    try {
      const token = getInviteAuthToken();
      const response = await fetch(`${getInviteApiBaseUrl()}/api/invite/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(typeof payload.error === "string" ? payload.error : "发送失败");
        return;
      }
      toast.success("邀请邮件已发送", { description: `已发送到 ${email}` });
      setEmailInput("");
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setSendingEmail(false);
    }
  };

  const subtleText = isDark ? "oklch(0.68 0.01 270)" : "oklch(0.45 0.01 270)";
  const cardBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0.97 0.005 270)";
  const cardBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0.9 0.005 270)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift size={18} style={{ color: "oklch(0.68 0.19 150)" }} />
            邀请好友，双方得积分
          </DialogTitle>
          <DialogDescription>
            把链接分享给好友，好友注册并完成首次付费后，你和好友都会收到积分奖励。
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: subtleText }}>
            <Loader2 size={16} className="animate-spin" />
            正在加载邀请信息…
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center text-sm" style={{ color: "oklch(0.65 0.2 25)" }}>
            {error}
          </div>
        )}

        {!loading && !error && summary && (
          <div className="space-y-4">
            {/* 奖励说明 */}
            <div className="rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-medium" style={{ color: subtleText }}>你可获得</div>
                  <div className="text-[22px] font-bold" style={{ color: "oklch(0.68 0.19 150)" }}>
                    {summary.inviterCredits.toLocaleString("zh-CN")}
                    <span className="ml-1 text-[12px] font-normal" style={{ color: subtleText }}>积分</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium" style={{ color: subtleText }}>好友可获得</div>
                  <div className="text-[22px] font-bold" style={{ color: "oklch(0.72 0.18 200)" }}>
                    {summary.inviteeCredits.toLocaleString("zh-CN")}
                    <span className="ml-1 text-[12px] font-normal" style={{ color: subtleText }}>积分</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: subtleText }}>
                奖励在好友完成首次付费（满 HKD {summary.minPaidAmountHkd}）后自动发放，
                有效期 {summary.rewardCreditValidDays} 天。
                邀请关系自好友注册起 {summary.bindingValidDays} 天内有效。
              </p>
            </div>

            {/* 邮箱邀请 */}
            <div className="space-y-2">
              <div className="text-[12px] font-medium" style={{ color: subtleText }}>输入好友邮箱直接发送</div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: subtleText, opacity: 0.6 }} />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !sendingEmail) {
                        void handleSendEmail();
                      }
                    }}
                    placeholder="friend@example.com"
                    disabled={sendingEmail}
                    className="w-full rounded-lg px-3 py-2 pl-9 text-[13px] outline-none transition-colors"
                    style={{
                      background: cardBg,
                      border: `1px solid ${cardBorder}`,
                      color: isDark ? "#f1f1f3" : "#18181b",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSendEmail()}
                  disabled={sendingEmail || !emailInput.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: sendingEmail || !emailInput.trim() ? cardBg : "oklch(0.58 0.22 290)",
                    color: sendingEmail || !emailInput.trim() ? subtleText : "white",
                    border: `1px solid ${cardBorder}`,
                  }}
                >
                  {sendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendingEmail ? "发送中" : "发送"}
                </button>
              </div>
            </div>

            {/* 邀请链接 */}
            <div className="space-y-2">
              <div className="text-[12px] font-medium" style={{ color: subtleText }}>或复制链接分享</div>
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <span className="flex-1 truncate text-[12px] font-mono">{inviteLink || "—"}</span>
                <button
                  type="button"
                  onClick={() => void handleCopy("link")}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                  style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
                >
                  {copiedField === "link" ? <Check size={12} /> : <Copy size={12} />}
                  {copiedField === "link" ? "已复制" : "复制"}
                </button>
              </div>
            </div>

            {/* 邀请码 */}
            <div className="space-y-2">
              <div className="text-[12px] font-medium" style={{ color: subtleText }}>邀请码</div>
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <span className="flex-1 text-[16px] font-bold tracking-[0.2em] font-mono">
                  {summary.inviteCode || "—"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy("code")}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: subtleText }}
                >
                  {copiedField === "code" ? <Check size={12} /> : <Copy size={12} />}
                  {copiedField === "code" ? "已复制" : "复制"}
                </button>
              </div>
            </div>

            {/* 我的邀请战绩 */}
            <div className="rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="mb-3 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: subtleText }}>
                <Users size={13} />
                我的邀请
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[18px] font-bold">{summary.rewardedCount}</div>
                  <div className="text-[11px]" style={{ color: subtleText }}>已获奖励</div>
                </div>
                <div>
                  <div className="text-[18px] font-bold">{summary.pendingCount}</div>
                  <div className="text-[11px]" style={{ color: subtleText }}>待付费</div>
                </div>
                <div>
                  <div className="text-[18px] font-bold">{summary.earnedCredits.toLocaleString("zh-CN")}</div>
                  <div className="text-[11px]" style={{ color: subtleText }}>累计积分</div>
                </div>
              </div>
              <p className="mt-3 text-[11px]" style={{ color: subtleText }}>
                剩余可获奖名额 {summary.remainingQuota} / {summary.maxQuota} 人
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
