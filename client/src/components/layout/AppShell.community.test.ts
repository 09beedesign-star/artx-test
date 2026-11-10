import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appShellSource = readFileSync(resolve(currentDir, "AppShell.tsx"), "utf8");

describe("AppShell community entry", () => {
  it("places the join-community button above help and opens the QR dialog copy", () => {
    // 三段式布局后底部工具区在 icon 栏里，锚点随之改名。
    const start = appShellSource.indexOf("Bottom utility icons");
    const end = appShellSource.indexOf("Panel toggle");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const bottomSection = appShellSource.slice(start, end);
    const communityIndex = bottomSection.indexOf("加入社群");
    const helpIndex = bottomSection.indexOf("帮助");

    expect(communityIndex).toBeGreaterThan(-1);
    expect(helpIndex).toBeGreaterThan(-1);
    expect(communityIndex).toBeLessThan(helpIndex);
    expect(appShellSource).toContain("用户可扫码加入微信群");
    expect(appShellSource).toContain("wechatGroupQrUrl");
    expect(appShellSource).toContain("/api/community/wechat-group-qr/image");
    expect(appShellSource).toContain("defaultWechatGroupQr");
  });

  it("highlights help while on the help page and gives an in-page submission toast", () => {
    const source = appShellSource;

    expect(source).toContain('const helpActive = isActive("/help");');
    // 高亮改为把 active 传给 icon 按钮（原来是内联 background 三元），意图不变。
    expect(source).toContain("active={helpActive}");
    expect(source).toContain("您当前已在帮助与反馈页面中，请提交你的建议吧。");
  });
});
