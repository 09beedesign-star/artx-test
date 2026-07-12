import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGETS = [
  { logPath: "/var/log/nginx/artx-admin.access.log", endpoint: "http://127.0.0.1:3001/internal/security-events" },
  { logPath: "/var/log/nginx/artx-gray.access.log", endpoint: "http://127.0.0.1:3002/internal/security-events" },
];

function classifyLogRequest(requestPath, status) {
  const pathname = requestPath.toLowerCase();
  if (pathname === "/api/health") return undefined;
  if (/(?:^|\/)(?:\.env|\.git)(?:\/|$)|\/wp-(?:login|admin)|\/xmlrpc\.php|\/phpmyadmin|\/cgi-bin|\/boaform/.test(pathname)) {
    return "sensitive_path_probe";
  }
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status === 401 && /^\/api\/auth\/(?:login|sms-login|email-login)$/.test(pathname)) return "login_failure";
  if (status === 403) return "authorization_denial";
  return undefined;
}

function parseNginxSecurityLogLine(line) {
  const request = line.match(/^(\S+)\s+\S+\s+\S+\s+\[[^\]]+\]\s+"[A-Z]+\s+([^\s?"]+)(?:\?[^\s"]*)?\s+HTTP\/[^\s"]+"\s+(\d{3})/);
  if (!request) return undefined;
  const [, source, requestPath, statusText] = request;
  const rule = classifyLogRequest(requestPath, Number(statusText));
  return rule ? { rule, source } : undefined;
}

function buildCollectorPayloads(lines) {
  const counts = new Map();
  for (const line of lines) {
    const parsed = parseNginxSecurityLogLine(line);
    if (!parsed) continue;
    const key = `${parsed.rule}:${parsed.source}`;
    const existing = counts.get(key) || { ...parsed, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  return Array.from(counts.values());
}

export function summarizeNginxSecurityLog(lines) {
  const counts = new Map();
  for (const event of buildCollectorPayloads(lines)) {
    counts.set(event.rule, (counts.get(event.rule) || 0) + event.count);
  }
  return Array.from(counts, ([rule, count]) => ({ rule, count }));
}

function statePathForLog(stateDir, logPath) {
  const digest = crypto.createHash("sha256").update(logPath).digest("hex");
  return path.join(stateDir, `${digest}.json`);
}

async function readState(statePath) {
  try {
    const value = JSON.parse(await fs.readFile(statePath, "utf-8"));
    return typeof value?.offset === "number" && typeof value?.ino === "number" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function readNewLogLines(logPath, stateDir) {
  const stats = await fs.stat(logPath);
  const statePath = statePathForLog(stateDir, logPath);
  const previous = await readState(statePath);
  const offset = previous?.ino === stats.ino && previous.offset <= stats.size ? previous.offset : 0;
  const content = await fs.readFile(logPath);
  const added = content.subarray(offset).toString("utf-8");
  return {
    lines: added.split(/\r?\n/).filter(Boolean),
    statePath,
    state: { ino: stats.ino, offset: stats.size },
  };
}

async function postEvent(endpoint, secret, event) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ArtX-Security-Ingest": secret,
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) throw new Error(`collector endpoint returned ${response.status}`);
}

async function collectTarget(target, secret, stateDir) {
  const result = await readNewLogLines(target.logPath, stateDir);
  const events = buildCollectorPayloads(result.lines);
  for (const event of events) {
    await postEvent(target.endpoint, secret, event);
  }
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(result.statePath, JSON.stringify(result.state), { mode: 0o600 });
}

async function main() {
  const secret = (process.env.SECURITY_EVENT_INGEST_SECRET || "").trim();
  if (!secret) throw new Error("SECURITY_EVENT_INGEST_SECRET is required");
  const stateDir = process.env.ARTX_SECURITY_COLLECTOR_STATE_DIR || "/var/lib/artx/security-collector";
  for (const target of DEFAULT_TARGETS) {
    try {
      await collectTarget(target, secret, stateDir);
    } catch (error) {
      console.warn("[security-collector] target collection failed", path.basename(target.logPath), error instanceof Error ? error.message : "unknown error");
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error("[security-collector] failed", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
