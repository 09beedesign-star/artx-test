# artx — 完整项目上下文

> 最后更新：2026-05-23 | 最新检查点：`2f4c7019`
>
> **新任务启动方式**：在新会话中发送「请读取 `/home/ubuntu/lovart-inspired-workspace/PROJECT_CONTEXT.md` 恢复上下文，然后继续」即可 100% 无遗漏恢复。

---

## 一、项目基本信息

| 字段 | 值 |
|------|-----|
| 项目名称 | artx |
| 项目路径 | `/home/ubuntu/lovart-inspired-workspace` |
| 开发服务器 | `https://3000-i3gy4osyy141i1m8xhfvi-da37a2d9.sg1.manus.computer` |
| 最新检查点 | `2f4c7019`（品牌名称全面更新为 artx） |
| 项目类型 | web-static（纯前端，无后端 API） |
| 框架 | React 19 + Tailwind 4 + shadcn/ui + Wouter |
| 画布库 | `@xyflow/react`（ReactFlow v12） |
| 主题系统 | ThemeContext（dark 默认，light 通过 `html.light` class 切换） |
| 字体 | Inter Variable（正文）+ JetBrains Mono（代码/标注），已在 index.html 引入 |
| 包管理器 | pnpm |

---

## 二、路由结构（App.tsx）

```
/                → AppShell + HomePage
/workspace       → AppShell + WorkspaceDashboard
/community       → AppShell + CommunityPage（占位页，"即将上线"）
/project/:id     → Workspace（无 AppShell，画布页自带返回按钮）
/404             → NotFound（该页面样式是模板默认样式，未适配 artx 设计系统）
*                → NotFound
```

**App.tsx 关键配置：**
```tsx
<ThemeProvider defaultTheme="dark" switchable>
  <TooltipProvider>
    <Toaster />
    <Router />
  </TooltipProvider>
</ThemeProvider>
```

---

## 三、文件结构

```
/home/ubuntu/lovart-inspired-workspace/
├── package.json                          # name: "artx"
├── .project-config.json                  # name: "artx", VITE_APP_TITLE: "artx"
├── PROJECT_CONTEXT.md                    # 本文件
├── client/
│   ├── index.html                        # <title>artx</title>，引入 Inter + JetBrains Mono
│   └── src/
│       ├── main.tsx                      # 挂载 App 到 #root，无 StrictMode
│       ├── App.tsx                       # 路由 + ThemeProvider（无密码门控）
│       ├── index.css                     # 全局样式、CSS 变量（见第五节）
│       ├── const.ts                      # OAuth 工具函数（getLoginUrl），当前未使用
│       ├── pages/
│       │   ├── HomePage.tsx              # 首页（核心页面，见第四节）
│       │   ├── WorkspaceDashboard.tsx    # 工作台（核心页面，见第四节）
│       │   ├── Workspace.tsx             # 画布路由壳（薄包装，挂载 InfiniteCanvas）
│       │   ├── CommunityPage.tsx         # 社区占位页（仅 TopBar + "即将上线"）
│       │   ├── PasswordGate.tsx          # 密码门控（已从 App.tsx 移除，文件保留备用）
│       │   ├── NotFound.tsx              # 404 页（模板默认样式，未适配设计系统）
│       │   └── Home.tsx                  # 模板残留文件，未路由，可忽略
│       ├── components/
│       │   ├── layout/
│       │   │   └── AppShell.tsx          # 左侧宽导航栏 200px（核心布局，见第四节）
│       │   ├── workspace/
│       │   │   ├── TopBar.tsx            # 顶部 52px 导航栏（所有页面共用）
│       │   │   ├── RightPanel.tsx        # 旧版右侧面板（已从 Workspace 移除，文件保留）
│       │   │   ├── Sidebar.tsx           # 旧版左侧边栏（已被 AppShell 替代，含旧品牌名）
│       │   │   └── ProjectHeader.tsx     # 旧版项目标题栏（未使用，文件保留）
│       │   ├── canvas/
│       │   │   ├── InfiniteCanvas.tsx    # ReactFlow 画布核心（核心组件，见第四节）
│       │   │   └── CanvasNodes.tsx       # 旧版节点系统（已被 InfiniteCanvas 内联替代）
│       │   ├── ErrorBoundary.tsx         # 全局错误边界（App.tsx 根层包裹）
│       │   ├── ManusDialog.tsx           # Manus OAuth 登录弹窗（当前未使用）
│       │   ├── Map.tsx                   # Google Maps 组件（当前未使用）
│       │   └── ui/                       # shadcn/ui 组件库（完整安装）
│       ├── contexts/
│       │   └── ThemeContext.tsx          # 暗/亮主题 Context（见第六节）
│       ├── hooks/
│       │   ├── useComposition.ts
│       │   ├── useMobile.tsx
│       │   └── usePersistFn.ts
│       └── lib/
│           ├── utils.ts                  # cn() 工具函数
│           └── workspace-data.ts         # 全局 mock 数据（见第七节）
```

