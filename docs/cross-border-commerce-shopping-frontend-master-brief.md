# 跨境电商 Shopping 前端总交接文档

更新时间：2026-07-12  
适用项目：ArtX  
项目路径：`/Users/ericbi/Documents/New project 2`  
目标任务：让另一个前端任务直接接手实现“按电商平台 + 国家/地区 + 商品品类 + 图片用途 + 爆款风格模板”生成可发布商品图的能力。

本文件合并自：

- `docs/cross-border-commerce-frontend-implementation-handoff.md`
- `docs/ecommerce-platform-product-image-playbook-2026.md`

## 0. 给新任务的直接指令

请在 ArtX 项目中继续实现“跨境电商爆款图生成”前端能力。

必须先读取并遵守：

1. `AGENTS.md`
2. `MEMORY.md`
3. 本文件：`docs/cross-border-commerce-shopping-frontend-master-brief.md`

核心目标：

把“按电商平台 + 国家/地区 + 商品品类 + 图片用途 + 爆款风格模板”生成商品图的能力做成前端界面。用户不需要写复杂 prompt，系统根据平台规格、国家地区审美、品类模板、爆款风格和风险规则组合生成上下文，再调用现有 AI 图片生成链路。

这一期必须包含 Shopee，不只是平台列表里出现，而是要能跑通：

`Shopee / Indonesia / 家居生活 / 大促强转化活动图`

不要发布测试环境，除非用户明确要求。

## 1. 产品目标

让用户在 ArtX 站点里完成这条路径：

平台 → 国家/地区 → 商品品类 → 图片用途 → 爆款图片风格 → 风险检查 → 高清生成 → 导出对应平台尺寸

用户价值：

- 快速生成更符合平台审美和尺寸要求的商品图。
- 降低尺寸、文化、宗教、政治、IP、功效宣称、虚假折扣等风险。
- 帮助卖家提升点击和转化的可能性，但产品文案不能承诺“一定提升”。

推荐对外表达：

> 基于平台规格、公开趋势和店铺数据，生成更符合该平台用户点击习惯的商品图，从而提升转化可能性。

禁止表达：

- 保证提高转化率
- 保证平台审核通过
- 保证成为爆款
- 自动抓取所有平台真实点击增长

## 2. 已有基础

另一个任务开始前先检查这些文件是否存在。如果不存在，说明当前分支还没有合并前序能力，需要先恢复或迁移。

### 规则与市场包

- `shared/cross-border-commerce-agent.ts`
  - 版本化市场包。
  - 可用平台映射。
  - 广告位尺寸和安全区。
  - 六类商品品类。
  - 五类模板。
  - 风险规则。
  - `composeCrossBorderCommerceContext()`：组合最终生成上下文。
  - `evaluateCrossBorderCommerceRisk()`：生成前风险检查。

### 后端 API

- `GET /api/cross-border-commerce/markets`
  - 返回市场、平台、广告位、模板、品类、治理说明。
- `POST /api/cross-border-commerce/risk-check`
  - 仅做风险检查。
- `POST /api/cross-border-commerce/compose`
  - 组合最终上下文，并写入审计记录。

### 审计记录

- `server/cross-border-commerce-records.ts`
  - 记录用户选择、市场包版本、平台规格版本、模板版本、风险结论、最终 prompt。
  - 数据落在 `.artx-data/cross-border-commerce-generations.json`。

### 前端初版页面

- `client/src/pages/CrossBorderCommercePage.tsx`
  - 路由：`/cross-border-commerce`
  - 已有轻量选择器雏形。

### 平台资料

- `docs/ecommerce-platform-product-image-playbook-2026.md`
  - Amazon、Shopee、TikTok Shop、Lazada、抖音、小红书、淘宝/天猫、京东。
  - 2026 产品图风格、规格、图片设计建议。
  - 公开数据、授权后台数据、不可公开稳定抓取数据的边界。

## 3. 本期前端要做什么

不是只做一个表单，而是做成产品化工作流。

建议拆成 4 个前端区域：

1. 首页 Shopping 分析入口。
2. 跨境电商生成选择器。
3. 爆款风格模板预览。
4. 生成结果与导出面板。

## 4. 首页 Shopping 分析模块

首页需要加上 shopping 相关分析。

