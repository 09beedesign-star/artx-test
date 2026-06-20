import { type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  Gift,
  History,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type AdminSection =
  | "overview"
  | "users"
  | "orders"
  | "credits"
  | "feedback"
  | "integrations"
  | "risk"
  | "audit";

type Status = "normal" | "watch" | "blocked";
type OrderStatus = "paid" | "pending" | "failed" | "refunded";
type FeedbackStatus = "new" | "processing" | "resolved";
type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "支付" | "报错" | "接口" | "额度";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  credits: number;
  spent: number;
  status: Status;
  lastSeen: string;
  risk: string;
};

type Order = {
  id: string;
  user: string;
  channel: string;
  amount: number;
  credits: number;
  status: OrderStatus;
  createdAt: string;
};

type Feedback = {
  id: string;
  user: string;
  title: string;
  module: string;
  status: FeedbackStatus;
  priority: "P0" | "P1" | "P2";
  createdAt: string;
};

type OpsAlert = {
  id: string;
  category: AlertCategory;
  title: string;
  detail: string;
  severity: AlertSeverity;
  time: string;
  owner: string;
  unread: boolean;
};

const sections: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  { id: "overview", label: "总览", description: "收入、算力、风险", icon: BarChart3 },
  { id: "users", label: "账户管理", description: "用户、状态、权限", icon: Users },
  { id: "orders", label: "支付订单", description: "支付、退款、对账", icon: CreditCard },
  { id: "credits", label: "额度管理", description: "积分、流水、调整", icon: WalletCards },
  { id: "feedback", label: "用户反馈", description: "意见、工单、回复", icon: MessageSquareText },
  { id: "integrations", label: "第三方接口", description: "支付、模型、密钥", icon: KeyRound },
  { id: "risk", label: "风控安全", description: "异常、限流、黑名单", icon: ShieldCheck },
  { id: "audit", label: "操作审计", description: "管理员动作追踪", icon: History },
];

const users: AdminUser[] = [
  {
    id: "usr_1028",
    name: "林澈",
    email: "lin@example.com",
    plan: "Pro 20K",
    credits: 18420,
    spent: 1299,
    status: "normal",
    lastSeen: "3 分钟前",
    risk: "低",
  },
  {
    id: "usr_1071",
    name: "Mira Studio",
    email: "ops@mira.ai",
    plan: "Team 100K",
    credits: 76310,
    spent: 5980,
    status: "watch",
    lastSeen: "18 分钟前",
    risk: "中",
  },
  {
    id: "usr_1189",
    name: "陈一鸣",
    email: "chen@example.com",
    plan: "Starter",
    credits: 920,
    spent: 99,
    status: "normal",
    lastSeen: "1 小时前",
    risk: "低",
  },
  {
    id: "usr_1220",
    name: "北辰增长",
    email: "finance@beichen.co",
    plan: "Enterprise",
    credits: 241900,
    spent: 32000,
    status: "blocked",
    lastSeen: "昨天",
    risk: "高",
  },
];

const orders: Order[] = [
  {
    id: "ord_90341",
    user: "林澈",
    channel: "Stripe",
    amount: 1299,
    credits: 20000,
    status: "paid",
    createdAt: "今天 11:24",
  },
  {
    id: "ord_90337",
    user: "Mira Studio",
    channel: "支付宝",
    amount: 5980,
    credits: 100000,
    status: "paid",
    createdAt: "今天 09:18",
  },
  {
    id: "ord_90310",
    user: "陈一鸣",
    channel: "微信支付",
    amount: 99,
    credits: 1200,
    status: "pending",
    createdAt: "昨天 21:06",
  },
  {
    id: "ord_90288",
    user: "北辰增长",
    channel: "PayPal",
    amount: 32000,
    credits: 500000,
    status: "failed",
    createdAt: "昨天 16:40",
  },
];

const feedbackSeed: Feedback[] = [
  {
    id: "fb_238",
    user: "Mira Studio",
    title: "批量生成时希望看到每个任务的积分预估",
    module: "额度消耗",
    status: "new",
    priority: "P1",
    createdAt: "今天 10:20",
  },
  {
    id: "fb_231",
    user: "林澈",
    title: "支付成功后积分到账慢了 2 分钟",
    module: "支付",
    status: "processing",
    priority: "P0",
    createdAt: "昨天 22:12",
  },
  {
    id: "fb_218",
    user: "陈一鸣",
    title: "希望支持导出积分流水",
    module: "报表",
    status: "resolved",
    priority: "P2",
    createdAt: "6 月 18 日",
  },
];

