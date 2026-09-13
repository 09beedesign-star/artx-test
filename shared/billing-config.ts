export type MembershipPlanId = "free" | "lite" | "creator" | "pro" | "studio" | "business";
export type BillingCycleId = "monthly" | "quarterly" | "annual";

export interface MembershipPlan {
  id: MembershipPlanId;
  name: string;
  shortName: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  monthlyCredits: number;
  audience: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
}

export interface BillingCycle {
  id: BillingCycleId;
  label: string;
  months: number;
  multiplier: number;
  badge: string;
  bonusRate: number;
  creditRule: string;
  recommended?: boolean;
}

export interface PlanQuote {
  plan: MembershipPlan;
  cycle: BillingCycle;
  price: number;
  monthlyEquivalent: number;
  baseCredits: number;
  bonusCredits: number;
  /** 周期内累计发放总额，**不是一次性到账额度** */
  totalCredits: number;
  /** 每月实际到账额度 */
  creditsPerPeriod: number;
  /** 总期数 */
  periods: number;
  creditsPerYuan: number;
  unitPrice: number;
}

export const MEMBERSHIP_CREDITS_PER_HKD = 170;

/**
 * 会员积分结转上限（按「月额度」的倍数计）。
 *
 * 1 = 当月额度之外最多再结转 1 个月，即任一时刻余额上限 = 2 个月额度。
 *
 * ⚠️ 这里改了，`server/admin-store.ts` 的 MEMBERSHIP_ROLLOVER_PERIODS
 * 和下面 BILLING_CYCLES 的 creditRule 文案**必须同步改**。
 * 三者不一致 = 对用户的承诺与实际扣费行为对不上，属于合规风险。
 * `server/credit-expiry-policy.test.ts` 有断言锁住这三者。
 */
export const MEMBERSHIP_ROLLOVER_MONTHS = 1;

/**
 * 各品类积分有效期口径 —— **唯一真相来源**。
 *
 * 前端积分规则页、订阅页、后台说明都从这里取，不要再各写一份文案。
 * 曾经的教训：BILLING_CYCLES 的 creditRule 写着「未使用积分到期不结转」，
 * 代码却是余额保留，**承诺与实现长期不一致**且没人发现。
 */
export const CREDIT_EXPIRY_RULES = {
  recharge: {
    label: "充值积分",
    days: 366,
    summary: "自购买之日起 366 天内有效",
    detail: "每笔充值独立计时，不会因为后续再次充值而延期。366 天而非 365 天是为了覆盖闰年，确保你不会在闰年少用一天。",
  },
  gift: {
    label: "赠送积分",
    days: 30,
    summary: "自到账之日起 30 天内有效",
    detail: "包括活动赠送、首充赠送与客服补偿。赠送积分有效期短于充值积分，且不可提现、不可转赠给其他账号。",
  },
  membership: {
    label: "会员积分",
    rolloverMonths: MEMBERSHIP_ROLLOVER_MONTHS,
    summary: "每月发放，未用完可结转 1 个月",
    detail: "订阅期内每月定额发放（年卡与季卡也按月发放，不再一次性到账）。当月未用完的额度可以顺延到下个月继续使用，但账户内的会员积分余额最多保留 2 个月额度，超出部分会自动失效。",
  },
} as const;

/**
 * 首充赠送规则 —— **唯一真相来源**。
 *
 * ⚠️ 这三个值原先只存在于 server/admin-store.ts，前端无法引用，
 * 导致「站内有首充赠送，但用户在任何页面都看不到」。提到 shared 后
 * server 侧必须从这里导入，**不要再各写一份常量**。
 *
 * ⚠️ 赠送积分走 kind:"gift"，有效期只有 CREDIT_EXPIRY_RULES.gift.days 天，
 * 远短于充值积分的 366 天。展示时必须把有效期一起说清楚，
 * 否则用户会以为赠送的也能放一年。
 */
