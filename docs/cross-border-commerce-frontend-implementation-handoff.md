# 跨境电商爆款图前端实现交接文档

更新时间：2026-07-12  
目标任务：在另一个前端任务中，把“按平台 + 国家/地区 + 品类 + 爆款风格生成可发布商品图”的能力做成用户可用界面。  
适用项目：ArtX，仓库 `/Users/ericbi/Documents/New project 2`

## 1. 产品目标

让用户在 ArtX 站点里选择：

平台 → 国家/地区 → 商品品类 → 图片用途 → 爆款图片风格 → 风险检查 → 生成图片 → 导出对应平台尺寸

用户不需要自己写复杂 prompt。系统根据平台规格、国家地区审美、品类模板、爆款风格、风险规则自动组合生成上下文，然后调用现有 AI 图片生成能力。

最终用户价值：

- 让跨境卖家快速生成更符合平台审美和尺寸要求的商品图。
- 降低因为尺寸、文化、宗教、政治、IP、功效宣称导致的图片风险。
- 帮助商家提升点击率、转化率和营收利润，但产品文案不能承诺“一定提升”。

推荐对外表达：

> 基于平台规格、公开趋势和店铺数据，生成更符合该平台用户点击习惯的商品图，从而提升转化可能性。

不要写：

> 保证提高转化率 / 保证平台审核通过 / 保证成为爆款。

## 2. 已有基础

另一个任务开始前先检查这些文件是否存在。如果不存在，说明当前分支还没有合并前序能力，需要先恢复或迁移。

### 规则与市场包

- `shared/cross-border-commerce-agent.ts`
  - 13 个首期市场。
  - 平台可用性。
  - 广告位尺寸和安全区。
  - 六类商品品类。
  - 五类模板。
  - 风险规则。
  - `composeCrossBorderCommerceContext()` 用于组合最终生成上下文。
  - `evaluateCrossBorderCommerceRisk()` 用于生成前风险检查。

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
  - 现有轻量选择器页面。
  - 路由：`/cross-border-commerce`
  - 已能选择市场、平台、广告位、品类、模板，调用 compose API，展示风险和最终 prompt。

### 平台图文玩法资料

- `docs/ecommerce-platform-product-image-playbook-2026.md`
  - Amazon、Shopee、TikTok Shop、Lazada、抖音、小红书、淘宝/天猫、京东。
  - 2026 产品图风格、规格、图片设计建议。
  - Hermes/公开抓取可得数据与必须授权后台的数据边界。

## 3. 这次前端任务要做什么

本任务不是只做一个表单，而是要把“跨境电商爆款图生成”做成一个产品化工作流。

建议拆成 4 个前端区域：

1. 首页 Shopping 分析入口
2. 跨境电商生成选择器
3. 爆款风格模板预览
4. 生成结果与导出面板

## 4. 首页需要加的 Shopping 分析

用户补充要求：首页需要加上 shopping 相关分析。

目标不是在首页塞一个大功能，而是在首页让用户理解 ArtX 可以帮他做“平台化商品图增长”。

### 首页新增模块建议

位置建议：HomePage 首屏之后、灵感/Skill/工作台入口之前，增加一个 `Shopping Intelligence` 或中文 `电商爆款图分析` 模块。

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

### 首页文案原则

可以写：

- “参考平台趋势和图片规格”
- “适配不同国家和地区的商品图表达”
- “帮助提升点击和转化可能性”

不要写：

- “保证提升营收”
- “保证爆单”
- “平台 100% 审核通过”
- “自动抓取所有平台真实点击增长”

### 首页视觉建议

首页模块要像产品能力，不要像广告文章。

建议视觉：

- 左侧：平台/国家/品类选择卡片预览。
- 右侧：商品图模板小卡片瀑布流。
- 卡片示例：
  - `Amazon · US · 白底主图`
  - `TikTok Shop · US · UGC 测评封面`
  - `小红书 · 中国 · 真实种草封面`
  - `Shopee · Indonesia · 本地语言卖点图`

## 5. 核心页面用户流程

页面路径：`/cross-border-commerce`

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

- 现有 `shared/cross-border-commerce-agent.ts` 目前更偏跨境平台，已经有 Amazon、TikTok Shop、Shopee、Lazada、Noon 等。
- 抖音、小红书、淘宝、京东如果还没有进入市场包，需要新增中国市场包和国内平台包。
- 前端不要硬编码最终规格；如果要快速 MVP，可以先在共享数据里扩展，再由 API 返回。

### Step 2：选择国家/地区

跨境首期：

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
- 用户选择 Shopee/Lazada 时，展示东南亚国家。
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

建议加一个比“广告位”更好懂的用户话术：

- 商品主图
- 卖点说明图
- 生活方式场景图
- 促销活动图
- 短视频 / 社媒封面
- 详情页模块图

不同平台可见项不同：

- Amazon：商品主图、卖点说明图、生活方式场景图。
- TikTok / 抖音：短视频封面、商品卡图、直播商品图。
- 小红书：种草封面、测评清单图、生活方式图。
- 淘宝 / 京东：商品主图、详情页模块图、活动图。
- Shopee / Lazada：商品主图、卖点图、活动图。