位置建议：`HomePage` 首屏之后、灵感/Skill/工作台入口之前，增加 `Shopping Intelligence` 或中文 `电商爆款图分析` 模块。

模块内容：

- 标题：`电商爆款图分析`
- 副标题：`按平台、国家和品类拆解商品图风格，生成更适合上架和投放的高清产品图。`
- 3 个指标卡：
  - `平台规格`：Amazon / Shopee / TikTok / Lazada / 抖音 / 小红书 / 淘宝 / 京东
  - `趋势模板`：白底主图、UGC 测评、种草封面、活动促销、详情卖点
  - `风险检查`：文化、宗教、政治、IP、功效宣称、虚假折扣
- 1 个流程预览：
  - 选择平台 → 选择国家 → 选择爆款风格 → 检查风险 → 生成图片
- CTA：
  - `生成跨境电商图`
  - 跳转 `/cross-border-commerce`

首页视觉建议：

- 左侧：平台/国家/品类选择卡片预览。
- 右侧：商品图模板小卡片瀑布流。
- 卡片示例：
  - `Amazon · US · 白底主图`
  - `Shopee · Indonesia · 本地语言卖点图`
  - `TikTok Shop · US · UGC 测评封面`
  - `小红书 · 中国 · 真实种草封面`

首页验收：

1. 首页能看到“电商爆款图分析”能力入口。
2. 模块能解释 ArtX 支持平台、国家、品类、爆款风格和风险检查。
3. CTA 能跳转 `/cross-border-commerce`。
4. 不出现“保证提升 GMV / 保证审核通过”等绝对承诺。
5. 移动端不溢出、不遮挡。

## 5. `/cross-border-commerce` 核心页面流程

### Step 1：选择平台

平台列表：

- Amazon
- Shopee
- TikTok Shop
- Lazada
- 抖音
- 小红书
- 淘宝 / 天猫
- 京东

注意：

- 现有 `shared/cross-border-commerce-agent.ts` 更偏跨境平台，已有 Amazon、TikTok Shop、Shopee、Lazada、Noon 等。
- 抖音、小红书、淘宝、京东如果还没有进入市场包，需要新增中国市场包和国内平台包。
- 前端不要硬编码最终规格；如果需要快速 MVP，也应先扩展共享数据，再由 API 返回。

### Step 2：选择国家/地区

跨境首期市场：

- 美国
- 巴西
- 墨西哥
- 印尼
- 泰国
- 越南
- 新加坡
- 菲律宾
- 日本
- 阿联酋（含迪拜）
- 沙特
- 卡塔尔
- 科威特

国内平台：

- 中国大陆

平台与国家要联动：

- 用户选择抖音、小红书、淘宝、京东时，默认国家为中国大陆。
- 用户选择 Amazon 时，可展示美国、日本、阿联酋、沙特等已注册市场。
- 用户选择 Shopee / Lazada 时，展示东南亚国家。
- 不适用的平台不要展示。

### Step 3：选择品类

沿用现有六类：

- 美妆个护
- 服饰配件
- 家居生活
- 3C 数码
- 食品饮品
- 母婴宠物

### Step 4：选择图片用途

用户话术建议：

- 商品主图
- 卖点说明图
- 生活方式场景图
- 促销活动图
- 短视频 / 社媒封面
- 详情页模块图

平台差异：

- Amazon：商品主图、卖点说明图、生活方式场景图。
- Shopee / Lazada：商品主图、卖点图、活动图。
- TikTok / 抖音：短视频封面、商品卡图、直播商品图。
- 小红书：种草封面、测评清单图、生活方式图。
- 淘宝 / 京东：商品主图、详情页模块图、活动图。

### Step 5：选择爆款风格模板

模板不是简单风格词，而是平台化图像结构。

首版模板：

| 模板 | 适合平台 | 用途 |
| --- | --- | --- |
| 白底高信任主图 | Amazon、Shopee、Lazada、淘宝、京东 | 搜索/货架主图 |
| 功能卖点信息卡 | Amazon 副图、京东、淘宝、Shopee、Lazada | 副图/详情卖点 |
| UGC 手持测评风 | TikTok、抖音、小红书 | 短视频封面/种草 |
| 真实生活种草风 | 小红书、抖音、TikTok | 封面/场景图 |
| 大促强转化活动图 | Shopee、Lazada、淘宝、京东 | 活动图 |
| 参数科技质感图 | 京东、Amazon、淘宝、3C 类目 | 3C/家电 |
| 清单测评对比图 | 小红书、淘宝内容化主图 | 测评/攻略 |

