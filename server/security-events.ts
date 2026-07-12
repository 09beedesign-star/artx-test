import crypto from "node:crypto";

export const SECURITY_EVENT_RULES = {
  sensitive_path_probe: {
    threshold: 3,
    windowMs: 10 * 60_000,
    severity: "high",
    title: "疑似攻击路径扫描",
  },
  login_failure: {
    threshold: 5,
    windowMs: 15 * 60_000,
    severity: "high",
    title: "登录失败次数过多",
  },
  authorization_denial: {
    threshold: 10,
    windowMs: 10 * 60_000,
    severity: "medium",
    title: "权限拒绝次数异常",
  },
  rate_limited: {
    threshold: 20,
    windowMs: 5 * 60_000,
    severity: "medium",
    title: "接口限流触发异常",
  },
  server_error: {
    threshold: 5,
    windowMs: 5 * 60_000,
    severity: "high",
    title: "服务错误次数异常",
  },
} as const;

export type SecurityEventRule = keyof typeof SECURITY_EVENT_RULES;

export type SecurityDetection = {
  rule: SecurityEventRule;
  count: number;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  target: string;
};

type SecuritySignal = {
  rule: SecurityEventRule;
  source: string;
  count?: number;
};

type DetectorOptions = {
  secret: string;
  now?: () => number;
  record: (event: SecurityDetection) => Promise<void> | void;
};

type Counter = {
  startedAt: number;
  count: number;
  emitted: boolean;
};

type IngestInput = {
  peerAddress?: string;
  providedSecret?: string;
  expectedSecret?: string;
  payload?: unknown;
};

type IngestResult =
  | { accepted: true; signal: Required<SecuritySignal> }
  | { accepted: false };

function isSecurityEventRule(value: unknown): value is SecurityEventRule {
  return typeof value === "string" && value in SECURITY_EVENT_RULES;
}

function sourceFingerprint(source: string, secret: string) {
  return crypto
    .createHmac("sha256", secret || "artx-security-event")
    .update(source)
    .digest("hex")
    .slice(0, 16);
}

function isLoopbackAddress(value?: string) {
  const address = value?.trim().toLowerCase() || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function secretsMatch(provided?: string, expected?: string) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function validateSecurityEventIngest(input: IngestInput): IngestResult {
  if (!isLoopbackAddress(input.peerAddress) || !secretsMatch(input.providedSecret, input.expectedSecret)) {
    return { accepted: false };
  }

  const payload = input.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { accepted: false };
  const value = payload as Record<string, unknown>;
  const source = typeof value.source === "string" ? value.source.trim() : "";
  const count = Number(value.count);
  if (!isSecurityEventRule(value.rule) || !source || source.length > 256 || !Number.isInteger(count) || count < 1 || count > 1_000) {
    return { accepted: false };
  }

  return {
    accepted: true,
    signal: { rule: value.rule, source, count },
  };
}

export function classifyApplicationSecuritySignal(input: { path: string; status: number }): SecurityEventRule | undefined {
  const path = input.path.toLowerCase();
  if (path === "/api/health" || path.startsWith("/assets/") || path.startsWith("/uploads/") || path === "/internal/security-events") {
    return undefined;
  }
  if (/(?:^|\/)(?:\.env|\.git)(?:\/|$)|\/wp-(?:login|admin)|\/xmlrpc\.php|\/phpmyadmin|\/cgi-bin|\/boaform/.test(path)) {
    return "sensitive_path_probe";
  }
  if (input.status === 429) return "rate_limited";
  if (input.status >= 500) return "server_error";
  if (input.status === 401 && /^\/api\/auth\/(?:login|sms-login|email-login)$/.test(path)) return "login_failure";
  if (input.status === 403) return "authorization_denial";
  return undefined;
}

export function createSecurityEventDetector(options: DetectorOptions) {
  const counters = new Map<string, Counter>();
  const now = options.now || Date.now;

  return {
    async observe(input: SecuritySignal): Promise<SecurityDetection | undefined> {
      const config = SECURITY_EVENT_RULES[input.rule];
      const source = input.source.trim();
      const count = input.count || 1;
      if (!source || !Number.isInteger(count) || count < 1 || count > 1_000) return undefined;

      const observedAt = now();
      const fingerprint = sourceFingerprint(source, options.secret);
      const key = `${input.rule}:${fingerprint}`;
      const existing = counters.get(key);
      const counter = !existing || observedAt - existing.startedAt >= config.windowMs
        ? { startedAt: observedAt, count: 0, emitted: false }
        : existing;
      counter.count += count;
      counters.set(key, counter);

      if (counter.emitted || counter.count < config.threshold) return undefined;
      counter.emitted = true;
      const detection: SecurityDetection = {
        rule: input.rule,
        count: counter.count,
        severity: config.severity,
        title: config.title,
        detail: `来源指纹 ${fingerprint} 在 ${Math.round(config.windowMs / 60_000)} 分钟内触发 ${counter.count} 次${config.title}规则。`,
        target: `source:${fingerprint}`,
      };
      try {
        await options.record(detection);
      } catch (error) {
        console.warn("[security-events] risk event recording failed", error instanceof Error ? error.message : "unknown error");
      }
      return detection;
    },
  };
}