### Step 5：选择爆款风格模板

模板不是简单风格词，而是平台化图像结构。

建议首版模板：

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

## 6. 生成链路

前端不要自己拼最终 prompt。应该调用后端：

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

## 7. 风险检查前端展示

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

## 8. 图片结果页与导出

生成结果区域至少展示：

- 生成图片预览。
- 使用的平台、国家、品类、模板。
- 输出尺寸。
- 风险结论。
- 可编辑文案建议。
- 导出按钮。

导出建议：

- 单尺寸导出：当前广告位尺寸。
- 批量导出：该平台相关尺寸，例如主图、活动横幅、短视频封面。
- 导出时保留审计信息：`auditRecordId`、market package version、template version。

## 9. 数据分析闭环

这个能力的长期价值不只是出图，而是知道哪类图真的更有效。

### 第一版先做手动录入/导入

允许用户给生成图补录数据：

- 曝光
- 点击
- CTR
- 加购
- 收藏
- 订单
- GMV
- ROAS

### 后续接后台授权

按照平台接入：

- Amazon：Seller Central、Brand Analytics、Advertising API。
- TikTok Shop：Creative Center 公共趋势 + Seller Center / Ads API。
- 抖音：电商罗盘、巨量千川。
- 淘宝：生意参谋、万相台、直通车。
- 京东：京东商智、京准通。
- 小红书：千帆、聚光、蒲公英。
- Shopee / Lazada：Seller Centre / Ads / Business Advisor。

### 模板效果字段

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

## 10. UI 设计要求

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

## 11. 首页 Shopping 分析的验收标准

另一个任务实现首页模块时，至少满足：

1. 首页能看到“电商爆款图分析”能力入口。
2. 模块能解释 ArtX 支持平台、国家、品类、爆款风格和风险检查。
3. CTA 能跳转 `/cross-border-commerce`。
4. 不出现“保证提升 GMV / 保证审核通过”等绝对承诺。
5. 移动端不溢出、不遮挡。

## 12. 跨境电商页面验收标准

1. 能从 API 获取市场包，而不是前端硬编码所有平台规格。
2. 平台和国家联动，不显示不适用平台。
3. 选择模板后展示尺寸、安全区、文案建议和风险提示。
4. 风险阻止时不能生成。
5. 生成请求使用 compose 返回的 `prompt` 和 `skillId`。
6. 生成结果能展示平台、国家、模板、尺寸和审计记录 ID。
7. 不影响现有智能产品图、画布、Skill Store、账单、登录、支付。

## 13. 不要做的事

- 不要改 `.env`。
- 不要接触支付金额、Wallyt 商户配置或密钥。
- 不要改 AI provider 核心能力，除非明确需要。
- 不要把第三方博客规格当成最终官方规则。
- 不要爬取需要登录或绕过反爬的后台数据。
- 不要承诺“平台一定通过”或“图片一定提高转化”。
- 不要把价格、折扣、疗效、认证直接烘焙到 AI 图片里。

## 14. 建议实施顺序

1. 检查 `AGENTS.md`、`MEMORY.md` 和当前 `git status`。
2. 确认 `shared/cross-border-commerce-agent.ts` 和 `/api/cross-border-commerce/*` 是否存在。
3. 如果不存在，先恢复前序跨境电商 Agent 能力。
4. 实现首页 Shopping 分析模块。
5. 扩展 `/cross-border-commerce` 页面为完整选择器。
6. 增加模板预览卡片和风险展示。
7. 接入现有 `/api/ai/orchestrate` 生图。
8. 做浏览器回归：
   - 首页模块可见。
   - CTA 跳转。
   - 选择 Amazon / US / 3C / 白底主图。
   - 选择 Shopee / Indonesia / 家居生活 / 大促强转化活动图。
   - 选择 TikTok Shop / US / 美妆 / UGC 封面。
   - 选择小红书 / 中国 / 美妆 / 种草封面。
   - 输入违规功效宣称时能阻止或要求改写。
   - 生成请求带正确 `skillId` 和 compose 后 prompt。

## 15. 关键参考文件

- `docs/ecommerce-platform-product-image-playbook-2026.md`
- `shared/cross-border-commerce-agent.ts`
- `server/cross-border-commerce-records.ts`
- `client/src/pages/CrossBorderCommercePage.tsx`
- `client/src/pages/HomePage.tsx`
- `client/src/components/layout/AppShell.tsx`
- `client/src/lib/skill-store.ts`
- `server/skills/cross-border-commerce-agent.md`

## 16. 给下一个任务的简短指令

请基于本文件实现前端界面：

1. 首页增加 shopping / 电商爆款图分析模块，并跳转 `/cross-border-commerce`。
2. 完善 `/cross-border-commerce` 为平台、国家、品类、用途、爆款风格模板选择器。
3. 使用 `/api/cross-border-commerce/markets`、`/risk-check`、`/compose`，不要在前端硬编码规格。
4. compose 成功后调用现有 `/api/ai/orchestrate` 生图。
5. 风险阻止时禁用生成，并展示安全替代表达。
6. 完成后跑 `pnpm run check`，并用浏览器验证首页入口和至少 4 条平台生成路径，其中必须包含 Shopee。