---

## 四、核心组件详解

### 4.1 AppShell（左侧导航栏）

**文件**：`client/src/components/layout/AppShell.tsx`

**特性：**
- 宽度固定 200px，**无收起/展开开关**（用户明确要求）
- 暗色背景：`oklch(0.11 0.012 270)`
- 亮色背景：`#F5F5F5`（用户明确要求）
- 右侧分隔线：暗色 `rgba(255,255,255,0.07)`，亮色 `rgba(0,0,0,0.07)`

**结构（从上到下）：**
1. **Logo 区**：渐变紫青色方块（Sparkles 图标）+ 文字 `artx`，点击跳转 `/`
2. **顶部导航**：首页（`/`）/ 灵感选题（`/inspiration`）/ 技能商店（`/skills`）
3. **分隔线**
4. **工作区分组**：标题"工作区" + 我的项目（`/workspace`）/ 素材库（`/assets`）
5. **分隔线**
6. **历史对话**：标题 + 新建按钮（Edit3 图标）+ 5 条 mock 历史记录
7. **底部区**：设置（`/settings`）/ 帮助（`/help`）/ 用户行（渐变头像 + "用户名"）

**NavItem 样式规则：**
- 激活态：`activeBg` 背景 + `activeColor` 文字 + `strokeWidth={2.0}`
- 非激活：透明背景 + `textSecondary` 文字 + `strokeWidth={1.6}`
- hover：`hoverBg` 背景（onMouseEnter/Leave 手动控制）

**props：**
```tsx
interface AppShellProps {
  children: React.ReactNode;
  hideSidebar?: boolean;  // 传 true 时直接渲染 children，不显示侧边栏
}
```

---

### 4.2 TopBar（顶部导航栏）

**文件**：`client/src/components/workspace/TopBar.tsx`

**特性：**
- 高度 52px，所有页面共用（HomePage / WorkspaceDashboard / Workspace / CommunityPage）
- 样式通过 `resolvedTheme` 手动推导颜色 token（不使用 CSS 变量 class）

**从左到右的元素：**
1. **搜索框**（`flex-1 max-w-md`）：占位符"搜索项目、素材或命令…" + ⌘K 标签（装饰性，无功能）
2. **弹性空白**（`flex-1`）
3. **新建项目按钮**：渐变紫青背景，点击 `toast("新建项目", { description: "功能即将上线" })`
4. **主题切换**：Radix DropdownMenu，选项：深色 / 浅色 / 跟随系统，绑定 ThemeContext.setMode
5. **积分显示**：Sparkles 图标 + 数字（默认 75）+ "积分"，点击 toast 占位
6. **通知铃铛**：Bell 图标 + 紫色未读小圆点，点击 toast 占位
7. **用户按钮**：渐变头像 + "用户名" + ChevronDown，点击 toast 占位

**props：**
```tsx
interface TopBarProps {
  credits?: number;  // 默认 75
}
```

---

### 4.3 HomePage（首页）

**文件**：`client/src/pages/HomePage.tsx`