每个模板至少包含：

```ts
{
  id: string;
  platformIds: string[];
  marketIds: string[];
  categoryIds: string[];
  imageType: string;
  title: string;
  previewDescription: string;
  size: { width: number; height: number };
  safeArea: {};
  promptRules: string[];
  forbiddenRules: string[];
  copySuggestions: string[];
  trendEvidence: {
    source: string;
    sourceUrl?: string;
    verifiedAt: string;
    validUntil: string;
    confidence: "public_observed" | "seller_authorized" | "third_party_estimated" | "ops_review";
  };
}
```

## 6. 平台风格、规格与设计建议

规格属于高频变化数据。进入正式产品前必须按目标国家/站点复核官方卖家中心或广告文档。前端不要把这些规格写死，应该展示 API 返回的数据。

### 平台视觉逻辑

| 类型 | 平台 | 视觉核心 |
| --- | --- | --- |
| 货架电商 | Amazon、Shopee、Lazada、淘宝、京东 | 搜索列表里先看清商品，主图偏白底、干净、主体大 |
| 内容电商 | TikTok Shop、抖音、小红书 | 先让用户停下来，首图/封面偏场景、人物、动线、对比和情绪 |
| 混合电商 | Shopee、Lazada、淘宝、京东活动页和直播/短视频入口 | 主图要合规，活动图可强促销，但价格/折扣/功效/认证应为可编辑层 |

### Amazon

推荐用途：跨境标品、3C、家居、个护、宠物、户外、厨房用品。

核心图型：

- 主图：2000 × 2000 px，至少 1000 px 长边；纯白背景，商品占画面约 85%，不放文字、水印、徽章、促销、道具。
- 副图/卖点图：2000 × 2000 px；功能拆解、尺寸图、材质细节、对比图，文案可编辑。
- 场景图：2000 × 2000 或 1920 × 1080 px；展示使用场景、比例、生活方式，不夸大效果。

风格建议：

- 白底主图极干净，边缘锐利，阴影轻，包装可读。
- 副图像“信息卡”：3-5 个卖点、图标、尺寸线、局部特写。
- 主图只解决“看清楚是什么”，不要加卖点。

数据边界：

- 公开可看：Best Sellers、Movers & Shakers、价格、评分、评论数、BSR、主图样式。
- 不公开：点击率、曝光、转化率、广告 CTR，需要 Seller Central / Ads API。

### Shopee

本期必须实现并验证。

推荐用途：东南亚、巴西、墨西哥市场的中低客单价商品、服饰、美妆、家居、小家电。

核心图型：

- 商品主图：1024 × 1024 px，至少 500 × 500 px；方图优先，主体清楚，白底或浅色背景更稳。
- 活动/促销图：1024 × 1024 或 1200 × 628 px；可放活动视觉，但价格、券、包邮等必须由卖家确认。
- 服饰/穿搭图：900 × 1200 或 1080 × 1440 px；人物穿搭、场景感、尺码/材质说明分开做。

2026 风格：

- 移动端强对比，主体大，价格感明显。
- 东南亚市场更吃“本地语言 + 明确利益点 + 场景真实感”。
- 大促节点 9.9、10.10、11.11、12.12 可出现强促销模板，但常规商品主图不要太乱。

设计建议：

- 主图保持 70% 以上主体占比，背景干净。
- 第二张图做“核心卖点 + 图标”，第三张图做“场景/对比”，第四张图做“规格/尺寸”。
- 印尼市场注意清真暗示不能乱用。
- 泰国避免王室/宗教形象。
- 菲律宾注意宗教节庆使用方式。

本期验收路径：

`Shopee / Indonesia / 家居生活 / 大促强转化活动图`

风险检查必须覆盖：

- 穆斯林文化与清真暗示误用。
- 暴露人物。
- 宗教符号娱乐化。
- 价格、折扣、包邮、认证等未经用户确认的信息。

数据边界：

- 公开可看：部分商品页价格、售出量文字、评分、评论数、图片。
- 不稳定：搜索排名、类目热榜，地区和登录状态影响大。
- 不公开：曝光、点击增长、转化增长，需要 Seller Centre / Business Insights / Ads 数据授权。

