/**
 * 技能商店卡片上的短描述（只用于卡片展示）。
 *
 * 为什么不直接改 skill-store.ts 里的 summary：
 * summary 还会被拼进 AI 提示词（buildSkillPromptContext 的「能力说明」）和画布技能面板，
 * 缩短它会悄悄改变出图效果。卡片要求所有卡片尺寸一致，描述固定最多 3 行，
 * 所以单独维护一份 ≤ 约 34 字的短文案，卡片优先用这里，缺失时回落 summary（并被截断到 3 行）。
 */
export const skillCardSummaries: Record<string, string> = {
  "brand-system-kit": "把品牌描述转成完整品牌板：色板、字体气质、图形语言和应用样张。",
  "logo-identity-lab": "围绕品牌关键词探索多方向 Logo：符号、字标、徽章与推荐方案。",
  "landing-page-visual": "生成可落地的网页首屏、产品页或多区块落地页视觉稿。",
  "commerce-poster-social": "按产品、活动和渠道生成高冲击海报、主图与社媒投放素材。",
  "cross-border-commerce-agent": "按国家、平台和品类生成商品图，出图前检查文化与 IP 风险。",
  "product-photography": "生成商品摄影、白底主图、生活场景和卖点视觉，产品清晰可辨。",
  "video-storyboard": "把广告或卖点拆成连续分镜卡，含镜头节奏、字幕位与封面方向。",
  "image-local-edit": "对已有图片去背景、擦除、局部重绘或扩图，其余区域保持不变。",
  "visual-reference-audit": "分析参考图与竞品视觉，提炼风格原则，生成更干净的方向稿。",
  "art-poster-design": "围绕单一概念做艺术海报：一个想法、一种构图、三层字级与留白。",
  "knowledge-comic": "把一个概念画成 4–8 格短漫画：场景提问、展示机制、给出结论。",
  "isometric-line-art": "等距投影细线插画：单笔线条、圆角形体、网格对齐，适合技术概念。",
  "xhs-carousel-images": "把一条内容拆成封面加内页的小红书轮播，版式统一、封面可读。",
  "infographic-designer": "把数据、流程或概念做成单张信息图，层级清楚、数字带单位。",
  "ui-visual-mockup": "生成去 AI 味的界面视觉稿：真实内容密度、统一设计系统。",
  "article-illustrator": "为文章配图，只画最难用文字说清的那一处，全篇风格统一。",
  "cover-image-lab": "生成缩略图也可读的封面：单一焦点，预留标题安全区。",
  "slide-deck-visual": "生成成套幻灯片视觉：统一版心，一页一观点，标题写成结论。",
  "diagram-flowchart": "把流程或架构画成清晰图示：形状表意、连线正交、网格对齐。",
  "photo-organic-knit": "把照片重塑成手工毛线针织海报，暖象牙色留白。需上传照片。",
  "photo-travel-sketch": "把旅行照片转成针管笔现场速写，干马克笔点色。需上传照片。",
  "surreal-pop-collage": "主体转黑白，背景换平涂色块，加一个超现实巨物。需上传照片。",
  "photo-stamp-archive": "左侧保留原照片，右侧盖做旧印章配档案标题。需上传照片。",
  "washi-tape-collage": "用半透明和纸胶带拼出主体，叠压透光、大量留白。需上传照片。",
  "pulp-print-poster": "90 年代通俗电影海报风：高饱和底色、硬边色块、金色粗标题。",
  "halftone-dot-poster": "主体由细密网点构成，单色或双色油墨印在暖色纸上。",
  "minimal-zine-poster": "诗意纸质独立杂志海报：大面积留白、小拼贴焦点、一个点缀色。",
  "xiaohei-object-scenes": "黑色小人与真实物件互动，配简短中文标注，纯白底留白。",
  "ip-mascot-logo": "用几个大块基础形状搭出可爱 IP 角色 Logo，小尺寸仍可辨认。",
};

/** 卡片标题：单行放不下的名字在此给短名（仅展示，不影响技能本身）。 */
export const skillCardNames: Record<string, string> = {
  "cross-border-commerce-agent": "跨境电商视觉",
};