**布局（从上到下）：**
1. **TopBar**（height: 52px）
2. **主内容区**（overflow-y-auto）
   - 暗色背景：`oklch(0.10 0.015 270)`，亮色：`#F5F5F5`
   - 可选暗色 BG_GLOW 背景图叠加（仅 dark 模式）
   - **Badge**：Sparkles 图标 + "artx"（品牌紫色）
   - **标题 h1**：`今天想创作什么？`（32px bold，letterSpacing: -0.02em）
   - **副标题**：`用 AI 的力量，将你的创意想法变成精美的视觉作品`（14px）
   - **HeroInputBox**：AI 输入框（最大宽 680px）
   - **Prompt 建议 chips**：4 个建议词
   - **快速入口卡片**（3 列）：AI 创作 / 从模板开始 / 导入素材
   - **最近项目标题行**：左"最近项目" + 右"查看全部 >"
   - **最近项目网格**（4 列）：来自 `PROJECTS` mock 数据

**HeroInputBox 关键特性：**
- 大圆角（24px）深色输入框，`maxWidth: 680`
- **hover 呼吸感动效**：`scale(1.008)` + 阴影增强，`transition: 0.35s cubic-bezier(0.23,1,0.32,1)`
- 底部工具行：附件按钮（Paperclip）/ 模型选择器（ChevronDown 下拉）/ 麦克风 / 发送按钮
- 模型选择器：下拉列表展示 `AI_MODELS`（GPT-4o / Claude 3.5 / Gemini 1.5 / Flux Pro / Midjourney v6 / Sora）
- 发送：Enter 键或点击发送按钮，触发 `toast` 占位 + 跳转 `/project/new`

**HomeCardMenu（最近项目 ... 菜单）：**
- 触发按钮：`w-5 h-5 rounded-md`，无背景，仅 open 时微亮
- 菜单项：重命名 / 复制链接 / 删除（红色）
- 定位：`bottom: calc(100% + 8px); right: 0`（向上弹出）
- 毛玻璃背景：`backdropFilter: blur(20px)`
- 与 WorkspaceDashboard CardMenu 样式完全一致

---

### 4.4 WorkspaceDashboard（工作台）

**文件**：`client/src/pages/WorkspaceDashboard.tsx`

**数据模型：**
```typescript
interface WsProject {
  id: string;
  title: string;
  cover: string | null;  // CDN URL 或 null（显示空封面占位）
  updatedAt: string;
  nodeCount: number;
}
```

**初始数据（INITIAL_PROJECTS，与 workspace-data.ts 的 PROJECTS 不同）：**
- p1: 跑鞋产品页（POSTER_2 封面，8 节点）
- p2: 咖啡品牌系统（BRAND_KIT 封面，12 节点）
- p3: 时尚大片海报（POSTER_1 封面，5 节点）
- p4: 科技产品广告（SOCIAL_AD 封面，7 节点）
- p5: 登山品牌视频（null 封面，3 节点）

**功能：**
- 项目卡片网格（4 列）
- **双击**卡片：跳转 `/project/:id`
- **单击**卡片：选中（checkbox 出现）
- **内联重命名**：CardMenu → 重命名，输入框替换标题，Enter/Blur 确认
- **CardMenu（... 菜单）**：重命名 / 副本 / 删除
  - 触发按钮：`w-5 h-5 rounded-md`，与首页 HomeCardMenu 完全一致
  - 菜单定位：`bottom: calc(100% + 8px); right: 0`
- **批量删除**：鼠标框选多个卡片 → DeleteConfirmDialog 二次确认
- **创建项目卡**：`CreateProjectCard` + `CoverPickerDialog`（选封面）
- **toast 反馈**：重命名 / 复制 / 删除操作均有 sonner toast

---

### 4.5 InfiniteCanvas（画布编辑器）

**文件**：`client/src/components/canvas/InfiniteCanvas.tsx`（1653 行）

**导出结构：**
```tsx
// 公开导出：包裹 ReactFlowProvider
export default function InfiniteCanvas({ projectId = "p1" }: { projectId?: string }) {
  return (
    <ReactFlowProvider>
      <InnerCanvas projectId={projectId} />
    </ReactFlowProvider>
  );
}
```

**节点类型（nodeTypes）：**

| 类型 | 组件 | 说明 |
|------|------|------|
| `chat` | `ChatNodeComponent` | 对话节点，含消息列表 + 输入框 |
| `asset` | `AssetNodeComponent` | 图片素材节点（主要节点类型） |
| `prompt` | `PromptNodeComponent` | 提示词节点 |
| `text` | `TextNodeComponent` | 文本备注节点（多色背景） |

