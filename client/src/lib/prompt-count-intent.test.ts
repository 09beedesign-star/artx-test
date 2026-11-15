import { describe, expect, it } from "vitest";
import {
  parsePromptImageCount,
  resolveImageCountFromPromptAndSelector,
} from "@shared/prompt-count-intent";

describe("parsePromptImageCount — 提示词里的出图张数", () => {
  it.each([
    ["生成4张猫咪海报", 4],
    ["帮我出3张不同风格的封面", 3],
    ["画两张赛博朋克城市", 2],
    ["来三张产品主图", 3],
    ["做2幅水彩插画", 2],
    ["给我出 4 个版本", 4],
    ["一共3张，竖版", 3],
    ["三张图，分别是春夏秋", 3],
    ["generate 4 images of a red car", 4],
    ["two posters for a coffee shop", 2],
  ])("%s → %d", (prompt, expected) => {
    expect(parsePromptImageCount(prompt)?.count).toBe(expected);
  });

  it.each([
    "把这两张图融合成一张",
    "参考这三张图的配色",
    "基于上传的两张照片换背景",
    "你能生成几张图？",
    "一次最多能出多少张",
    "一只坐在窗边的橘猫",
    "4K 海报，16:9",
    "",
  ])("不应识别为张数：%s", prompt => {
    expect(parsePromptImageCount(prompt)).toBeNull();
  });

  it("超过选择器上限时钳到 4，但保留用户原话的数字", () => {
    const intent = parsePromptImageCount("生成10张头像");
    expect(intent?.requested).toBe(10);
    expect(intent?.count).toBe(4);
  });

  it("融合句里同时有出图张数：以「动词+张数」为准", () => {
    expect(parsePromptImageCount("参考这两张图，生成一张新海报")?.count).toBe(1);
  });
});

describe("resolveImageCountFromPromptAndSelector — 提示词优先，其次选择器", () => {
  it("提示词写了张数 → 盖过选择器", () => {
    expect(
      resolveImageCountFromPromptAndSelector({ prompt: "生成3张海报", selectorCount: 1 })
    ).toMatchObject({ count: 3, source: "prompt" });
  });

  it("提示词写 1 张也要盖过选择器的 4 张（MJ 默认 4 张时省积分）", () => {
    expect(
      resolveImageCountFromPromptAndSelector({ prompt: "只要一张图", selectorCount: 4 })
    ).toMatchObject({ count: 1, source: "prompt" });
  });

  it("提示词没提张数 → 用选择器", () => {
    expect(
      resolveImageCountFromPromptAndSelector({ prompt: "一只橘猫，4K", selectorCount: 2 })
    ).toEqual({ count: 2, source: "selector" });
  });
});

describe("接线：全站提示词出口都要过张数裁决", () => {
  it("InfiniteCanvas 里每个带张数选择器的出口都调用了 resolveImageCountFromPromptAndSelector", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../components/canvas/InfiniteCanvas.tsx"),
      "utf8"
    );
    // 右侧助手 2 条 + 草稿节点 1 + 底部输入框 1 + 图片编辑面板 1 = 5
    expect(src.match(/resolveImageCountFromPromptAndSelector\(\{/g)?.length).toBe(5);
    for (const selector of [
      "selectorCount: assistantImageCount",
      "selectorCount: imageCount",
      "selectorCount: count",
    ]) {
      expect(src, `缺少出口：${selector}`).toContain(selector);
    }
    // 选择器原值不能再直接进 payload（绕过裁决 = 提示词里的张数静默失效）
    expect(src).not.toMatch(/^\s*count: imageCount,$/m);
    expect(src).not.toMatch(/^\s*: assistantImageCount;$/m);
  });
});
