import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildInviteReportCsv,
  clampCommissionRate,
  estimateDirectCommissionHkd,
  INVITEE_STATE_LABEL,
  MAX_COMMISSION_RATE_PERCENT,
  type InviteReport,
  type InviteRewardConfigView,
} from "./invite-admin-report";

type ConfigLimits = {
  maxPairCostRatio: number;
  maxInviterExposureHkd: number;
  maxBindingValidDays: number;
  maxRewardedInvitesPerUser: number;
  worstCreditsPerHkd: number;
  cheapestMonthlyPlanHkd: number;
  maxRewardCreditValidDays: number;
};

type EditableKey =
  | "inviterCredits"
  | "inviteeCredits"
  | "maxRewardedInvitesPerUser"
  | "bindingValidDays"
  | "rewardCreditValidDays"
  | "minPaidAmountHkd";

const FIELDS: Array<{ key: EditableKey; label: string; unit: string }> = [
  { key: "inviterCredits", label: "邀请人奖励", unit: "积分/人" },
  { key: "inviteeCredits", label: "被邀请人奖励", unit: "积分" },
  { key: "maxRewardedInvitesPerUser", label: "单人奖励上限", unit: "人" },
  { key: "minPaidAmountHkd", label: "首付门槛", unit: "HKD" },
  { key: "bindingValidDays", label: "绑定有效期", unit: "天" },
  { key: "rewardCreditValidDays", label: "奖励积分有效期", unit: "天" },
];

function toDraft(config?: InviteRewardConfigView): Record<EditableKey, string> {
  return {
    inviterCredits: String(config?.inviterCredits ?? ""),
    inviteeCredits: String(config?.inviteeCredits ?? ""),
    maxRewardedInvitesPerUser: String(config?.maxRewardedInvitesPerUser ?? ""),
    bindingValidDays: String(config?.bindingValidDays ?? ""),
    rewardCreditValidDays: String(config?.rewardCreditValidDays ?? ""),
    minPaidAmountHkd: String(config?.minPaidAmountHkd ?? ""),
  };
}

/** 前端即时提示用；最终以服务端 validateInviteRewardConfig 为准。 */
function previewErrors(draft: Record<EditableKey, string>, limits?: ConfigLimits): string[] {
  const v = Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key])])) as Record<EditableKey, number>;
  const errors: string[] = [];
  for (const f of FIELDS) {
    if (!Number.isInteger(v[f.key]) || v[f.key] <= 0) errors.push(`${f.label}必须是正整数`);
  }
  if (errors.length || !limits) return errors;
  const pairHkd = (v.inviterCredits + v.inviteeCredits) / limits.worstCreditsPerHkd;
  if (pairHkd / v.minPaidAmountHkd > limits.maxPairCostRatio) {
    errors.push(`双方奖励合计约 ${pairHkd.toFixed(2)} HKD，超过门槛的 ${limits.maxPairCostRatio * 100}%`);
  }
  const exposure = (v.inviterCredits * v.maxRewardedInvitesPerUser) / limits.worstCreditsPerHkd;
  if (exposure > limits.maxInviterExposureHkd) {
    errors.push(`单个邀请人最多可领约 ${exposure.toFixed(0)} HKD，超过 ${limits.maxInviterExposureHkd} HKD 上限`);
  }
  if (v.inviterCredits < v.inviteeCredits) errors.push("邀请人奖励不得低于被邀请人");
  if (v.minPaidAmountHkd < limits.cheapestMonthlyPlanHkd) errors.push(`首付门槛不得低于 ${limits.cheapestMonthlyPlanHkd} HKD`);
  if (v.rewardCreditValidDays > limits.maxRewardCreditValidDays) errors.push(`奖励积分有效期不得超过 ${limits.maxRewardCreditValidDays} 天`);
  if (v.bindingValidDays > limits.maxBindingValidDays) errors.push(`绑定有效期不得超过 ${limits.maxBindingValidDays} 天`);
  if (v.maxRewardedInvitesPerUser > limits.maxRewardedInvitesPerUser) errors.push(`单人奖励上限不得超过 ${limits.maxRewardedInvitesPerUser}`);
  return errors;
}

