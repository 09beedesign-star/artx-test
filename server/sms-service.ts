import crypto from "node:crypto";

export type SmsSendResult = {
  sent: boolean;
  provider: "tencent" | "dry-run";
  requestId?: string;
  reason?: string;
};

type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
};

function env(name: string) {
  return (process.env[name] || "").trim();
}

function getTencentSmsConfig(): TencentSmsConfig | null {
  const secretId = env("TENCENTCLOUD_SECRET_ID") || env("TENCENT_CLOUD_SECRET_ID");
  const secretKey = env("TENCENTCLOUD_SECRET_KEY") || env("TENCENT_CLOUD_SECRET_KEY");
  const sdkAppId = env("TENCENT_SMS_SDK_APP_ID");
  const signName = env("TENCENT_SMS_SIGN_NAME");
  const templateId = env("TENCENT_SMS_TEMPLATE_ID");
  const region = env("TENCENT_SMS_REGION") || "ap-guangzhou";
  if (!secretId || !secretKey || !sdkAppId || !signName || !templateId) return null;
  return { secretId, secretKey, sdkAppId, signName, templateId, region };
}

export function normalizeMainlandPhone(value: unknown) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/[^\d]/g, "");
  const withoutCountry = digits.startsWith("86") && digits.length === 13 ? digits.slice(2) : digits;
  return /^1[3-9]\d{9}$/.test(withoutCountry) ? withoutCountry : "";
}

export function toE164MainlandPhone(phone: string) {
  return `+86${phone}`;
}

export function getSmsStatus() {
  return {
    configured: Boolean(getTencentSmsConfig()),
    dryRun: env("SMS_DRY_RUN").toLowerCase() === "true",
  };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function getUtcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function sendTencentSms(phone: string, code: string): Promise<SmsSendResult> {
  const config = getTencentSmsConfig();
  if (!config) return { sent: false, provider: "tencent", reason: "sms_not_configured" };

  const host = "sms.tencentcloudapi.com";
  const service = "sms";
  const action = "SendSms";
  const version = "2021-01-11";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = getUtcDate(timestamp);
  const payload = JSON.stringify({
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: [code],
    PhoneNumberSet: [toE164MainlandPhone(phone)],
  });

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = [
    "TC3-HMAC-SHA256",
    `Credential=${config.secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": host,
      "X-TC-Action": action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": version,
      "X-TC-Region": config.region,
    },
    body: payload,
  });
  const data = await response.json().catch(() => ({})) as {
    Response?: {
      RequestId?: string;
      Error?: { Code?: string; Message?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  const responseBody = data.Response || {};
  const status = responseBody.SendStatusSet?.[0];
  const ok = response.ok && !responseBody.Error && (!status?.Code || status.Code === "Ok");
  if (!ok) {
    return {
      sent: false,
      provider: "tencent",
      requestId: responseBody.RequestId,
      reason: responseBody.Error?.Message || status?.Message || `tencent_sms_${response.status}`,
    };
  }
  return { sent: true, provider: "tencent", requestId: responseBody.RequestId };
}

export async function sendSmsVerificationCode(phone: string, code: string): Promise<SmsSendResult> {
  if (env("SMS_DRY_RUN").toLowerCase() === "true") {
    console.info(`[sms] dry-run verification code for ${phone.slice(0, 3)}****${phone.slice(-4)}`);
    return { sent: true, provider: "dry-run" };
  }
  return sendTencentSms(phone, code);
}
