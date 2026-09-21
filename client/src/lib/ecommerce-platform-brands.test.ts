import { describe, expect, it } from "vitest";

import { ECOMMERCE_PLATFORM_IDS } from "@/components/canvas/SmartCommerceProductDialog";
import {
  ECOMMERCE_PLATFORM_BRANDS,
  FALLBACK_ECOMMERCE_BRAND,
  getBrandForegroundColor,
  getContrastRatio,
  getEcommercePlatformBrand,
  getRelativeLuminance,
} from "./ecommerce-platform-brands";

/**
 * 品牌视觉档案的守卫测试。
 *
 * 【这组测试真正要挡的事】
 * 标签 icon 的失效方式全是**静默**的：
 *   · 平台 id 对不上 → 回落灰块，界面照常渲染，不报错
 *   · 亮底配白字      → 字还在 DOM 里，对比度 1.3:1，人眼看不见，不报错
 *   · mark 写 3 个字  → 14px 色块里挤成一坨，不报错
 * 三种都不会让任何现有测试变红，只能靠这里逐条核对。
 *
 * ⚠️ 这里断言的是**导出的数据和纯函数**，不是源码文本。
 *    源码断言（toContain）在这个场景下没用 —— 色值写错、对比度不够
 *    这类问题，源码里那行字符串长得完全正常。
 */
describe("ecommerce platform brands", () => {
  it("每个平台都有品牌视觉，没有平台落到兜底灰块", () => {
    const missing = ECOMMERCE_PLATFORM_IDS.filter(
      id => !(id in ECOMMERCE_PLATFORM_BRANDS)
    );

    expect(
      missing,
      `这些平台没配品牌视觉，会静默回落成灰块：${missing.join(", ")}`
    ).toEqual([]);

    // 自我保护：平台清单本身要是空了，上面的 filter 恒为空数组，断言就成摆设。
    expect(ECOMMERCE_PLATFORM_IDS.length).toBeGreaterThan(20);
  });

  it("没有多余的品牌条目（平台删了但品牌没删）", () => {
    const known = new Set(ECOMMERCE_PLATFORM_IDS);
    const dangling = Object.keys(ECOMMERCE_PLATFORM_BRANDS).filter(
      id => !known.has(id)
    );

    expect(
      dangling,
      `这些品牌条目对应的平台已不存在：${dangling.join(", ")}`
    ).toEqual([]);
  });

  it("每个品牌色都是合法的 6 位 hex", () => {
    for (const [id, brand] of Object.entries(ECOMMERCE_PLATFORM_BRANDS)) {
      expect(brand.color, `${id} 的品牌色格式非法`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("每个品牌底色配上自动前景色后，对比度都达到 3:1", () => {
    /*
      ⚠️ 阈值为什么是 3.0 而不是正文的 4.5：
         mark 是 aria-hidden 的**装饰性**标识，标签右侧已经有完整平台名，
         它不承载任何独占信息，适用的是 WCAG 1.4.11（非文本内容 3:1），
         不是 1.4.3（正文 4.5:1）。

         更关键的是：小红书 #FF2442、淘宝 #FF4400 这类红底白字
         本来就是这些平台的官方视觉（实测 3.4~3.8:1）。
         硬套 4.5 会把一半标签翻成「红底黑字」，
         为了一个指标数字把品牌辨识度全毁掉，得不偿失。

      ✅ 这条测试真正要挡的是 BestBuy #FFE000 / MercadoLibre #FFE600
         那种亮黄配白 = 1.3:1 的「字消失」级事故。
    */
    const failures: string[] = [];

    for (const [id, brand] of Object.entries(ECOMMERCE_PLATFORM_BRANDS)) {
      const ratio = getContrastRatio(
        getBrandForegroundColor(brand.color),
        brand.color
      );
      if (ratio < 3) failures.push(`${id}(${brand.color}) = ${ratio.toFixed(2)}`);
    }

    expect(failures, `这些品牌 icon 的字看不清：${failures.join(", ")}`).toEqual([]);

    // 自我保护：品牌表空了的话上面恒绿。
    expect(Object.keys(ECOMMERCE_PLATFORM_BRANDS).length).toBeGreaterThan(20);
  });

  it("亮底自动切深色字、暗底自动切白字", () => {
    // BestBuy 的亮黄 —— 本模块存在的直接原因。
    expect(getBrandForegroundColor("#FFE000")).toBe("#101010");
    expect(getBrandForegroundColor("#FFE600")).toBe("#101010");
    // 抖音近黑 / TikTok 纯黑。
    expect(getBrandForegroundColor("#161823")).toBe("#FFFFFF");
    expect(getBrandForegroundColor("#010101")).toBe("#FFFFFF");
  });

  it("相对亮度用的是人眼加权，不是 RGB 平均值", () => {
    /*
      纯绿和纯蓝的 RGB 平均值相同（85），但人眼看到的亮度差一个数量级。
      这条断言就是用来挡「图省事改成 (r+g+b)/3」的。
    */
    const green = getRelativeLuminance("#00FF00");
    const blue = getRelativeLuminance("#0000FF");
    expect(green).toBeGreaterThan(blue * 5);

    expect(getRelativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(getRelativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("mark 长度受控：中文 1 字、英文 2 字母", () => {
    for (const [id, brand] of Object.entries(ECOMMERCE_PLATFORM_BRANDS)) {
      expect(brand.mark.length, `${id} 的 mark 为空`).toBeGreaterThan(0);

      const isCjk = /[\u4e00-\u9fa5]/.test(brand.mark);
      if (isCjk) {
        expect(brand.mark.length, `${id} 的中文 mark 超过 1 字`).toBe(1);
      } else {
        expect(brand.mark.length, `${id} 的英文 mark 超过 2 字母`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("未知平台 / 空值回落到中性灰兜底", () => {
    expect(getEcommercePlatformBrand("not-a-platform")).toBe(FALLBACK_ECOMMERCE_BRAND);
    expect(getEcommercePlatformBrand(null)).toBe(FALLBACK_ECOMMERCE_BRAND);
    expect(getEcommercePlatformBrand(undefined)).toBe(FALLBACK_ECOMMERCE_BRAND);
    expect(getEcommercePlatformBrand("")).toBe(FALLBACK_ECOMMERCE_BRAND);

    /*
      ⚠️ 兜底色必须是低饱和中性灰。
         兜底要是长得「挺正常」，漏配的平台会顶着别人的视觉语言上线且没人发现。
      判据：R/G/B 三通道极差足够小 = 接近灰。
    */
    const hex = FALLBACK_ECOMMERCE_BRAND.color.replace("#", "");
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24);
  });

  it("已知平台返回自己的品牌，不是兜底", () => {
    const douyin = getEcommercePlatformBrand("douyin");
    expect(douyin).not.toBe(FALLBACK_ECOMMERCE_BRAND);
    expect(douyin.mark).toBe("抖");

    const tiktok = getEcommercePlatformBrand("tiktok");
    expect(tiktok).not.toBe(FALLBACK_ECOMMERCE_BRAND);
    expect(tiktok.mark).toBe("TT");
  });

  it("品牌色不全是同一个颜色（标签之间要能区分）", () => {
    const colors = new Set(
      Object.values(ECOMMERCE_PLATFORM_BRANDS).map(b => b.color.toUpperCase())
    );
    // 不要求全部互异（红色系平台天然接近），但至少要有足够的色彩分散度。
    expect(colors.size).toBeGreaterThan(ECOMMERCE_PLATFORM_IDS.length * 0.7);
  });
});
