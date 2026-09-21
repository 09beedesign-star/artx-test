import type { ReactNode } from "react";

export type SocialMediaSizePreset = {
  id: string;
  platform: string;
  title: string;
  width: number;
  height: number;
  tone: string;
};

export type SocialMediaSizeCategory =
  | "电商类"
  | "社媒平台类"
  | "内容/视频平台类";

export const SOCIAL_MEDIA_SIZE_CATEGORIES: SocialMediaSizeCategory[] = [
  "电商类",
  "社媒平台类",
  "内容/视频平台类",
];

export type SocialMediaExportPayload = {
  presets: SocialMediaSizePreset[];
  customSize?: { width: number; height: number };
  crop: { x: number; y: number; width: number; height: number };
  transform?: { offsetX: number; offsetY: number; scale: number; rotation: number };
  transforms?: Record<
    string,
    { offsetX: number; offsetY: number; scale: number; rotation: number }
  >;
  format?: "png" | "jpg" | "webp";
};

export const SOCIAL_MEDIA_SIZE_PRESETS: SocialMediaSizePreset[] = [
  {
    id: "tiktok-shop-product-square",
    platform: "TikTok Shop",
    title: "跨境电商商品主图",
    width: 1080,
    height: 1080,
    tone: "oklch(0.68 0.20 185)",
  },
  {
    id: "tiktok-shop-product-portrait",
    platform: "TikTok Shop",
    title: "跨境电商竖版商品图",
    width: 1080,
    height: 1350,
    tone: "oklch(0.64 0.19 190)",
  },
  {
    id: "facebook-shopping-product-square",
    platform: "Facebook Shopping",
    title: "跨境电商商品图",
    width: 1200,
    height: 1200,
    tone: "oklch(0.60 0.18 250)",
  },
  {
    id: "facebook-shopping-collection",
    platform: "Facebook Shopping",
    title: "跨境电商合集封面",
    width: 1200,
    height: 628,
    tone: "oklch(0.58 0.17 255)",
  },
  {
    id: "red-note-vertical",
    platform: "小红书",
    title: "笔记封面竖版",
    width: 1080,
    height: 1440,
    tone: "oklch(0.62 0.24 25)",
  },
  {
    id: "red-note-landscape",
    platform: "小红书",
    title: "笔记封面横版",
    width: 1080,
    height: 810,
    tone: "oklch(0.64 0.22 32)",
  },
  {
    id: "red-note-square",
    platform: "小红书",
    title: "笔记封面方版",
    width: 1080,
    height: 1080,
    tone: "oklch(0.66 0.20 20)",
  },
  {
    id: "douyin-cover-vertical",
    platform: "抖音",
    title: "视频封面竖版",
    width: 1080,
    height: 1440,
    tone: "oklch(0.63 0.20 280)",
  },
  {
    id: "douyin-cover-full",
    platform: "抖音",
    title: "全屏封面",
    width: 1080,
    height: 1920,
    tone: "oklch(0.59 0.20 286)",
  },
  {
    id: "douyin-cover-landscape",
    platform: "抖音",
    title: "视频封面横版",
    width: 1080,
    height: 608,
    tone: "oklch(0.56 0.18 292)",
  },
  {
    id: "wechat-channel-vertical",
    platform: "视频号",
    title: "竖版视频封面",
    width: 1080,
    height: 1260,
    tone: "oklch(0.68 0.16 155)",
  },
  {
    id: "wechat-channel-landscape",
    platform: "视频号",
    title: "横版视频封面",
    width: 1080,
    height: 608,
    tone: "oklch(0.64 0.15 165)",
  },
  {
    id: "kuaishou-cover-vertical",
    platform: "快手",
    title: "视频封面竖版",
    width: 1080,
    height: 1920,
    tone: "oklch(0.70 0.20 48)",
  },
  {
    id: "bilibili-cover-landscape",
    platform: "B站",
    title: "视频封面横版",
    width: 1920,
    height: 1080,
    tone: "oklch(0.70 0.15 225)",
  },
  {
    id: "bilibili-cover-vertical",
    platform: "B站",
    title: "视频封面竖版",
    width: 1080,
    height: 1920,
    tone: "oklch(0.66 0.16 235)",
  },
  {
    id: "weibo-feed",
    platform: "微博",
    title: "正文图片",
    width: 1080,
    height: 1080,
    tone: "oklch(0.70 0.19 70)",
  },
  {
    id: "weibo-profile-cover",
    platform: "微博",
    title: "主页封面图",
    width: 980,
    height: 300,
    tone: "oklch(0.68 0.17 80)",
  },
  {
    id: "wechat-official-hero",
    platform: "公众号",
    title: "头条封面",
    width: 900,
    height: 383,
    tone: "oklch(0.66 0.14 150)",
  },
  {
    id: "wechat-official-sub",
    platform: "公众号",
    title: "次条封面",
    width: 200,
    height: 200,
    tone: "oklch(0.70 0.12 160)",
  },
  {
    id: "facebook-square",
    platform: "Facebook",
    title: "帖子图片正方形",
    width: 1200,
    height: 1200,
    tone: "oklch(0.60 0.18 250)",
  },
  {
    id: "facebook-landscape",
    platform: "Facebook",
    title: "帖子图片横版",
    width: 1200,
    height: 630,
    tone: "oklch(0.58 0.17 255)",
  },
  {
    id: "facebook-story",
    platform: "Facebook",
    title: "Story",
    width: 1080,
    height: 1920,
    tone: "oklch(0.56 0.18 248)",
  },
  {
    id: "x-feed-landscape",
    platform: "X",
    title: "信息流图片横版",
    width: 1600,
    height: 900,
    tone: "oklch(0.46 0.03 255)",
  },
  {
    id: "x-link-card",
    platform: "X",
    title: "分享链接卡片",
    width: 1200,
    height: 628,
    tone: "oklch(0.52 0.04 250)",
  },
  {
    id: "x-header",
    platform: "X",
    title: "头图横幅",
    width: 1500,
    height: 500,
    tone: "oklch(0.58 0.04 245)",
  },
  {
    id: "instagram-square",
    platform: "Instagram",
    title: "正方形帖子",
    width: 1080,
    height: 1080,
    tone: "oklch(0.66 0.22 330)",
  },
  {
    id: "instagram-portrait",
    platform: "Instagram",
    title: "竖版帖子推荐",
    width: 1080,
    height: 1350,
    tone: "oklch(0.64 0.23 320)",
  },
  {
    id: "instagram-landscape",
    platform: "Instagram",
    title: "横版帖子",
    width: 1080,
    height: 566,
    tone: "oklch(0.68 0.20 340)",
  },
  {
    id: "instagram-story-reels",
    platform: "Instagram",
    title: "Story / Reels",
    width: 1080,
    height: 1920,
    tone: "oklch(0.61 0.24 300)",
  },
  {
    id: "tiktok-vertical",
    platform: "TikTok",
    title: "视频竖版",
    width: 1080,
    height: 1920,
    tone: "oklch(0.70 0.20 185)",
  },
  {
    id: "tiktok-square",
    platform: "TikTok",
    title: "正方形图片",
    width: 1080,
    height: 1080,
    tone: "oklch(0.66 0.18 190)",
  },
  {
    id: "tiktok-landscape",
    platform: "TikTok",
    title: "横版视频",
    width: 1920,
    height: 1080,
    tone: "oklch(0.62 0.17 200)",
  },
  {
    id: "linkedin-landscape",
    platform: "LinkedIn",
    title: "分享帖子横版",
    width: 1200,
    height: 627,
    tone: "oklch(0.55 0.16 245)",
  },
  {
    id: "linkedin-square",
    platform: "LinkedIn",
    title: "分享帖子正方形",
    width: 1080,
    height: 1080,
    tone: "oklch(0.58 0.15 240)",
  },
  {
    id: "linkedin-portrait",
    platform: "LinkedIn",
    title: "分享帖子竖版",
    width: 1080,
    height: 1350,
    tone: "oklch(0.60 0.14 235)",
  },
  {
    id: "youtube-thumbnail",
    platform: "YouTube",
    title: "视频缩略图",
    width: 1280,
    height: 720,
    tone: "oklch(0.58 0.22 29)",
  },
  {
    id: "youtube-banner",
    platform: "YouTube",
    title: "频道横幅",
    width: 2560,
    height: 1440,
    tone: "oklch(0.62 0.20 35)",
  },
  {
    id: "pinterest-standard",
    platform: "Pinterest",
    title: "标准 Pin 图",
    width: 1000,
    height: 1500,
    tone: "oklch(0.62 0.23 22)",
  },
  {
    id: "pinterest-square",
    platform: "Pinterest",
    title: "正方形 Pin 图",
    width: 1000,
    height: 1000,
    tone: "oklch(0.66 0.20 24)",
  },
  {
    id: "pinterest-video-pin",
    platform: "Pinterest",
    title: "纵向 Pin 图",
    width: 1080,
    height: 1920,
    tone: "oklch(0.59 0.21 20)",
  },
  {
    id: "amazon-main-min",
    platform: "亚马逊",
    title: "主图最低要求",
    width: 1000,
    height: 1000,
    tone: "oklch(0.73 0.16 78)",
  },
  {
    id: "amazon-main-recommended",
    platform: "亚马逊",
    title: "主图推荐品质",
    width: 2000,
    height: 2000,
    tone: "oklch(0.76 0.14 82)",
  },
  {
    id: "amazon-main-premium",
    platform: "亚马逊",
    title: "主图高品质",
    width: 2560,
    height: 2560,
    tone: "oklch(0.79 0.12 86)",
  },
  {
    id: "shopee-main-800",
    platform: "虾皮",
    title: "商品主图",
    width: 800,
    height: 800,
    tone: "oklch(0.68 0.21 43)",
  },
  {
    id: "shopee-main-1024",
    platform: "虾皮",
    title: "商品主图高清",
    width: 1024,
    height: 1024,
    tone: "oklch(0.72 0.19 46)",
  },
  {
    id: "taobao-main",
    platform: "淘宝 / 天猫",
    title: "主图",
    width: 800,
    height: 800,
    tone: "oklch(0.70 0.18 55)",
  },
  {
    id: "taobao-detail",
    platform: "淘宝 / 天猫",
    title: "详情页图片",
    width: 790,
    height: 1546,
    tone: "oklch(0.66 0.17 62)",
  },
  {
    id: "jd-main",
    platform: "京东",
    title: "主图",
    width: 800,
    height: 800,
    tone: "oklch(0.62 0.22 35)",
  },
  {
    id: "jd-detail",
    platform: "京东",
    title: "详情页图片",
    width: 750,
    height: 1546,
    tone: "oklch(0.65 0.20 38)",
  },
  {
    id: "pinduoduo-main-wide",
    platform: "拼多多",
    title: "主图横版",
    width: 750,
    height: 352,
    tone: "oklch(0.68 0.22 31)",
  },
  {
    id: "pinduoduo-main-square",
    platform: "拼多多",
    title: "主图方版",
    width: 800,
    height: 800,
    tone: "oklch(0.72 0.20 28)",
  },
];

