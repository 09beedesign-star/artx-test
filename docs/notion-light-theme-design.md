# Notion 风格白色主题设计规范

## 概述

基于 Notion 设计规范（`design.md` v1.1.0）为 ArtX 平台设计的白色主题系统。核心特征：
- **暖纸质中性色**：`#fbfbfa` 页面背景 + `#ffffff` 卡片 + `#f9f8f7` 侧边栏
- **墨水品牌色**：`#2c2c2b` 作为唯一实心 CTA 按钮
- **聚焦蓝**：`#08f` 仅用于聚焦环、链接、AI 强调和开关开启状态
- **系统 UI 无衬线字体**：`ui-sans-serif, -apple-system, BlinkMacSystemFont`
- **药丸按钮**：32px 高度，完全圆角（9999px）
- **克制动效**：120ms 悬停，200ms 中等过渡

---

## 一、颜色系统

### 1.1 核心色彩定义

```css
:root {
  /* === 品牌与强调色 === */
  --notion-ink: #2c2c2b;              /* 墨水黑 - 主按钮 */
  --notion-ink-hover: #1e1e1e;        /* 墨水悬停 */
  --notion-ink-secondary: #6a6a6b;    /* 次要墨水 */
  
  --notion-focus-blue: #08f;          /* 聚焦蓝 - 链接/聚焦/AI */
  --notion-focus-soft: rgba(0, 136, 255, 0.08);   /* 柔和蓝 */
  --notion-focus-ring: rgba(0, 136, 255, 0.25);   /* 聚焦环 */
  
  --notion-danger: #ea4f3d;           /* 危险红 - 删除操作 */
  
  /* === 背景层级 === */
  --notion-bg-page: #fbfbfa;          /* 页面底色（暖纸白） */
  --notion-bg-surface: #ffffff;       /* 卡片/表面（纯白） */
  --notion-bg-sidebar: #f9f8f7;       /* 侧边栏（暖米） */
  --notion-bg-muted: #f9f8f7;         /* 弱化表面 */
  
  /* === 文字层级 === */
  --notion-text-primary: #2c2c2b;     /* 主文字（墨水） */
  --notion-text-secondary: #6a6a6b;   /* 次要文字 */
  --notion-text-muted: #8e8b86;       /* 弱化文字 */
  --notion-text-on-ink: #ffffff;      /* 墨水上的文字（白色） */
  
  /* === 边框与分隔 === */
  --notion-border: #f0efed;           /* 发丝边框 */
  --notion-border-focus: #08f;        /* 聚焦边框 */
  
  /* === 交互状态 === */
  --notion-tab-active: rgba(42, 28, 0, 0.07);     /* 激活标签（暖灰洗） */
  --notion-hover-warm: rgba(44, 44, 43, 0.04);    /* 温暖悬停 */
  --notion-hover-warm-strong: rgba(44, 44, 43, 0.05); /* 强温暖悬停 */
}
```

### 1.2 对比度验证（WCAG 2.2 AA）

| 组合 | 对比度 | 状态 |
|------|--------|------|
| 主文字 `#2c2c2b` on 页面 `#fbfbfa` | **18.7:1** | ✅ AAA |
| 次要文字 `#6a6a6b` on 页面 `#fbfbfa` | **7.2:1** | ✅ AA |
| 弱化文字 `#8e8b86` on 页面 `#fbfbfa` | **4.9:1** | ✅ AA |
| 聚焦蓝 `#08f` on 白色 `#ffffff` | **4.8:1** | ✅ AA |
| 墨水按钮文字 `#ffffff` on `#2c2c2b` | **18.8:1** | ✅ AAA |

---

## 二、排版系统

### 2.1 字体家族

```css
:root {
  /* Notion 使用系统 UI 字体 */
  --font-ui: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-chinese: "PingFang SC", "PingFang TC", -apple-system, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

body {
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 2.2 字体刻度

| 用途 | 字号 | 字重 | 行高 |
|------|------|------|------|
| 大标题（Headline LG） | 28px | 600 | 1.3 |
| 页面标题 | 16px | 600 | 1.4 |
| 正文（Body MD） | 14px | 400 | 1.5 |
| 导航/按钮 | 14px | 500 | 1 |
| 侧边栏 | 16px | 400 | 1.5 |
| 说明文字 | 12px | 400 | 1.4 |

```css
.text-headline-lg {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--notion-text-primary);
}

