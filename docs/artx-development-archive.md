# ArtX 站点开发全过程档案

更新时间：2026-07-05

这份文档用于在重启任务、交给其他 Agent、准备灰度生产或正式发布时快速接手 ArtX 项目。它记录代码空间、GitHub 仓库、域名与环境、发布规则、核心能力、关键文件、开发阶段和代码修改追溯方式。

敏感信息规则：本文只记录变量名、配置位置和用途，不记录 AI token、支付密钥、OAuth secret、数据库密码、服务器密码或 SSH 私钥。

## 1. 代码空间与仓库

### 本地代码空间

- 本地路径：`/Users/ericbi/Documents/New project 2`
- 当前工作分支：`feature/interaction-framework`
- 当前本地 HEAD：`3b741aed488e50a8f60c84e9cdef71d2c05f71bc`
- 当前存在未跟踪本地目录：`.playwright-cli/`，不要默认提交。

### GitHub 远端

| remote | 地址 | 用途 |
| --- | --- | --- |
| `origin` | `https://github.com/09beedesign-star/artx.git` | 正式代码仓库来源，不要在普通测试发布时推送 |
| `test` | `https://github.com/09beedesign-star/artx-test.git` | 测试环境发布仓库 |

### 关键分支

| 分支 / 引用 | 用途 |
| --- | --- |
| `feature/interaction-framework` | 当前 ArtX 主要开发分支 |
| `test/feature/interaction-framework` | 固定测试环境发布分支 |
| `origin/feature/interaction-framework` | origin 上的同名功能分支，不能当作测试发布完成依据 |
| `backup/pre-interaction-framework` | 交互框架大改前备份点 |

注意：测试发布时必须使用显式远端引用 `refs/remotes/test/feature/interaction-framework`，避免本地同名分支 `refs/heads/test/feature/interaction-framework` 造成歧义。

## 2. 域名、环境与部署目标

### 当前测试环境

| 项目 | 地址 / 配置 |
| --- | --- |
| 测试前端 | `https://backstage.artxsd.com` |
| 测试后端 | `https://backstage.artxsd.com` |
| 测试发布 remote | `test` |
| 测试发布分支 | `feature/interaction-framework` |
| 版本检查 | `https://backstage.artxsd.com/deployment.json` |
| 后端健康检查 | `https://backstage.artxsd.com/api/health` |

测试环境只认 `test/feature/interaction-framework` 生成的 GitHub Pages artifact。不要把 `test/main`、手工 `gh-pages`、Manus 临时预览或本地 localhost 当成测试发布完成。

### 灰度生产环境计划

| 项目 | 信息 |
| --- | --- |
| 正式域名 | `www.artxsd.com` |
| 灰度前端域名 | `gray.artxsd.com` |
| 云服务器系统 | Debian 13.2 64bit |
| 服务器公网 IP | `43.161.241.133` |
| 前端部署位置 | 云服务器 |
| 后端部署状态 | 用户说明已部署在同一台云服务器，需要审计确认端口、进程方式、Nginx、HTTPS、uploads 和环境变量 |

灰度环境原则：

1. 先审计服务器现状，不假设空服务器。
2. 灰度环境用于准生产验证，不直接等同公开正式上线。
3. 建议 `gray.artxsd.com/` 提供前端，`gray.artxsd.com/api` 代理后端，`gray.artxsd.com/uploads` 代理或映射上传文件。
4. 如无必要，先不单独创建 `api-gray.artxsd.com`，减少跨域复杂度。
5. 灰度环境必须加访问保护，例如 Basic Auth、IP 白名单、账号白名单或邀请码。

灰度任务详细交接文档：`docs/gray-production-handoff.md`

## 3. 发布规则

### 测试环境发布

用户说“提交到测试环境”“发布到测试环境”时，固定流程：

```bash
git fetch test --prune
git merge --ff-only refs/remotes/test/feature/interaction-framework
pnpm run check
pnpm run build
git push test HEAD:feature/interaction-framework
```

发布后必须检查：

