/**
 * InviteDialog — 邀请好友得积分
 *
 * ⚠️ 这个弹窗**只展示，不发放**。
 * 奖励的唯一发放点在后端订单支付成功链路（server/admin-store.ts 的
 * markBillingOrderPaid），前端没有、也不应该有任何"领取"按钮 ——
 * 本项目注册链路零成本（无邮箱验证/无手机号/无验证码），
 * 任何由用户主动触发的发放都会重新打开刷号缺口。
 * 详见 server/invite-rewards.ts 顶部说明。
 *
 * ⚠️ 分享渠道：只做「复制链接」，刻意不做「输入邮箱直接发送」。
 * 2026-09-13 实测：邮件发往 outlook.com / hotmail.com 会被微软
 * 服务器端静默丢弃 —— 不进垃圾箱、无退信 NDR、发件方零感知；
 * 同一封同构邮件 Gmail 能正常收到，Outlook 收不到。
 * 根因是新域名没有发信信誉，属于收件商侧策略，短期内无法从代码解决。
 * 复制链接让用户自己经微信/QQ 转发，送达率 100% 且零成本。
 * 后端路由仍保留未删，将来域名信誉建立后可重新启用。
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2, Users } from "lucide-react";
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

/**
 * 一次性复制的完整邀请话术。
 *
 * 为什么主推整段文案，而不是只复制链接、或把「链接+邀请码」拼一起：
 *
 *   1. 只给链接时，收到的人不知道这是什么、点进去能得到什么，
 *      在微信里一条裸链接的打开率极低，还容易被当成广告。
 *   2. 邀请码必须同时给出，但**不是**因为需要手动输入（链接已自动带上），
 *      而是**兜底**：部分聊天工具/公众号会截断或改写 URL 的查询参数，
 *      一旦 ?invite= 丢了，链接照样能打开，邀请关系却悄悄没了 ——
 *      这类丢失全程零报错，是最难发现的一种。留一份明文码，
 *      用户至少能人工核对或找客服追回。
 *   3. 必须写清奖励条件（注册 + 首次付费满额），否则朋友注册完
 *      等着积分到账，最后只会变成对平台的不信任。
 *
 * ⚠️ 数字一律从接口返回的 summary 取，不要在文案里写死 ——
 * 奖励配置在 shared/billing-config.ts 里会调整，写死必然导致
 * 「文案说 200、实际发 300」这种对不上账的投诉。
 */
function buildInviteMessage(summary: InviteSummary, link: string) {
  if (!link) return "";
  return [
    `我在用 ArtX Studio 做 AI 图像创作，挺好用的，邀请你一起来试试。`,
    ``,
    `点这个链接注册：${link}`,
    `我的邀请码：${summary.inviteCode}（链接已自动带上，若打不开可手动填写）`,
    ``,
    `注册后完成首次付费（满 HKD ${summary.minPaidAmountHkd}），你可得 ${summary.inviteeCredits} 积分。`,
  ].join("\n");
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
  const [copiedField, setCopiedField] = useState<"message" | "link" | "code" | "">("");

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
  const inviteMessage = summary ? buildInviteMessage(summary, inviteLink) : "";

  const handleCopy = async (field: "message" | "link" | "code") => {
    const text =
      field === "message" ? inviteMessage : field === "link" ? inviteLink : summary?.inviteCode || "";
    const ok = await copyText(text);
    if (!ok) {
      toast.error("复制失败", { description: "请手动选中后复制" });
      return;
    }
    setCopiedField(field);
    toast.success(
      field === "message" ? "邀请消息已复制" : field === "link" ? "邀请链接已复制" : "邀请码已复制",
    );
    window.setTimeout(() => setCopiedField(""), 2000);
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

            {/*
              一次性复制 —— 唯一主推动作，说明见 buildInviteMessage 注释。
              链接和邀请码降为次级操作：绝大多数人只需要"复制、粘贴、发送"三步，
              把三个同等分量的按钮摆在一起反而让人犹豫该点哪个。
            */}
            <div className="space-y-2">
              <div className="text-[12px] font-medium" style={{ color: subtleText }}>
                一键复制邀请消息，粘贴给好友
              </div>
              <div
                className="rounded-lg px-3 py-2.5"
                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <pre
                  className="max-h-[124px] overflow-y-auto whitespace-pre-wrap break-all text-[11.5px] leading-relaxed"
                  style={{ color: subtleText, fontFamily: "inherit" }}
                >
                  {inviteMessage || "—"}
                </pre>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy("message")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-colors"
                style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
              >
                {copiedField === "message" ? <Check size={15} /> : <Copy size={15} />}
                {copiedField === "message" ? "已复制，去粘贴给好友" : "复制邀请消息（含链接和邀请码）"}
              </button>
              <p className="text-[11px]" style={{ color: subtleText }}>
                好友点链接注册即自动绑定，无需手动输入邀请码。
              </p>
            </div>

            {/* 链接与邀请码 —— 次级操作，给需要单独使用的场景留出口 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCopy("link")}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium transition-colors"
                style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: subtleText }}
              >
                {copiedField === "link" ? <Check size={12} /> : <Copy size={12} />}
                {copiedField === "link" ? "已复制" : "只复制链接"}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy("code")}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium transition-colors"
                style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: subtleText }}
              >
                {copiedField === "code" ? <Check size={12} /> : <Copy size={12} />}
                <span className="font-mono tracking-[0.12em]">{summary.inviteCode || "—"}</span>
              </button>
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