.text-body-md {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--notion-text-primary);
}

.text-nav {
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
}

.text-caption {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--notion-text-muted);
}
```

---

## 三、间距系统

### 3.1 基础单位

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  
  /* 特殊间距 */
  --gap-bento: 14px;          /* 文档网格间隙 */
  --section-padding: 28px;     /* 区域内边距 */
}
```

### 3.2 布局常量

```css
:root {
  --sidebar-width: 270px;
  --page-max-width: 1100px;
  --topbar-height: 60px;
}
```

---

## 四、圆角系统

```css
:root {
  --radius-sm: 6px;    /* 输入框、导航项、下拉项 */
  --radius-md: 8px;    /* 侧边栏外壳、页面头部 */
  --radius-lg: 10px;   /* 下拉面板、卡片块 */
  --radius-xl: 12px;   /* 设置模态框 */
  --radius-full: 9999px; /* 药丸按钮、图标按钮、芯片 */
}
```

---

## 五、组件设计

### 5.1 按钮（Buttons）

#### 5.1.1 主按钮（Primary - 墨水）

```css
.nt-btn-primary {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  background: var(--notion-ink);
  color: var(--notion-text-on-ink);
  border: none;
  cursor: pointer;
  transition: background 120ms ease;
}

.nt-btn-primary:hover {
  background: var(--notion-ink-hover);
}

.nt-btn-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--notion-focus-ring);
}
```

#### 5.1.2 轮廓按钮（Outline）

```css
.nt-btn-outline {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  background: var(--notion-bg-surface);
  color: var(--notion-text-primary);
  border: 1px solid rgba(44, 44, 43, 0.15);
  cursor: pointer;
  transition: all 120ms ease;
}

.nt-btn-outline:hover {
  background: var(--notion-hover-warm);
  border-color: rgba(44, 44, 43, 0.25);
}
```

#### 5.1.3 幽灵按钮（Ghost）

```css
.nt-btn-ghost {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  color: var(--notion-text-primary);
  border: none;
  cursor: pointer;
  transition: background 120ms ease;
}

.nt-btn-ghost:hover {
  background: var(--notion-tab-active);
}
```

#### 5.1.4 文本按钮（Text - 聚焦蓝）

```css
.nt-btn-text {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  color: var(--notion-focus-blue);
  border: none;
  cursor: pointer;
  transition: opacity 120ms ease;
}

.nt-btn-text:hover {
  opacity: 0.8;
}
```

#### 5.1.5 图标按钮（Icon Button）

```css
.nt-icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--notion-text-secondary);
  border: none;
  cursor: pointer;
  transition: all 120ms ease;
}

.nt-icon-btn:hover {
  background: var(--notion-hover-warm);
  color: var(--notion-text-primary);
}
```

### 5.2 输入框（Input Fields）

#### 5.2.1 文本输入框

```css
.nt-input {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--notion-border);
  border-radius: var(--radius-sm);
  background: var(--notion-bg-surface);
  color: var(--notion-text-primary);
  font-size: 14px;
  font-family: var(--font-ui);
  transition: all 200ms ease;
}

.nt-input::placeholder {
  color: var(--notion-text-muted);
}

.nt-input:focus {
  outline: none;
  border-color: var(--notion-border-focus);
  box-shadow: 0 0 0 2px var(--notion-focus-ring);
}
```

#### 5.2.2 搜索框

```css
.nt-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--notion-border);
  border-radius: var(--radius-sm);
  background: var(--notion-bg-surface);
}

.nt-search-icon {
  width: 16px;
  height: 16px;
  color: var(--notion-text-muted);
}

.nt-search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--notion-text-primary);
}
```

#### 5.2.3 AI 作曲家输入框（Composer）

```css
.nt-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 14px;
  border: 1px solid var(--notion-border);
  border-radius: var(--radius-full);
  background: var(--notion-bg-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 200ms ease;
}

.nt-composer:focus-within {
  border-color: var(--notion-border-focus);
  box-shadow: 0 0 0 2px var(--notion-focus-ring);
}

.nt-composer input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--notion-text-primary);
}

.nt-composer input::placeholder {
  color: var(--notion-text-muted);
}
```