```bash
curl -fsSL "https://09beedesign-star.github.io/artx-test/deployment.json"
```

确认：

- `commitSha` 等于刚推送的测试分支 HEAD
- `branch` 是 `feature/interaction-framework`
- `backendUrl` 是 `https://backstage.artxsd.com`

### 灰度生产发布

建议流程：

```text
测试环境验证通过
-> 从 test/feature/interaction-framework 构建灰度版本
-> 上传前端产物到服务器灰度目录
-> 确认后端服务、环境变量和 uploads 可用
-> 配置 Nginx / HTTPS / 访问保护
-> 验证登录、支付、AI、MCP、API Key、uploads
-> 记录版本和回滚点
-> 灰度稳定后再切正式生产
```

### 正式生产发布

正式发布不是普通测试发布。必须先确认：

- 正式域名和 HTTPS 正常
- Google OAuth callback 更新
- 威富通支付 callback/notify 更新
- 后端 CORS / Cookie / session 域名正确
- AI token、支付密钥、数据库等只在后端
- 登录、积分、限流、额度、告警已生效
- 灰度环境已完成回归验证

## 4. 技术栈与关键配置

| 类别 | 内容 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Tailwind、Radix UI、Wouter、React Flow |
| 后端 | Node.js、Express、esbuild bundle |
| 包管理 | pnpm `10.4.1` |
| 测试/灰度后端托管 | 腾讯云，公网入口 `https://backstage.artxsd.com` |
| 静态前端托管 | GitHub Pages 测试环境，另有 `netlify.toml` 静态部署配置 |
| AI 图片 | BKEEL / GPT image2 / Nano banana、PicWish/佐糖能力 |
| 支付 | 威富通 Wallyt，后端环境变量配置 |
| 管理后台 | `/admin-prototype`，使用 `server/admin-store.ts` MVP 数据源 |

重要环境变量只记录变量名：

