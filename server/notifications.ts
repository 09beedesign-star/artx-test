import net from "node:net";
import tls from "node:tls";

type NotificationSeverity = "critical" | "warning" | "info";

export type OpsNotification = {
  title: string;
  message: string;
  severity?: NotificationSeverity;
  category?: string;
  metadata?: Record<string, unknown>;
};

export type UserEmailNotification = {
  to: string;
  subject: string;
  text: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
};

function env(name: string) {
  return (process.env[name] || "").trim();
}

function getSmtpConfig(): SmtpConfig | null {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const password = env("SMTP_PASSWORD");
  const from = env("SMTP_FROM") || user;
  const port = Number(env("SMTP_PORT") || 587);
  if (!host || !user || !password || !from || !Number.isFinite(port)) return null;
  return {
    host,
    user,
    password,
    from,
    port,
    secure: env("SMTP_SECURE").toLowerCase() === "true" || port === 465,
  };
}

function getOpsEmailRecipients() {
  return (env("ADMIN_ALERT_EMAIL") || env("SMTP_TO"))
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export function getNotificationStatus() {
  return {
    webhookConfigured: Boolean(env("ALERT_WEBHOOK_URL")),
    smtpConfigured: Boolean(getSmtpConfig()),
    opsEmailConfigured: getOpsEmailRecipients().length > 0,
  };
}

function encodeHeader(value: string) {
  return /[^\x20-\x7e]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`
    : value;
}

function sanitizeAddress(value: string) {
  return value.replace(/[\r\n<>]/g, "").trim();
}

function buildEmailMessage(input: { from: string; to: string; subject: string; text: string }) {
  const body = input.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return [
    `From: ${sanitizeAddress(input.from)}`,
    `To: ${sanitizeAddress(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

function createSocket(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.once("connect", () => resolve(socket));
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function readSmtpResponse(socket: net.Socket | tls.TLSSocket) {
  let buffer = "";
  return new Promise<{ code: number; text: string }>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      const match = last.match(/^(\d{3})\s/);
      if (!match) return;
      cleanup();
      resolve({ code: Number(match[1]), text: buffer });
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function smtpCommand(socket: net.Socket | tls.TLSSocket, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!expected.includes(response.code)) {
    throw new Error(`SMTP command failed with ${response.code}`);
  }
  return response;
}

async function upgradeStartTls(socket: net.Socket, config: SmtpConfig) {
  await smtpCommand(socket, "STARTTLS", [220]);
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: config.host });
    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });
}

async function sendSmtpMail(input: UserEmailNotification) {
  const config = getSmtpConfig();
  if (!config) return { sent: false, reason: "smtp_not_configured" };

  let socket = await createSocket(config);
  try {
    await readSmtpResponse(socket);
    await smtpCommand(socket, `EHLO ${env("SMTP_HELO_NAME") || "artx.local"}`, [250]);
    if (!config.secure) {
      socket = await upgradeStartTls(socket as net.Socket, config);
      await smtpCommand(socket, `EHLO ${env("SMTP_HELO_NAME") || "artx.local"}`, [250]);
    }
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(config.user).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(config.password).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${sanitizeAddress(config.from)}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${sanitizeAddress(input.to)}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    socket.write(`${buildEmailMessage({ from: config.from, to: input.to, subject: input.subject, text: input.text })}\r\n.\r\n`);
    const response = await readSmtpResponse(socket);
    if (response.code !== 250) throw new Error(`SMTP DATA failed with ${response.code}`);
    await smtpCommand(socket, "QUIT", [221]).catch(() => undefined);
    return { sent: true };
  } finally {
    socket.destroy();
  }
}

async function sendWebhookNotification(input: OpsNotification) {
  const url = env("ALERT_WEBHOOK_URL");
  if (!url) return { sent: false, reason: "webhook_not_configured" };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      message: input.message,
      severity: input.severity || "info",
      category: input.category || "ops",
      metadata: input.metadata || {},
      occurredAt: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Alert webhook returned ${response.status}`);
  }
  return { sent: true };
}

export async function sendUserEmailNotification(input: UserEmailNotification) {
  if (!input.to || !input.to.includes("@")) return { sent: false, reason: "invalid_recipient" };
  try {
    return await sendSmtpMail(input);
  } catch (error) {
    console.warn("[notifications] user email failed", error instanceof Error ? error.message : "unknown error");
    return { sent: false, reason: "smtp_failed" };
  }
}

export async function sendOpsNotification(input: OpsNotification) {
  const results: Array<{ channel: string; sent: boolean; reason?: string }> = [];
  try {
    const result = await sendWebhookNotification(input);
    results.push({ channel: "webhook", ...result });
  } catch (error) {
    console.warn("[notifications] webhook failed", error instanceof Error ? error.message : "unknown error");
    results.push({ channel: "webhook", sent: false, reason: "webhook_failed" });
  }

  const recipients = getOpsEmailRecipients();
  for (const to of recipients) {
    const result = await sendUserEmailNotification({
      to,
      subject: input.title,
      text: [
        input.message,
        "",
        `Severity: ${input.severity || "info"}`,
        `Category: ${input.category || "ops"}`,
        input.metadata ? `Metadata: ${JSON.stringify(input.metadata)}` : "",
      ].filter(Boolean).join("\n"),
    });
    results.push({ channel: "smtp", ...result });
  }

  return results;
}