### TikTok Shop

推荐用途：美妆个护、家居小工具、服饰配件、食品饮品、宠物、健身、数码小配件。

核心图型：

- 商品图：800 × 800 或 1080 × 1080 px。
- 短视频封面：1080 × 1920 px；中心安全区留给标题，避免底部 CTA 和右侧互动栏遮挡。
- 图片广告/轮播：1080 × 1920 px，Pangle 可用 1200 × 628 px。

风格建议：

- 像“短视频第一帧”，不是传统静物广告。
- 手持、开箱、使用瞬间、强对比。
- 文案控制在 5-9 个字，放中心偏上，不压产品。

数据边界：

- 公开/半公开：TikTok Creative Center / Top Products，可看 popularity、popularity change、impressions、CTR、CVR 等趋势字段。
- 需要授权：商品点击、店铺成交、广告消耗、GMV、商品卡点击增长。

### Lazada

推荐用途：东南亚品牌货、家居、母婴、美妆、3C、小家电、跨境标品。

核心图型：

- 商品主图：1000 × 1000 或 2000 × 2000 px，低于 1000 px 不建议。
- 场景图：1200 × 900 或 1000 × 1000 px。
- 活动横幅：1200 × 628 px，促销信息用可编辑层。

风格建议：

- LazMall 风格更干净，类似品牌旗舰店。
- 主图干净，副图强卖点，大促图强促销。
- 印尼、泰国、越南不要统一套英文，应做本地语言表达。

数据边界：

- 公开可看：部分商品页价格、评分、销量文字、图片。
- 不公开：点击增长、曝光、成交增长，需要 Lazada Seller Center / Business Advisor。

### 抖音电商

推荐用途：内容带货、直播间商品、短视频挂车、精选联盟商品。

核心图型：

- 方形商品主图：800 × 800 px，至少 600 × 600 px。
- 3:4 竖图：750 × 1000 px。
- 商品详情图：宽 750 px 或 790 px 工作稿。
- 短视频封面：1080 × 1920 px。

风格建议：

- 货架主图更像电商，短视频封面更像内容。
- 强调“痛点-结果”：清洁前后、穿搭效果、使用便利、真实试用。
- 功效类、医美、减肥、母婴用品必须降级为“体验/质感/适用场景”表达。

数据边界：

- 公开：部分公开视频互动、商品橱窗展示信息，但不稳定。
- 官方后台：电商罗盘、巨量千川、巨量云图。

### 小红书

推荐用途：美妆个护、服饰穿搭、家居生活、母婴、宠物、食品饮品、医美前种草。

核心图型：

- 笔记封面：1080 × 1440 或 1242 × 1660 px。
- 方图商品图：1080 × 1080 px。
- 长图/攻略图：宽 1080 px，按内容分段。

风格建议：

- 真实生活 + 轻商业，不像广告但画面干净。
- 常见爆款封面：真人局部、桌面布景、前后对比、清单式排版、测评感。
- 医美、减肥、母婴、食品保健要保守表达，避免前后对比夸大。

数据边界：

- 公开：笔记点赞、收藏、评论、封面、标题、发布时间。
- 不公开：商品点击、成交、搜索曝光、投放点击增长，需要千帆、聚光、蒲公英。

### 淘宝 / 天猫

推荐用途：国内综合电商、服饰、美妆、3C、家居、食品、母婴。

核心图型：

- 商品主图：800 × 800 或 1200 × 1200 px 工作稿。
- 白底图：800 × 800 或更高。
- 3:4 主图/短视频封面：750 × 1000 或 1080 × 1440 px。
- 详情页：宽 750/790 px 工作稿。

风格建议：

- 搜索主图：商品大、文字少、差异点明确。
- 活动主图：价格心智强，但要分清平台允许的促销位置。
- 详情页像销售页面：人群、痛点、卖点、参数、信任背书、售后。

数据边界：

- 公开：商品页价格、评价、销量文字、主图、部分榜单。
- 核心增长：生意参谋、直通车、万相台、引力魔方。

### 京东

推荐用途：3C 数码、家电、家居、母婴、食品、生鲜、品牌标品。

核心图型：

