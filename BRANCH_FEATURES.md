# 分支功能与路径记录

更新日期：2026-05-30

## 当前分支状态

| 分支 | 基准/来源 | 最新提交 | 状态 |
| --- | --- | --- | --- |
| `feature/interaction-framework` | `origin/main` | `796f3e0` + 本文档提交 | 当前目标分支，已推送到 `origin/feature/interaction-framework` |
| `main` / `origin/main` | 主线 | `c8356cc` | 主线基准 |
| `backup/pre-interaction-framework` | `origin/main` 同提交 | `c8356cc` | 交互框架改动前备份点 |
| `gh-pages` | 发布分支 | `ac78a95` | 静态站点发布分支，与 `main` 无共同 merge base |

## ArtX 分支映射

### 数字定义

| 定义数字 | 对象 | 路径/地址 | 说明 |
| --- | --- | --- | --- |
| `00` | GitHub 代码仓库 | `https://github.com/09beedesign-star/artx/tree/feature/interaction-framework` | ArtX 远程仓库的 `feature/interaction-framework` 分支 |
| `01` | ArtX 本地总分支 | `feature/interaction-framework` | 本地交互框架总分支 |
| `02` | ArtX 提示词输入框子分支 | `feature/interaction-framework-artx-input` | 提示词输入框功能子分支 |

### 发布默认规则

| 指令 | 默认目标 | 说明 |
| --- | --- | --- |
| `推送到测试环境` | `00` | 默认推送到测试约定目标 |
| `推送到正式环境` | `art X v1.0 go` 代码仓库 | 默认推送到正式发布仓库 |

### 本地总分支

| 项目 | 分支路径 | 说明 |
| --- | --- | --- |
| ArtX 本地总分支 | `feature/interaction-framework` | ArtX 交互框架总分支，下面的子分支从这里拆出 |

### 子分支

| 功能 | 子分支路径 | 创建/切换命令 | 说明 |
| --- | --- | --- | --- |
| 提示词输入框 | `feature/interaction-framework-artx-input` | `git switch -c feature/interaction-framework-artx-input` | ArtX 提示词输入框功能子分支 |

## `feature/interaction-framework`

### 功能范围

- 新增/补齐工作区交互框架：灵感、技能、素材、帮助等页面入口。
- 顶部与侧边工作区交互调整：搜索框移到顶部居中、工具栏重构、用户行和面板交互完善。
- 画布图片交互：本地拖拽导入、上传图片、图片节点拖拽/等比缩放、批量下载、复制粘贴、Alt 拖拽复制。
- 多选与分组交互：多选右键菜单、横向/竖向排列、分组容器移动/重命名/退出、禁用双击进入分组。
- 注释系统：Figma 风格注释气泡、绑定节点移动、折叠/展开/编辑/关闭/done。
- 创建画布工具：拖拽绘制 canvasFrame、尺寸弹窗、预设比例、背景色选择、尺寸调整、历史记录回退。
- 几何形工具：几何形二级菜单、拖拽创建、锚点编辑、空白点击退出编辑、缩放坐标修复。
- 文字工具：完整文字工具面板、描边、hover 外选框、工具自动切换、快捷键支持。
- 历史记录/撤销修复：画布创建、尺寸调整、图片缩放等支持 Ctrl/Cmd+Z，修复 undo 被节点变化覆盖的问题。

### 主要路径

| 路径 | 类型 | 对应功能 |
| --- | --- | --- |
| `client/src/components/canvas/InfiniteCanvas.tsx` | 核心改动 | 画布交互、图片节点、分组、多选、注释、工具栏、创建画布、几何形、文字工具、历史记录 |
| `client/src/components/canvas/TextToolbarCode.ts` | 新增 | 文字工具相关代码/占位入口 |
| `client/src/components/workspace/TopBar.tsx` | 修改 | 顶部搜索框、工具栏/入口交互 |
| `client/src/components/layout/AppShell.tsx` | 修改 | 应用外壳与工作区布局入口 |
| `client/src/App.tsx` | 修改 | 页面路由/入口注册 |
| `client/src/pages/InspirationPage.tsx` | 新增 | 灵感页面 |
| `client/src/pages/SkillsPage.tsx` | 新增 | 技能页面 |
| `client/src/pages/AssetsPage.tsx` | 新增 | 素材页面 |
| `client/src/pages/HelpPage.tsx` | 新增 | 帮助页面 |
| `client/src/pages/HomePage.tsx` | 修改 | 首页/工作区入口调整 |
| `client/src/pages/ProfilePage.tsx` | 修改 | 个人页小调整 |
| `client/src/pages/Workspace.tsx` | 修改 | 工作区页面接入 |
| `package.json` | 修改 | 新增/调整依赖 |
| `pnpm-lock.yaml` | 修改 | 依赖锁文件更新 |

### 提交摘要

该分支相对 `origin/main` 主要集中在 `InfiniteCanvas.tsx` 及工作区页面/布局文件。提交历史覆盖「交互框架页面补齐 -> 顶部搜索/工具栏 -> 图片/分组/注释 -> 创建画布/几何形 -> 文字工具增强 -> 当前画布交互与页面细节修复」这一整条画布编辑体验链路。

## `backup/pre-interaction-framework`

### 功能范围

- 作为交互框架大改前的备份分支。
- 当前与 `origin/main` 指向同一提交 `c8356cc`。

### 主要路径

| 路径 | 类型 | 对应功能 |
| --- | --- | --- |
| 无额外差异 | 备份点 | 可作为回退或对照基准 |

## `gh-pages`

### 功能范围

- 用于 Art X site 的静态部署。
- 与 `main` 没有共同 merge base，不作为功能开发分支对比。

### 主要路径

| 路径 | 类型 | 对应功能 |
| --- | --- | --- |
| 发布产物路径 | 部署 | 静态站点发布内容 |