const alertSeed: OpsAlert[] = [
  {
    id: "al_901",
    category: "支付",
    title: "微信支付回调待确认",
    detail: "ord_90310 已扣款但积分未入账，建议 15 分钟内补偿或重放回调。",
    severity: "critical",
    time: "2 分钟前",
    owner: "Finance",
    unread: true,
  },
  {
    id: "al_898",
    category: "报错",
    title: "模型任务队列出现 5xx",
    detail: "Model Gateway 最近 10 分钟失败率 7.4%，影响高额度用户批量生成。",
    severity: "critical",
    time: "8 分钟前",
    owner: "AI Ops",
    unread: true,
  },
  {
    id: "al_892",
    category: "接口",
    title: "Render API 延迟升高",
    detail: "任务状态同步平均 812ms，超过观察阈值，可能导致用户误以为任务卡住。",
    severity: "warning",
    time: "19 分钟前",
    owner: "Infra",
    unread: true,
  },
  {
    id: "al_886",
    category: "额度",
    title: "北辰增长触发异常消耗",
    detail: "10 分钟内消耗 80K 积分，已冻结部分额度，等待人工复核。",
    severity: "warning",
    time: "昨天 16:51",
    owner: "Risk",
    unread: false,
  },
];

const creditEvents = [
  { id: "cr_771", user: "林澈", type: "购买入账", amount: "+20,000", actor: "Stripe 回调", note: "ord_90341" },
  { id: "cr_769", user: "Mira Studio", type: "任务消耗", amount: "-3,420", actor: "系统", note: "视频生成 x 12" },
  { id: "cr_762", user: "陈一鸣", type: "人工补偿", amount: "+500", actor: "Admin Eric", note: "支付延迟补偿" },
  { id: "cr_758", user: "北辰增长", type: "冻结额度", amount: "-80,000", actor: "风控规则", note: "异常调用峰值" },
];

const integrations = [
  { name: "Stripe", category: "国际卡支付", state: "在线", latency: "286ms", owner: "Finance" },
  { name: "支付宝", category: "国内支付", state: "在线", latency: "194ms", owner: "Finance" },
  { name: "Render API", category: "后端部署", state: "观察", latency: "812ms", owner: "Infra" },
  { name: "Model Gateway", category: "模型供应商", state: "在线", latency: "438ms", owner: "AI Ops" },
];

const auditRows = [
  { actor: "Admin Eric", action: "给陈一鸣补偿 500 积分", target: "usr_1189", time: "今天 12:06" },
  { actor: "Stripe Webhook", action: "订单支付成功并入账", target: "ord_90341", time: "今天 11:24" },
  { actor: "Risk Rule #07", action: "冻结北辰增长部分额度", target: "usr_1220", time: "昨天 16:51" },
  { actor: "客服 Ava", action: "将反馈标记为处理中", target: "fb_231", time: "昨天 22:20" },
];

function statusLabel(status: Status | OrderStatus | FeedbackStatus) {
  const map: Record<string, string> = {
    normal: "正常",
    watch: "观察",
    blocked: "冻结",
    paid: "已支付",
    pending: "待确认",
    failed: "失败",
    refunded: "已退款",
    new: "新反馈",
    processing: "处理中",
    resolved: "已解决",
  };

  return map[status] ?? status;
}

function statusClass(status: Status | OrderStatus | FeedbackStatus | string) {
  if (["normal", "paid", "resolved", "在线"].includes(status)) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }

  if (["watch", "pending", "processing", "观察"].includes(status)) {
    return "border-amber-400/35 bg-amber-400/10 text-amber-100";
  }

  if (["blocked", "failed", "P0"].includes(status)) {
    return "border-rose-400/35 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-white/7 text-white/70";
}

function formatCurrency(value: number) {
  return `¥${value.toLocaleString("zh-CN")}`;
}

function formatCredits(value: number) {
  return value.toLocaleString("zh-CN");
}