- 商品主图：800 × 800 或 1200 × 1200 px 工作稿。
- 卖点图：800 × 800 / 1200 × 1200 px。
- 详情页：宽 790 px 工作稿。

风格建议：

- 京东用户更重视可信、参数、品牌、服务。
- 3C/家电主图偏科技质感，但不能牺牲清晰度。
- 食品/母婴少用夸大功效，多用成分、规格、质检、适用场景。

数据边界：

- 公开：排行榜、价格、评价数、好评率、主图。
- 核心增长：京东商智、京准通、京麦后台。

## 7. 生成链路

前端不要自己拼最终 prompt。应该调用后端。

1. 页面加载：

```http
GET /api/cross-border-commerce/markets
```

2. 用户选择平台/国家/品类/用途/模板后：

```http
POST /api/cross-border-commerce/risk-check
```

3. 用户确认后：

```http
POST /api/cross-border-commerce/compose
```

4. compose 返回：

```ts
{
  context: {
    prompt: string;
    skillId: "commerce-poster-social" | "product-photography";
    placement: {};
    template: {};
    editableCopySuggestions: string[];
    exportSizes: [];
    risk: {};
  },
  auditRecordId: string;
}
```

5. 再调用现有图片生成链路：

```http
POST /api/ai/orchestrate
```

请求中带：

```ts
{
  capability: "text_to_image",
  prompt: context.prompt,
  skillId: context.skillId,
  ratio: "1:1" | "9:16" | "4:5" | "16:9",
  count: 1
}
```

注意：

- 不要让用户自由 prompt 覆盖平台尺寸、风险禁止项。
- 用户自由描述只能作为补充字段进入 `userPrompt`。
- 价格、折扣、认证、法律声明、医美功效、食品保健功效，不要直接烘焙进图片。

## 8. 风险检查前端展示

风险分三档：

- `阻止生成`
- `要求改写`
- `提示建议`

前端表现：

- 阻止生成：禁用生成按钮，展示命中规则和安全替代表达。
- 要求改写：允许用户修改输入，不直接进入生成。
- 提示建议：可以生成，但展示建议。

命中文案示例：

```text
命中：医美/减肥/功效宣称
原因：该类宣称需要证据，且不应直接烘焙到图片中。
建议：改为“轻盈质地、日常护理、清爽肤感”等体验型表达。
```

重点市场风险：

- 中东：默认规避酒类、猪制品、赌博、暴露人物、宗教符号娱乐化、敏感政治表达、不当节庆借用。
- 印尼：重点检查穆斯林文化、清真暗示、暴露人物、宗教符号误用。
- 泰国：规避王室与宗教形象不当使用。
- 菲律宾：保留宗教节庆与健康功效提醒。
- 美洲与日本：重点检查商标、名人肖像、虚假评价、功效和价格承诺。
- 中国平台：重点检查极限词、虚假功效、医疗/减肥/母婴宣称、诱导点击、盗用 IP。

## 9. 图片结果页与导出

生成结果区域至少展示：

- 生成图片预览。
- 使用的平台、国家、品类、模板。
- 输出尺寸。
- 风险结论。
- 可编辑文案建议。
- 审计记录 ID：`auditRecordId`。
- 导出按钮。

导出建议：

- 单尺寸导出：当前广告位尺寸。
- 批量导出：该平台相关尺寸，例如主图、活动横幅、短视频封面。
- 导出时保留审计信息：`auditRecordId`、market package version、template version。

## 10. 数据分析闭环

这个能力的长期价值不只是出图，而是知道哪类图真的更有效。

第一版先做手动录入/导入：

- 曝光
- 点击
- CTR
- 加购
- 收藏
- 订单
- GMV
- ROAS

后续接后台授权：

- Amazon：Seller Central、Brand Analytics、Advertising API。
- Shopee：Seller Centre、Business Insights、Ads。
- TikTok Shop：Creative Center 公共趋势 + Seller Center / Ads API。
- Lazada：Seller Center、Sponsored Solutions、Business Advisor。
- 抖音：电商罗盘、巨量千川、巨量云图。
- 小红书：千帆、聚光、蒲公英。
- 淘宝：生意参谋、万相台、直通车、引力魔方。
- 京东：京东商智、京准通、京麦后台。

模板效果字段：

