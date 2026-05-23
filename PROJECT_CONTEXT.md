# Lovart AI 创意工作台 — 项目上下文

> 最后更新：2026-05-23

---

## 项目基本信息

| 项目名 | lovart-inspired-workspace |
|--------|--------------------------|
| 路径 | `/home/ubuntu/lovart-inspired-workspace` |
| 框架 | React 19 + Tailwind 4 + shadcn/ui + Wouter |
| 开发服务器 | `https://3000-i3gy4osyy141i1m8xhfvi-da37a2d9.sg1.manus.computer` |
| 最新检查点 | `547ca03d`（移除密码门控） |
| 当前进行中任务 | 按 Figma DESIGN.md 规范更新字体和颜色 |

---

## 技术栈

- **路由**：Wouter（`/`, `/workspace`, `/community`, `/project/:id`）
- **主题**：ThemeContext（dark/light 双模式，默认 dark）
- **字体**：Inter Variable + JetBrains Mono（已更新 index.html）
- **状态管理**：React useState/useContext
- **画布**：ReactFlow（`@xyflow/react`）

---

## 页面结构

| 路由 | 组件 | 说明 |
|------|------|------|
| `/` | `HomePage` + `AppShell` | 首页，AI 输入框 + 最近项目 |
| `/workspace` | `WorkspaceDashboard` + `AppShell` | 工作台项目列表 |
| `/community` | `CommunityPage` + `AppShell` | 创作社区 |
| `/project/:id` | `Workspace`（无 AppShell） | 画布编辑器 |

---

## 关键组件路径

```
client/src/
├── App.tsx                          # 路由入口（已移除密码门控）
├── index.css                        # 全局样式、CSS 变量、字体
├── pages/
│   ├── HomePage.tsx                 # 首页（AI 输入框、最近项目）
│   ├── WorkspaceDashboard.tsx       # 工作台
│   ├── CommunityPage.tsx            # 社区
│   ├── Workspace.tsx                # 画布页（无侧边栏）
│   ├── PasswordGate.tsx             # 密码门控（已从 App.tsx 移除，文件保留备用）
│   └── NotFound.tsx
├── components/
│   ├── layout/
│   │   └── AppShell.tsx             # 左侧宽导航栏（200px）
│   ├── canvas/
│   │   └── InfiniteCanvas.tsx       # 画布核心组件（ReactFlow）
│   └── ui/                          # shadcn/ui 组件库
└── contexts/
    └── ThemeContext.tsx              # 暗/亮主题切换
```

---

## 已完成的主要功能

### 首页（HomePage）
- AI 提示词输入框（hover 呼吸感动效：scale 1.008 + 阴影增强）
- 快速入口卡片（AI 创作 / 从模板开始 / 导入素材）
- 最近项目网格（4 列，卡片含封面图 + 标题 + 更新时间 + `...` 菜单）
- `...` 菜单样式与工作台完全一致（`w-5 h-5 rounded-md`，右对齐）
- 亮色模式背景：`#F5F5F5`

### 侧边栏（AppShell）
- 宽导航栏（200px），无收起/展开开关
- 内容：Logo、首页 / 灵感选题 / 技能商店、工作区分组（我的项目 / 素材库）、历史对话列表（5 条 + 新建按钮）、底部设置 / 帮助 / 用户行
- 亮色模式背景：`#F5F5F5`，完整主题适配

### 画布（InfiniteCanvas）
- ReactFlow 无限画布，节点类型：asset（图片素材）/ text / shape
- 节点直接拖动（`selectNodesOnDrag={false}`，选中即可拖）
- 节点连接点（Handle）：亮色模式深灰色，暗色模式白色
- 连接线（TapnowEdge）：亮色模式深灰 `rgba(60,60,80,0.45)`
- 图片预览模态框：顶部半透明 bar（10% 白色）+ 下载/关闭深色图标
- 图片放大后顶部浮动工具栏（AssetFloatingToolbar）：亮色模式深色图标
- 左下角缩放控件（ZoomControlBar）：毛玻璃竖条 bar，含放大/缩小/居中/锁定
- 居中按钮：自定义 SVG（四角框 + 中心小方块）
- 底部全局提示词输入框（BottomPromptBar）：支持 Ctrl 多选引用，chip 单独删除
- 右键菜单：含编辑素材（zoom in 推进动画 + 底部编辑输入框）等选项
- 小地图（MiniMap）：右下角，品牌紫色视口高亮方框，pannable/zoomable

### 工作台（WorkspaceDashboard）
- 项目卡片网格，含封面图 + 标题 + 更新时间 + `...` 菜单
- `...` 菜单：`w-5 h-5 rounded-md`，hover 淡入，bottom 对齐

---

## 设计系统

### 当前颜色（index.css）
- **暗色模式（默认）**：深蓝紫背景 `oklch(0.10 0.015 270)`，品牌紫 `oklch(0.58 0.22 290)`，品牌青 `oklch(0.72 0.18 200)`
- **亮色模式**：背景 `#F5F5F5`，前景深蓝板岩 `oklch(0.22 0.018 255)`，品牌紫 `oklch(0.52 0.22 290)`