function AdminPrototypePage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [selectedUserId, setSelectedUserId] = useState(users[0].id);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [feedbackItems, setFeedbackItems] = useState(feedbackSeed);
  const [alerts, setAlerts] = useState(alertSeed);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [creditDelta, setCreditDelta] = useState(500);
  const [notice, setNotice] = useState("原型已载入：可切换模块、筛选账户、处理反馈、模拟额度调整。");

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];
  const paidRevenue = orders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + order.amount, 0);
  const issuedCredits = orders.reduce((sum, order) => sum + order.credits, 0);
  const remainingCredits = users.reduce((sum, user) => sum + user.credits, 0);
  const unreadAlerts = alerts.filter((alert) => alert.unread).length;
  const urgentAlerts = alerts.filter((alert) => alert.severity === "critical").length;

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesQuery = `${user.name} ${user.email} ${user.plan}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter]);

  function handleResolveFeedback(id: string) {
    setFeedbackItems((items) =>
      items.map((item) => (item.id === id ? { ...item, status: "resolved" } : item))
    );
    setNotice("反馈状态已更新：客服视角会立即看到已解决。");
  }

  function handleCreditAdjustment(direction: "plus" | "minus") {
    const symbol = direction === "plus" ? "+" : "-";
    setNotice(
      `${selectedUser.name} 的额度调整已模拟提交：${symbol}${formatCredits(
        creditDelta
      )} 积分，已生成审计记录。`
    );
  }

  function handleMarkAlertRead(id: string) {
    setAlerts((items) =>
      items.map((item) => (item.id === id ? { ...item, unread: false } : item))
    );
    setNotice("消息已标记处理：对应问题仍会保留在通知中心供追踪。");
  }

  function handleMarkAllAlertsRead() {
    setAlerts((items) => items.map((item) => ({ ...item, unread: false })));
    setNotice("所有敏捷处理消息已标记为已读。");
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-[#0f172a] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-cyan-300 text-slate-950">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-wide">ArtX Admin</div>
                  <div className="text-xs text-slate-400">Compute credit ops</div>
                </div>
              </div>
            </div>

            <nav className="grid gap-1 p-3">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;

                return (
                  <button
                    key={section.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-left transition",
                      isActive
                        ? "bg-cyan-300 text-slate-950"
                        : "text-slate-300 hover:bg-white/7 hover:text-white"
                    )}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <Icon className="size-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{section.label}</span>
                      <span
                        className={cn(
                          "block truncate text-xs",
                          isActive ? "text-slate-800" : "text-slate-500"
                        )}
                      >
                        {section.description}
                      </span>
                    </span>
                    <ChevronRight className="size-4 opacity-60" />
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-white/10 p-4">
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-100">
                  <Bell className="size-4" />
                  今日运营提醒
                </div>
                <p className="text-xs leading-5 text-slate-400">
                  1 笔支付回调延迟、1 个高风险账户、2 条待处理反馈需要跟进。
                </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1020]/90 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                  付费算力与积分运营后台
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  管理用户、支付、积分额度、反馈、第三方接口和高风险操作。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <NotificationCenter
                  alerts={alerts}
                  open={alertsOpen}
                  unreadCount={unreadAlerts}
                  urgentCount={urgentAlerts}
                  onToggle={() => setAlertsOpen((value) => !value)}
                  onMarkRead={handleMarkAlertRead}
                  onMarkAllRead={handleMarkAllAlertsRead}
                  onJumpTo={(section) => {
                    setActiveSection(section);
                    setAlertsOpen(false);
                  }}
                />
                <Button
                  variant="outline"
                  className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => setNotice("已模拟拉取第三方支付与模型接口健康状态。")}
                >
                  <Activity className="size-4" />
                  刷新接口状态
                </Button>
                <Button
                  className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  onClick={() => setNotice("已模拟打开新套餐配置：下一步可接入真实套餐表单。")}
                >
                  <Plus className="size-4" />
                  新建套餐
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-4 md:p-6">
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-50">
              {notice}
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-emerald-300/20 bg-emerald-300/[0.055] px-4 py-3 text-sm text-emerald-50 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="font-medium">后台权限已启用</span>
                <span className="ml-2 text-emerald-100/75">
                  当前账号：{user?.username || "admin"} · 角色：{user?.role || "admin"}
                </span>
              </div>
              <span className="text-xs text-emerald-100/70">
                权限：{(user?.permissions || ["admin:access"]).slice(0, 4).join(" / ")}
              </span>
            </div>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={CircleDollarSign}
                label="已确认收入"
                value={formatCurrency(paidRevenue)}
                detail="仅统计已支付订单"
              />
              <MetricCard
                icon={Gauge}
                label="已发放积分"
                value={formatCredits(issuedCredits)}
                detail="购买入账 + 赠送额度"
              />
              <MetricCard
                icon={WalletCards}
                label="用户剩余额度"
                value={formatCredits(remainingCredits)}
                detail="需要纳入财务负债视角"
              />
              <MetricCard
                icon={AlertTriangle}
                label="待处理风险"
                value="3"
                detail="接口、账户、支付异常"
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035]">
                <SectionTabs activeSection={activeSection} setActiveSection={setActiveSection} />
                <div className="p-4 md:p-5">{renderSection()}</div>
              </div>

              <aside className="space-y-5">
                <UserDetailPanel
                  user={selectedUser}
                  creditDelta={creditDelta}
                  setCreditDelta={setCreditDelta}
                  onAdjust={handleCreditAdjustment}
                />
                <RiskPanel />
              </aside>
            </section>
          </div>
        </main>
      </div>
    </div>
  );

  function renderSection() {
    if (activeSection === "overview") {
      return (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">今日运营队列</h2>
                <p className="text-sm text-slate-400">先处理影响收入和额度可信度的问题。</p>
              </div>
              <Badge tone="amber">4 项待办</Badge>
            </div>
            <div className="space-y-3">
              {[
                ["支付回调延迟", "微信支付 ord_90310 待确认，需自动补偿规则兜底", "P0"],
                ["异常消耗", "北辰增长 10 分钟内消耗 80K 积分，已冻结部分额度", "P0"],
                ["接口延迟", "Render API 平均延迟高于阈值，影响任务状态同步", "P1"],
                ["客服反馈", "2 条支付/额度相关反馈未关闭", "P1"],
              ].map(([title, body, priority]) => (
                <div
                  key={title}
                  className="flex items-start gap-3 rounded-md border border-white/8 bg-white/[0.03] p-3"
                >
                  <div className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-white/7">
                    <AlertTriangle className="size-4 text-amber-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{title}</div>
                      <Badge tone={priority === "P0" ? "rose" : "amber"}>{priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-base font-semibold">后台模块成熟度</h2>
            <p className="mt-1 text-sm text-slate-400">用于判断 MVP 后台先做什么。</p>
            <div className="mt-5 space-y-4">
              {[
                ["账户管理", 88],
                ["支付订单", 76],
                ["额度流水", 92],
                ["反馈工单", 64],
                ["风控审计", 58],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="text-slate-400">{value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/8">
                    <div
                      className="h-2 rounded-full bg-cyan-300"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "users") {
      return (
        <div className="space-y-4">
          <Toolbar
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
          <Table className="min-w-[780px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>用户</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>积分余额</TableHead>
                <TableHead>累计付费</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近活跃</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow
                  key={user.id}
                  className={cn(
                    "border-white/8 hover:bg-white/[0.04]",
                    selectedUserId === user.id && "bg-cyan-300/8"
                  )}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </TableCell>
                  <TableCell>{user.plan}</TableCell>
                  <TableCell>{formatCredits(user.credits)}</TableCell>
                  <TableCell>{formatCurrency(user.spent)}</TableCell>
                  <TableCell>
                    <Badge className={statusClass(user.status)}>{statusLabel(user.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-400">{user.lastSeen}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeSection === "orders") {
      return <OrdersTable />;
    }

    if (activeSection === "credits") {
      return (
        <DataList
          title="积分与额度流水"
          description="每一笔入账、消耗、冻结、人工调整都必须可追溯。"
          rows={creditEvents.map((event) => ({
            title: `${event.user} · ${event.type}`,
            meta: `${event.actor} · ${event.note}`,
            value: event.amount,
            icon: event.amount.startsWith("+") ? Gift : LockKeyhole,
          }))}
        />
      );
    }

    if (activeSection === "feedback") {
      return (
        <div className="space-y-3">
          {feedbackItems.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-white/10 bg-slate-950/35 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusClass(item.priority)}>{item.priority}</Badge>
                    <Badge className={statusClass(item.status)}>{statusLabel(item.status)}</Badge>
                    <span className="text-xs text-slate-500">{item.module}</span>
                  </div>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.user} · {item.createdAt}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => handleResolveFeedback(item.id)}
                >
                  <Check className="size-4" />
                  标记解决
                </Button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeSection === "integrations") {
      return (
        <DataList
          title="第三方接口健康度"
          description="支付、模型、部署和网关都要有状态、延迟、负责人。"
          rows={integrations.map((item) => ({
            title: `${item.name} · ${item.category}`,
            meta: `${item.owner} · ${item.latency}`,
            value: item.state,
            icon: item.state === "在线" ? BadgeCheck : AlertTriangle,
          }))}
        />
      );
    }

    if (activeSection === "risk") {
      return (
        <DataList
          title="风控规则"
          description="先覆盖资金和额度异常，再扩展到设备、IP、频率限制。"
          rows={[
            { title: "短时高消耗", meta: "10 分钟内超过套餐余额 35%", value: "启用", icon: Gauge },
            { title: "支付失败重试", meta: "同卡 5 次失败后进入观察", value: "启用", icon: CreditCard },
            { title: "多账户设备", meta: "同设备注册 8 个账户", value: "观察", icon: Users },
            { title: "人工大额赠送", meta: "超过 10,000 积分需要二次确认", value: "启用", icon: ShieldCheck },
          ]}
        />
      );
    }

    return (
      <DataList
        title="管理员操作审计"
        description="钱和额度相关操作必须记录人、时间、目标和原因。"
        rows={auditRows.map((row) => ({
          title: row.action,
          meta: `${row.actor} · ${row.target}`,
          value: row.time,
          icon: History,
        }))}
      />
    );
  }
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-md bg-white/7">
          <Icon className="size-4 text-cyan-200" />
        </div>
        <span className="text-xs text-emerald-200">实时</span>
      </div>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function NotificationCenter({
  alerts,
  open,
  unreadCount,
  urgentCount,
  onToggle,
  onMarkRead,
  onMarkAllRead,
  onJumpTo,
}: {
  alerts: OpsAlert[];
  open: boolean;
  unreadCount: number;
  urgentCount: number;
  onToggle: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onJumpTo: (section: AdminSection) => void;
}) {
  return (
    <div className="relative">
      <button
        className={cn(
          "relative inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
          open
            ? "border-cyan-300 bg-cyan-300 text-slate-950"
            : "border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
        )}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`消息提醒，${unreadCount} 条未读`}
      >
        <Bell className="size-4" />
        消息
        {unreadCount > 0 && (
          <span
            className={cn(
              "ml-1 rounded-md px-1.5 py-0.5 text-xs",
              open ? "bg-slate-950 text-cyan-200" : "bg-rose-400 text-white"
            )}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-[calc(100vw-32px)] max-w-[430px] overflow-hidden rounded-md border border-white/10 bg-[#0f172a] shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">敏捷处理消息</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  聚合支付异常、系统报错、接口延迟和额度风险。
                </p>
              </div>
              <Badge className={urgentCount > 0 ? statusClass("P0") : statusClass("normal")}>
                {urgentCount} 个紧急
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{unreadCount} 条未读</span>
              <button
                className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
                onClick={onMarkAllRead}
              >
                全部已读
              </button>
            </div>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "border-b border-white/8 p-4 last:border-b-0",
                  alert.unread ? "bg-cyan-300/[0.045]" : "bg-transparent"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                      alert.severity === "critical"
                        ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                        : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    )}
                  >
                    {alert.category === "支付" ? (
                      <CreditCard className="size-4" />
                    ) : alert.category === "报错" ? (
                      <AlertTriangle className="size-4" />
                    ) : alert.category === "接口" ? (
                      <Activity className="size-4" />
                    ) : (
                      <WalletCards className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          alert.severity === "critical"
                            ? statusClass("P0")
                            : statusClass("watch")
                        }
                      >
                        {alert.category}
                      </Badge>
                      <span className="text-xs text-slate-500">{alert.time}</span>
                      {alert.unread && <span className="size-2 rounded-full bg-cyan-300" />}
                    </div>
                    <div className="mt-2 text-sm font-medium">{alert.title}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{alert.detail}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">负责人：{alert.owner}</span>
                      <button
                        className="ml-auto rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/8"
                        onClick={() => onJumpTo(alertSection(alert.category))}
                      >
                        查看模块
                      </button>
                      <button
                        className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-950 hover:bg-cyan-100"
                        onClick={() => onMarkRead(alert.id)}
                      >
                        标记处理
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function alertSection(category: AlertCategory): AdminSection {
  const map: Record<AlertCategory, AdminSection> = {
    支付: "orders",
    报错: "integrations",
    接口: "integrations",
    额度: "risk",
  };

  return map[category];
}

function SectionTabs({
  activeSection,
  setActiveSection,
}: {
  activeSection: AdminSection;
  setActiveSection: (section: AdminSection) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
      {sections.slice(0, 6).map((section) => (
        <button
          key={section.id}
          className={cn(
            "shrink-0 rounded-md px-3 py-2 text-sm transition",
            activeSection === section.id
              ? "bg-white text-slate-950"
              : "text-slate-400 hover:bg-white/7 hover:text-white"
          )}
          onClick={() => setActiveSection(section.id)}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}

function Toolbar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
}: {
  query: string;
  setQuery: (query: string) => void;
  statusFilter: "all" | Status;
  setStatusFilter: (status: "all" | Status) => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative md:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索用户、邮箱、套餐"
          className="border-white/10 bg-slate-950/40 pl-9 text-slate-100 placeholder:text-slate-500"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "全部"],
          ["normal", "正常"],
          ["watch", "观察"],
          ["blocked", "冻结"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={cn(
              "rounded-md border px-3 py-2 text-sm transition",
              statusFilter === value
                ? "border-cyan-300 bg-cyan-300 text-slate-950"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/8"
            )}
            onClick={() => setStatusFilter(value as "all" | Status)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrdersTable() {
  return (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead>订单</TableHead>
          <TableHead>用户</TableHead>
          <TableHead>渠道</TableHead>
          <TableHead>金额</TableHead>
          <TableHead>兑换积分</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id} className="border-white/8 hover:bg-white/[0.04]">
            <TableCell className="font-mono text-xs text-slate-400">{order.id}</TableCell>
            <TableCell>{order.user}</TableCell>
            <TableCell>{order.channel}</TableCell>
            <TableCell>{formatCurrency(order.amount)}</TableCell>
            <TableCell>{formatCredits(order.credits)}</TableCell>
            <TableCell>
              <Badge className={statusClass(order.status)}>{statusLabel(order.status)}</Badge>
            </TableCell>
            <TableCell className="text-slate-400">{order.createdAt}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UserDetailPanel({
  user,
  creditDelta,
  setCreditDelta,
  onAdjust,
}: {
  user: AdminUser;
  creditDelta: number;
  setCreditDelta: (value: number) => void;
  onAdjust: (direction: "plus" | "minus") => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">账户详情</h2>
          <p className="text-sm text-slate-400">点击用户表格可切换对象。</p>
        </div>
        <Badge className={statusClass(user.status)}>{statusLabel(user.status)}</Badge>
      </div>

      <div className="rounded-md border border-white/8 bg-slate-950/35 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-white/8 text-sm font-semibold">
            {user.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <InfoCell label="套餐" value={user.plan} />
          <InfoCell label="风险" value={user.risk} />
          <InfoCell label="积分余额" value={formatCredits(user.credits)} />
          <InfoCell label="累计付费" value={formatCurrency(user.spent)} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="text-sm font-medium">人工额度调整</label>
        <Input
          type="number"
          value={creditDelta}
          onChange={(event) => setCreditDelta(Number(event.target.value))}
          className="border-white/10 bg-slate-950/40 text-slate-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"
            onClick={() => onAdjust("plus")}
          >
            <Plus className="size-4" />
            增加
          </Button>
          <Button
            variant="outline"
            className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
            onClick={() => onAdjust("minus")}
          >
            <X className="size-4" />
            扣减
          </Button>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          真实后台必须填写原因，并写入不可删除的审计日志。
        </p>
      </div>
    </div>
  );
}

function RiskPanel() {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">上线前必补能力</h2>
        <SlidersHorizontal className="size-4 text-slate-500" />
      </div>
      <div className="space-y-3">
        {[
          ["支付对账", "第三方支付金额、订单、入账积分必须每日核对"],
          ["额度负债", "未消耗积分是平台未来成本，需要看余额池"],
          ["密钥治理", "后台只展示状态和位置，不展示密钥值"],
          ["高危权限", "退款、封号、大额赠送需要二次确认"],
        ].map(([title, body]) => (
          <div key={title} className="rounded-md border border-white/8 bg-slate-950/30 p-3">
            <div className="text-sm font-medium">{title}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataList({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{ title: string; meta: string; value: string; icon: typeof BarChart3 }>;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="divide-y divide-white/8 overflow-hidden rounded-md border border-white/10">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={`${row.title}-${row.meta}`}
              className="flex items-center gap-3 bg-slate-950/30 p-4"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-white/7">
                <Icon className="size-4 text-cyan-200" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{row.title}</div>
                <div className="truncate text-xs text-slate-500">{row.meta}</div>
              </div>
              <Badge className={statusClass(row.value)}>{row.value}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function Badge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: "amber" | "rose";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
        tone === "amber" && "border-amber-400/35 bg-amber-400/10 text-amber-100",
        tone === "rose" && "border-rose-400/35 bg-rose-400/10 text-rose-100",
        !tone && "border-white/10 bg-white/7 text-slate-300",
        className
      )}
    >
      {children}
    </span>
  );
}

export default AdminPrototypePage;
