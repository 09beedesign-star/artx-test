import { describe, expect, it } from "vitest";
import {
  ECOMMERCE_PLATFORM_BG_RULES,
  ECOMMERCE_PLATFORM_IDS,
} from "@/components/canvas/SmartCommerceProductDialog";
import {
  ECOMMERCE_PLATFORM_STYLE_MAP,
  ECOMMERCE_STYLE_PROFILES,
  FALLBACK_ECOMMERCE_STYLE_ID,
  buildEcommercePromptRules,
  findWhiteBackgroundConflicts,
  getEcommerceStyleProfile,
  type EcommercePlatformSpec,
} from "./ecommerce-style-profiles";

/**
 * 【这套测试在守什么】
 *
 * 需求是「选了电商平台后，该平台的设计风格要真的进到提示词里」。
 * 这条链路上有三处会**静默失效**——不抛异常、界面也毫无异常，
 * 只是风格从此再没生效过：
 *   1. 平台 id 与映射表 key 对不上 → 静默回落到兜底风格
 *   2. 白底平台映射到了非白底风格族 → 提示词里两条指令打架，图过不了审
 *   3. 风格行被构造出来了却没进最终数组 → 本项目反复踩的「透传 ≠ 被消费」
 *
 * ⚠️ 这三条都不会报错，所以只能靠断言兜住。
 */

