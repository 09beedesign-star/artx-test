import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.resolve(import.meta.dirname, "./ProfilePage.tsx"),
  "utf8"
);

describe("个人中心长期记忆卡片", () => {
  it("卡片与输入框、保存按钮都在", () => {
    expect(source).toContain('data-testid="profile-long-term-memory"');
    expect(source).toContain('data-testid="profile-long-term-memory-input"');
    expect(source).toContain('data-testid="profile-long-term-memory-save"');
  });

  it("字数上限取自共享常量，而不是页面里另写一个数字", () => {
    /*
     * ⚠️ 前端写死一个数字、服务端按另一个裁剪 = 用户看着还能输，
     *    保存后内容被悄悄截断。两端必须同源。
     */
    expect(source).toContain("USER_MEMORY_LIMITS.longTerm");
    expect(source).not.toMatch(/maxLength=\{1200\}/);
  });
});

describe("保存链路", () => {
  const handler = source.slice(
    source.indexOf("const handleSaveLongTermMemory"),
    source.indexOf("useEffect(() => {\n    const result = writeStoredProfile")
  );

  it("写服务端而不是 localStorage", () => {
    /*
     * ⚠️ 用户要的是「跟随用户账号」。存 localStorage 的话，
     *    他在公司写的习惯回家就没了，且会以为功能坏了。
     */
    expect(handler).toContain("saveUserMemory");
    expect(handler).not.toContain("localStorage");
  });

  it("只提交 longTerm，不捎带 contextEnabled", () => {
    /*
     * ⚠️⚠️ 把开关一起传上去，会用本页的初始值覆盖用户刚在画布打开的开关 ——
     *    悄悄给关掉了，且零报错。服务端的 patch 语义正是为此准备。
     */
    expect(handler).toContain("saveUserMemory({ longTerm: longTermMemory })");
    expect(handler).not.toContain("contextEnabled:");
  });

  it("保存失败有提示，不静默吞掉", () => {
    expect(handler).toContain("没保存成功");
  });

  it("保存成功后广播，让画布那边跟上", () => {
    expect(handler).toContain("broadcastUserMemoryChange");
  });
});

describe("跨页面同步不能毁掉正在编辑的草稿", () => {
  it("收到外部变更时只更新已保存快照，不覆盖输入框", () => {
    /*
     * ⚠️ 直接 setLongTermMemory 会在用户打字过程中把内容清掉：
     *    对方在画布点一下开关，这边正在写的草稿就没了。
     */
    const effect = source.slice(
      source.indexOf("const handleChange = (event: Event) => {"),
      source.indexOf("window.addEventListener(USER_MEMORY_CHANGED_EVENT")
    );
    expect(effect).toContain("setSavedLongTermMemory(detail.longTerm)");
    expect(effect).not.toContain("setLongTermMemory(detail.longTerm)");
  });

  it("卸载时摘掉监听", () => {
    expect(source).toContain("window.removeEventListener(USER_MEMORY_CHANGED_EVENT");
  });
});

describe("文案必须讲清两个开关的区别", () => {
  it("明确说明长期记忆始终生效、与画布开关无关", () => {
    /*
     * 不说清的话用户会以为「画布开关关着，长期记忆就不生效」，
     * 进而反复纠结为什么写了没用。
     */
    expect(source).toContain("始终生效");
    expect(source).toContain("和画布上那个开关无关");
  });
});
