import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_GIFT_SOURCE_PREFIXES,
  grantCredits,
  isAllowedGiftSource,
  type GiftableData,
  type GiftableUser,
} from "./credit-gifting";

/**
 * 「禁止用户之间转赠积分」防护测试
 *
 * 产品硬性边界：积分只能由平台**单向**发放给用户，
 * 不存在「用户 A 把自己的积分转给用户 B」的任何通路。
 *
 * 本文件是该规则的**长期守卫**，分三层：
 *   1. 运行时闸门 —— grantCredits 的 source 白名单确实生效
 *   2. 源码级扫描 —— 全仓不得出现转赠语义的接口/函数/路由
 *   3. 越权收款人 —— 用户端路由不得从请求体读取收款人 id
 *
 * ⚠️ 第 2、3 层是**反向断言**：缺陷的形态是「将来有人新增了一条通路」，
 * 逐个点名的正向断言守不住未知的新增点，必须用扫描式断言。
 */

const SERVER_DIR = __dirname;
const REPO_ROOT = path.resolve(SERVER_DIR, "..");
const CLIENT_SRC_DIR = path.join(REPO_ROOT, "client", "src");

function makeData(): GiftableData {
  return { credits: [], creditBatches: [], creditNotifications: [] };
}

function makeUser(overrides: Partial<GiftableUser> = {}): GiftableUser {
  return { id: "u_1", name: "测试用户", credits: 100, ...overrides };
}

/** 递归收集源码文件，跳过依赖目录与测试文件本身。 */
function collectSourceFiles(dir: string, extensions: string[]): string[] {
  const collected: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return collected;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collected.push(...collectSourceFiles(fullPath, extensions));
      continue;
    }
    // 测试文件本身会大量提及「转赠」这类词，必须排除，否则断言自己打自己。
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    if (extensions.some((ext) => entry.endsWith(ext))) collected.push(fullPath);
  }
  return collected;
}

describe("积分转赠禁令：运行时闸门", () => {
  it("平台侧来源前缀全部放行", () => {
    for (const prefix of ALLOWED_GIFT_SOURCE_PREFIXES) {
      expect(isAllowedGiftSource(`${prefix}whatever`)).toBe(true);
    }
  });

  it("拒绝表达「来自某个用户」的来源", () => {
    const transferLikeSources = [
      "user/u_123",
      "u_123",
      "transfer/u_123",
      "from-user/u_123",
      "peer/u_456",
      "gift-from/u_789",
      "member/u_1",
      "", // 空来源同样必须拒绝，否则可绕过
    ];
    for (const source of transferLikeSources) {
      expect(isAllowedGiftSource(source)).toBe(false);
    }
  });

  it("非法来源被拒绝且不产生任何副作用", () => {
    const data = makeData();
    const user = makeUser();

    const result = grantCredits(data, {
      user,
      amount: 500,
      reason: "好友转赠",
      source: "user/u_999",
      operator: "u_999",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("禁止用户之间转赠");
    }

    // 关键：拒绝必须是「零写入」，不能留半截数据。
    expect(user.credits).toBe(100);
    expect(data.credits).toHaveLength(0);
    expect(data.creditBatches).toHaveLength(0);
    expect(data.creditNotifications).toHaveLength(0);
  });

  it("白名单前缀必须是「前缀」而非子串匹配，防止 user/x 伪装成 xadmin/", () => {
    // 「包含」匹配会让 "evil-admin/" 或 "user/admin/" 这类来源蒙混过关。
    expect(isAllowedGiftSource("evil-admin/gift")).toBe(false);
    expect(isAllowedGiftSource("user/admin/gift")).toBe(false);
    expect(isAllowedGiftSource("x-rule/signup")).toBe(false);
  });

  it("合法赠送不受影响（回归保护）", () => {
    const data = makeData();
    const user = makeUser();

    const result = grantCredits(data, {
      user,
      amount: 500,
      reason: "运营活动奖励",
      source: "admin/batch-gift",
      operator: "admin",
    });

    expect(result.success).toBe(true);
    expect(user.credits).toBe(600);
  });
});

describe("积分转赠禁令：源码级扫描", () => {
  /**
   * 转赠语义的标识符。
   * ⚠️ 只匹配**代码标识符**形态（驼峰/短横线/下划线），
   * 不匹配自然语言注释 —— 否则本项目里解释「为什么禁止转赠」的注释
   * 会命中自己。这是本仓库踩过的坑（见 MEMORY.md「解释性注释会命中自己」）。
   */
  const FORBIDDEN_IDENTIFIER_PATTERNS = [
    /\btransferCredits\b/,
    /\bsendCredits\b/,
    /\bshareCredits\b/,
    /\bgiveCredits\b/,
    /\bdonateCredits\b/,
    /\bcreditTransfer\b/,
    /\brecipientUserId\b/,
    /\bfromUserId\b/,
    /["'`]\/?credits\/transfer["'`]/,
    /["'`]\/?credits\/send["'`]/,
  ];

  it("服务端不存在任何转赠语义的标识符或路由", () => {
    const files = collectSourceFiles(SERVER_DIR, [".ts"]);
    expect(files.length).toBeGreaterThan(5);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_IDENTIFIER_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(REPO_ROOT, file)} 命中 ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("前端不存在任何转赠语义的标识符或入口", () => {
    const files = collectSourceFiles(CLIENT_SRC_DIR, [".ts", ".tsx"]);
    expect(files.length).toBeGreaterThan(5);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_IDENTIFIER_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(REPO_ROOT, file)} 命中 ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("grantCredits 的生产调用点只能在管理员鉴权后的 admin-store 内", () => {
    const files = collectSourceFiles(SERVER_DIR, [".ts"]);
    const callers = files.filter((file) => {
      if (file.endsWith("credit-gifting.ts")) return false; // 定义处不算调用
      return /\bgrantCredits\s*\(/.test(readFileSync(file, "utf8"));
    });

    // 唯一允许的调用方是 admin-store.ts（其 handleAdminApiRequest 开头即鉴权）。
    // 若将来新增调用方，这条会失败，强制人工复核该调用点的鉴权。
    expect(callers.map((file) => path.basename(file)).sort()).toEqual(["admin-store.ts"]);
  });
});

describe("积分转赠禁令：越权指定收款人", () => {
  /**
   * 最隐蔽的一类缺陷：用户端接口接受 userId 参数并据此发放积分，
   * 却不校验它是否等于当前登录用户 —— 等同于「任意指定收款人」。
   *
   * 防线：server/index.ts 里用户身份一律由 requireSessionUser 从
   * Authorization 头推导，绝不从请求体读取。
   */
  it("index.ts 不得从请求体或查询串读取 userId 作为身份依据", () => {
    const source = readFileSync(path.join(SERVER_DIR, "index.ts"), "utf8");

    // 去掉注释后再扫，避免说明性注释误伤。
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(withoutComments).not.toMatch(/\breq\.body\.userId\b/);
    expect(withoutComments).not.toMatch(/\breq\.query\.userId\b/);
    expect(withoutComments).not.toMatch(/\bbody\.userId\b/);
  });

  it("用户端计费路由必须以会话用户为准", () => {
    const source = readFileSync(path.join(SERVER_DIR, "index.ts"), "utf8");

    // 下单路由必须存在，且用的是会话里的 user.id。
    expect(source).toMatch(/requireSessionUser/);
    expect(source).toMatch(/userId:\s*user\.id/);
  });
});