export const FIRST_RECHARGE_BONUS = {
  /** 单笔充值达到该金额（HKD）才触发 */
  minAmount: 150,
  /** 赠送积分数 */
  credits: 2500,
  /** 仅限该账号的第一笔充值订单 */
  oncePerAccount: true,
} as const;

/**
 * Free 免费档。
 * 刻意不放进 MEMBERSHIP_PLANS —— 那个数组是「可购买套餐」列表，
 * 订阅页会逐项渲染成付费卡片。Free 只作为未订阅用户的默认归属档，
 * 需要时通过 FREE_PLAN / isFreePlanId 单独引用。
 */
export const FREE_PLAN_ID: MembershipPlanId = "free";
export const FREE_PLAN_DISPLAY_NAME = "Free 免费版";

export const FREE_PLAN: MembershipPlan = {
  id: "free",
  name: FREE_PLAN_DISPLAY_NAME,
  shortName: "Free",
  monthlyPrice: 0,
  quarterlyPrice: 0,
  annualPrice: 0,
  monthlyCredits: 0,
  audience: "新用户体验、轻度试用",
  tagline: "免费体验标准图片生成与基础编辑能力。",
  features: ["标准 AI 生图体验", "基础图片编辑", "提示词优化", "升级后解锁完整额度"],
};

export function isFreePlanId(planId?: string | null) {
  return String(planId || "").trim().toLowerCase() === "free";
}

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "lite",
    name: "Lite 入门版",
    shortName: "Lite",
    monthlyPrice: 39,
    quarterlyPrice: 105,
    annualPrice: 359,
    monthlyCredits: 8000,
    audience: "灵感探索、个人创作、轻量商用",
    tagline: "用一杯咖啡的预算，把日常灵感快速变成可用图片、文案和视觉草稿。",
    features: ["每月 8,000 创作积分", "标准 AI 生图与智能编辑", "提示词优化与 AI 文案", "个人画布与历史记录"],
  },
  {
    id: "creator",
    name: "Creator 创作者版",
    shortName: "Creator",
    monthlyPrice: 129,
    quarterlyPrice: 348,
    annualPrice: 1187,
    monthlyCredits: 26000,
    audience: "图文、电商图、社媒内容",
    tagline: "给内容创作者和小商家更稳的月度额度。",
    features: ["高清图片生成", "商品图编辑", "社媒封面模板", "基础批量任务"],
  },
  {
    id: "pro",
    name: "Pro 专业版",
    shortName: "Pro",
    monthlyPrice: 129,
    quarterlyPrice: 348,
    annualPrice: 1187,
    monthlyCredits: 28000,
    audience: "高频创作、电商内容、商单交付",
    tagline: "主推专业档，用更低成本覆盖商品图、海报、社媒视觉和日常商单产出。",
    features: ["每月 28,000 创作积分", "完整标准图片模型", "高质量模型关键交付权益", "优先队列与商业创作工具"],
    recommended: true,
  },
  {
    id: "studio",
    name: "Studio 工作室版",
    shortName: "Studio",
    monthlyPrice: 329,
    quarterlyPrice: 888,
    annualPrice: 3025,
    monthlyCredits: 80000,
    audience: "小团队、工作室、批量商业生产",
    tagline: "为连续交付准备的高额度套餐，让团队稳定生产商品图、广告图和多平台素材。",
    features: ["每月 80,000 创作积分", "Pro 全部专业能力", "高质量模型重点项目权益", "更高优先级与批量生产能力"],
  },
  {
    id: "business",
    name: "Business 团队版",
    shortName: "Business",
    monthlyPrice: 999,
    quarterlyPrice: 2697,
    annualPrice: 9191,
    monthlyCredits: 260000,
    audience: "机构、视频/批量内容生产",
    tagline: "面向机构和高成本模型用户，额度更足且单价最低。",
    features: ["机构级额度", "高级视频模型", "最高优先级", "对账与风险提示"],
  },
];

