import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATION_HISTORY_TAG_COLORS,
  DEFAULT_TAG_NAMES,
  TAG_COLOR_IDS,
  TAG_NAME_MAX_LENGTH,
  clearRecordTags,
  countTaggedRecords,
  isTagColorId,
  normalizeTagIds,
  normalizeTagNames,
  tagColor,
  toggleRecordTag,
  type TagColorId,
} from "./creation-history-tags";

describe("创作历史六色标签：常量", () => {
  it("恰好六种颜色，id 唯一且色值可用", () => {
    expect(CREATION_HISTORY_TAG_COLORS).toHaveLength(6);
    expect(new Set(TAG_COLOR_IDS).size).toBe(6);
    for (const color of CREATION_HISTORY_TAG_COLORS) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(color.fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(color.name).toBeTruthy();
    }
    expect(tagColor("red").id).toBe("red");
  });

  it("默认名称覆盖全部六种颜色", () => {
    for (const id of TAG_COLOR_IDS) expect(DEFAULT_TAG_NAMES[id]).toBeTruthy();
  });
});

describe("创作历史六色标签：脏数据收敛", () => {
  it("tagIds 只保留合法 id、去重并保持固定顺序", () => {
    expect(normalizeTagIds(undefined)).toEqual([]);
    expect(normalizeTagIds("red")).toEqual([]);
    expect(normalizeTagIds(["purple", "nope", "red", "purple", 42])).toEqual(["red", "purple"]);
  });

  it("标签名逐字段回落，空白名回落默认，超长截断", () => {
    const names = normalizeTagNames({ red: "  重要客户  ", blue: "", green: "x".repeat(40), nope: "忽略" });
    expect(names.red).toBe("重要客户");
    expect(names.blue).toBe(DEFAULT_TAG_NAMES.blue);
    expect(names.green).toHaveLength(TAG_NAME_MAX_LENGTH);
    expect(names.orange).toBe(DEFAULT_TAG_NAMES.orange);
  });

  it("完全坏掉的配置不影响整套标签名", () => {
    expect(normalizeTagNames(null)).toEqual(DEFAULT_TAG_NAMES);
    expect(normalizeTagNames({ red: 123 })).toEqual(DEFAULT_TAG_NAMES);
    expect(isTagColorId("red")).toBe(true);
    expect(isTagColorId("rainbow")).toBe(false);
  });
});

describe("创作历史六色标签：打标签 / 取消标签", () => {
  const base: { id: string; tagIds?: TagColorId[] } = { id: "g1#0" };

  it("第一次打标签会加上，第二次点击同一个颜色会取消", () => {
    const tagged = toggleRecordTag(base, "red");
    expect(tagged.tagIds).toEqual(["red"]);
    expect(toggleRecordTag(tagged, "red").tagIds).toBeUndefined();
    expect(base.tagIds).toBeUndefined(); // 不可变
  });

  it("可叠加多个颜色，且顺序稳定", () => {
    const a = toggleRecordTag(base, "purple");
    const b = toggleRecordTag(a, "red");
    expect(b.tagIds).toEqual(["red", "purple"]);
  });

  it("取消全部标签", () => {
    const tagged = { id: "g1#0", tagIds: ["red", "blue"] as TagColorId[], prompt: "保留" };
    const cleared = clearRecordTags(tagged);
    expect(cleared.tagIds).toBeUndefined();
    expect(cleared.prompt).toBe("保留");
  });

  it("计数只统计真实存在的标签", () => {
    const counts = countTaggedRecords([
      { tagIds: ["red", "blue"] },
      { tagIds: ["red"] },
      {},
      { tagIds: ["nope" as TagColorId] },
    ]);
    expect(counts.red).toBe(2);
    expect(counts.blue).toBe(1);
    expect(counts.green).toBe(0);
  });
});

describe("🔒 标签是纯本地数据，不进云端", () => {
  it("标签模块没有任何网络 / 云同步 / 浏览器存储调用", () => {
    const src = readFileSync(resolve(__dirname, "./creation-history-tags.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    expect(src).not.toMatch(/workspace-sync|scheduleWorkspaceSync/);
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|indexedDB/);
    expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH)/i);
  });
});