**边类型（edgeTypes）：**
- `tapnow`（TapnowEdge）：自定义贝塞尔曲线边，暗色 `rgba(60,60,80,0.45)`，亮色同色系

**初始节点布局：**
```
chat-1  (60, 80)   → asset-1 (460, 80)
                   → asset-2 (720, 80)
prompt-1 (460,420) → asset-3 (980, 80)
asset-1  → prompt-1
text-1   (780,420) 独立文本节点
asset-4  (980,420) 独立素材节点
```

**AssetNodeComponent 关键行为：**
- **单击**：`setShowPanel` 切换 + 派发 `asset-reference` CustomEvent（含 ctrlKey）
- **双击**：打开 `ImagePreviewModal` 全屏预览
- **右键**：派发 `node-contextmenu` CustomEvent → 显示 `NodeContextMenu`
- **选中时**：显示 `AssetFloatingToolbar`（顶部悬浮工具栏）
- **isEditing 状态**：叠加 15% 黑色半透明 mask（`rgba(0,0,0,0.15)`）

**NodeWrapper（所有节点的外层包装）：**
- 选中时：`box-shadow: 0 0 0 2px oklch(0.62 0.22 290)`（品牌紫色边框）
- Handle（连接点）：暗色模式白色，亮色模式深灰色
- 顶部工具栏：ModelSelector + 删除按钮（选中时显示）

**ImagePreviewModal（双击素材节点）：**
- 全屏遮罩（`rgba(0,0,0,0.88)`）
- 顶部半透明 bar（`rgba(255,255,255,0.10)`）：图片标题 + 下载 + 关闭按钮（深色图标）
- 图片 `object-contain` 展示

**AssetFloatingToolbar（选中素材节点时，节点正上方）：**
- 操作：预览（ZoomIn）/ 裁剪（Crop）/ 3D（Box）/ 擦除（Eraser）/ 调整（SlidersHorizontal）/ 移动（MoreHorizontal）/ 下载（Download）/ 全屏（Maximize2）
- 大部分操作触发 toast 占位

**BottomPromptBar（底部全局提示词输入框）：**
- 位置：`absolute bottom-4 left-1/2 -translate-x-1/2`，宽度 `min(680px, calc(100% - 48px))`
- 有引用时：品牌紫色边框 + 外发光（`0 0 0 3px oklch(0.62 0.22 290 / 0.12)`）
- **引用 chips**：单击素材节点注入引用（chip 显示素材名 + × 删除按钮）
- **Ctrl/Cmd + 单击**：多选引用（追加/取消）；再次单击同一素材：取消引用
- **Backspace**（空输入时）：删除最后一个引用
- **多于 1 个引用时**：显示"全部清除"按钮
- placeholder 文字随引用数量动态变化（0个/1个/多个三种状态）
- Enter 发送（Shift+Enter 换行），发送后清空所有引用

**AssetEditPromptBar（右键"编辑素材"后出现）：**
- 触发流程：右键 → "编辑素材" → `fitView({ nodes: [{ id: nodeId }], duration: 900, padding: 0.08 })` zoom in 推进动画 → 950ms 后显示编辑 bar
- 编辑 bar：底部 slide-up 动画，含素材引用 chip + 提示词输入框 + ModelSelector + 发送按钮
- 目标节点同时叠加 `isEditing: true` → 15% 黑色 mask（通过 `displayNodes` 注入）
- Esc / × / 发送 → 关闭并清除 mask

**NodeContextMenu（右键节点菜单）：**
- 菜单项：添加节点 / 添加素材 / 编辑素材 / 复制 / 粘贴 / 添加文本备注 / 删除节点（红色）
- 右键空白画布：**无菜单**（用户明确要求）
- 通过 `window.dispatchEvent(new CustomEvent("node-contextmenu", ...))` 传递坐标

**ZoomControlBar（左下角缩放控件）：**
- 位置：`absolute bottom: 80px, left: 16px`
- 样式：毛玻璃竖条（`backdropFilter: blur(12px)`，`borderRadius: 12px`，`padding: 4px`）
- 按钮（从上到下）：放大（Plus）/ 分隔线 / 缩小（Minus）/ 分隔线 / 居中（自定义 SVG：四角框 + 中心小方块，tooltip"居中显示"）/ 分隔线 / 锁定（Lock/Unlock，锁定时品牌紫色）

