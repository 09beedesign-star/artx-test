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
import { Check, Copy, Gift, Loader2, PauseCircle, PlayCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "@/lib/api-base-url";
import { useTheme } from "@/contexts/ThemeContext";
import { TOUR_ANCHORS } from "@shared/onboarding-steps";

export interface InviteSummary {
  inviteCode: string;
  /** 是否已暂停接受新绑定。暂停只挡新人，不影响已有关系与已发积分。 */
  acceptDisabled: boolean;
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
  const [toggling, setToggling] = useState(false);

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

  /*
   * 切换暂停开关。
   *
   * ⚠️ 成功后用后端返回的 summary 整体覆盖，而不是本地 setState 翻转布尔。
   * 本地翻转会让「后端因为别的原因没写成」在界面上表现为已生效，
   * 用户以为已经停掉了，实际还在接新绑定 —— 安全开关尤其不能这样骗人。
   */
  const handleToggleAccept = async () => {
    if (!summary || toggling) return;
    const next = !summary.acceptDisabled;
    const token = getInviteAuthToken();
    if (!token) {
      toast.error("请先登录");
      return;
    }
    setToggling(true);
    try {
      const response = await fetch(`${getInviteApiBaseUrl()}/api/invite/toggle-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disabled: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(typeof payload.error === "string" ? payload.error : "操作失败，请稍后重试");
        return;
      }
      setSummary(payload as InviteSummary);
      toast.success(next ? "已暂停接受新邀请" : "已恢复接受新邀请", {
        description: next ? "已邀请的好友和已获积分不受影响" : "好友现在可以正常通过你的链接注册",
      });
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setToggling(false);
    }
  };

  const subtleText = isDark ? "oklch(0.68 0.01 270)" : "oklch(0.45 0.01 270)";
  const cardBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0.97 0.005 270)";
  const cardBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0.9 0.005 270)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        【2026-09-13 定高改造】弹窗定高 800px，标题固定、内容区内部滚动。

        改之前：`DialogContent` 只约束了宽度，高度完全由内容撑。邀请信息一多
        （奖励说明 + 暂停横幅 + 话术 + 三个复制按钮 + 战绩 + 开关），整个弹窗就
        比视口还高，**上下两头被挤出屏幕** —— 顶部标题和底部的暂停开关都点不到。

        ⚠️⚠️ 这里有两个必须成对出现的写法，少一个都会「看起来改了但没用」：

        1. `grid-rows-[auto_minmax(0,1fr)]`
           基座是 `grid`。**grid 子项的 `min-height` 默认是 `auto`**，意思是
           「不许小于内容高度」。所以哪怕外层定高 800、内层写了 `overflow-y-auto`，
           子项照样会被内容顶开、直接撑破 800 —— 滚动条永远不出现，白改。
           必须写成 `minmax(0,1fr)` 把下限显式压到 0，才允许它收缩并触发滚动。
           （`1fr` 是 `minmax(auto,1fr)` 的简写，正是问题本身，不能用。）

        2. `overflow-hidden`
           定高之后内容仍可能溢出圆角边框，裁掉才不会露在 `rounded-lg` 外面。

        `max-h-[calc(100vh-2rem)]` 是兜底：视口本身不足 800 时（小屏 / 浏览器窗口
        被压扁）必须让步，否则又会复现「上下被顶出去」这个原始症状。
      */}
      <DialogContent className="grid h-[800px] max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift size={18} style={{ color: "oklch(0.68 0.19 150)" }} />
            邀请好友，双方得积分
          </DialogTitle>
          <DialogDescription>
            把链接分享给好友，好友注册并完成首次付费后，你和好友都会收到积分奖励。
          </DialogDescription>
        </DialogHeader>

        {/*
          滚动区。三个状态（加载 / 出错 / 正常）**共用同一个滚动容器**，
          这样 grid 永远只有「标题 + 内容」两行，和上面的 grid-rows 严格对齐；
          若让三个分支各自当 grid item，行数会随状态变化，模板就对不上了。

          `-mr-2 pr-2`：把滚动条挪进 `p-6` 的右侧留白里，
          内容的视觉宽度和改造前保持一致，不会因为多了滚动条而横向缩一截。
        */}
        <div className="-mr-2 overflow-y-auto pr-2">
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
              <div data-tour-id={TOUR_ANCHORS.inviteReward} className="rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
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
                暂停态横幅。
                ⚠️ 必须写明「已邀请的好友和已获积分不受影响」——
                用户按下暂停时最担心的就是「我之前的奖励会不会没了」，
                不在这里当场回答，用户就不敢用这个开关，等于功能白做。
              */}
              {summary.acceptDisabled && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: isDark ? "oklch(0.65 0.15 60 / 12%)" : "oklch(0.95 0.06 75)",
                    border: `1px solid ${isDark ? "oklch(0.7 0.15 65 / 30%)" : "oklch(0.82 0.11 70)"}`,
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 text-[12px] font-semibold"
                    style={{ color: isDark ? "oklch(0.82 0.14 70)" : "oklch(0.5 0.13 60)" }}
                  >
                    <PauseCircle size={14} />
                    邀请码已暂停，新好友无法再绑定到你名下
                  </div>
                  <p
                    className="mt-1.5 text-[11px] leading-relaxed"
                    style={{ color: isDark ? "oklch(0.75 0.08 70)" : "oklch(0.45 0.09 60)" }}
                  >
                    已邀请的好友、已到账的积分、历史统计全部不受影响。
                    随时可以恢复，邀请码不会改变，之前发出去的链接恢复后照常有效。
                  </p>
                </div>
              )}

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
                {/*
                  ⚠️ 暂停态禁用复制，而不是照常允许。
                  暂停时复制出去的链接，好友点开能打开站点、能注册，
                  但邀请关系会被后端闸门静默拒绝 —— 全程零报错，
                  等好友付了钱才发现没奖励，而 hasPaid 落盘后没有第二次机会补绑。
                  与其事后无法挽回，不如在这里就拦住。
                */}
                <button
                  type="button"
                  disabled={summary.acceptDisabled}
                  onClick={() => void handleCopy("message")}
                  data-tour-id={TOUR_ANCHORS.inviteCopyMessage}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-colors"
                  style={{
                    background: summary.acceptDisabled ? cardBg : "oklch(0.58 0.22 290)",
                    color: summary.acceptDisabled ? subtleText : "white",
                    border: summary.acceptDisabled ? `1px solid ${cardBorder}` : "none",
                    cursor: summary.acceptDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {copiedField === "message" ? <Check size={15} /> : <Copy size={15} />}
                  {summary.acceptDisabled
                    ? "已暂停邀请，恢复后可复制"
                    : copiedField === "message"
                      ? "已复制，去粘贴给好友"
                      : "复制邀请消息（含链接和邀请码）"}
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
                  data-tour-id={TOUR_ANCHORS.inviteCode}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium transition-colors"
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: subtleText }}
                >
                  {copiedField === "code" ? <Check size={12} /> : <Copy size={12} />}
                  <span className="font-mono tracking-[0.12em]">{summary.inviteCode || "—"}</span>
                </button>
              </div>

              {/* 我的邀请战绩 */}
              <div data-tour-id={TOUR_ANCHORS.inviteStats} className="rounded-xl p-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
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

              {/*
                暂停 / 恢复开关。
                刻意放在最底部：这是低频的安全动作，不该和高频的「复制分享」抢注意力。
                文案回答的是「我为什么需要它」而不是「它是什么」—— 用户不关心
                inviteAcceptDisabled 这个字段，只关心「码传出去了怎么办」。
              */}
              <div
                className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-medium">
                    {summary.acceptDisabled ? "邀请已暂停" : "暂停接受新邀请"}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: subtleText }}>
                    {summary.acceptDisabled
                      ? "恢复后好友可继续通过你的链接注册。"
                      : "担心邀请码流传到不该去的地方时，可随时暂停，已有奖励不受影响。"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={toggling}
                  onClick={() => void handleToggleAccept()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
                  style={{
                    background: summary.acceptDisabled ? "oklch(0.68 0.19 150)" : "transparent",
                    color: summary.acceptDisabled ? "white" : subtleText,
                    border: summary.acceptDisabled ? "none" : `1px solid ${cardBorder}`,
                    opacity: toggling ? 0.6 : 1,
                    cursor: toggling ? "wait" : "pointer",
                  }}
                >
                  {toggling ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : summary.acceptDisabled ? (
                    <PlayCircle size={13} />
                  ) : (
                    <PauseCircle size={13} />
                  )}
                  {summary.acceptDisabled ? "恢复邀请" : "暂停"}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
