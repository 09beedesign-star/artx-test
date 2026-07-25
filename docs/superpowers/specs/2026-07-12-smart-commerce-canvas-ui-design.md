# 智能电商产品画布面板设计

## 目标

将 `docs/cross-border-commerce-shopping-frontend-master-brief.md` 定义的“平台、国家/地区、品类、图片用途、模板、风险检查、高清生成”框架嵌入画布顶部现有智能产品图工具。用户在同一个浮动面板内完成选择和生成，不跳转独立页面。

## 范围

- 保留现有产品图与背景参考图上传、2K/4K、1-9 张生成、画布落图与计费能力。
- 新增平台化选择、市场联动、用途/广告位、模板、风险结论和输出摘要。
- 市场、平台、广告位、模板、风险与最终 prompt 由跨境电商共享规则和 API 提供。
- 不修改 AI provider、支付、登录、账单、Skill Store、其他画布工具或生产发布配置。

## 信息架构

面板使用适合画布工具的三栏结构：

1. 左栏“产品素材”：必选产品图、可选背景参考图。
2. 中栏“电商配置”：平台、国家/地区、品类、图片用途、风格模板和补充要求，按上游选择逐级过滤。
3. 右栏“生成检查”：当前规格、安全区、风险结论、分辨率、数量和最终生成摘要。

顶部只保留标题、简短说明和五段进度提示；底部固定取消与生成按钮。面板继续位于画布工具栏下方，支持拖动和内部纵向滚动，不出现横向滚动。

## 数据与交互

- 打开面板后请求 `GET /api/cross-border-commerce/markets`。
- 默认选择第一个可用市场、平台、广告位、品类与兼容模板；上游切换后自动修正下游无效选择。
- 用户输入补充要求后，以短延时调用 `POST /api/cross-border-commerce/risk-check`。
- `block` 禁用生成；`rewrite` 要求用户修改；`advise` 与 `pass` 可继续。
- 点击生成时先调用 `POST /api/cross-border-commerce/compose`，再把返回的 `prompt`、`skillId`、尺寸、数量和素材派发给现有画布生成事件。
- 价格、折扣、认证、法律或功效文字只作为可编辑建议，不直接烘焙进图片。

## 组件边界

- `shared/cross-border-commerce-agent.ts`：市场包、平台、广告位、模板与风险规则唯一数据源。
- `server/cross-border-commerce-records.ts`：compose 审计记录。
- `server/index.ts`：markets、risk-check、compose 三个薄 API。
- `client/src/lib/cross-border-commerce.ts`：前端类型、API 调用、联动选择纯函数。
- `client/src/components/canvas/SmartCommerceProductDialog.tsx`：完整面板 UI 与本地选择状态。
- `InfiniteCanvas.tsx`：只负责打开面板、接收 compose 后生成事件并调用既有画布生成链路。

## 视觉规则

- 延续画布现有深浅色主题、`#C5ED47` 主操作色和紧凑工具密度。
- 不使用营销式大标题、装饰性渐变、嵌套卡片或大面积阴影。
- 平台使用现有 Lucide/平台图标，选择控件保持稳定尺寸；长文案换行，所有区域只纵向滚动。
- 桌面三栏；窄屏改为单列分段，底部操作栏始终可见。

## 成功标准

1. 在画布顶部智能电商产品面板内完成全流程，不跳页。
2. 平台与国家/地区联动，规格和模板来自 API。
3. Shopee / Indonesia / 家居生活 / 大促强转化活动图可选且可 compose。
4. 风险阻止时不能生成，改写和提示状态清晰。
5. 生成使用 compose 返回的 prompt 与 skillId，数量最多 9 张，输出采用所选广告位尺寸。
6. 桌面与窄屏无重叠、裁切或横向滚动，控制台无相关错误。
7. 现有画布、AI 工具、登录、账单、支付和 Skill Store 回归不受影响。