**MiniMap（右下角小地图）：**
- 视口高亮方框：品牌紫色边框（`oklch(0.62 0.22 290)`），通过 `.react-flow__minimap-mask` CSS 覆盖
- `zoomable` + `pannable`

**LassoEraser（C 键套索切割）：**
- 按住 C 键 + 拖拽：绘制矩形选区，切断选区内的所有连线边
- 松开 C 键退出切割模式

**BackButton（左上角返回按钮）：**
- 点击跳转 `/`（首页）

**TopLeftToolbar（左上角节点创建工具栏）：**
- 位置：`top: 12, left: 100`（避开返回按钮）
- 可添加：chat / asset / prompt / text 节点

**ReactFlow 配置：**
```tsx
<ReactFlow
  fitView
  fitViewOptions={{ padding: 0.15 }}
  minZoom={0.1}
  maxZoom={4}
  defaultEdgeOptions={{ type: "tapnow" }}
  selectNodesOnDrag={false}   // 节点选中后可直接拖动（不需要先点选）
  nodesDraggable={true}
  proOptions={{ hideAttribution: true }}
/>
```

---

## 五、设计系统（index.css）

### 5.1 当前 CSS 变量

**暗色模式（默认，`:root`）：**
- `--background`: `oklch(0.10 0.015 270)`（深蓝紫）
- `--foreground`: `oklch(0.93 0.008 270)`
- `--card`: `oklch(0.14 0.018 270)`
- `--primary`: `oklch(0.58 0.22 290)`（品牌紫）
- `--ring`: `oklch(0.58 0.22 290)`

**亮色模式（`html.light, .light`）：**
- `--background`: `oklch(0.955 0.004 255)`（冷灰白）
- `--foreground`: `oklch(0.22 0.018 255)`（深海军蓝板岩）
- 注意：AppShell 和 HomePage 亮色背景硬编码为 `#F5F5F5`（用户明确要求）

**自定义品牌 token（`@theme inline`）：**
- `--color-brand-purple`: `oklch(0.55 0.22 290)`
- `--color-brand-cyan`: `oklch(0.72 0.18 200)`
- `--color-surface-1/2/3`: 深蓝紫表面层级

**自定义 easing：**
- `--ease-out-snappy`: `cubic-bezier(0.23, 1, 0.32, 1)`
- `--ease-in-out-smooth`: `cubic-bezier(0.77, 0, 0.175, 1)`

**全局字体（当前实际值）：**
```css
html, body {
  font-family: 'DM Sans', system-ui, sans-serif;
}
```
> ⚠️ 注意：index.html 已引入 Inter Variable + JetBrains Mono，但 index.css 的 `font-family` 仍是 DM Sans，**待更新**（Figma DESIGN.md 规范应用任务尚未完成）。

**工具类：**
- `.gradient-brand`：紫→青渐变背景
- `.gradient-brand-text`：渐变文字（-webkit-background-clip）
- `.gradient-border`：渐变边框（伪元素 mask 技巧）
- `.card-hover`：卡片 hover 上浮 + 紫色阴影
- `.animate-fade-up`：fade-up 入场动画（0.3s）
- `.font-mono-dim`：JetBrains Mono 11px 青色（用于尺寸/数字标注）
- `.skeleton`：shimmer 骨架屏动画
- `.pulse-glow`：品牌紫色外发光脉冲

**MiniMap CSS 覆盖（index.css 末尾）：**
```css
.react-flow__minimap-mask {
  fill: transparent !important;
  stroke: oklch(0.62 0.22 290) !important;
  stroke-width: 3 !important;
}
```

### 5.2 Figma DESIGN.md 规范（待应用）

> 这是**待完成任务**：将以下规范应用到 index.css 和各页面组件

**颜色：**
- `primary: #000000`，`on-primary: #ffffff`
- `canvas: #ffffff`，`ink: #000000`，`surface-soft: #f7f7f5`
- 彩色 block：`lime #dceeb1`，`lilac #c5b0f4`，`cream #f4ecd6`，`pink #efd4d4`，`mint #c8e6cd`，`coral #f3c9b6`，`navy #1f1d3d`
- `accent-magenta: #ff3d8b`，`semantic-success: #1ea64a`
- `hairline: #e6e6e6`，`hairline-soft: #f1f1f1`