describe("电商平台 id 与风格映射的对齐", () => {
  it("映射表的 key 集合与面板平台 id 集合完全一致", () => {
    const platformIds = [...ECOMMERCE_PLATFORM_IDS].sort();
    const mappedIds = Object.keys(ECOMMERCE_PLATFORM_STYLE_MAP).sort();

    // 自我保护：如果面板那边导出为空，这个测试会变成「空集合等于空集合」的恒绿
    expect(platformIds.length).toBeGreaterThan(20);
    expect(mappedIds).toEqual(platformIds);
  });

  it("映射表里引用的每个 styleId 都真实存在", () => {
    const knownStyleIds = new Set(ECOMMERCE_STYLE_PROFILES.map(item => item.id));
    const dangling = Object.entries(ECOMMERCE_PLATFORM_STYLE_MAP)
      .filter(([, styleId]) => !knownStyleIds.has(styleId))
      .map(([platformId, styleId]) => `${platformId} -> ${styleId}`);

    expect(dangling).toEqual([]);
  });

  it("风格族 id 不重复", () => {
    const ids = ECOMMERCE_STYLE_PROFILES.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("白底硬不变量", () => {
  /**
   * bg === "white" 是平台审核硬规则，风格文案是视觉建议。
   * 两者互相矛盾时模型只会挑一条，挑中哪条全凭运气。
   * 这里逐个平台核对，一个都不能漏。
   */
  it("每个白底平台都只映射到 whiteBg 为 true 的风格族", () => {
    const violations: string[] = [];
    let checkedWhitePlatforms = 0;

    for (const platformId of ECOMMERCE_PLATFORM_IDS) {
      if (ECOMMERCE_PLATFORM_BG_RULES[platformId] !== "white") continue;
      checkedWhitePlatforms += 1;
      const profile = getEcommerceStyleProfile(platformId);
      if (!profile.whiteBg) {
        violations.push(`${platformId} -> ${profile.id}(whiteBg=false)`);
      }
    }

    // 自我保护：白底平台一个都没被检查到的话，上面的循环等于没跑
    expect(checkedWhitePlatforms).toBeGreaterThan(5);
    expect(violations).toEqual([]);
  });

  it("兜底风格族本身不是白底族，且确实存在", () => {
    const fallback = ECOMMERCE_STYLE_PROFILES.find(
      item => item.id === FALLBACK_ECOMMERCE_STYLE_ID
    );
    expect(fallback).toBeDefined();
    // 兜底必须中性：兜底如果是白底族，非白底平台忘配映射时会被强按成纯白底
    expect(fallback!.whiteBg).toBe(false);
  });
});

describe("getEcommerceStyleProfile", () => {
  it("已知平台返回对应的风格族", () => {
    expect(getEcommerceStyleProfile("amazon").id).toBe("white-studio");
    expect(getEcommerceStyleProfile("xiaohongshu").id).toBe("lifestyle-social");
    expect(getEcommerceStyleProfile("etsy").id).toBe("handcraft-warm");
  });

  it("未知平台 / 空值回落到兜底风格而不是抛错", () => {
    expect(getEcommerceStyleProfile("not-a-real-platform").id).toBe(
      FALLBACK_ECOMMERCE_STYLE_ID
    );
    expect(getEcommerceStyleProfile(null).id).toBe(FALLBACK_ECOMMERCE_STYLE_ID);
    expect(getEcommerceStyleProfile(undefined).id).toBe(FALLBACK_ECOMMERCE_STYLE_ID);
    expect(getEcommerceStyleProfile("").id).toBe(FALLBACK_ECOMMERCE_STYLE_ID);
  });

  it("每个风格族都带有可直接插入提示词的关键词", () => {
    for (const profile of ECOMMERCE_STYLE_PROFILES) {
      expect(profile.keywords.length).toBeGreaterThan(0);
      expect(profile.prompt.length).toBeGreaterThan(20);
      expect(profile.tone.trim()).not.toBe("");
      // 关键词要是用户能直接用的半句话，不是「高级感」这种空标签
      for (const keyword of profile.keywords) {
        expect(keyword.trim().length).toBeGreaterThan(2);
      }
    }
  });
});

describe("buildEcommercePromptRules —— 风格是否真的进了提示词", () => {
  function specOf(platformId: string): EcommercePlatformSpec {
    return {
      id: platformId,
      name: `平台-${platformId}`,
      width: 800,
      height: 800,
      ratio: "1:1",
      bg: ECOMMERCE_PLATFORM_BG_RULES[platformId] ?? "any",
    };
  }

  it("没选平台时一条规则都不加（保持原行为）", () => {
    expect(buildEcommercePromptRules(null)).toEqual([]);
    expect(buildEcommercePromptRules(undefined)).toEqual([]);
  });

  it("把选中平台的风格指令原文写进了规则里", () => {
    const rules = buildEcommercePromptRules(specOf("xiaohongshu"));
    const profile = getEcommerceStyleProfile("xiaohongshu");

    // 直接断言风格 prompt 的原文出现在返回值中——这是「透传 ≠ 被消费」的守卫。
    // 只要哪天风格行被构造却没 push 进数组，这条立刻红。
    expect(rules.join("\n")).toContain(profile.prompt);
    expect(rules.join("\n")).toContain(profile.label);
  });

  it("风格指令排在白底硬规则之后", () => {
    const rules = buildEcommercePromptRules(specOf("amazon"));
    const profile = getEcommerceStyleProfile("amazon");

    const whiteRuleIndex = rules.findIndex(line => line.includes("纯白背景（#FFFFFF）"));
    const styleRuleIndex = rules.findIndex(line => line.includes(profile.prompt));

    expect(whiteRuleIndex).toBeGreaterThanOrEqual(0);
    expect(styleRuleIndex).toBeGreaterThanOrEqual(0);
    // 靠后的指令修正作用更强；风格是建议、白底是审核硬线，顺序反了硬线会被盖掉
    expect(styleRuleIndex).toBeGreaterThan(whiteRuleIndex);
  });

  it("非白底平台给的是自由背景规则，不会被强按成纯白底", () => {
    const rules = buildEcommercePromptRules(specOf("etsy"));
    expect(rules.join("\n")).not.toContain("纯白背景（#FFFFFF）");
    expect(rules.join("\n")).toContain("背景可自由设计");
  });

  it("规格行带上了平台名与主图尺寸", () => {
    const rules = buildEcommercePromptRules({
      id: "amazon",
      name: "Amazon",
      width: 2000,
      height: 2000,
      ratio: "1:1",
      bg: "white",
    });
    expect(rules[0]).toContain("Amazon");
    expect(rules[0]).toContain("2000×2000");
    expect(rules[0]).toContain("1:1");
  });

  it("每个平台都能产出三条非空规则，没有平台会拿到空风格", () => {
    for (const platformId of ECOMMERCE_PLATFORM_IDS) {
      const rules = buildEcommercePromptRules(specOf(platformId));
      expect(rules).toHaveLength(3);
      for (const line of rules) {
        expect(line.trim()).not.toBe("");
      }
      // 早期实现用过 `${style?.label ?? ""}` 的可选链写法，
      // 一旦 style 为空会静默生成「XX 的调性——」这种半句话。
      expect(rules[2]).not.toContain("的调性——");
    }
  });
});

describe("findWhiteBackgroundConflicts", () => {
  it("识别出与纯白底冲突的场景词", () => {
    expect(findWhiteBackgroundConflicts("放在木质桌面上，旁边有绿植")).toEqual(
      expect.arrayContaining(["桌面", "木质", "绿植"])
    );
  });

  it("干净的白底描述不报冲突", () => {
    expect(findWhiteBackgroundConflicts("纯白底，柔和布光，产品居中")).toEqual([]);
  });

  it("空输入安全返回空数组", () => {
    expect(findWhiteBackgroundConflicts("")).toEqual([]);
    expect(findWhiteBackgroundConflicts("   ")).toEqual([]);
  });

  it("只做提示不做改写——返回的是命中词，不是被改过的提示词", () => {
    const prompt = "放在大理石台面上";
    const hits = findWhiteBackgroundConflicts(prompt);
    expect(hits.length).toBeGreaterThan(0);
    // 命中词必须都是原文里真实出现过的子串，否则就是在凭空造词误导用户
    for (const hit of hits) {
      expect(prompt).toContain(hit);
    }
  });
});
