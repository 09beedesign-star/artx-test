/**
 * 手机号 + 密码账号体系的唯一规则源（前后端共用）。
 *
 * 流程结构与文案对齐 https://www.sparkx.zone 的登录 / 注册 / 重置密码（2026-10-27 实抓）。
 * ⚠️ 前端校验与后端校验必须都从这里取，禁止各写一份 —— 两端规则不一致时，
 *    要么前端放行、后端拒绝（用户看到看不懂的错误），要么反过来（后端规则形同虚设）。
 */

export const PHONE_AUTH_MESSAGES = {
  invalidPhone: "请输入正确的手机号",
  emptyPassword: "请输入密码",
  passwordTooShort: "密码至少8位",
  passwordNeedsLetterAndDigit: "密码需包含字母和数字",
  passwordMismatch: "两次密码不一致",
  emptyCode: "请输入验证码",
  invalidCode: "请输入6位验证码",
  agreementRequired: "请勾选用户协议",
  phoneRegistered: "该手机号已注册，请直接登录",
  phoneNotRegistered: "该手机号未注册",
  wrongCredentials: "手机号或密码错误",
  codeInvalidOrExpired: "验证码无效或已过期，请重新获取",
  codeWrong: "验证码错误",
  codeTooManyAttempts: "验证码错误次数过多，请重新获取",
  // 网关类错误（与 SparkX /locales/zh-CN/gateway.json 一致）
  dataError: "数据异常，请稍后重试",
  requestFailed: "请求数据失败，请稍后重试",
  requestTimeout: "请求超时，请稍后重试",
  networkError: "网络连接失败，请检查网络设置",
} as const;

export type PhoneCodePurpose = "register" | "reset";

export const PHONE_MAX_LENGTH = 11;
export const CODE_LENGTH = 6;
export const PASSWORD_MIN_LENGTH = 8;

/** 中国大陆手机号：11 位，1 开头，第二位 3-9。 */
export function isValidMainlandPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(phone);
}

/** 返回第一条不满足的密码规则文案；全部满足返回空串。 */
export function validatePhoneAuthPassword(password: string): string {
  if (!password) return PHONE_AUTH_MESSAGES.emptyPassword;
  if (password.length < PASSWORD_MIN_LENGTH) return PHONE_AUTH_MESSAGES.passwordTooShort;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return PHONE_AUTH_MESSAGES.passwordNeedsLetterAndDigit;
  }
  return "";
}

/** 手机号账号在库里的用户名形态（与既有 sms-login 建号保持一致）。 */
export function phoneAccountUsername(phone: string) {
  return `+86${phone}`;
}