**字体 utility class（Inter Variable）：**

| class | size | weight | lh | ls |
|-------|------|--------|----|----|
| `.type-display-xl` | 86px | 340 | 1.00 | -1.72px |
| `.type-display-lg` | 64px | 340 | 1.10 | -0.96px |
| `.type-headline` | 26px | 540 | 1.35 | -0.26px |
| `.type-subhead` | 26px | 340 | 1.35 | -0.26px |
| `.type-card-title` | 24px | 700 | 1.45 | — |
| `.type-body-lg` | 20px | 330 | 1.40 | -0.14px |
| `.type-body` | 18px | 320 | 1.45 | -0.26px |
| `.type-body-sm` | 16px | 330 | 1.45 | -0.14px |
| `.type-button` | 20px | 480 | 1.40 | -0.10px |
| `.type-eyebrow` | 18px JetBrains Mono | 400 | — | +0.54px |
| `.type-caption` | 12px JetBrains Mono | 400 | — | +0.60px |

**圆角：**
- `xs: 2px`，`sm: 6px`，`md: 8px`，`lg: 24px`，`xl: 32px`，`pill: 50px`

**间距：**
- `hair: 1px`，`xxs: 4px`，`xs: 8px`，`sm: 12px`，`md: 16px`，`lg: 24px`，`xl: 32px`，`xxl: 48px`，`section: 96px`

---

## 六、ThemeContext 实现

**文件**：`client/src/contexts/ThemeContext.tsx`

```typescript
export type ThemeMode = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

// useTheme() 返回：
{
  mode: ThemeMode;               // 用户选择的模式（含 system）
  resolvedTheme: ResolvedTheme;  // 实际渲染的主题（dark 或 light）
  setMode: (mode: ThemeMode) => void;
  theme: ResolvedTheme;          // legacy 别名，等同 resolvedTheme
  toggleTheme?: () => void;      // 在 dark/light 间切换
  switchable: boolean;           // 是否允许切换（App.tsx 传 true）
}
```

**主题切换机制：**
- `localStorage` 持久化 `theme-mode`
- `resolvedTheme === "dark"` → `document.documentElement.classList.add("dark")`
- `resolvedTheme === "light"` → `document.documentElement.classList.add("light")`
- 监听 `prefers-color-scheme` 媒体查询（system 模式时生效）

---

## 七、Mock 数据（workspace-data.ts）

**文件**：`client/src/lib/workspace-data.ts`

**AI_MODELS（6 个）：**
- GPT-4o（OpenAI，绿色 `oklch(0.72 0.18 160)`）
- Claude 3.5（Anthropic，橙色 `oklch(0.78 0.18 50)`）
- Gemini 1.5（Google，蓝色 `oklch(0.72 0.18 240)`）
- Flux Pro（Black Forest，紫色 `oklch(0.78 0.18 290)`）
- Midjourney v6（Midjourney，粉色 `oklch(0.80 0.18 330)`）
- Sora（OpenAI，青色 `oklch(0.72 0.18 200)`）

**CDN 图片 URL（已上传到 Manus CDN，永久有效）：**
```
POSTER_1  = https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-poster-1-DATcWhVcZRVivtUCucEHfs.webp
POSTER_2  = https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-poster-2-NTxjh66koAhnBAhhcjC89d.webp
BRAND_KIT = https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-brand-kit-V9KcLx992pZUUDT7GuBo2a.webp
SOCIAL_AD = https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-social-ad-RrSD9DQUDaqwSjKBeYF3Wy.webp
BG_GLOW   = https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/workspace-bg-glow-VcrGoRhdfcRLpcj7oX2BTa.webp
```

**GENERATED_ASSETS（4 个，用于画布节点）：**
- a1: 时尚大片海报（POSTER_1，720×960）
- a2: 跑鞋产品图（POSTER_2，720×960）
- a3: 咖啡品牌手册（BRAND_KIT，1440×1080）
- a4: 科技产品广告（SOCIAL_AD，720×960）