- AI：`AI_IMAGE_API_KEY`, `AI_IMAGE_BASE_URL`, `AI_IMAGE_MODEL`, `AI_TEXT_API_KEY`, `AI_TEXT_BASE_URL`, `AI_TEXT_MODEL`
- 前端 API：`VITE_API_BASE_URL`, `VITE_AUTH_API_BASE_URL`, `VITE_AI_API_BASE_URL`, `VITE_TEST_BACKEND_URL`
- OAuth：`OAUTH_PUBLIC_BASE_URL`, `OAUTH_FRONTEND_URL`, `OAUTH_STATE_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `META_CLIENT_ID`, `META_CLIENT_SECRET`, `WECHAT_CLIENT_ID`, `WECHAT_CLIENT_SECRET`
- 威富通：`WALLYT_DOMAIN_URL`, `WALLYT_MCH_ID`, `WALLYT_SIGNATURE_KEY`, `WALLYT_NOTIFY_URL`, `WALLYT_WX_APP_ID`
- 管理 / 数据：`ARTX_ADMIN_DATA_BACKEND`, `ARTX_DATA_DIR`, `ARTX_UPLOADS_DIR`, `DATABASE_URL`

## 5. 关键文件索引

| 文件 | 用途 |
| --- | --- |
| `AGENTS.md` | 项目级操作规则，尤其测试发布规则 |
| `MEMORY.md` | 项目内长期规则、踩坑、能力约束 |
| `docs/dev-log.md` | 开发日志，AI 任务 ID 和测试发布记录 |
| `docs/test-deployment.md` | 测试发布防错流程 |
| `docs/gray-production-handoff.md` | 灰度生产环境交接 |
| `docs/artx-development-archive.md` | 本总档案 |
| `BRANCH_FEATURES.md` | 早期分支功能与路径记录 |
| `client/src/components/canvas/InfiniteCanvas.tsx` | 画布核心：图片节点、画板、注释、输入框、Skill、AI 生成、下载、复制粘贴 |
| `client/src/lib/ai.ts` | 前端 AI API 客户端、后端路由、图片结果归一化 |
| `client/src/lib/workspace-data.ts` | 模型选项、工作台数据 |
| `client/src/pages/BillingPage.tsx` | 订阅、充值、升级、支付弹窗 |
| `client/src/pages/HomePage.tsx` | 首页、登录态入口、灵感推荐入口 |
| `client/src/pages/SkillsPage.tsx` | 技能商店 |
| `client/src/pages/InspirationPage.tsx` | 灵感选题 / 灵感推荐 |
| `server/index.ts` | Express 路由、AI、支付、admin、auth、uploads |
| `server/image-generation.ts` | 图片 AI / PicWish / BKEEL 能力 |
| `server/admin-store.ts` | 管理后台数据、订单、积分、AI 账单记录 |
| `server/wallyt-payment.ts` | 威富通支付签名、下单、查询、回调 |
| `server/local-image-storage.ts` | 生成图片落盘到 uploads |
| `vite.config.ts` | 本地开发 API mock/proxy、测试后端代理 |
| `render.yaml` | 旧 Render 配置留档；测试/灰度 API 不再指向 Render |
| `netlify.toml` | 静态前端构建与环境变量示例 |

## 6. 产品能力总览

### 画布与工作台

- 无限画布、React Flow 节点系统
- 图片节点、画板 canvasFrame、几何形、文字工具、注释点
- 拖拽导入、浏览器外部图片粘贴、复制粘贴、跨画布复制粘贴
- 图片下载、批量下载、画板导出，目标支持 PNG/JPG/PSD 等路径
- 画板移动、画板内部图片同步、画板大小调整不改变内部图片尺寸
- 全选快捷键：Windows `Ctrl+A`，Mac `Cmd+A`
- 撤销历史：画布创建、尺寸调整、几何形锚点、图片缩放等逐步补齐

### AI 图片能力

- 文生图
- Skill 生成图
- 智能背景
- 图片编辑 / 局部编辑
- 去背景 / 抠图
- 橡皮擦 / 对象擦除
- 扩图
- HD 高清
- 去水印
- OCR / 智能文案
- 图片生成失败状态、后台任务恢复、聊天备份找回

### 登录与访问控制

- 未登录用户只允许浏览灵感推荐等公开内容
- 工作台、AI 操作、二级能力入口应触发登录
- 登录态下首页右上角从“开始体验”切换为“进入工作台”
- Google 登录需要正式或灰度 HTTPS 域名和 OAuth callback

### 订阅、充值与升级

- `/billing` 会员中心
- 订阅服务：Lite / PRO / Studio，月付 / 季付 / 年付
- 充值：不同充值档位和自定义金额门槛
- 威富通支付二维码弹窗
- 支付成功确认弹窗
- 积分余额刷新与后台订单记录
- 后台 admin 订单、积分、AI 账单和支付异常告警

### 技能商店与灵感推荐

- 技能商店分类、快速加载到画布、Skill 选择器接入画布生成
- 灵感推荐 / 灵感选题瀑布流
- 灵感详情浮窗、提示词滚动和复制
- 未登录状态下技能商店可浏览，真正加载进画布前应触发登录

### MCP / API Key

- 左侧侧边栏规划 API Key 功能
- 弹窗展示 API key、Base URL、复制按钮
- 画布右侧顶部规划 MCP 工具，一键复制 MCP 代码
- 第三方 AI Agent 可通过 MCP/API 控制平台图片生成
- API Key 必须有用户归属、限额、可禁用、可审计

## 7. 开发阶段时间线

### 2026-05-22 至 2026-05-31：基础工作台与画布框架

- 初始化 ArtX 工作台、三栏布局、深色主题、AI 对话和素材画廊
- React Flow 无限画布、节点拖拽、连线、右键菜单、底部 AI 输入框
- 首页、工作台、项目画布、多页面路由
- 图片节点工具栏、图层管理、全屏预览、主题切换
- 顶部工具栏、注释系统、创建画布工具、几何形、文字工具
- 早期画布历史记录、Cmd/Ctrl+Z、图片缩放和画板尺寸调整

### 2026-06-01 至 2026-06-20：AI 接入与画布编辑强化

- 接入 AI 图片生成、图片上下文、异步任务、测试注册登录
- 图片擦除、OCR、提取文案、再次生成、图片调节、图层顺序
- 图片裁切、旋转、导入图片尺寸归一、浏览器图片粘贴
- 去背景 alpha、前景保护、AI 编辑保持主体比例
- 工作台自动保存、项目封面保存、画布消息持久化

### 2026-06-21 至 2026-06-24：智能背景、PicWish、输入框与标签密集迭代

- 智能背景创建面板、商业风格图、布局与拖拽
- PicWish/佐糖去水印、橡皮擦、去背景、高清、智能背景链路
- 图片节点竖状 bar、下载、裁切、批量下载
- 提示词输入框标签拖拽、hover 缩略图、框选、自动折行、光标插入
- 几何形锚点、Alt 正圆、层级和选框样式
- 画布全选、跨画布复制粘贴、画板导出
- 开发日志 `docs/dev-log.md` 建立，AI 任务 ID 记录规则确立

### 2026-06-25 至 2026-06-28：智能背景强约束与订阅支付框架

- 智能背景参考图、产品比例强约束、输出比例强约束
- 前端生成结果加载校验、失败态和自动重试方向
- 批量下载 zip 修复
- `/billing` 订阅 / 充值 / 升级框架
- 套餐价格、积分配额、充值门槛
- 威富通支付接入，二维码支付弹窗、订单、充值、订阅按钮
- 后台 admin 账单、订单、积分、支付异常链路开始接入

### 2026-07-01 至 2026-07-02：测试分支聚合与画布能力回收

- 多任务窗口改动合回主测试分支
- 恢复技能商店、底部提示词输入框、画布下载、画板导出
- 外部图片复制粘贴、拖拽导入、画板同步移动、注释点落点
- 画板导出 PSD/JPG/PNG，图片单张/批量下载
- 去除 mock 工作台数据，清理上线前测试内容

### 2026-07-04 至 2026-07-05：上线前 UI、加载态、权限、Skill、支付与图片 URL 修复

- 全站背景色统一为 `#222222`
- 顶部 bar 毛玻璃样式、logo 尺寸、首页灵感推荐恢复
- 未登录访问规则：公开浏览与登录触发逻辑
- 加载动画、画布骨架屏、tips 文案
- API Key 弹窗、MCP 工具入口规划
- Skill 选择器、模型选择器、默认文案、自动折行
- Skill 生成链路改为直接生成，不被意图路由拦截
- 本地开发 AI 代理到测试后端，避免 CORS 和本地缺 token
- 后端后台任务超时保护
- 支付成功弹窗与充值/订阅成功提示
- 修复 `/uploads/images/...` 在 GitHub Pages 前端显示破图的问题，统一补全为测试后端图片地址

