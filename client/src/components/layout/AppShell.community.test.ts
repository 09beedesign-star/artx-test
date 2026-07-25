import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appShellSource = readFileSync(resolve(currentDir, "AppShell.tsx"), "utf8");

describe("AppShell community entry", () => {
  it("places the join-community button above help and opens the QR dialog copy", () => {
    const bottomSection = appShellSource.slice(appShellSource.indexOf("Bottom: Help"));
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
});