/**
 * 订阅页货架上**实际在售**的档位与顺序。
 *
 * ⚠️ 与 MEMBERSHIP_PLANS 是两件事：那个是「定价表」，收录了历史与预留档位
 * （Creator / Business 仍有完整定价，但订阅页并不售卖）。任何面向用户或运营
 * 展示「有哪些套餐可买」的地方都必须用这个列表，否则会展示出买不到的套餐。
 *
 * 历史事故：后台「套餐/金额配置」曾直接遍历 MEMBERSHIP_PLANS，
 * 把 Creator 与 Business 一起列出来，运营对着下架套餐做决策。
 */
export const SUBSCRIPTION_PLAN_IDS: MembershipPlanId[] = [
  "lite",
  "pro",
  "studio",
];

export function isSellablePlanId(planId?: string | null) {
  return SUBSCRIPTION_PLAN_IDS.includes(
    String(planId || "").trim().toLowerCase() as MembershipPlanId,
  );
}

export const BILLING_CYCLES: BillingCycle[] = [
  {
    id: "monthly",
    label: "月付",
    months: 1,
    multiplier: 1,
    badge: "低门槛",
    bonusRate: 0,
    creditRule: "会员积分每月发放，当月未用完可结转 1 个月；账户会员积分余额上限为 2 个月额度",
  },
  {
    id: "quarterly",
    label: "季度",
    months: 3,
    multiplier: 3,
    badge: "季付优惠",
    bonusRate: 0,
    creditRule: "季卡按月发放 3 期，当月未用完可结转 1 个月；账户会员积分余额上限为 2 个月额度",
  },
  {
    id: "annual",
    label: "全年",
    months: 12,
    multiplier: 12,
    badge: "年付优惠",
    bonusRate: 0,
    creditRule: "年卡按月发放 12 期，当月未用完可结转 1 个月；账户会员积分余额上限为 2 个月额度",
    recommended: true,
  },
];

export const CREDIT_COST_RULES = [
  { task: "提示词优化 / 文案生成", credits: "20 积分 / 次" },
  { task: "普通图片生成", credits: "按模型计费：40-300 积分 / 张" },
  { task: "高清图片生成", credits: "160 积分 / 次" },
  { task: "图片编辑、扩图、抠图、去水印", credits: "40-200 积分 / 次" },
  { task: "商品图 / 海报一键生成", credits: "480 积分 / 次" },
  { task: "普通短视频", credits: "1,200-3,000 积分 / 条" },
  { task: "高级视频模型", credits: "3,500-9,000 积分 / 条" },
];

export function getPlanQuote(plan: MembershipPlan, cycle: BillingCycle): PlanQuote {
  const cyclePrices: Record<BillingCycleId, number> = {
    monthly: plan.monthlyPrice,
    quarterly: plan.quarterlyPrice,
    annual: plan.annualPrice,
  };
  const price = cyclePrices[cycle.id];
  /**
   * totalCredits 是**整个周期累计发放**的积分，用于算单价和性价比。
   *
   * ⚠️ 它**不等于**「一次性到账的积分」——自按月发放上线后，年卡的
   * 336,000 积分是分 12 期、每期 28,000 到账的。
   * 前端展示务必用 monthlyCredits 讲「每月多少」，或明确标注「全年累计」，
   * 直接把 totalCredits 展示成余额会让用户以为付款后立刻到账 336,000。
   */
  const totalCredits = plan.monthlyCredits * cycle.months;
  const baseCredits = totalCredits;
  const bonusCredits = 0;
  const creditsPerYuan = totalCredits / price;
  const unitPrice = price / totalCredits;

  return {
    plan,
    cycle,
    price,
    monthlyEquivalent: Math.round(price / cycle.months),
    baseCredits,
    bonusCredits,
    totalCredits,
    /** 每期（每月）实际到账额度。前端展示到账金额时用这个。 */
    creditsPerPeriod: plan.monthlyCredits,
    /** 计费周期总期数，年卡 12 / 季卡 3 / 月卡 1 */
    periods: cycle.months,
    creditsPerYuan,
    unitPrice,
  };
}