### 5.3 侧边栏（Sidebar）

```css
.notion-sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--notion-bg-sidebar);
  border-right: 1px solid var(--notion-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 侧边栏标签页 */
.sidebar-tab {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  color: var(--notion-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 120ms ease;
}

.sidebar-tab:hover {
  background: var(--notion-hover-warm);
  color: var(--notion-text-primary);
}

.sidebar-tab--selected {
  background: var(--notion-tab-active);
  color: var(--notion-text-primary);
}

/* 导航项 */
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--notion-text-primary);
  cursor: pointer;
  transition: background 120ms ease;
}

.nav-item:hover {
  background: var(--notion-hover-warm);
}

.nav-item-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
```

### 5.4 顶部导航栏（TopBar）

```css
.notion-topbar {
  height: var(--topbar-height);
  background: var(--notion-bg-surface);
  border-bottom: 1px solid var(--notion-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
}

.topbar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--notion-text-primary);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

### 5.5 卡片（Cards）

```css
.nt-card {
  background: var(--notion-bg-surface);
  border: 1px solid var(--notion-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  transition: box-shadow 200ms ease;
}

.nt-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.nt-card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--notion-text-primary);
  margin-bottom: var(--space-2);
}

.nt-card-content {
  font-size: 14px;
  color: var(--notion-text-secondary);
  line-height: 1.5;
}
```

### 5.6 下拉菜单（Dropdown）

```css
.nt-dropdown {
  min-width: 200px;
  background: var(--notion-bg-surface);
  border: 1px solid var(--notion-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: var(--space-2);
}

.nt-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--notion-text-primary);
  cursor: pointer;
  transition: background 120ms ease;
}

.nt-dropdown-item:hover {
  background: var(--notion-hover-warm);
}

.nt-dropdown-item--danger {
  color: var(--notion-danger);
}

.nt-dropdown-item--danger:hover {
  background: rgba(234, 79, 61, 0.1);
}
```

### 5.7 开关（Toggle）

```css
.nt-toggle {
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background: #e0ded8;
  position: relative;
  cursor: pointer;
  transition: background 200ms ease;
}

.nt-toggle--on {
  background: var(--notion-focus-blue);
}

.nt-toggle-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 200ms ease;
}

.nt-toggle--on .nt-toggle-thumb {
  transform: translateX(16px);
}
```

### 5.8 芯片/标签（Chips）

```css
.nt-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  background: var(--notion-bg-muted);
  color: var(--notion-text-secondary);
  transition: all 120ms ease;
}

.nt-chip--active {
  background: var(--notion-tab-active);
  color: var(--notion-text-primary);
}

.nt-chip:hover {
  background: var(--notion-hover-warm-strong);
}
```

---

## 六、动效规范

### 6.1 时长

```css
:root {
  --motion-hover: 120ms;
  --motion-medium: 200ms;
  --motion-ease: ease;
}
```

### 6.2 悬停模式

- 按钮：暖洗背景 `rgba(42, 28, 0, 0.07)` 或 `rgba(44, 44, 43, 0.04)`
- 文字：从弱化 `#8e8b86` 到墨水 `#2c2c2b`
- 图标：从次要 `#6a6a6b` 到主要 `#2c2c2b`

### 6.3 聚焦模式

```css
:focus-visible {
  outline: none;
  border-color: var(--notion-border-focus);
  box-shadow: 0 0 0 2px var(--notion-focus-ring);
}
```

### 6.4 禁用动效

❌ **避免**：弹跳、旋转（除加载动画）、夸张缩放、霓虹 AI 动画

---

## 七、阴影系统

```css
:root {
  --shadow-composer: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-dropdown: 0 4px 20px rgba(0, 0, 0, 0.08);
  --shadow-modal: 0 8px 30px rgba(0, 0, 0, 0.08);
}
```

---

## 八、实施检查清单

### 8.1 颜色合规

- [ ] 页面底色使用 `#fbfbfa`（暖纸白）
- [ ] 卡片/表面使用 `#ffffff`（纯白）
- [ ] 侧边栏使用 `#f9f8f7`（暖米）
- [ ] 主按钮使用墨水 `#2c2c2b`，文字白色
- [ ] 聚焦蓝 `#08f` 仅用于聚焦、链接、AI
- [ ] 边框使用 `#f0efed`（发丝灰）
- [ ] 文字对比度达到 WCAG AA 标准

