/**
 * 积分规则板块。
 *
 * /billing 页面与 /credits-guide 规则页共用同一个组件，
 * 两边看到的数字、文案、图表完全一致 —— 本项目的老坑是「同一份数据的多个出口」，
 * 表现永远是零报错、改了一边另一边纹丝不动。
 *
 * ⚠️ 本文件**不许出现任何硬编码的积分/价格数字**。
 * 所有数字来自 @shared/credit-rules（它再向下追溯到 ai-credit-policy 与
 * billing-config）。这条不是洁癖：呈现在这里是「对用户的正式承诺」，
 * 与后台实际扣费不一致就是合规问题。
 *
 * 图表刻意不引 recharts：这里全是静态比例条，用 flex/宽度百分比就够了，
 * 引入图表库只会额外带来容器宽高为 0 时不渲染的老问题。
 */
import { useMemo } from "react";
import {
  ArrowUpRight,
  Coins,
  Gift,
  Layers,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import {
  REFERENCE_IMAGE_CREDITS,
  buildFreeCreditChannels,
  buildFreeCreditTotal,
  buildImageQualityLadder,
  buildPlanValueRows,
  buildRechargeRows,
  buildResolutionLadder,
  buildUnitCreditRows,
  getWelcomePackage,
  imagesFromCredits,
} from "@shared/credit-rules";
import { formatCredits } from "@shared/billing-config";
import type { BillingTheme } from "./billing-theme";

type Tone = "green" | "purple" | "cyan";

function toneColor(tone: Tone, isDark: boolean) {
  if (tone === "green") return "#C5ED47";
  return isDark ? "oklch(0.72 0.18 292)" : "oklch(0.52 0.20 292)";
}

/**
 * 通用比例条。
 *
 * ⚠️ 宽度保底 3%：值为 0 的条目如果宽度真的是 0，
 * 用户看到的不是「这项很便宜」，而是「这一行坏了」。
 */
function BarRow({
  label,
  hint,
  valueLabel,
  ratio,
  tone,
  theme,
}: {
  label: string;
  hint?: string;
  valueLabel: string;
  ratio: number;
  tone: Tone;
  theme: BillingTheme;
}) {
  const { border, text, faint } = theme;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate type-caption" style={{ color: text }}>
          {label}
        </span>
        <span
          className="shrink-0 type-caption"
          style={{ color: toneColor(tone, theme.isDark), fontWeight: 720 }}
        >
          {valueLabel}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-[var(--radius-pill)]"
        style={{ background: theme.isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 6%)" }}
      >
        <div
          className="h-full rounded-[var(--radius-pill)]"
          style={{
            width: `${Math.max(3, Math.min(100, ratio * 100))}%`,
            background: toneColor(tone, theme.isDark),
            transition: "width 420ms ease",
          }}
        />
      </div>
      {hint && (
        <div className="mt-1 type-caption" style={{ color: faint, fontSize: 11 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  desc,
  theme,
}: {
  icon: typeof Coins;
  title: string;
  desc: string;
  theme: BillingTheme;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color: toneColor("green", theme.isDark) }} />
        <h3 className="type-body-sm" style={{ color: theme.text, fontSize: 15, fontWeight: 680 }}>
          {title}
        </h3>
      </div>
      <p className="mt-1.5 type-caption leading-6" style={{ color: theme.sub }}>
        {desc}
      </p>
    </div>
  );
}

export default function CreditRulesBoard({
  theme,
  showFullGuideLink = true,
  onOpenInvite,
}: {
  theme: BillingTheme;
  /** 规则页自身就是规则，不需要再给一个跳自己的入口。 */
  showFullGuideLink?: boolean;
  /** 有值才渲染「邀请好友」按钮 —— 未登录的公开页不该给出登录后才可用的入口。 */
  onOpenInvite?: () => void;
}) {
  const { isDark, panel, panelStrong, border, text, sub, faint, green } = theme;
  const accent = toneColor("green", isDark);
  const accentSoft = isDark ? "oklch(0.78 0.18 110 / 0.12)" : "oklch(0.88 0.14 110 / 0.22)";

  const welcome = useMemo(() => getWelcomePackage(), []);
  const unitRows = useMemo(() => buildUnitCreditRows(), []);
  const qualityLadder = useMemo(() => buildImageQualityLadder(), []);
  const resolutionLadder = useMemo(() => buildResolutionLadder(), []);
  const planRows = useMemo(() => buildPlanValueRows(), []);
  const rechargeRows = useMemo(() => buildRechargeRows(), []);
  const channels = useMemo(() => buildFreeCreditChannels(), []);
  const freeTotal = useMemo(() => buildFreeCreditTotal(), []);

  const fieldBg = isDark ? "oklch(1 0 0 / 0.045)" : "oklch(0 0 0 / 0.03)";
  const cardStyle = { background: fieldBg, borderColor: border };
  const maxQuality = Math.max(...qualityLadder.map(item => item.credits));
  const maxResolution = Math.max(...resolutionLadder.map(item => item.credits));
  const maxPlanRate = Math.max(...planRows.map(item => item.creditsPerHkd));
  const maxRechargeRate = Math.max(...rechargeRows.map(item => item.creditsPerHkd));
  /** 条形基准取「单人可得上限」，否则注册礼包那一条会短到看不出存在的意义。 */
  const maxChannelCredits = Math.max(...channels.map(item => item.maxCredits));

  return (
    <section
      id="credit-rules"
      className="flex flex-col gap-4 rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl"
      style={{ background: panel, borderColor: border }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 type-caption"
            style={{ background: accentSoft, color: accent }}
          >
            <Sparkles size={12} />
            积分规则 · 怎么花最划算
          </div>
          <h2 className="type-title-sm" style={{ color: text, fontSize: 22, fontWeight: 720 }}>
            先把 {formatCredits(welcome.credits)} 积分拿到手，再谈要不要花钱
          </h2>
          <p className="mt-1.5 max-w-[720px] type-body-sm leading-6" style={{ color: sub }}>
            积分是全站统一的创作额度，不绑定某个模型：出图、改图、写文案都从这里扣。
            下面这张图把「一张图花多少、订阅给多少、白拿多少」一次讲清楚。
          </p>
        </div>
        {showFullGuideLink && (
          <Link
            href="/credits-guide"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md-design)] border px-3.5 type-caption transition-opacity hover:opacity-80"
            style={{ borderColor: border, color: sub }}
          >
            完整积分规则
            <ArrowUpRight size={13} />
          </Link>
        )}
      </div>

      {/*
        欢迎礼包 Hero。

        ⚠️ 这里刻意不展示注册礼包的有效期，是 2026-09-19 的产品决策：
        三天这个数字会劝退注册，所以只讲额度和「注册即到账」。
        隐藏仅作用于展示层 —— 服务端依旧按 SIGNUP_INITIAL_CREDITS.expiryDays 到期回收，
        积分规则数据源里 welcome.expiryDays 也继续保留，**不要因为前端不显示就删掉追溯依据**。
        同理，下方三条通道卡片里 signup 那一条也不显示天数。
      */}
      <div
        className="rounded-[var(--radius-lg-design)] border p-4"
        style={{
          background: isDark
            ? "linear-gradient(120deg, oklch(0.78 0.18 110 / 0.14), oklch(0.62 0.20 292 / 0.10))"
            : "linear-gradient(120deg, oklch(0.88 0.14 110 / 0.24), oklch(0.86 0.10 292 / 0.14))",
          borderColor: isDark ? "oklch(0.78 0.18 110 / 0.28)" : "oklch(0.80 0.14 110 / 0.5)",
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-caption" style={{ color: sub }}>
              <Gift size={14} style={{ color: accent }} />
              新用户落地礼包
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <span
                style={{ color: accent, fontSize: 42, fontWeight: 780, lineHeight: 1.05 }}
              >
                {formatCredits(welcome.credits)}
              </span>
              <span className="pb-1.5 type-body-sm" style={{ color: text, fontWeight: 600 }}>
                积分
              </span>
              <span
                className="mb-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 type-caption"
                style={{ background: accentSoft, color: accent }}
              >
                注册即到账
              </span>
            </div>
            <p className="mt-2 type-body-sm leading-6" style={{ color: sub }}>
              按全站默认档 {formatCredits(welcome.imageCredits)} 积分/张算，这一份
              <span style={{ color: text, fontWeight: 600 }}>
                {" "}
                够你出 {welcome.freeImages} 张成品图
              </span>
              。不绑卡、不填邀请码，注册完直接开干。
            </p>
          </div>

          <div className="grid w-full shrink-0 grid-cols-3 gap-2 lg:w-[320px]">
            {[
              /*
                最便宜的一次操作用 Math.min 现算，不能写成「取表里的最后一行」：
                能力顺序会随运营调整而重排，届时"最低消耗"会悄悄变成最贵那档。
              */
              {
                label: "最低单次消耗",
                value: formatCredits(Math.min(...unitRows.map(row => row.credits))),
                unit: "积分 / 次",
              },
              { label: "默认档出图", value: formatCredits(welcome.imageCredits), unit: "积分/张" },
              {
                label: "充值汇率天花板",
                value: formatCredits(Math.max(...rechargeRows.map(row => row.creditsPerHkd))),
                unit: "积分/HKD",
              },
            ].map(metric => (
              <div
                key={metric.label}
                className="rounded-[var(--radius-lg-design)] border p-3"
                style={{ background: panelStrong, borderColor: border }}
              >
                <div className="type-caption" style={{ color: faint, fontSize: 11 }}>
                  {metric.label}
                </div>
                <div className="mt-1" style={{ color: text, fontSize: 18, fontWeight: 720 }}>
                  {metric.value}
                </div>
                <div className="type-caption" style={{ color: faint, fontSize: 11 }}>
                  {metric.unit}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ① 单位消耗：一次做某事花多少积分 */}
        <article className="rounded-[var(--radius-lg-design)] border p-4" style={cardStyle}>
          <SectionTitle
            icon={Coins}
            title="一次操作花多少积分"
            desc="出图只是起点，改图、抠图、扩图都更省 —— 与其重出一张，不如改现有的。"
            theme={theme}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {unitRows.map(row => (
              <div
                key={row.id}
                className="rounded-[var(--radius-md-design)] border px-3 py-2.5"
                style={{ background: panelStrong, borderColor: border }}
              >
                <div className="truncate type-caption" style={{ color: sub, fontSize: 11 }}>
                  {row.label}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span style={{ color: text, fontSize: 17, fontWeight: 720 }}>
                    {formatCredits(row.credits)}
                  </span>
                  <span className="type-caption" style={{ color: faint, fontSize: 11 }}>
                    积分 / {row.unit}
                  </span>
                </div>
                <div className="type-caption" style={{ color: faint, fontSize: 11 }}>
                  {row.hint}
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* ② 出图档位：同一张提示词的三个价位 */}
        <article className="rounded-[var(--radius-lg-design)] border p-4" style={cardStyle}>
          <SectionTitle
            icon={Layers}
            title="同一句提示词，三档价位任挑"
            desc={`选哪一档，直接决定 ${formatCredits(welcome.credits)} 积分能出多少张。`}
            theme={theme}
          />
          <div className="flex flex-col gap-3">
            {qualityLadder.map(rung => (
              <BarRow
                key={rung.id}
                label={`${rung.label} · ${rung.hint}`}
                valueLabel={`${formatCredits(rung.credits)} 积分/张`}
                hint={`${formatCredits(welcome.credits)} 积分礼包含 ${rung.welcomeImages} 张`}
                ratio={rung.credits / maxQuality}
                tone={rung.id === "medium" ? "green" : "purple"}
                theme={theme}
              />
            ))}
          </div>
        </article>

        {/* ③ 分辨率：越大越值，因为平台替你多付了 */}
        <article className="rounded-[var(--radius-lg-design)] border p-4" style={cardStyle}>
          <SectionTitle
            icon={TrendingUp}
            title="分辨率往上走，是平台在补贴"
            desc="下面的倍率不是随手定的：你多付的倍数，刻意低于上游成本上涨的倍数。"
            theme={theme}
          />
          <div className="flex flex-col gap-3">
            {resolutionLadder.map(rung => (
              <BarRow
                key={rung.id}
                label={`${rung.label} · 计费 ×${rung.creditsMultiplier} / 成本 ×${rung.costMultiplier}`}
                valueLabel={`${formatCredits(rung.credits)} 积分/张`}
                hint={
                  rung.isSubsidized
                    ? "平台补贴档：成本涨得比你多付的更多"
                    : rung.id === "1k"
                      ? "基准档：日常创作足够用"
                      : "本地算力放大档：含溢价，真要极限尺寸才动它"
                }
                ratio={rung.credits / maxResolution}
                tone={rung.isSubsidized || rung.id === "1k" ? "green" : "purple"}
                theme={theme}
              />
            ))}
          </div>
        </article>

        {/* ④ 订阅 = 批发价 */}
        <article className="rounded-[var(--radius-lg-design)] border p-4" style={cardStyle}>
          <SectionTitle
            icon={Rocket}
            title="订阅买的不是额度，是汇率"
            desc="每月积分 ÷ 月费 = 每 HKD 换到的积分，都比直接充值更划算，还能按月结转。"
            theme={theme}
          />
          <div className="flex flex-col gap-3">
            {planRows.map(row => (
              <BarRow
                key={row.id}
                label={`${row.name} · 每月 ${formatCredits(row.monthlyCredits)} 积分`}
                valueLabel={`${formatCredits(row.creditsPerHkd)} 积分/HKD`}
                hint={`每月额度够出 ${formatCredits(row.imagesPerMonth)} 张默认档图片`}
                ratio={row.creditsPerHkd / maxPlanRate}
                tone="green"
                theme={theme}
              />
            ))}
          </div>
        </article>

        {/* ⑤ 充值阶梯 */}
        <article className="rounded-[var(--radius-lg-design)] border p-4" style={cardStyle}>
          <SectionTitle
            icon={TrendingUp}
            title="充得越多，每 HKD 换得越狠"
            desc="三档阶梯汇率自动生效，不需要输入优惠码，金额到档就按高档算。"
            theme={theme}
          />
          <div className="flex items-end gap-2">
            {rechargeRows.map(row => (
              <div key={row.minAmount} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="type-caption" style={{ color: accent, fontSize: 13, fontWeight: 720 }}>
                  {formatCredits(row.creditsPerHkd)}
                </span>
                <div
                  className="w-full rounded-[var(--radius-md-design)]"
                  style={{
                    height: `${Math.max(36, (row.creditsPerHkd / maxRechargeRate) * 132)}px`,
                    background:
                      row.boostPercent > 0
                        ? accent
                        : isDark
                          ? "oklch(1 0 0 / 14%)"
                          : "oklch(0 0 0 / 12%)",
                    opacity: row.boostPercent > 0 ? 1 : 0.7,
                  }}
                />
                <span className="text-center type-caption" style={{ color: sub, fontSize: 11 }}>
                  HKD {formatCredits(row.minAmount)} 起
                </span>
                <span className="text-center type-caption" style={{ color: faint, fontSize: 11 }}>
                  {row.boostPercent > 0 ? `多拿 ${row.boostPercent}%` : "起步汇率"}
                </span>
              </div>
            ))}
          </div>
        </article>

        {/* ⑥ 三条白拿通道 */}
        <article className="rounded-[var(--radius-lg-design)] border p-4" style={cardStyle}>
          <SectionTitle
            icon={Users}
            title="不用多花一分钱，也能继续加仓"
            desc={`三条通道全部吃满，单人累计上限 ${formatCredits(freeTotal)} 积分 ≈ ${formatCredits(
              imagesFromCredits(freeTotal, REFERENCE_IMAGE_CREDITS),
            )} 张默认档出图。`}
            theme={theme}
          />
          <div className="flex flex-col gap-3">
            {channels.map(channel => (
              <div
                key={channel.id}
                className="rounded-[var(--radius-md-design)] border p-3"
                style={{ background: panelStrong, borderColor: border }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="type-body-sm" style={{ color: text, fontWeight: 660 }}>
                    {channel.title}
                  </span>
                  <span className="type-caption" style={{ color: accent, fontWeight: 720 }}>
                    +{formatCredits(channel.credits)} 积分
                    <span style={{ color: faint, fontWeight: 400 }}> · {channel.repeatLabel}</span>
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)]"
                  style={{ background: isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 6%)" }}
                >
                  <div
                    className="h-full rounded-[var(--radius-pill)]"
                    style={{
                      width: `${Math.max(4, (channel.maxCredits / maxChannelCredits) * 100)}%`,
                      background: accent,
                    }}
                  />
                </div>
                <p className="mt-2 type-caption leading-5" style={{ color: sub, fontSize: 11 }}>
                  {channel.condition}
                </p>
                <p className="mt-1 type-caption" style={{ color: faint, fontSize: 11 }}>
                  {/*
                    注册礼包的天数不对外展示（决策见 Hero 那段注释）：
                    只剩 signup 三条里的这一条要特殊处理，其余通道照常写明天数，
                    因为它们 mask 的是 gift 的 30 天，写清楚对用户有利。
                  */}
                  {channel.id !== "signup" && `到账后 ${channel.validDays} 天内有效 · `}
                  该通道单人上限 {formatCredits(channel.maxCredits)} 积分
                </p>
                {channel.id === "invite" && onOpenInvite && (
                  <button
                    type="button"
                    onClick={onOpenInvite}
                    className="mt-2 flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-3 type-caption transition-opacity hover:opacity-85"
                    style={{ background: accentSoft, color: accent, fontWeight: 640 }}
                  >
                    <Users size={12} />
                    复制我的邀请链接
                  </button>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg-design)] border p-3.5"
        style={cardStyle}
      >
        <p className="min-w-0 type-caption leading-6" style={{ color: sub }}>
          多种积分同时在账时，系统自动先扣最快过期的那一份，尽量减少浪费。
          会员积分按月发放、未用完可结转 1 个月；充值与赠送积分各自独立计时。
          {welcome.activeUntil && `新用户礼包活动截至 ${welcome.activeUntil}。`}
        </p>
        {showFullGuideLink && (
          <Link
            href="/credits-guide"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md-design)] px-4 type-caption transition-opacity hover:opacity-85"
            style={{ background: accent, color: "#10130A", fontWeight: 720 }}
          >
            查看完整积分规则
            <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
    </section>
  );
}