### 进行中：Figma DESIGN.md 字体/颜色规范应用
**DESIGN.md 关键规范（已获取）：**

**颜色：**
- `primary: #000000`，`on-primary: #ffffff`
- `canvas: #ffffff`，`ink: #000000`
- `surface-soft: #f7f7f5`
- 彩色 block：`block-lime: #dceeb1`，`block-lilac: #c5b0f4`，`block-cream: #f4ecd6`，`block-pink: #efd4d4`，`block-mint: #c8e6cd`，`block-coral: #f3c9b6`，`block-navy: #1f1d3d`
- `accent-magenta: #ff3d8b`，`semantic-success: #1ea64a`
- `hairline: #e6e6e6`，`hairline-soft: #f1f1f1`

**字体（figmaSans → 替换为 Inter Variable）：**
- `display-xl`: 86px / weight 340 / lh 1.00 / ls -1.72px
- `display-lg`: 64px / weight 340 / lh 1.10 / ls -0.96px
- `headline`: 26px / weight 540 / lh 1.35 / ls -0.26px
- `subhead`: 26px / weight 340 / lh 1.35 / ls -0.26px
- `card-title`: 24px / weight 700 / lh 1.45
- `body-lg`: 20px / weight 330 / lh 1.40 / ls -0.14px
- `body`: 18px / weight 320 / lh 1.45 / ls -0.26px
- `body-sm`: 16px / weight 330 / lh 1.45 / ls -0.14px
- `button/link`: 20px / weight 480 / lh 1.40 / ls -0.10px
- `eyebrow`: figmaMono 18px / weight 400 / ls 0.54px（→ JetBrains Mono）
- `caption`: figmaMono 12px / weight 400 / ls 0.60px（→ JetBrains Mono）

**圆角：**
- `xs: 2px`，`sm: 6px`，`md: 8px`，`lg: 24px`，`xl: 32px`，`pill: 50px`

**间距：**
- `hair: 1px`，`xxs: 4px`，`xs: 8px`，`sm: 12px`，`md: 16px`，`lg: 24px`，`xl: 32px`，`xxl: 48px`，`section: 96px`

**当前进度：**
- [x] 获取 DESIGN.md 规范
- [x] 更新 index.html 字体引入（Inter Variable + JetBrains Mono）
- [ ] 更新 index.css 全局 CSS 变量（颜色 + 字体 + 圆角 + 间距）
- [ ] 更新各页面组件文字颜色和字体应用
- [ ] 保存检查点

---

## 检查点历史（关键节点）

| 版本 ID | 说明 |
|---------|------|
| `d556cb63` | 初始项目创建 |
| `70634ced` | 画面居中按钮（后已移除） |
| `09c7699b` | 首页亮色背景 #F5F5F5 |
| `ddb7f2a3` | 暗色 AI 输入框提亮 |
| `40441394` | 侧边栏亮色背景 #F5F5F5 |
| `57ce8664` | AI 输入框 hover 呼吸感 |
| `cfce6a5f` | 首页 ... 菜单与工作台统一 |
| `d648f94e` | 图片工具栏亮色图标修复 |
| `bc00ec48` | 移除画面居中按钮 |
| `b2213b4c` | 预览工具栏深灰图标 + 节点直接拖动 |
| `6ee946bb` | 预览模态框工具栏统一嵌入透明 bar |
| `cf356e2f` | Ctrl 多选引用 + chip 单独删除 |
| `17f95c43` | 左下角缩放控件毛玻璃竖条 bar |
| `987ead48` | 居中图标替换为四角框+中心小方块 SVG |
| `2ca56a77` | 移除左侧图层/设置/参考面板 |
| `4565bb92` | 右键编辑素材全屏编辑模式（后重构） |
| `71ee9903` | 编辑素材改为画布内 zoom in 动画 |
| `2559a3b6` | 编辑输入框水平居中 |
| `e3046adc` | 侧边栏重构为宽导航栏 |
| `aa8b232b` | 编辑素材：zoom in + 15% mask + 底部输入框 |
| `35effe9d` | 编辑输入框吸附节点正下方（已 rollback） |
| `d290a698` | 移除节点编辑功能（已 rollback） |
| `de94e39f` | 添加密码门控（密码 bkeel） |
| `547ca03d` | **当前版本**：移除密码门控，恢复直接访问 |

---

## 待完成任务

- [ ] 按 Figma DESIGN.md 规范完成字体和颜色更新（进行中）

---

## 注意事项

- 静态资源必须用 `manus-upload-file --webdev` 上传，不能放 `client/public/` 或 `client/src/assets/`
- 暗色模式为默认主题，亮色模式通过 `.light` class 切换
- 侧边栏宽度 200px，画布页无侧边栏（Workspace 组件独立）
- ReactFlow 节点通过 `data.isEditing` 传递编辑状态
- 多引用通过 `CustomEvent('asset-reference', { detail: { assetId, name, src, ctrlKey } })` 传递
- `PasswordGate.tsx` 文件保留备用，未来可重新接入 App.tsx