export function getSocialMediaPresetCategory(
  preset: SocialMediaSizePreset
): SocialMediaSizeCategory {
  if (
    [
      "TikTok Shop",
      "Facebook Shopping",
      "亚马逊",
      "虾皮",
      "淘宝 / 天猫",
      "京东",
      "拼多多",
    ].includes(preset.platform)
  ) {
    return "电商类";
  }
  if (
    ["YouTube", "B站", "视频号", "抖音", "快手", "TikTok"].includes(
      preset.platform
    )
  ) {
    return "内容/视频平台类";
  }
  return "社媒平台类";
}

export function getSocialMediaPresetSubcategory(
  preset: SocialMediaSizePreset
) {
  if (getSocialMediaPresetCategory(preset) !== "电商类") return preset.platform;
  if (["TikTok Shop", "Facebook Shopping", "亚马逊", "虾皮"].includes(preset.platform))
    return "跨境电商";
  return "国内电商";
}

export function groupSocialMediaSizePresets(
  presets: SocialMediaSizePreset[] = SOCIAL_MEDIA_SIZE_PRESETS
) {
  return SOCIAL_MEDIA_SIZE_CATEGORIES.map(category => ({
    category,
    groups: Array.from(
      presets
        .filter(preset => getSocialMediaPresetCategory(preset) === category)
        .reduce((map, preset) => {
          const groupName = getSocialMediaPresetSubcategory(preset);
          const group = map.get(groupName) || [];
          group.push(preset);
          map.set(groupName, group);
          return map;
        }, new Map<string, SocialMediaSizePreset[]>())
        .entries()
    ).map(([name, items]) => ({ name, items })),
  })).filter(category => category.groups.length > 0);
}