## 8. 近期关键提交记录

以下是最近 120 条提交摘要，完整历史可用 Git 命令查询。

```text
- `3b741ae` `2026-07-05` fix: resolve generated upload image urls
- `3a24de3` `2026-07-05` Adjust admin credit layout and order balances
- `7dfc905` `2026-07-05` fix: stabilize canvas skill generation and billing feedback
- `0df0fe6` `2026-07-05` Fix admin payments and deployment readiness
- `a2f5450` `2026-07-04` fix: reduce homepage edge overlay
- `92bf210` `2026-07-04` fix: refresh test pages bundle for homepage edge
- `0176927` `2026-07-04` fix: mask homepage hero image edge on wide screens
- `b136c74` `2026-07-04` fix: align pnpm lockfile for pages deploy
- `485b995` `2026-07-04` fix: restore pnpm workspace package entry
- `93ec09f` `2026-07-04` fix: remove homepage hero guide line
- `308654f` `2026-07-04` Merge branch 'feature/interaction-framework' of https://github.com/09beedesign-star/artx-test into feature/interaction-framework
- `f531171` `2026-07-04` chore: publish current test build updates
- `a01f341` `2026-07-03` chore: retry test pages deploy
- `879e6be` `2026-07-03` deploy: refresh test static artifacts
- `ac17bea` `2026-07-02` chore: trigger test backend redeploy
- `14e13b4` `2026-07-02` Trigger test backend redeploy
- `1558f2b` `2026-07-02` Fix image and artboard download export
- `40fa0a4` `2026-07-02` Fix canvas paste and download interactions
- `c7e93a5` `2026-07-02` Retrigger test deployment for canvas fixes
- `b36a508` `2026-07-02` Retrigger test Pages deploy after queue cleared
- `2b3d59e` `2026-07-02` Trigger test Pages deploy for canvas fixes
- `ad5ad56` `2026-07-02` Fix canvas annotation, artboard movement, paste and downloads
- `f6d7500` `2026-07-01` Restore bottom prompt bar to previous version
- `59628ef` `2026-07-01` Restore skill store page to previous version
- `07849cc` `2026-07-01` Fix billing current plan display
- `3973cf0` `2026-07-01` Refine artboard toolbar and annotation recovery
- `f36b6b8` `2026-07-01` Fix canvas artboard paste and export recovery
- `c9fd254` `2026-07-01` Update test deployment metadata
- `59dc8f1` `2026-07-01` Remove handwritten workspace mock data
- `c8105a0` `2026-07-01` Update test deployment metadata
- `928123e` `2026-07-01` Clean inspiration page header
- `bea82e2` `2026-07-01` Update test deployment metadata
- `1e62d73` `2026-07-01` Show inspiration topics on home page
- `aa56e8c` `2026-07-01` Update test deployment metadata
- `89655e8` `2026-07-01` Update payment confirmation modal
- `e34df33` `2026-07-01` Update test deployment metadata for toast width
- `57ae0c8` `2026-07-01` Set global toast width to 300px
- `4efe63c` `2026-07-01` feat: record external payment collections
- `3d3d486` `2026-07-01` Update test deployment metadata for plan display fix
- `f30bd94` `2026-07-01` Fix billing plan display names and publish test build
- `e12973e` `2026-07-01` feat: connect admin billing operations
- `4affe0c` `2026-07-01` Align test deployment metadata with branch head
- `b40a95c` `2026-07-01` Update test deployment metadata
- `c2fa565` `2026-07-01` Update billing copy and inline payment QR dialog
- `990e6a5` `2026-06-30` Deploy f08c934 static test build for legacy Pages
- `f08c934` `2026-06-28` Refine recharge thresholds and billing copy
- `c662453` `2026-06-28` Wire billing payments and subscription selection
- `cee3ae1` `2026-06-28` Merge payment test deployment history
- `fff3c56` `2026-06-28` Deploy Wallyt payment verification to test
- `8401633` `2026-06-28` Refine billing plan and recharge tiers
- `005f07a` `2026-06-28` Add custom credit recharge payments
- `5421ada` `2026-06-28` Refine billing pricing and payment UI
- `a02dad2` `2026-06-28` Document Wallyt payment configuration rule
- `599cd5d` `2026-06-28` Integrate Wallyt billing payments
- `ce0b22a` `2026-06-28` Tighten composer density and upgrade cluster
- `2ab4aea` `2026-06-28` Publish current ArtX canvas and AI updates
- `697579f` `2026-06-27` Enforce smart background product and ratio constraints
- `e53c048` `2026-06-25` Fix batch image zip downloads
- `f66cf59` `2026-06-25` Fix smart background reference placement and ratio
- `46bbb48` `2026-06-24` Use image edit for quick image edits
- `52f5235` `2026-06-24` Fix smart background output aspect ratio
- `565f327` `2026-06-24` Fix batch download duplicate filenames
- `d1bc627` `2026-06-24` Fix download dialog overlay positioning
- `12d067d` `2026-06-24` Log eraser mask verification results
- `6100142` `2026-06-24` Fix eraser mask conversion semantics
- `2b57e5f` `2026-06-24` Fix eraser PicWish remove-objects route
- `90a4a5c` `2026-06-24` Refine hover previews and homepage inspiration surfacing
- `553f63e` `2026-06-24` chore: expose eraser task contract health flag
- `00757ba` `2026-06-24` chore: trigger test rebuild for eraser verification
- `59b0f79` `2026-06-24` Colorize canvas skill menu icons
- `64fbc96` `2026-06-24` Fix shape anchor undo and generation status copy layout
- `7e584ba` `2026-06-24` Tighten canvas assistant input line height
- `3206384` `2026-06-24` Keep smart background dialog open on canvas click
- `4a32a12` `2026-06-24` Color skill selector menu icons
- `2153d26` `2026-06-24` Harden eraser PicWish task id flow
- `852c7a0` `2026-06-24` Refine smart background panel layout
- `0d0625e` `2026-06-24` Fix skill selector popover on canvas
- `25dfb03` `2026-06-24` Refine canvas frame resize and eraser mask overlay
- `085f57b` `2026-06-24` Log PicWish task id traceability
- `fc07d57` `2026-06-24` Update PicWish task id memory rule
- `dadbc0f` `2026-06-24` Restore canvas image commands and workspace dialog
- `f9d51f7` `2026-06-24` Normalize AI provider task id responses
- `7012263` `2026-06-24` Expose PicWish provider task ids to client
- `7044868` `2026-06-24` Propagate PicWish task ids across image helpers
- `2d69954` `2026-06-24` Align eraser with PicWish inpaint contract
- `16f4461` `2026-06-24` Log PicWish AI provider calls
- `9603052` `2026-06-24` Expand canvas keyboard selection scope
- `5e68ce9` `2026-06-24` Update canvas regenerate and composer interactions
- `713a685` `2026-06-24` Log AI eraser test deployment
- `5d51645` `2026-06-24` Document development log rule
- `746de8f` `2026-06-24` Update AI eraser and canvas prompt interactions
- `4144014` `2026-06-23` Fix image edit regeneration behavior
- `702bf63` `2026-06-23` Document image regenerate behavior
- `eb5c11f` `2026-06-23` Add image node regenerate control
- `4bc0424` `2026-06-23` Refine shape and composer tag interactions
- `e0a90c1` `2026-06-23` Keep extracted copy in text panel only
- `6858104` `2026-06-23` Show smart edit image placeholder immediately
- `f22b432` `2026-06-23` Fix BKEEL async image task parsing
- `596ed40` `2026-06-23` Update smart background creation panel
- `98f5544` `2026-06-23` Fix smart background image drop handling
- `8028ada` `2026-06-23` Fix smart background dialog and eraser blend
- `6b2b039` `2026-06-22` Support BKEEL async image generation polling
- `46028d5` `2026-06-22` Hide font design toolbar entry
- `5ab73a9` `2026-06-22` Redesign smart background dialog
- `cef7d97` `2026-06-21` Add PicWish watermark removal command
- `63a4b63` `2026-06-21` Fix PicWish eraser mask polarity
- `c9b2fd3` `2026-06-21` Fix AI image generation backend routing
- `92a27a6` `2026-06-21` Add canvas select all shortcut
- `6cf37bf` `2026-06-21` Update login area actions
- `b548ca4` `2026-06-21` Position font design dialog below toolbar
- `2f01aab` `2026-06-21` Revert "Simplify auth UI to email login"
- `262fe2a` `2026-06-21` Simplify auth UI to email login
- `cfe0473` `2026-06-21` Restore Gemini image model options
- `5e07525` `2026-06-21` Fix font design dialog layout
- `9f0484a` `2026-06-21` Default prompt model selectors to auto
```

