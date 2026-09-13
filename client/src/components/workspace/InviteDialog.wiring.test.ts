import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 邀请功能前端接线防护
 *
 * 这里用源码扫描而不是渲染测试，原因是要守的两件事都属于「结构约定」：
 *   1. 侧边栏新增入口必须同时改三处，漏一处就是「点了没反应」；
 *   2. 前端绝不能出现任何"领取奖励"的写接口。
 * 渲染测试守不住第 2 条 —— 它只会验证已有按钮的行为，
 * 守不住将来有人新增一个按钮。
 */

const root = path.resolve(__dirname, "../../../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

/** 剥掉整行注释，避免断言命中我们自己写的解释性说明。 */
function stripLineComments(source: string) {
  return source
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("邀请入口接线", () => {
  it("三处联动齐全：NAV_ITEMS / ICON_MAP / handleNavClick", () => {
    const navData = stripLineComments(read("client/src/lib/workspace-data.ts"));
    const sidebar = stripLineComments(read("client/src/components/workspace/Sidebar.tsx"));

    // 剥注释后必须仍含实质代码，否则下面的断言全是空转。
    expect(navData).toContain("NAV_ITEMS");
    expect(sidebar).toContain("ICON_MAP");

    // 1) 导航数据里有邀请项
    expect(navData).toMatch(/id:\s*"invite"/);
    expect(navData).toMatch(/icon:\s*"Gift"/);

    // 2) 图标已注册，否则会回落成默认 Home 图标
    expect(sidebar).toMatch(/ICON_MAP[\s\S]*?Gift[\s\S]*?\}/);
    expect(sidebar).toMatch(/import\s*\{[\s\S]*?Gift[\s\S]*?\}\s*from\s*"lucide-react"/);

    // 3) 点击分支已放行，否则只会弹「功能即将上线」
    expect(sidebar).toMatch(/id\s*===\s*"invite"/);
    expect(sidebar).toContain("setInviteOpen(true)");

    // 弹窗真的被渲染了（只声明 state 不挂组件是最常见的漏接）
    expect(sidebar).toContain("<InviteDialog");
    expect(sidebar).toMatch(/import\s+InviteDialog\s+from/);
  });

  it("邀请弹窗只读不写：不得出现任何领取/发放类写接口", () => {
    const dialog = stripLineComments(read("client/src/components/workspace/InviteDialog.tsx"));
    expect(dialog).toContain("/api/invite/summary");

    // ⚠️ 允许 POST /api/invite/send（发邮件），但禁止任何积分发放类接口。
    // 发邮件本身不发放积分 —— 奖励发放点在后端订单支付成功链路里。
    expect(dialog).toMatch(/\/api\/invite\/send/);
    
    // 反向断言：守的是「将来新增的出口」，不是已知的那几个。
    // 逐个点名正向断言只能守住今天，守不住明天。
    expect(dialog).not.toMatch(/\/api\/invite\/(claim|grant|reward|redeem)/i);
  });

  it("邀请码只在注册时透传，登录不带", () => {
    const auth = stripLineComments(read("client/src/contexts/AuthContext.tsx"));
    expect(auth).toContain("readInviteCodeFromUrl");
    // 必须以 action === "register" 为条件，不能无条件带上。
    expect(auth).toMatch(/action\s*===\s*"register"\s*\?\s*readInviteCodeFromUrl\(\)/);
  });

  it("邀请链接指向注册入口并带邀请码参数", () => {
    const dialog = stripLineComments(read("client/src/components/workspace/InviteDialog.tsx"));
    expect(dialog).toMatch(/\?invite=\$\{encodeURIComponent\(code\)\}/);
  });
});