export function SocialPlatformIcon({
  platform,
  size = 22,
}: {
  platform: string;
  size?: number;
}) {
  const brandColors: Record<string, string> = {
    小红书: "#FF2442",
    抖音: "#000000",
    TikTok: "#000000",
    视频号: "#07C160",
    公众号: "#07C160",
    快手: "#FF4906",
    B站: "#00A1D6",
    微博: "#E6162D",
    Facebook: "#1877F2",
    X: "#000000",
    Instagram: "#E4405F",
    LinkedIn: "#0A66C2",
    YouTube: "#FF0000",
    Pinterest: "#E60023",
    亚马逊: "#FF9900",
    Shopee: "#EE4D2D",
    虾皮: "#EE4D2D",
    Lazada: "#1A4CFF",
    淘宝: "#FF5000",
    "淘宝 / 天猫": "#FF5000",
    京东: "#E1251B",
    拼多多: "#E02E24",
  };
  const brandColor = brandColors[platform] || "#6D5DFB";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  };
  const icon = "rgba(255,255,255,0.96)";
  const strokeProps = {
    stroke: icon,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const wrap = (children: ReactNode) => (
    <svg {...common}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={brandColor} />
      {children}
    </svg>
  );

  if (platform === "小红书")
    return wrap(
      <>
        <rect
          x="6"
          y="5.8"
          width="12"
          height="12.4"
          rx="3.2"
          {...strokeProps}
        />
        <path d="M8.4 10h7.2M8.4 13h7.2M9.5 16h5" {...strokeProps} />
      </>
    );
  if (platform === "抖音" || platform === "TikTok")
    return wrap(
      <>
        <path
          d="M14 5.2v8.2a3.9 3.9 0 1 1-3.1-3.8v2.6a1.55 1.55 0 1 0 1.1 1.5V5.2h2z"
          fill={icon}
        />
        <path
          d="M14 6.2c1 1.7 2.4 2.7 4.1 2.9v2.1c-1.7-.1-3-.7-4.1-1.6V6.2z"
          fill={icon}
        />
      </>
    );
  if (platform === "视频号" || platform === "公众号")
    return wrap(
      <>
        <path
          d="M5.8 9c0-2 1.9-3.6 4.2-3.6 1.5 0 2.8.6 3.5 1.6.5-.2 1-.3 1.6-.3 2.2 0 4 1.5 4 3.5s-1.8 3.5-4 3.5h-.5l-1.9 2 .4-2.4c-.5-.2-.9-.5-1.2-.8-.6.2-1.2.3-1.9.3h-.6l-2.2 2.1.5-2.6A3.8 3.8 0 0 1 5.8 9z"
          {...strokeProps}
        />
        <circle cx="9" cy="9" r=".7" fill={icon} />
        <circle cx="12.4" cy="9" r=".7" fill={icon} />
      </>
    );
  if (platform === "快手")
    return wrap(
      <>
        <rect
          x="6"
          y="8.2"
          width="10.7"
          height="8.6"
          rx="2.7"
          {...strokeProps}
        />
        <circle cx="8.8" cy="6.6" r="1.6" {...strokeProps} />
        <circle cx="13" cy="6.6" r="1.6" {...strokeProps} />
        <path d="m16.8 11.2 2.5-1.5v4.6l-2.5-1.5v-1.6z" {...strokeProps} />
        <circle cx="9.5" cy="12.4" r=".8" fill={icon} />
        <circle cx="13.2" cy="12.4" r=".8" fill={icon} />
      </>
    );
  if (platform === "B站")
    return wrap(
      <>
        <rect
          x="4.8"
          y="7.8"
          width="14.4"
          height="10.2"
          rx="3"
          {...strokeProps}
        />
        <path d="m8.3 5.2 2.2 2.6M15.7 5.2l-2.2 2.6" {...strokeProps} />
        <circle cx="9.7" cy="13" r=".8" fill={icon} />
        <circle cx="14.3" cy="13" r=".8" fill={icon} />
      </>
    );
  if (platform === "微博")
    return wrap(
      <>
        <ellipse cx="11" cy="13" rx="6.3" ry="4.4" {...strokeProps} />
        <circle cx="9" cy="12.6" r=".8" fill={icon} />
        <circle cx="12.7" cy="12.6" r=".8" fill={icon} />
        <path
          d="M15.7 6.3c1.5.3 2.6 1.3 3 2.8M16.2 4c2.5.5 4.2 2.3 4.7 4.8"
          {...strokeProps}
        />
      </>
    );
  if (platform === "Facebook")
    return wrap(
      <path
        d="M14.2 8.4h2V5.3h-2.5c-2.6 0-4.1 1.6-4.1 4.1V12H7.5v3h2.1v5h3.5v-5h2.7l.4-3h-3.1V9.8c0-.9.4-1.4 1.1-1.4z"
        fill={icon}
      />
    );
  if (platform === "X")
    return wrap(
      <path
        d="M5.2 5.4h3.4l3.6 4.8 4.1-4.8h2.4l-5.3 6.2 5.6 7h-3.4l-3.9-5.2-4.4 5.2H4.8l5.7-6.6-5.3-6.6zm2.2 1.6 8.9 10h.8l-8.9-10h-.8z"
        fill={icon}
      />
    );
  if (platform === "Instagram")
    return wrap(
      <>
        <rect x="5.5" y="5.5" width="13" height="13" rx="4" {...strokeProps} />
        <circle cx="12" cy="12" r="3.1" {...strokeProps} />
        <circle cx="16" cy="8" r=".9" fill={icon} />
      </>
    );
  if (platform === "LinkedIn")
    return wrap(
      <>
        <rect x="6.2" y="10" width="2.4" height="7.4" fill={icon} />
        <circle cx="7.4" cy="7.3" r="1.35" fill={icon} />
        <path
          d="M11 10h2.2v1c.5-.7 1.2-1.2 2.2-1.2 1.7 0 2.7 1.2 2.7 3.4v4.2h-2.4v-3.8c0-1-.5-1.6-1.2-1.6s-1.2.5-1.2 1.6v3.8H11V10z"
          fill={icon}
        />
      </>
    );
  if (platform === "YouTube")
    return wrap(
      <>
        <rect
          x="4.2"
          y="7.4"
          width="15.6"
          height="9.2"
          rx="3"
          {...strokeProps}
        />
        <path d="m10.7 9.8 4.2 2.2-4.2 2.2V9.8z" fill={icon} />
      </>
    );
  if (platform === "Pinterest")
    return wrap(
      <path
        d="M10.9 15.2c-.4 1.7-.8 3-1.8 4.2-.2-1.5-.2-3 .2-4.6l1-4.1s-.3-.6-.3-1.4c0-1.3.8-2.3 1.8-2.3.8 0 1.2.6 1.2 1.4 0 .8-.5 2.1-.8 3.2-.2 1 .5 1.7 1.5 1.7 1.8 0 3-2.1 3-4.6 0-2-1.3-3.4-3.7-3.4-2.7 0-4.3 2-4.3 4.2 0 .8.2 1.4.6 1.8.2.2.2.3.1.6l-.2.8c-.1.3-.3.4-.6.3-1.2-.5-1.8-1.8-1.8-3.3 0-2.5 2.1-5.5 6.4-5.5 3.5 0 5.8 2.5 5.8 5.2 0 3.5-2 6.2-5 6.2-1 0-1.9-.5-2.3-1.1l-.8 2.7z"
        fill={icon}
        transform="scale(.78) translate(3.3 1.8)"
      />
    );
  if (platform === "亚马逊")
    return wrap(
      <>
        <path d="M5.8 8h12.4l-1 9.8H6.8L5.8 8z" {...strokeProps} />
        <path d="M9.2 8a2.8 2.8 0 0 1 5.6 0" {...strokeProps} />
        <path d="M8.6 14.2c2.1 1.5 4.9 1.5 6.9 0" {...strokeProps} />
      </>
    );
  if (platform === "Shopee" || platform === "虾皮")
    return wrap(
      <>
        <path d="M6.4 8.2h11.2l-.9 9.8H7.3l-.9-9.8z" {...strokeProps} />
        <path d="M9.3 8.2a2.7 2.7 0 0 1 5.4 0" {...strokeProps} />
        <path
          d="M10 15.2c.7.5 1.5.8 2.3.8 1 0 1.7-.5 1.7-1.1 0-.8-.7-1-1.8-1.4-1.1-.4-2-.9-2-2s.9-1.9 2.2-1.9c.8 0 1.5.2 2 .6"
          {...strokeProps}
        />
      </>
    );
  if (platform === "Lazada")
    return wrap(
      <>
        <path
          d="M12 6.1 18.3 9.7v6.7L12 20l-6.3-3.6V9.7L12 6.1z"
          {...strokeProps}
        />
        <path
          d="M8.7 10.7c1.1-1.1 2.2-1.1 3.3 0 1.1-1.1 2.2-1.1 3.3 0 1 1 .9 2.5-.1 3.5L12 17.1l-3.2-2.9c-1-1-.9-2.5-.1-3.5z"
          fill={icon}
        />
      </>
    );
  if (
    platform === "淘宝" ||
    platform === "淘宝 / 天猫" ||
    platform === "京东" ||
    platform === "拼多多"
  )
    return wrap(
      <>
        <rect x="5" y="7" width="14" height="11" rx="3" {...strokeProps} />
        <path
          d="M8.5 7a3.5 3.5 0 0 1 7 0M8.4 13h7.2M10 10.4h4M10 15.5h4"
          {...strokeProps}
        />
      </>
    );
  return wrap(
    <>
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" {...strokeProps} />
      <path
        d="M8 13.7 10.4 11l2.1 2.1 2.9-3.2 2.6 3.8V17H6v-3.3h2z"
        fill={icon}
      />
    </>
  );
}
