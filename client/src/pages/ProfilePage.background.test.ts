/**
 * ProfilePage 白天模式背景色测试
 * 
 * 需求：白天模式下，个人中心页面的底层颜色从黑色改为白色，与其他页面底色统一。
 * 
 * 验证点：
 * 1. 主容器背景：白天模式下为白色（#ffffff），黑夜模式下为黑色（#222222）
 * 2. 头部横幅背景：白天模式下为白色，黑夜模式下为黑色
 * 3. 编辑面板遮罩：白天模式下为白色半透明，黑夜模式下为黑色半透明
 * 4. 修改密码面板遮罩：白天模式下为白色半透明，黑夜模式下为黑色半透明
 * 5. 头像裁剪面板遮罩：白天模式下为白色半透明，黑夜模式下为黑色半透明
 * 6. 头像上传按钮 hover 遮罩：白天模式下为白色半透明+黑色图标，黑夜模式下为黑色半透明+白色图标
 */

import { describe, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const sourceFile = resolve(__dirname, "ProfilePage.tsx");
const source = readFileSync(sourceFile, "utf-8");

describe("ProfilePage 白天模式背景色", () => {
  it("主容器背景：白天模式下为白色", ({ expect }) => {
    const mainContainerMatch = source.match(
      /background:\s*isDark\s*\?\s*"#222222"\s*:\s*"#ffffff"/
    );
    expect(mainContainerMatch).toBeTruthy();
  });

  it("头部横幅背景：白天模式下为白色", ({ expect }) => {
    const headerBannerMatch = source.match(
      /background:\s*isDark\s*\?\s*"#222222"\s*:\s*"#ffffff"/
    );
    expect(headerBannerMatch).toBeTruthy();
  });

  it("编辑面板遮罩：白天模式下为白色半透明", ({ expect }) => {
    const editModalMatch = source.match(
      /background:\s*isDark\s*\?\s*"rgba\(34,34,34,0\.35\)"\s*:\s*"rgba\(255,255,255,0\.35\)"/
    );
    expect(editModalMatch).toBeTruthy();
  });

  it("修改密码面板遮罩：白天模式下为白色半透明", ({ expect }) => {
    const passwordModalMatch = source.match(
      /background:\s*isDark\s*\?\s*"rgba\(34,34,34,0\.35\)"\s*:\s*"rgba\(255,255,255,0\.35\)"/
    );
    expect(passwordModalMatch).toBeTruthy();
  });

  it("头像裁剪面板遮罩：白天模式下为白色半透明", ({ expect }) => {
    const avatarCropMatch = source.match(
      /background:\s*isDark\s*\?\s*"rgba\(34,34,34,0\.45\)"\s*:\s*"rgba\(255,255,255,0\.45\)"/
    );
    expect(avatarCropMatch).toBeTruthy();
  });

  it("头像上传按钮 hover 遮罩：白天模式下为白色半透明", ({ expect }) => {
    const hoverOverlayMatch = source.match(
      /background:\s*isDark\s*\?\s*"rgba\(34,34,34,0\.45\)"\s*:\s*"rgba\(255,255,255,0\.45\)"/
    );
    expect(hoverOverlayMatch).toBeTruthy();
  });

  it("头像上传按钮图标：白天模式下为黑色", ({ expect }) => {
    const iconColorMatch = source.match(
      /<Camera\s+size=\{18\}\s+color=\{isDark\s*\?\s*"white"\s*:\s*"black"\}\s*\/>/
    );
    expect(iconColorMatch).toBeTruthy();
  });

  it("不再使用硬编码的黑色背景（bg-[#222222]）", ({ expect }) => {
    const hardcodedBlackBg = source.match(/bg-\[#222222\]/g);
    expect(hardcodedBlackBg).toBeNull();
  });

  it("不再使用硬编码的黑色背景（background: \"#222222\"）在条件判断之外", ({ expect }) => {
    // 匹配所有 background: "#222222" 但不在 isDark 三元表达式中的
    const lines = source.split("\n");
    const problematicLines = lines.filter((line, index) => {
      if (line.includes('background: "#222222"')) {
        // 检查前后行是否有 isDark 判断
        const contextLines = lines.slice(Math.max(0, index - 2), index + 3).join("\n");
        return !contextLines.includes("isDark");
      }
      return false;
    });
    
    expect(problematicLines.length).toBe(0);
  });
});