export function formatCurrency(value: number) {
  return `HKD ${value.toLocaleString("zh-HK")}`;
}

export function formatCredits(value: number) {
  return value.toLocaleString("zh-CN");
}

export interface CreditRechargeTier {
  minAmount: number;
  creditsPerHkd: number;
  label: string;
}

export const CREDIT_RECHARGE_TIERS: CreditRechargeTier[] = [
  { minAmount: 500, creditsPerHkd: 170, label: "大额补充" },
  { minAmount: 150, creditsPerHkd: 150, label: "增长补充" },
  { minAmount: 10, creditsPerHkd: 130, label: "轻量补充" },
];

export const CREDIT_RECHARGE_RATE = 130;

export function getCreditRechargeTier(amount: number) {
  const normalizedAmount = Math.max(0, Math.round(amount));
  return CREDIT_RECHARGE_TIERS.find((tier) => normalizedAmount >= tier.minAmount) || CREDIT_RECHARGE_TIERS[CREDIT_RECHARGE_TIERS.length - 1];
}

export function quoteCreditRecharge(amount: number) {
  const normalizedAmount = Math.max(0, Math.round(amount));
  const tier = getCreditRechargeTier(normalizedAmount);
  return {
    amount: normalizedAmount,
    credits: normalizedAmount * tier.creditsPerHkd,
    creditsPerHkd: tier.creditsPerHkd,
    tier,
  };
}

// ===== 邀请注册奖励 =====
// ⚠️ 红线：奖励必须挂在「被邀请人首次付费」上，绝不能挂在「注册成功」上。
// 理由：注册零成本（无邮箱验证/无手机/无验证码），若注册即发奖，
// 任意用户都能用 plus 邮箱无限注册小号自邀自得，等同于永久提款机。
// 这与已被砍掉的「每日免费积分」是同一类风险，判断标准是
// 「发放触发条件是否需要付费或管理员介入」。改动此处前务必重读该标准。
/*
 * 2026-09-13 额度定档（此前 500/300/10人/10HKD 是上线时的占位值）。
 *
 * 定档依据是「积分的钱等价」：用户自己掏钱能买到的**最差**汇率是
 * 轻量补充档 130 积分/HKD（见 RECHARGE_TIERS），所以平台每发 130 积分
 * 就等于让渡 1 HKD 的潜在收入。会员档换算更贵（Lite 205 / Pro 217 /
 * Studio 243 分每 HKD），用 130 估成本是**偏保守**的，安全。
 *
 * ⚠️ 旧占位值的致命问题在门槛而不在额度：
 *   minPaidAmountHkd = 10 时，用户付 10 HKD 拿到 1300 积分，
 *   而平台要为这一单发出 500 + 300 = 800 积分 —— 奖励成本占收入 62%。
 *   也就是说邀请渠道每带来一单，平台的毛利先被吃掉六成，
 *   规模越大亏得越多，是个反向杠杆。
 *
 * 现在的口径（保守档）：
 *   - 门槛抬到 39 HKD，对齐 Lite 月卡最低售价。低于一个月卡的付费
 *     不构成「真实付费用户」，不值得为它买单；同时堵死"充 10 块
 *     触发奖励"的最低成本薅法。
 *   - 单对奖励 300 + 200 = 500 积分 ≈ 3.85 HKD，占门槛 10%。
 *     这个比例与「赠送积分占已发积分 6%」同量级，可持续。
 *   - 单人上限保持 10 次：最多领走 3000 积分（约 23 HKD），
 *     即便被小号农场打满，绝对损失也封顶在可接受范围。
 *
 * 改这几个数之前，请先把上面那段成本换算重算一遍，
 * 尤其不要在放大额度的同时降低 minPaidAmountHkd —— 两者同向放松
 * 会让成本占比以乘积速度恶化。
 */