## 9. 开发日志摘录

`docs/dev-log.md` 是人工整理的开发日志，不替代 Git 历史。当前明确记录了：

- PicWish provider task id 透传与可追踪响应
- 图片竖状 bar 下载命令修复
- 图片节点裁切命令恢复
- 跨画布复制粘贴图片节点和画板
- 橡皮擦 PicWish taskId 写回接口响应和前端日志
- 标签 hover 缩略图预览
- PicWish inpaint 替换旧橡皮擦链路
- 统一开发日志创建

AI 相关日志规则：

- `generationId`
- `backendTaskId`
- `providerTaskId`
- request endpoint
- result / error
- 测试环境 commitSha 和 deployment check

如果某一层 ID 不存在，要写 `N/A`，不能留空。

## 10. 如何查看“所有修改的代码记录”

仓库当前有约 1000 条提交。不要把所有 diff 复制进本文档；应通过 Git 精确追溯。

### 查看完整提交历史

```bash
git log --date=short --pretty=format:'%h %ad %s' --all
```

### 查看某个提交改了哪些文件

```bash
git show --stat <commit>
```

### 查看某个提交的完整代码 diff

```bash
git show <commit>
```

### 查看某个文件的所有历史修改

```bash
git log --follow --stat -- client/src/components/canvas/InfiniteCanvas.tsx
git log --follow -p -- client/src/components/canvas/InfiniteCanvas.tsx
```

