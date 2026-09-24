/**
 * AI 生图接口的 IP 级防刷限流 —— **唯一事实源**。
 *
 * ── 为什么单独建这个模块 ──
 * 本项目反复栽在「同一份逻辑有多个出口，只改一个等于没做」上。
 * 生图相关路由有 13 个（/api/images/generate、/edit、/erase、/expand …），
 * 如果在每个路由里各写一份限流，漏掉任何一个，攻击者就从那一个把 Key 刷爆，
 * 而且**零报错**——你只会在账单上看到它。
 *
 * 所以：限流的判定逻辑全部收口在本文件，路由侧只允许调用，不允许自己写计数。
 *
 * ── 为什么不用 express-rate-limit ──
 * 1. 本项目是**单机单进程**部署（CVM 上一个 Node 进程 + nginx），内存计数完全够用；
 * 2. 多一个依赖就多一份供应链风险，而这套逻辑不到 100 行；
 * 3. 需要一个**纯函数内核**来做单元测试（见 ai-rate-limit.test.ts）——
 *    第三方中间件耦合了 req/res，测起来要造一堆假对象。
 *
 * ⚠️⚠️⚠️ 扩到多实例时这套必须换成 Redis：内存计数各算各的，
 *    N 个实例 = 限额被放大 N 倍。这不是 bug，是本实现的**已知边界**，
 *    改多实例的人必须先读到这行。
 */

/** 时间窗口内允许的请求数与窗口长度。默认「每 IP 每分钟 12 次」，理由见 readRuleFromEnv。 */
export interface RateLimitRule {
  /** 窗口内最大请求数 */
  limit: number;
  /** 窗口长度（毫秒） */
  windowMs: number;
}

export interface RateLimitDecision {
  /** true = 放行；false = 应当返回 429 */
  allowed: boolean;
  /** 本窗口内已用次数（含当前这次，若被拒则不含） */
  used: number;
  /** 本窗口剩余可用次数 */
  remaining: number;
  /** 距离窗口重置还有多少秒（用于 Retry-After 头） */
  retryAfterSec: number;
  /** 窗口重置的绝对时间戳，便于写 X-RateLimit-Reset */
  resetAt: number;
}

interface WindowState {
  /** 窗口起点时间戳 */
  startedAt: number;
  /** 窗口内计数 */
  count: number;
}

/**
 * 限流内核：**纯函数**，不碰 req/res、不碰 Date.now()。
 *
 * ⚠️ `now` 必须由调用方传入。如果这里直接读 Date.now()，
 *    测试就只能靠 sleep 来验证窗口滚动 —— 慢且不稳定。
 *
 * 采用**固定窗口**（fixed window）而不是滑动窗口：
 * 实现简单、内存恒定。代价是窗口边界处最多可能放过 2 倍的量
 * （第 59 秒打满一窗 + 第 61 秒再打满一窗）。对「防止 Key 被恶意刷量」这个目标，
 * 这个精度足够；真要更严可以把 windowMs 调小。
 */
export function evaluateRateLimit(
  state: WindowState | undefined,
  rule: RateLimitRule,
  now: number,
): { decision: RateLimitDecision; nextState: WindowState } {
  // 窗口已过期（或从未有过）→ 开新窗口
  const expired = !state || now - state.startedAt >= rule.windowMs;
  const current: WindowState = expired
    ? { startedAt: now, count: 0 }
    : { startedAt: state.startedAt, count: state.count };

  const resetAt = current.startedAt + rule.windowMs;
  // Math.ceil 保证「还剩 0.2 秒」报成 1 而不是 0 —— 报 0 会让客户端立刻重试再吃一个 429
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));

  if (current.count >= rule.limit) {
    return {
      decision: {
        allowed: false,
        used: current.count,
        remaining: 0,
        retryAfterSec,
        resetAt,
      },
      // ⚠️ 被拒的请求**不计数**。若把被拒也累加，恶意方持续请求会让窗口计数
      //    无限增长，正常用户在窗口结束前永远拿不到配额（等于被动升级成封禁）。
      nextState: current,
    };
  }

  const nextCount = current.count + 1;
  return {
    decision: {
      allowed: true,
      used: nextCount,
      remaining: Math.max(0, rule.limit - nextCount),
      retryAfterSec,
      resetAt,
    },
    nextState: { startedAt: current.startedAt, count: nextCount },
  };
}

/**
 * 从请求里取**真实客户端 IP**。
 *
 * ⚠️⚠️⚠️ 这是整套限流最容易静默失效的一环。
 *  生产是 nginx 反代到 127.0.0.1:3002，若直接用 `req.socket.remoteAddress`，
 *  拿到的永远是 `127.0.0.1` —— **全站所有用户共用一个限流桶**，
 *  一个人刷满，所有人被 429。功能"正常工作"，却完全不是你要的语义。
 *
 * ✅ 正确做法：读 nginx 注入的 `X-Forwarded-For` 的**第一段**（最原始的客户端）。
 * ⚠️ 但 XFF 是客户端可伪造的头 —— 只有在「确实处于可信反代之后」才能信它，
 *    所以由 `trustProxy` 显式控制，不做自动猜测。
 */
