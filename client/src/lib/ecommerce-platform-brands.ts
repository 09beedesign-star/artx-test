/**
 * 电商平台品牌视觉档案 —— 标签 icon 的唯一事实源。
 *
 * 【为什么是自绘色块字标，不是真实品牌 logo】
 * 26 个平台的官方 logo 分属 26 个权利人，打包进产品有商标使用风险；
 * 装 simple-icons 之类的图标包也覆盖不全（淘宝 / 得物 / 有赞 / 唯品会
 * 这些国内平台在通用图标库里基本没有）。缺图标的平台会退化成空白方块，
 * 一排四个标签里混着几个空块比全部用字标更难看。
 * ✅ 所以统一用「品牌主色 + 品牌标记字」，视觉一致、零依赖、零版权风险。
 *
 * 【⚠️ 前景色必须算，不能写死白色】
 * 这是本模块存在的核心原因。BestBuy 的品牌黄 #FFE000、Shopee 的橙
 * 在浅色背景上配白字，对比度只有 1.3:1 左右 —— 字还在，人眼看不见。
 * 这种问题不报错、不影响测试，只是「有几个标签的字糊了」。
 * ✅ 用 WCAG 相对亮度公式判定，亮底自动换深色字。
 *
 * ⚠️ 这里的 key 必须与 SmartCommerceProductDialog.tsx 的平台 id 完全一致。
 *    对不上会静默回落到兜底灰块 —— 界面不报错，只是那个平台没了品牌色。
 *    ecommerce-platform-brands.test.ts 会逐个核对两边的 id 集合。
 */

export type EcommercePlatformBrand = {
  /** 品牌主色，用作 icon 底色 */
  color: string;
  /**
   * icon 上的标记字。
   *
   * ⚠️ 中文最多 1 字、英文最多 2 字母。
   *    给 14px 见方的色块塞 3 个字符会挤成一团糊，
   *    而且长度不一致时一排四个标签的视觉重心会歪。
   */
  mark: string;
};

/**
 * ⚠️ 色值取自各平台品牌主色的公开视觉识别，仅用于区分标签，
 *    不代表官方授权用色。调整时注意同步检查对比度（见下方 test）。
 */
export const ECOMMERCE_PLATFORM_BRANDS: Readonly<
  Record<string, EcommercePlatformBrand>
> = {
  // —— 热门 ——
  douyin: { color: "#161823", mark: "抖" },
  xiaohongshu: { color: "#FF2442", mark: "红" },
  tiktok: { color: "#010101", mark: "TT" },
  "taobao-tmall": { color: "#FF4400", mark: "淘" },
  jd: { color: "#E1251B", mark: "京" },
  pinduoduo: { color: "#E22E1F", mark: "拼" },
  temu: { color: "#FB7701", mark: "TM" },
  shopee: { color: "#EE4D2D", mark: "SP" },
  amazon: { color: "#FF9900", mark: "AZ" },

  // —— 主流 ——
  kuaishou: { color: "#FF3C3C", mark: "快" },
  "wechat-channel": { color: "#07C160", mark: "视" },
  vip: { color: "#F10180", mark: "唯" },
  dewu: { color: "#00C2B5", mark: "得" },
  youzan: { color: "#F03C3C", mark: "赞" },
  ebay: { color: "#0064D2", mark: "eB" },
  aliexpress: { color: "#E62E04", mark: "AE" },
  shein: { color: "#222222", mark: "SH" },
  walmart: { color: "#0071CE", mark: "WM" },
  target: { color: "#CC0000", mark: "TG" },
  bestbuy: { color: "#FFE000", mark: "BB" },
  etsy: { color: "#F56400", mark: "ET" },
  lazada: { color: "#0F156D", mark: "LZ" },
  ozon: { color: "#005BFF", mark: "OZ" },
  allegro: { color: "#FF5A00", mark: "AL" },
  flipkart: { color: "#2874F0", mark: "FK" },
  mercadolibre: { color: "#FFE600", mark: "ML" },
};

/**
 * 兜底品牌视觉。
 *
 * ⚠️ 必须是中性灰而不是某个像样的颜色。
 *    兜底如果长得「挺正常」，新增平台忘配品牌时没人看得出来，
 *    那个平台会一直顶着别人的视觉语言上线。
 */
export const FALLBACK_ECOMMERCE_BRAND: EcommercePlatformBrand = {
  color: "#6B7280",
  mark: "··",
};

export function getEcommercePlatformBrand(
  platformId: string | null | undefined
): EcommercePlatformBrand {
  if (!platformId) return FALLBACK_ECOMMERCE_BRAND;
  return ECOMMERCE_PLATFORM_BRANDS[platformId] || FALLBACK_ECOMMERCE_BRAND;
}

/**
 * WCAG 相对亮度。
 *
 * ⚠️ 不能用 `(r+g+b)/3` 这种平均值糊弄 —— 人眼对绿最敏感、对蓝最不敏感，
 *    平均值会把 #FFE000（亮黄）和 #0F156D（深蓝）判成差不多的亮度，
 *    于是亮黄底配上白字，字就消失了。
 *
 * 公式：https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getRelativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map(ch => ch + ch)
          .join("")
      : value;
  const channels = [0, 2, 4].map(offset => {
    const raw = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** 两个颜色的 WCAG 对比度（1 ~ 21）。 */
export function getContrastRatio(foreground: string, background: string): number {
  const a = getRelativeLuminance(foreground);
  const b = getRelativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * 在品牌底色上挑一个看得清的前景色。
 *
 * ⚠️ 返回深色时用的是 #101010 而不是纯黑：
 *    纯黑配亮黄在小尺寸下边缘会有轻微的视觉振动，近黑更稳。
 */
export function getBrandForegroundColor(background: string): string {
  return getContrastRatio("#FFFFFF", background) >= 3 ? "#FFFFFF" : "#101010";
}