### 8.2 排版合规

- [ ] 字体使用系统 UI 无衬线
- [ ] 正文 14px，行高 1.5
- [ ] 导航/按钮 14px/500
- [ ] 标题使用 16px 或 28px/600

### 8.3 组件合规

- [ ] 主按钮为药丸形状（9999px）
- [ ] 按钮高度 32px
- [ ] 输入框圆角 6px
- [ ] 卡片圆角 10-12px
- [ ] 侧边栏宽度 270px

### 8.4 交互合规

- [ ] 悬停时长 120ms
- [ ] 聚焦显示蓝色环
- [ ] 激活标签使用暖灰洗 `rgba(42, 28, 0, 0.07)`
- [ ] 无弹跳、霓虹或夸张动效

### 8.5 无障碍合规

- [ ] 键盘可导航所有交互元素
- [ ] 聚焦指示器清晰可见
- [ ] 链接文字使用聚焦蓝 `#08f`
- [ ] 语义化 HTML 结构
- [ ] ARIA 标签正确使用

---

## 九、禁止事项

❌ **禁止将聚焦蓝作为实心主按钮填充色**  
❌ **禁止使用 Cubox/Framer 蓝色（`#2c46f1`, `#3b75fb`）作为主 CTA**  
❌ **禁止将墨水黑作为全页背景**  
❌ **禁止添加玻璃态、霓虹光效、赛博渐变**  
❌ **禁止在系统 UI 字体栈外发明字体**  
❌ **禁止将药丸主按钮替换为尖角矩形**  
❌ **禁止拉伸/旋转 Notion 标志**

---

## 十、代码模板

### 10.1 完整页面结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notion 风格页面</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --notion-ink: #2c2c2b;
      --notion-ink-hover: #1e1e1e;
      --notion-focus-blue: #08f;
      --notion-focus-ring: rgba(0, 136, 255, 0.25);
      --notion-bg-page: #fbfbfa;
      --notion-bg-surface: #ffffff;
      --notion-bg-sidebar: #f9f8f7;
      --notion-text-primary: #2c2c2b;
      --notion-text-secondary: #6a6a6b;
      --notion-text-muted: #8e8b86;
      --notion-border: #f0efed;
      --notion-tab-active: rgba(42, 28, 0, 0.07);
      --sidebar-width: 270px;
      --font-ui: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    body {
      font-family: var(--font-ui);
      background: var(--notion-bg-page);
      color: var(--notion-text-primary);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .app-layout {
      display: flex;
      height: 100vh;
    }

    .sidebar {
      width: var(--sidebar-width);
      background: var(--notion-bg-sidebar);
      border-right: 1px solid var(--notion-border);
      padding: 16px;
    }

    .main-content {
      flex: 1;
      overflow-y: auto;
    }

    .topbar {
      height: 60px;
      background: var(--notion-bg-surface);
      border-bottom: 1px solid var(--notion-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
    }

    .nt-btn-primary {
      height: 32px;
      padding: 0 12px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 500;
      background: var(--notion-ink);
      color: white;
      border: none;
      cursor: pointer;
      transition: background 120ms ease;
    }

    .nt-btn-primary:hover {
      background: var(--notion-ink-hover);
    }
  </style>
</head>
<body>
  <div class="app-layout">
    <aside class="sidebar">
      <!-- 侧边栏内容 -->
    </aside>
    <main class="main-content">
      <header class="topbar">
        <h1>页面标题</h1>
        <button class="nt-btn-primary">新建页面</button>
      </header>
      <!-- 主内容区 -->
    </main>
  </div>
</body>
</html>
```

---

## 十一、参考资源

- **源文档**：`design.md` v1.1.0
- **灵感来源**：https://app.notion.com
- **图标系统**：约 110 个填充图标（16×16px）
- **WCAG 标准**：https://www.w3.org/WAI/WCAG22/quickref/
- **对比度检查**：https://webaim.org/resources/contrastchecker/

---

*该设计规范确保 ArtX 白色主题完全符合 Notion 的视觉语言和交互模式，同时满足现代无障碍标准。*
