import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 验证码登录建号时必须传递 context（signupIp / signupUserAgent）
 *
 * ## 防护目标
 *
 * 邮箱验证码登录（email-login）和短信验证码登录（sms-login）在查不到用户时会静默建号。
 * 历史上这两处调用 `createUser` **未传 context**，导致所有通过验证码登录建立的账号
 * `signupIp` / `signupUserAgent` 恒为 `undefined`。
 *
 * 后果：`evaluateBindingEligibility` 的同 IP 检测（invite-rewards.ts:135）条件是
 * `inviter.signupIp && inviteeIp && 相等` —— 任一方为空整个表达式为 false，
 * 对验证码建号的账号**形同不存在**，自邀防线完全失效。
 *
 * 本测试守住三个要点：
 * 1. 验证码登录建号后用户的 signupIp 和 signupUserAgent **必须非空**；
 * 2. 值必须来自调用时传入的 context，而不是默认值或硬编码；
 * 3. 源码层：确认两处 `createUser` 调用**真的传了第三、第四参数**（传 role 和 context，
 *    不是只传前两个让后面走默认值）。
 */

let dataDir = "";

async function loadAuthStore() {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.SMS_DRY_RUN = "true";
  return import("./auth-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-context-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.SMS_DRY_RUN;
  delete process.env.EMAIL_DRY_RUN;
});

describe("验证码登录静默建号时必须记录来源信息", () => {
  it("邮箱验证码登录建号后 signupIp 和 signupUserAgent 必须非空", async () => {
    process.env.EMAIL_DRY_RUN = "true";
    const { handleAuthAction } = await loadAuthStore();

    // 发送验证码
    const sendResult = await handleAuthAction(
      "email-send-code",
      { email: "newuser@example.com", action: "login" },
      { ip: "203.0.113.42", userAgent: "TestClient/1.0" }
    );
    expect(sendResult.status).toBe(200);
    const debugCode = (sendResult.body as { debugCode?: string }).debugCode;
    expect(debugCode).toBeTruthy();

    // 用验证码登录，此时账号不存在会被创建
    const loginResult = await handleAuthAction(
      "email-login",
      { email: "newuser@example.com", code: debugCode! },
      { ip: "203.0.113.42", userAgent: "TestClient/1.0" }
    );
    expect(loginResult.status).toBe(200);

    // 读库验证：signupIp 和 signupUserAgent 必须都写进去了
    const authData = JSON.parse(await readFile(path.join(dataDir, "auth-users.json"), "utf-8"));
    const user = authData.users.find((item: { username: string }) => item.username === "newuser@example.com");
    expect(user).toBeTruthy();
    expect(user.signupIp, "邮箱验证码登录建号时 signupIp 为空，同 IP 检测会失效").toBeTruthy();
    expect(user.signupUserAgent, "邮箱验证码登录建号时 signupUserAgent 为空").toBeTruthy();
    // 必须是传入的那个值，不是默认值或空字符串
    expect(user.signupIp).toBe("203.0.113.42");
    expect(user.signupUserAgent).toBe("TestClient/1.0");
  });

  it("短信验证码登录建号后 signupIp 和 signupUserAgent 必须非空", async () => {
    const { handleAuthAction } = await loadAuthStore();

    const sendResult = await handleAuthAction(
      "sms-send-code",
      { phone: "13800138888" },
      { ip: "198.51.100.7", userAgent: "MobileApp/2.1" }
    );
    expect(sendResult.status).toBe(200);
    const debugCode = (sendResult.body as { debugCode?: string }).debugCode;

    const loginResult = await handleAuthAction(
      "sms-login",
      { phone: "13800138888", code: debugCode! },
      { ip: "198.51.100.7", userAgent: "MobileApp/2.1" }
    );
    expect(loginResult.status).toBe(200);

    const authData = JSON.parse(await readFile(path.join(dataDir, "auth-users.json"), "utf-8"));
    const user = authData.users.find((item: { username: string }) => item.username === "+8613800138888");
    expect(user).toBeTruthy();
    expect(user.signupIp, "短信验证码登录建号时 signupIp 为空，同 IP 检测会失效").toBeTruthy();
    expect(user.signupUserAgent, "短信验证码登录建号时 signupUserAgent 为空").toBeTruthy();
    expect(user.signupIp).toBe("198.51.100.7");
    expect(user.signupUserAgent).toBe("MobileApp/2.1");
  });

  it("源码层：两处 createUser 调用必须传 role 和 context 参数", async () => {
    const source = await readFile(path.join(import.meta.dirname, "auth-store.ts"), "utf-8");

    // 定位到 email-login 处理块：从 `if (action === "email-login")` 到下一个 `if (action === "sms`
    const emailLoginStart = source.indexOf('if (action === "email-login")');
    expect(emailLoginStart, "email-login 处理块不见了，测试定位锚点失效").toBeGreaterThan(-1);
    const emailLoginEnd = source.indexOf('if (action === "sms-send-code")', emailLoginStart);
    const emailLoginBlock = source.slice(emailLoginStart, emailLoginEnd);

    // email-login 里的 createUser 调用必须传 context.ip 和 context.userAgent
    // 直接在整个块里查，不用正则匹配单个调用（避免括号嵌套问题）
    expect(emailLoginBlock).toContain("createUser(");
    expect(emailLoginBlock).toContain("context.ip");
    expect(emailLoginBlock).toContain("context.userAgent");
    // 反向断言：如果只传两个参数，后面就是 `);` 或 `);\n`，不会有对象字面量
    // 找到 createUser 所在行往后几行，验证有 { ip: context.ip
    const createUserLine = emailLoginBlock.indexOf("createUser(");
    const contextObjStart = emailLoginBlock.indexOf("ip: context.ip", createUserLine);
    expect(contextObjStart, "email-login 里 createUser 没有传 context 对象").toBeGreaterThan(createUserLine);

    // 定位到 sms-login 处理块
    const smsLoginStart = source.indexOf('if (action === "sms-login")');
    expect(smsLoginStart, "sms-login 处理块不见了").toBeGreaterThan(-1);
    const smsLoginEnd = source.indexOf('if (action === "register")', smsLoginStart);
    const smsLoginBlock = source.slice(smsLoginStart, smsLoginEnd);

    expect(smsLoginBlock).toContain("createUser(");
    expect(smsLoginBlock).toContain("context.ip");
    expect(smsLoginBlock).toContain("context.userAgent");
    const smsCreateUserLine = smsLoginBlock.indexOf("createUser(");
    const smsContextObjStart = smsLoginBlock.indexOf("ip: context.ip", smsCreateUserLine);
    expect(smsContextObjStart, "sms-login 里 createUser 没有传 context 对象").toBeGreaterThan(smsCreateUserLine);
  });
});