export function resolveClientIp(
  headers: Record<string, unknown>,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const xff = headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (typeof raw === "string" && raw.trim()) {
      // XFF 形如 "客户端, 代理1, 代理2" —— 取第一段
      const first = raw.split(",")[0]?.trim();
      if (first) return normalizeIp(first);
    }
    const realIp = headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) return normalizeIp(realIp.trim());
  }
  return normalizeIp(socketAddress || "unknown");
}

/**
 * IPv6 映射的 IPv4（`::ffff:1.2.3.4`）要归一化，
 * 否则同一个用户经不同链路会占两个桶，限流被稀释一倍。
 */
function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * 默认限流档位。**这个数字不是拍脑袋来的，改之前先看完下面这笔账。**
 *
 * ⚠️⚠️⚠️ 限流阈值算错的后果是**误伤真实付费用户**，而且表现为「产品偶发报错」，
 *    极难归因到限流上。所以默认值必须按「一次产品操作实际发几个后端请求」来算，
 *    而不是按「用户每分钟点几次」来算。
 *
 * 本项目的实测账：
 *   - 「智能文案编辑」一次操作 = /api/images/ocr + /api/images/edit = **2 个请求**
 *     （二者都走 handleTrackedAiRequest，都会各消耗一次配额）
 *   - 画布上多选图片批量处理时，前端是**并发**发的，N 张图 = N 个请求同时到达
 *   - 失败重试、参数微调重出图都会叠加
 *
 * 若按直觉配成 3 次/分：用户做第 2 次智能文案编辑（第 3、4 个请求）就被 429，
 * 正常使用直接不可用。取 12 次/分 ≈ 每分钟 6 次智能编辑，够正常人用；
 * 对刷 Key 的攻击者仍是有效上限（一天最多 17280 次 → 配合鉴权和计费足以兜住）。
 *
 * 调紧时务必同步确认上面这笔「一次操作几个请求」的账有没有变。
 */
const DEFAULT_LIMIT_PER_WINDOW = 12;
const DEFAULT_WINDOW_SEC = 60;

/** 从环境变量读限流规则，便于压测放宽或线上临时收紧（改完重启生效）。 */
export function readRuleFromEnv(env: NodeJS.ProcessEnv): RateLimitRule {
  const limit = Number.parseInt(env.AI_RATE_LIMIT_PER_MINUTE ?? "", 10);
  const windowSec = Number.parseInt(env.AI_RATE_LIMIT_WINDOW_SEC ?? "", 10);
  return {
    // ⚠️ 用 Number.isFinite 判断，不能用 `|| DEFAULT` —— 显式配成 0（临时关停）
    //    是 falsy，会被兜底成默认值，运维以为关停了实际还在限，零报错。
    limit: Number.isFinite(limit) && limit >= 0 ? limit : DEFAULT_LIMIT_PER_WINDOW,
    windowMs: (Number.isFinite(windowSec) && windowSec > 0 ? windowSec : DEFAULT_WINDOW_SEC) * 1000,
  };
}

/**
 * 内存限流器。单进程内共享一个实例。
 *
 * 内存占用：每个活跃 IP 一个 {startedAt,count} 约 100 字节，
 * 配合下面的惰性清理，长期稳定在「活跃 IP 数 × 100B」量级。
 */
export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, WindowState>();
  private lastSweepAt = 0;

  constructor(private readonly rule: RateLimitRule) {}

  /** 判定并计数。调用一次即消耗一次配额（被拒除外）。 */
  check(key: string, now: number = Date.now()): RateLimitDecision {
    this.sweep(now);
    const { decision, nextState } = evaluateRateLimit(this.buckets.get(key), this.rule, now);
    this.buckets.set(key, nextState);
    return decision;
  }

  /**
   * 惰性清理过期桶 —— 防止长期运行后 Map 无限膨胀（内存泄漏）。
   *
   * ⚠️ 不用 setInterval：那会让进程永远不空闲，
   *    而且在测试里需要额外 unref/清理，容易留下悬挂定时器。
   */
  private sweep(now: number) {
    if (now - this.lastSweepAt < this.rule.windowMs) return;
    this.lastSweepAt = now;
    // ⚠️ 用 forEach 而不是 `for...of`：本项目 tsconfig 的 target 不支持
    //   直接迭代 Map（TS2802 需要 downlevelIteration）。
    //   先收集再删，避免边遍历边删改容器。
    const expiredKeys: string[] = [];
    this.buckets.forEach((state, key) => {
      if (now - state.startedAt >= this.rule.windowMs) expiredKeys.push(key);
    });
    expiredKeys.forEach(key => this.buckets.delete(key));
  }

  /** 仅供测试使用：当前活跃桶数量。 */
  get size(): number {
    return this.buckets.size;
  }
}