export const INVITE_REWARD_CONFIG = {
  /** 邀请人可获得的积分（被邀请人首次付费后发放） */
  inviterCredits: 300,
  /** 被邀请人可获得的积分（本人首次付费后发放） */
  inviteeCredits: 200,
  /** 单个邀请人累计可获得奖励的最大有效邀请数 */
  maxRewardedInvitesPerUser: 10,
  /** 绑定关系有效期（天）：超过此天数仍未付费，绑定作废 */
  bindingValidDays: 30,
  /**
   * 奖励积分有效期（天）：必须与 gift 类积分一致（30 天）。
   *
   * ⚠️ 这条是红线，不是风格问题。邀请奖励和平台赠送一样**成本为零**，
   * 有效期必须严格短于充值积分（366 天）。一旦拉长到和充值同级，
   * 用户就能靠拉人头囤积长期积分，等同于开辟了一条绕过付费的发行渠道。
   */
  rewardCreditValidDays: 30,
  /**
   * 被邀请人首次付费的最低金额门槛（港币），低于此金额不触发奖励。
   * 39 = Lite 月卡售价，见上方长注释里的成本换算。
   */
  minPaidAmountHkd: 39,
  /**
   * 触发「邀请渠道异常」的退款率阈值（0-1）。**命中即自动封禁邀请人账号。**
   *
   * ## 为什么是 0.4
   *
   * 正常用户也会退款，行业自然退款率通常在 5%-15%。阈值定在 20%-30%
   * 会把「运气不好碰上两个退款的朋友」也标成可疑。刷单者的典型形态是
   * **近乎全退**（付费只为触发奖励，拿到就退）。
   * 0.4 配合最小样本 3，最宽松的命中场景是「邀请 5 人退 2 人（40%）」——
   * 已经明显偏离自然退款率，值得处置。
   *
   * ⚠️ 阈值用 `>=` 判定，所以 0.4 意味着「退款率达到 40% 就算异常」，
   * 不是「超过 40%」。5 邀 2 退 = 40.0% 会命中。
   *
   * ## 为什么必须配最小样本数
   *
   * 只看比率会在小样本上疯狂误报：邀请 1 人、那人退款 → 退款率 100%，
   * 但这完全可能只是朋友试了一下不合适。**比率在分母小的时候没有意义**，
   * 所以要求至少 3 条已奖励邀请才开始判定。
   *
   * ## ⚠️ 命中后果已从「只告警」升级为「自动封禁」（用户决策，09-13）
   *
   * 此前刻意只生成 riskEvent 供人工复核，理由是「误封代价高于多发积分」。
   * 现改为自动封禁，因为人工复核在实际运营中不会有人盯。
   * **配套的兜底是后台解封**：AdminPrototypePage 的「恢复账号」按钮
   * 可随时解除，封禁不是不可逆操作。改这个值前先确认解封链路仍然可用，
   * 否则等于把误封变成了单向门。
   *
   * 自动封禁同时仍写 riskEvent，两者不是二选一 —— 封禁是止损，
   * 事件是留痕，运营要能看到「为什么这个人被封了」。
   */
  refundRateAlertThreshold: 0.4,
  /** 计算退款率所需的最小已奖励邀请数，低于此数不做判定（避免小样本误报）。 */
  refundRateMinSamples: 3,
} as const;

/** 邀请码长度（去除易混淆字符后的随机串） */
export const INVITE_CODE_LENGTH = 8;

/**
 * 邀请码字符集：刻意剔除 0/O/1/I/L 等易混淆字符，
 * 因为邀请码要靠用户口头传播或手工输入，混淆字符会直接变成转化流失。
 */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
