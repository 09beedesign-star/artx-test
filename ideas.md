# AI 创意工作台 设计构思

## 设计方向一
<response>
<text>
**Design Movement**: 新黑暗主义 × 玻璃态（Glassmorphism Dark）

**Core Principles**:
- 深邃的宇宙黑底色，配合半透明磨砂玻璃卡片，制造层次感
- 紫色→青色渐变作为品牌主色，贯穿所有交互高亮
- 三栏式工作台布局：左侧导航、中央画布、右侧属性面板
- 信息密度高但不拥挤，通过空间节奏控制视觉呼吸

**Color Philosophy**:
- 背景：oklch(0.10 0.02 270) 深蓝黑
- 卡片：oklch(0.15 0.02 270 / 0.8) 半透明
- 主色调：oklch(0.55 0.25 290) 紫色
- 强调渐变：from-purple-600 to-cyan-500
- 文字：oklch(0.92 0.01 270) 冷白

**Layout Paradigm**:
- 固定三栏：左侧 240px 导航 + 中央弹性 + 右侧 280px 属性面板
- 顶部全宽导航栏 48px
- 中央区域分为上方画廊网格 + 下方对话输入条

**Signature Elements**:
- 渐变光晕背景（紫色/青色模糊光斑）
- 卡片左上角彩色类型标签（Image/Video/Brand）
- AI 思考步骤进度条动画

**Interaction Philosophy**:
- 悬停时卡片轻微上浮 + 边框发光
- 侧边栏菜单展开/收起带滑动动画
- 生成按钮按下有脉冲扩散效果

**Animation**:
- 卡片入场：opacity 0→1 + translateY 8px→0，stagger 50ms
- 侧边栏折叠：height 动画 200ms ease-out
- 加载状态：渐变色旋转边框
- 按钮激活：scale 0.97，160ms ease-out

**Typography System**:
- 标题：DM Sans 700，冷白色
- 正文：DM Sans 400，灰白
- 标签/代码：JetBrains Mono，青色
</text>
<probability>0.08</probability>
</response>

## 设计方向二
<response>
<text>
**Design Movement**: 极简黑白主义 × 编辑排版风

**Core Principles**:
- 近乎纯黑背景，强调内容本身而非装饰
- 高对比度文字层级，用字重和尺寸建立视觉秩序
- 极少颜色，仅用单一强调色（琥珀/金色）点缀关键操作
- 网格对齐严格，每个元素都有明确的视觉重量

**Color Philosophy**:
- 背景：oklch(0.08 0 0) 纯黑
- 卡片：oklch(0.12 0 0) 深灰
- 强调色：oklch(0.75 0.18 85) 琥珀金
- 文字：oklch(0.95 0 0) 纯白

**Layout Paradigm**:
- 左侧超窄导航 64px（仅图标）+ 中央主区域 + 右侧可收起面板
- 顶部导航极简，仅品牌名 + 搜索 + 用户信息

**Signature Elements**:
- 细线分隔符（1px 白色 10% 透明度）
- 单色图标系统
- 数字标注（尺寸、数量）用等宽字体

**Interaction Philosophy**:
- 点击即响应，无多余动画
- 悬停状态仅改变背景色，不做位移

**Animation**:
- 极简：仅 opacity 过渡，100-150ms
- 无位移动画

**Typography System**:
- 标题：Syne 800
- 正文：Space Grotesk 400/500
</text>
<probability>0.06</probability>
</response>

## 设计方向三（选定）
<response>
<text>
**Design Movement**: 新拟物暗黑 × 创意工作室风（Neo-Studio Dark）

**Core Principles**:
- 深色背景带有微妙的蓝紫色调，营造专业创意工作室氛围
- 卡片使用轻微的内阴影 + 外发光，制造立体感而非平面感
- 渐变色作为品牌语言，从紫色到青色，象征创意流动
- 三栏工作台布局，左侧可折叠，右侧属性面板，中央为主画布

**Color Philosophy**:
- 主背景：oklch(0.11 0.015 270) 深蓝紫黑
- 侧边栏：oklch(0.13 0.018 270) 略浅
- 卡片：oklch(0.16 0.02 270) 带蓝紫调的深灰
- 主色：oklch(0.58 0.22 290) 品牌紫
- 渐变：紫色(#7c3aed) → 青色(#06b6d4)
- 文字主：oklch(0.93 0.008 270) 冷白
- 文字次：oklch(0.60 0.01 270) 中灰

**Layout Paradigm**:
- 全屏三栏：左侧 220px 固定导航 + 中央弹性主区 + 右侧 260px 属性面板
- 顶部 52px 全局导航栏
- 中央区域：上方为生成结果画廊（网格/流式），下方为 AI 对话输入区
- 右侧面板：层级管理 + 生成参数 + 参考资产

**Signature Elements**:
- 渐变发光边框（hover 时卡片边框变为紫→青渐变）
- 左侧导航项目激活状态：左侧 3px 紫色竖条 + 背景轻微高亮
- AI 生成步骤：带动画的步骤指示器（Analyzing → Searching → Generating）

**Interaction Philosophy**:
- 卡片悬停：translateY(-2px) + 边框渐变发光，180ms ease-out
- 按钮按下：scale(0.97)，160ms
- 侧边栏折叠：width 动画 250ms cubic-bezier(0.23,1,0.32,1)
- 生成进行中：脉冲动画 + 流动渐变边框

**Animation**:
- 页面初始：卡片从下方 stagger 入场（translateY 12px → 0，opacity 0→1）
- 生成结果出现：scale(0.95)→1 + opacity 0→1，200ms
- 侧边栏菜单展开：max-height 动画，200ms ease-out
- 加载骨架屏：shimmer 渐变动画

**Typography System**:
- 品牌/大标题：DM Sans 700-800，冷白
- 导航/标签：DM Sans 500，中灰
- 正文/描述：DM Sans 400，浅灰
- 数字/尺寸标注：JetBrains Mono 400，青色
- 字号体系：12/13/14/16/18/24/32px
</text>
<probability>0.09</probability>
</response>

## 选定方向：Neo-Studio Dark（方向三）

采用**新拟物暗黑 × 创意工作室风**设计哲学，以深蓝紫黑为主色调，紫→青渐变为品牌语言，三栏式工作台布局，打造专业 AI 创意工作台体验。