**PROJECTS（5 个）**：用于 HomePage 最近项目网格（与 WorkspaceDashboard 的 INITIAL_PROJECTS 不同，后者有 cover 和 nodeCount 字段）

---

## 八、用户明确要求（禁止违反）

1. **侧边栏不要收起/展开开关**（AppShell 固定 200px）
2. **暗色模式为默认主题**（ThemeProvider defaultTheme="dark"）
3. **亮色模式背景统一 `#F5F5F5`**（AppShell 和 HomePage 硬编码）
4. **不修改 `server/` 目录**（server/ 是占位兼容目录，禁止修改）
5. **静态资源必须用 `manus-upload-file --webdev` 上传**，不能放 `client/public/` 或 `client/src/assets/`
6. **右键空白画布不显示菜单**（已实现，禁止改回）

---

## 九、已废弃的方案（避免重复提出）

| 方案 | 废弃原因 |
|------|---------|
| 节点编辑输入框吸附节点正下方（useViewport 计算坐标） | 用户不满意，rollback 到 2559a3b6 |
| 全屏遮罩编辑模式（AssetEditModal，全屏黑色遮罩） | 改为画布内 zoom in + 底部 bar 方案 |
| 密码门控（PasswordGate 接入 App.tsx） | 用户要求移除，但文件保留备用 |
| 右侧面板（RightPanel，含图层/设置/参考） | 用户要求移除，画布全宽 |
| 旧版 56px 图标侧边栏 | 改为 200px 宽导航栏 |
| 移除节点编辑功能（d290a698） | 已 rollback，功能恢复 |

---

## 十、检查点历史

| 版本 ID | 说明 |
|---------|------|
| `d556cb63` | 初始项目创建 |
| `cf356e2f` | Ctrl 多选引用 + chip 单独删除 |
| `17f95c43` | 左下角缩放控件毛玻璃竖条 bar |
| `987ead48` | 居中图标替换为四角框+中心小方块 SVG |
| `2ca56a77` | 移除右侧面板，画布全宽 |
| `e3046adc` | 侧边栏重构为宽导航栏（200px） |
| `aa8b232b` | 编辑素材：zoom in + 15% mask + 底部输入框 |
| `2559a3b6` | 编辑输入框水平居中（此版本为 rollback 目标） |
| `de94e39f` | 添加密码门控 |
| `547ca03d` | 移除密码门控，恢复直接访问 |
| **`2f4c7019`** | **当前版本**：品牌名称全面更新为 artx |

---

## 十一、待完成任务

- [ ] **按 Figma DESIGN.md 规范更新字体和颜色**（最高优先级）
  - 将 `index.css` 中 `font-family` 从 DM Sans 改为 `'Inter', system-ui, sans-serif`
  - 添加 DESIGN.md 颜色 CSS 变量（block 系列、hairline、accent-magenta 等）
  - 添加字体 utility class（`.type-display-xl/lg`、`.type-headline`、`.type-body` 等）
  - 添加圆角 CSS 变量（`--radius-xs: 2px` 等）
  - 更新各页面组件文字颜色和字体 class 应用
  - 保存检查点

- [ ] **NotFound 页面适配 artx 设计系统**（低优先级）
  - 当前 404 页使用模板默认样式（浅色渐变背景，英文文案），未适配暗/亮主题

---

## 十二、遗留文件说明（不要误用）

| 文件 | 状态 | 说明 |
|------|------|------|
| `client/src/pages/Home.tsx` | 模板残留 | 未路由，不是 HomePage，可忽略 |
| `client/src/pages/PasswordGate.tsx` | 备用保留 | 已从 App.tsx 移除，文件保留，密码 bkeel |
| `client/src/components/workspace/Sidebar.tsx` | 旧版残留 | 已被 AppShell 替代，含旧品牌名"Lovart AI" |
| `client/src/components/workspace/RightPanel.tsx` | 旧版残留 | 已从 Workspace 移除 |
| `client/src/components/workspace/ProjectHeader.tsx` | 旧版残留 | 未使用 |
| `client/src/components/canvas/CanvasNodes.tsx` | 旧版残留 | 已被 InfiniteCanvas.tsx 内联替代 |
| `client/src/components/ManusDialog.tsx` | 未使用 | Manus OAuth 弹窗，当前未接入 |