### 查看测试分支与本地差异

```bash
git fetch test --prune
git diff refs/remotes/test/feature/interaction-framework..HEAD
```

### 查看某个时间段的改动

```bash
git log --since='2026-06-21' --until='2026-07-05' --date=short --pretty=format:'%h %ad %s'
```

### 查看某个能力相关改动

```bash
git log --all --grep='billing' --oneline
git log --all --grep='eraser' --oneline
git log --all --grep='download' --oneline
git log --all --grep='skill' --oneline
git log --all --grep='smart background' --oneline
```

## 11. 回归测试清单

发布测试环境、灰度环境或正式环境前至少验证：

1. 首页：未登录 / 已登录顶部按钮、灵感推荐、右侧提示词/登录窗口切换。
2. 技能商店：分类、搜索、快速加载、未登录拦截、Skill 进入画布。
3. 画布：打开项目、节点显示、图片拖入、外部复制粘贴、全选、跨画布复制粘贴。
4. 图片节点：下载 PNG/JPG、批量下载、裁切、去背景、橡皮擦、扩图、HD、去水印。
5. 画板：移动同步内部图片、导出 PSD/JPG/PNG、调整尺寸不缩放内部图片。
6. 注释：点击落点准确，层级低于顶部工具栏。
7. 提示词输入框：自动折行、标签 hover 缩略图、标签拖拽排序、框选、光标插入。
8. Skill 生成：8 个 Skill 均能发起生成并返回可加载图片。
9. 订阅充值：套餐选择、二维码内嵌、支付成功弹窗、积分刷新。
10. 后台：admin 订单、积分、AI 账单、支付异常、用户权限。
11. 登录：未登录不能进入工作台或调用 AI；Google callback 在灰度/正式域名可用。
12. 图片 URL：GitHub Pages 前端显示后端 `/uploads/images/...` 时必须补全为后端域名，避免破图。

## 12. 新任务启动提示词

可以把下面这段交给新 Agent：

```text
你正在接手 ArtX 项目。先阅读：
- /Users/ericbi/Documents/New project 2/AGENTS.md
- /Users/ericbi/Documents/New project 2/MEMORY.md
- /Users/ericbi/Documents/New project 2/docs/artx-development-archive.md
- /Users/ericbi/Documents/New project 2/docs/test-deployment.md
- /Users/ericbi/Documents/New project 2/docs/dev-log.md

本地代码空间是 /Users/ericbi/Documents/New project 2。
测试/灰度环境固定为 https://backstage.artxsd.com，测试发布分支是 test/feature/interaction-framework。
普通功能改动先发布到测试环境；灰度生产环境目标是 gray.artxsd.com；正式域名是 www.artxsd.com。

不要泄露或提交任何 AI token、支付密钥、OAuth secret、数据库密码、服务器密码或 SSH 私钥。
不要把 origin 当作测试环境发布目标。
发布测试环境前必须同步 test/feature/interaction-framework，运行 pnpm run check 和 pnpm run build，推送后检查 deployment.json 的 commitSha。
```
