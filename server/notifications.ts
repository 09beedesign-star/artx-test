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
  html?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
};

type ResendConfig = {
  apiKey: string;
  from: string;
};

type EmailSendResult = {
  sent: boolean;
  reason?: string;
  provider?: string;
};

function env(name: string) {
  return (process.env[name] || "").trim();
}

function getResendConfig(): ResendConfig | null {
  const apiKey = env("RESEND_API_KEY");
  const from = env("RESEND_FROM");
  if (!apiKey || !from) return null;
  return { apiKey, from };
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
  const resendConfigured = Boolean(getResendConfig());
  const smtpConfigured = Boolean(getSmtpConfig());
  return {
    webhookConfigured: Boolean(env("ALERT_WEBHOOK_URL")),
    resendConfigured,
    smtpConfigured,
    emailConfigured: resendConfigured || smtpConfigured,
    emailProvider: resendConfigured ? "resend" : smtpConfigured ? "smtp" : null,
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeEmailBody(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function buildEmailMessage(input: { from: string; to: string; subject: string; text: string; html?: string }) {
  const body = input.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  if (input.html) {
    const boundary = `artx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return [
      `From: ${sanitizeAddress(input.from)}`,
      `To: ${sanitizeAddress(input.to)}`,
      `Subject: ${encodeHeader(input.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeEmailBody(input.text),
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeEmailBody(input.html),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

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

async function sendSmtpMail(input: UserEmailNotification): Promise<EmailSendResult> {
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
    socket.write(`${buildEmailMessage({ from: config.from, to: input.to, subject: input.subject, text: input.text, html: input.html })}\r\n.\r\n`);
    const response = await readSmtpResponse(socket);
    if (response.code !== 250) throw new Error(`SMTP DATA failed with ${response.code}`);
    await smtpCommand(socket, "QUIT", [221]).catch(() => undefined);
    return { sent: true, provider: "smtp" };
  } finally {
    socket.destroy();
  }
}

function textToHtml(text: string) {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

const VERIFICATION_EMAIL_LOGO_URL =
  "https://09beedesign-star.github.io/artx-test/assets/artxstudio-logo-DWGVxm5a.png";

export function buildVerificationCodeEmailHtml(input: {
  title: string;
  intro: string;
  code: string;
}) {
  const title = escapeHtml(input.title);
  const intro = escapeHtml(input.intro);
  const code = escapeHtml(input.code);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#18181b;">
    <div style="width:100%;padding:40px 16px;box-sizing:border-box;background:#f4f4f6;">
      <div style="max-width:520px;margin:0 auto;background:#18181b;border-radius:18px;padding:32px 28px;box-sizing:border-box;box-shadow:0 24px 80px rgba(24,24,27,0.18);">
        <img src="${VERIFICATION_EMAIL_LOGO_URL}" alt="ArtX Studio" width="132" style="display:block;width:132px;max-width:60%;height:auto;margin:0 0 18px;border:0;outline:none;text-decoration:none;">
        <h1 style="margin:14px 0 10px;font-size:24px;line-height:32px;font-weight:760;color:#ffffff;letter-spacing:0;">${title}</h1>
        <p style="margin:0;color:#d4d4d8;font-size:15px;line-height:24px;letter-spacing:0;">${intro}</p>
        <div style="margin:28px 0 22px;padding:18px;background:#ffffff;border-radius:14px;text-align:center;box-shadow:inset 0 0 0 1px rgba(24,24,27,0.06);">
          <div style="font-size:12px;line-height:16px;color:#71717a;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">验证码</div>
          <div style="margin-top:8px;font-size:40px;line-height:48px;font-weight:800;color:#18181b;letter-spacing:0.18em;font-family:'SFMono-Regular','Roboto Mono','Menlo','Consolas',monospace;">${code}</div>
        </div>
        <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:22px;letter-spacing:0;">验证码 10 分钟内有效。请勿将验证码转发给他人。</p>
        <p style="margin:14px 0 0;color:#71717a;font-size:12px;line-height:20px;letter-spacing:0;">如果这不是你本人操作，请忽略此邮件。</p>
      </div>
    </div>
  </body>
</html>`;
}

async function sendResendMail(input: UserEmailNotification): Promise<EmailSendResult> {
  const config = getResendConfig();
  if (!config) return { sent: false, reason: "resend_not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html || textToHtml(input.text),
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`);
  }
  return { sent: true, provider: "resend" };
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

export async function sendUserEmailNotification(input: UserEmailNotification): Promise<EmailSendResult> {
  if (!input.to || !input.to.includes("@")) return { sent: false, reason: "invalid_recipient" };
  try {
    if (getResendConfig()) return await sendResendMail(input);
    return await sendSmtpMail(input);
  } catch (error) {
    console.warn("[notifications] user email failed", error instanceof Error ? error.message : "unknown error");
    return { sent: false, reason: getResendConfig() ? "resend_failed" : "smtp_failed" };
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
    results.push({ channel: result.provider || "email", ...result });
  }

  return results;
}