```ts
{
  generationId: string;
  auditRecordId: string;
  platform: string;
  market: string;
  category: string;
  templateId: string;
  imageType: string;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  conversionRate?: number;
  gmv?: number;
  roas?: number;
  measuredAt: string;
}
```

数据标签：

- `public_observed`：公开页面观察到的排名、评论、价格、主图。
- `seller_authorized`：商家授权后台的点击、曝光、转化、成交。
- `third_party_estimated`：第三方估算数据，必须标注来源和置信度。
- `ops_review`：运营复核。

## 11. UI 设计要求

整体应该是工具型界面，不要做成营销 landing page。

建议布局：

- 左侧：平台、国家、品类、用途、模板选择。
- 中间：模板预览卡片。
- 右侧：风险检查、生成设置、文案建议。
- 底部或右下：生成按钮。

模板卡片要显示：

- 平台图标/名称。
- 国家/地区。
- 适用图片用途。
- 推荐尺寸。
- 风格关键词。
- 趋势证据状态。

状态标签：

- `官方规格`
- `公开趋势`
- `后台授权`
- `运营复核`
- `待更新`

## 12. 实施顺序

1. 检查 `AGENTS.md`、`MEMORY.md` 和当前 `git status`。
2. 确认 `shared/cross-border-commerce-agent.ts` 和 `/api/cross-border-commerce/*` 是否存在。
3. 如果不存在，先恢复前序跨境电商 Agent 能力。
4. 实现首页 Shopping / 电商爆款图分析模块。
5. 扩展 `/cross-border-commerce` 页面为完整选择器。
6. 如果中国平台或 Shopee 市场包不完整，先扩展共享市场包，再由 API 返回。
7. 增加模板预览卡片和风险展示。
8. 接入现有 `/api/ai/orchestrate` 生图。
9. 做浏览器回归。

## 13. 验收标准

首页：

1. 首页能看到“电商爆款图分析”模块。
2. 模块能解释平台、国家、品类、爆款风格和风险检查。
3. CTA 能跳转 `/cross-border-commerce`。
4. 移动端不溢出、不遮挡。
5. 不出现“保证提升 GMV / 保证审核通过”等绝对承诺。

跨境电商页面：

1. 能从 API 获取市场包，而不是前端硬编码所有平台规格。
2. 平台和国家联动，不显示不适用平台。
3. 选择模板后展示尺寸、安全区、文案建议和风险提示。
4. 风险阻止时不能生成。
5. 生成请求使用 compose 返回的 `prompt` 和 `skillId`。
6. 生成结果展示平台、国家、模板、尺寸和 `auditRecordId`。
7. 不影响现有智能产品图、画布、Skill Store、账单、登录、支付。

必须浏览器验证至少 4 条路径：

1. `Amazon / US / 3C / 白底主图`
2. `Shopee / Indonesia / 家居生活 / 大促强转化活动图`
3. `TikTok Shop / US / 美妆 / UGC 封面`
4. `小红书 / 中国 / 美妆 / 种草封面`

检查项：

- 首页模块可见。
- CTA 跳转正确。
- 风险阻止时按钮禁用。
- 输入违规功效宣称时能阻止或要求改写。
- 生成请求带正确 `skillId` 和 compose 后 prompt。
- 完成后运行 `pnpm run check`。

## 14. 不要做的事

- 不要改 `.env`。
- 不要接触支付金额、Wallyt 商户配置或密钥。
- 不要改 AI provider 核心能力，除非明确需要。
- 不要把第三方博客规格当成最终官方规则。
- 不要爬取需要登录或绕过反爬的后台数据。
- 不要承诺“平台一定通过”或“图片一定提高转化”。
- 不要把价格、折扣、疗效、认证直接烘焙到 AI 图片里。
- 不要发布测试环境，除非用户明确要求。

## 15. 关键参考文件

- `AGENTS.md`
- `MEMORY.md`
- `docs/cross-border-commerce-frontend-implementation-handoff.md`
- `docs/ecommerce-platform-product-image-playbook-2026.md`
- `shared/cross-border-commerce-agent.ts`
- `server/cross-border-commerce-records.ts`
- `client/src/pages/CrossBorderCommercePage.tsx`
- `client/src/pages/HomePage.tsx`
- `client/src/components/layout/AppShell.tsx`
- `client/src/lib/skill-store.ts`
- `server/skills/cross-border-commerce-agent.md`