export function InviteManagementPanel({
  token,
  config,
  limits,
  onSaveConfig,
}: {
  token: string;
  config?: InviteRewardConfigView;
  limits?: ConfigLimits;
  onSaveConfig: (payload: Record<string, unknown>) => Promise<void> | void;
}) {
  const [report, setReport] = useState<InviteReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ratePercent, setRatePercent] = useState("10");
  const [draft, setDraft] = useState(() => toDraft(config));

  useEffect(() => {
    setDraft(toDraft(config));
  }, [config]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/invites", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      // 先判 status 再读 body（项目判据：413/502 的 HTML 体会被误判）。
      if (!response.ok) throw new Error(payload.error || `邀请数据加载失败（${response.status}）`);
      setReport(payload as InviteReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "邀请数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const rate = clampCommissionRate(ratePercent);
  const errors = useMemo(() => previewErrors(draft, limits), [draft, limits]);

  const inviters = useMemo(() => {
    const list = report?.inviters || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) =>
      row.inviterName.toLowerCase().includes(q)
      || row.inviteCode.toLowerCase().includes(q)
      || row.invitees.some((item) => item.username.toLowerCase().includes(q))
    );
  }, [report, query]);

  const totalCommission = useMemo(
    () => Math.round(inviters.reduce((sum, row) => sum + estimateDirectCommissionHkd(row, rate), 0) * 100) / 100,
    [inviters, rate]
  );

  function handleExport() {
    const csv = buildInviteReportCsv(inviters, rate);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `ArtX邀请关系_${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleSave() {
    if (errors.length) return;
    const ok = window.confirm(
      `确认更新邀请奖励配置？\n邀请人 ${draft.inviterCredits} 积分 / 被邀请人 ${draft.inviteeCredits} 积分，` +
      `门槛 ${draft.minPaidAmountHkd} HKD，上限 ${draft.maxRewardedInvitesPerUser} 人。\n` +
      "仅对之后发生的首次付费生效，已发放的奖励不变。"
    );
    if (!ok) return;
    await onSaveConfig({
      ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key])])),
      confirmation: "CONFIRM_INVITE_REWARD_CONFIG",
    });
    load();
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-start gap-3 rounded-md border border-emerald-300/25 bg-emerald-300/[0.06] p-3 text-xs text-emerald-100/85">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
        <div>
          <div className="font-medium text-emerald-200">合规口径：只统计、只分成「直接邀请」一层</div>
          <div className="mt-1 text-emerald-100/65">
            A 邀请 B、B 又邀请 C 时，C 只算 B 的邀请，与 A 无关；A 的人数与分成基数里永远不包含 C。
            按多层下线计酬属于《禁止传销条例》所禁止的「团队计酬」，系统不提供多级数据。
          </div>
        </div>
      </div>

      {/* 奖励配置 */}
      <div className="rounded-md border border-white/10 bg-slate-950/35 p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">邀请奖励积分配置</h3>
            <p className="mt-1 text-xs text-slate-400">
              奖励在<strong className="text-slate-200">被邀请人首次付费</strong>满门槛后发放（注册不发）。改动只影响之后的付费。
            </p>
          </div>
          <Button
            className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:w-auto"
            disabled={errors.length > 0}
            onClick={handleSave}
          >
            保存奖励配置
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((field) => (
            <label key={field.key} className="rounded-md border border-white/8 bg-white/[0.03] p-3">
              <div className="text-xs text-slate-400">{field.label}（{field.unit}）</div>
              <Input
                value={draft[field.key]}
                inputMode="numeric"
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                className="mt-2 border-white/12 bg-white/5"
                aria-label={field.label}
              />
            </label>
          ))}
        </div>
        {errors.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-md border border-rose-300/25 bg-rose-300/[0.06] p-3 text-xs text-rose-200">
            {errors.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        ) : limits ? (
          <p className="mt-3 text-xs text-slate-500">
            按最差汇率 {limits.worstCreditsPerHkd} 积分/HKD 估算：单对成本 ≤ 门槛 {limits.maxPairCostRatio * 100}%，
            单个邀请人最多领 ≤ {limits.maxInviterExposureHkd} HKD。退款率封禁阈值
            {config ? ` ${(config.refundRateAlertThreshold * 100).toFixed(0)}%（≥${config.refundRateMinSamples} 单）` : ""}
            为风控参数，不在此开放。
          </p>
        ) : null}
      </div>

      {/* 邀请关系名单 */}
      <div className="rounded-md border border-white/10 bg-slate-950/35 p-4">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold">邀请关系名单</h3>
            <p className="mt-1 text-xs text-slate-400">
              {report
                ? `${report.totals.inviterCount} 位邀请人 · 直接邀请注册 ${report.totals.inviteeCount} 人 · 付费 ${report.totals.paidInviteeCount} 人 · 净付费 ${report.totals.netPaidHkd} HKD · 已发奖励 ${report.totals.rewardCreditsGranted} 积分`
                : loading ? "加载中…" : "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              分成比例 %（≤{MAX_COMMISSION_RATE_PERCENT}）
              <Input
                value={ratePercent}
                inputMode="decimal"
                onChange={(event) => setRatePercent(event.target.value)}
                className="mt-1 h-9 w-24 border-white/12 bg-white/5"
                aria-label="分成比例"
              />
            </label>
            <Input
              value={query}
              placeholder="搜邀请人 / 邀请码 / 被邀请账号"
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-56 border-white/12 bg-white/5"
              aria-label="搜索邀请关系"
            />
            <Button variant="outline" className="h-9 border-white/15 bg-transparent" onClick={load} disabled={loading}>
              刷新
            </Button>
            <Button variant="outline" className="h-9 border-white/15 bg-transparent" onClick={handleExport} disabled={!inviters.length}>
              <Download className="mr-1 size-4" />导出 CSV
            </Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          估算分成 = 直接邀请用户净付费（已付 − 已退）× {rate}%，当前筛选合计 <strong className="text-slate-200">{totalCommission} HKD</strong>。
          此处仅为估算，不会自动打款；实际结算请线下核对并走财务流程。
        </p>
        {error && <div className="mb-3 text-xs text-rose-300">{error}</div>}

        {inviters.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">{loading ? "加载中…" : "暂无邀请关系"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-slate-400">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-2">邀请人</th>
                  <th className="py-2 pr-2">邀请码</th>
                  <th className="py-2 pr-2 text-right">直接邀请</th>
                  <th className="py-2 pr-2 text-right">付费人数</th>
                  <th className="py-2 pr-2 text-right">已发奖/上限</th>
                  <th className="py-2 pr-2 text-right">净付费 HKD</th>
                  <th className="py-2 pr-2 text-right">估算分成 HKD</th>
                  <th className="py-2 pr-2 text-right">已获积分</th>
                </tr>
              </thead>
              <tbody>
                {inviters.map((row) => {
                  const open = expanded[row.inviterId] === true;
                  return (
                    <InviterRows
                      key={row.inviterId}
                      open={open}
                      onToggle={() => setExpanded((current) => ({ ...current, [row.inviterId]: !open }))}
                      row={row}
                      commission={estimateDirectCommissionHkd(row, rate)}
                      maxQuota={report?.config.maxRewardedInvitesPerUser ?? 0}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InviterRows({
  row,
  open,
  onToggle,
  commission,
  maxQuota,
}: {
  row: InviteReport["inviters"][number];
  open: boolean;
  onToggle: () => void;
  commission: number;
  maxQuota: number;
}) {
  return (
    <>
      <tr className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]" onClick={onToggle}>
        <td className="py-2 pr-2">
          <span className="inline-flex items-center gap-1">
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <span className="font-medium text-slate-100">{row.inviterName}</span>
            {row.inviterStatus === "disabled" && <span className="rounded bg-rose-400/15 px-1 text-rose-300">已停用</span>}
            {row.acceptDisabled && <span className="rounded bg-amber-400/15 px-1 text-amber-200">暂停邀请</span>}
          </span>
        </td>
        <td className="py-2 pr-2 font-mono text-slate-300">{row.inviteCode || "—"}</td>
        <td className="py-2 pr-2 text-right text-slate-100">{row.directInviteCount}</td>
        <td className="py-2 pr-2 text-right">{row.paidInviteCount}</td>
        <td className="py-2 pr-2 text-right">{row.rewardedCount}/{maxQuota}</td>
        <td className="py-2 pr-2 text-right">{row.directNetPaidHkd}</td>
        <td className="py-2 pr-2 text-right text-cyan-200">{commission}</td>
        <td className="py-2 pr-2 text-right">{row.earnedRewardCredits}</td>
      </tr>
      {open && (
        <tr className="border-b border-white/5 bg-white/[0.02]">
          <td colSpan={8} className="px-6 py-2">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-2 text-left">被邀请账号</th>
                  <th className="py-1 pr-2 text-left">绑定时间</th>
                  <th className="py-1 pr-2 text-left">状态</th>
                  <th className="py-1 pr-2 text-right">订单</th>
                  <th className="py-1 pr-2 text-right">已付</th>
                  <th className="py-1 pr-2 text-right">已退</th>
                  <th className="py-1 pr-2 text-right">净付费</th>
                  <th className="py-1 pr-2 text-right">邀请人得分</th>
                </tr>
              </thead>
              <tbody>
                {row.invitees.map((item) => (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="py-1 pr-2 text-slate-200">{item.username}</td>
                    <td className="py-1 pr-2 text-slate-400">{item.invitedAt ? item.invitedAt.slice(0, 16).replace("T", " ") : "—"}</td>
                    <td className="py-1 pr-2">{INVITEE_STATE_LABEL[item.state] || item.state}</td>
                    <td className="py-1 pr-2 text-right">{item.paidOrders}</td>
                    <td className="py-1 pr-2 text-right">{item.paidHkd}</td>
                    <td className="py-1 pr-2 text-right">{item.refundedHkd}</td>
                    <td className="py-1 pr-2 text-right">{item.netPaidHkd}</td>
                    <td className="py-1 pr-2 text-right">{item.inviterRewardCredits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
