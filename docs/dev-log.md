# ArtX 开发日志

本日志用于记录 ArtX 的关键开发、测试发布和 AI 第三方联调信息。它不替代 Git commit message，也不替代正式 changelog；它的作用是让团队能快速回溯“什么时候改了什么、测试环境是哪一版、AI 任务链路 ID 是什么”。

## 记录规则

- 按时间追加新条目，最新记录放在最上方。
- 普通 UI / 交互任务也要记录影响范围和回归结果。
- AI 相关任务必须记录三层 ID：`generationId`、`backendTaskId`、`providerTaskId`。
- 如果某一层 ID 当次不存在，明确写 `N/A`，不要留空。
- 测试环境发布必须记录 `commitSha`，并确认线上 `deployment.json` 或 `window.__ARTX_BUILD__` 与测试分支一致。
- 凭据只记录变量名或配置位置，不记录密钥值。

## 固定环境

- 测试/灰度入口：<https://backstage.artxsd.com>
- 测试/灰度后端：<https://backstage.artxsd.com>
- 测试发布分支：`test/feature/interaction-framework`

## 条目模板

```md
## YYYY-MM-DD HH:mm

- 任务：
- 原因：
- 影响范围：
- AI 联调：
  - capability:
  - entry:
  - model/provider:
  - generationId:
  - backendTaskId:
  - providerTaskId:
  - request endpoint:
  - result:
  - error:
- 测试环境：
  - frontend:
  - backend:
  - branch:
  - commitSha:
  - deployment check:
- 验证：
- 已知风险 / 待回归：
```

## 2026-07-06 21:40

- 任务：测试/灰度后端迁移到腾讯云入口
- 原因：测试/灰度后端已从 Render 迁移到腾讯云，后续前端、AI、Auth、Billing、图片相关 API 不得再默认指向 `https://artx-test.onrender.com`，统一使用 `https://backstage.artxsd.com`。
- 影响范围：`AGENTS.md`、`MEMORY.md`、前端 API 默认兜底、构建元数据、测试部署脚本、Wallyt 默认回调、腾讯云部署文档、测试发布文档；现有管理后台 `admin.artxsd.com`、`/opt/artx`、`artx-admin.service`、`127.0.0.1:3001`、`/var/lib/artx` 不动。
- AI 联调：
  - capability: all test/gray AI capabilities
  - entry: frontend / AI / Auth / Billing / image APIs
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: `https://backstage.artxsd.com`
  - result: 腾讯云灰度后端作为测试/灰度统一 API 入口；旧 Render 地址只保留在历史日志语境中。
  - error: N/A
- 测试环境：
  - frontend: <https://backstage.artxsd.com>
  - backend: <https://backstage.artxsd.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: 用户已确认 `/api/health`、Skill 生图、Wallyt 支付回调、图片代理、生成图 `/uploads` 下载通过。
- 验证：本次为配置/文档入口收口；后续发布或联调默认检查 `https://backstage.artxsd.com/api/health` 和 `artx-gray-backend.service`。
- 已知风险 / 待回归：旧历史日志中仍会出现 Render 地址作为当时记录，不代表当前测试/灰度目标。

## 2026-07-06 19:24

- 任务：下载、拖拽、复制全部解决的最终版
- 原因：为后续溯源创建最终版注释，明确画布图片下载、外部图片拖拽、内部/外部复制粘贴链路已经完成集中修复与本地回归。
- 影响范围：选中图片下载、批量下载、画布导出下载、外部网页图片拖入解析与 Chrome 去重、画布内部创建副本/外部剪贴板粘贴优先级；本条为日志记录，不改变产品功能代码。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：本地完整服务 `http://localhost:3000/` 已用于回归；`pnpm check`、`pnpm build` 均通过；本地 `/api/images/proxy` 已确认返回图片内容类型而非前端 HTML。
- 已知风险 / 待回归：本条尚未发布测试环境；发布时仍需按 `AGENTS.md` 同步并推送 `test/feature/interaction-framework`，再校验线上 `deployment.json` 或 `window.__ARTX_BUILD__` 的 `commitSha`。

## 2026-07-06 15:17

- 任务：复制粘贴拖入下载全跑通
- 原因：为后续溯源创建明确注释，标记画布图片复制、粘贴、外部拖入和下载链路已经完成一轮跑通修复与本地验证。
- 影响范围：画布图片复制/粘贴优先级、外部网页图片拖入解析与去重、选中图片下载/批量下载/画布导出下载相关链路；本条仅为日志记录，不改变产品代码。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：本地完整服务 `http://127.0.0.1:5018/` 已用于回归；`npm exec --yes pnpm@10.4.1 -- run check`、`npm exec --yes pnpm@10.4.1 -- run build` 均通过。
- 已知风险 / 待回归：本条为溯源注释；如后续发布测试环境，需要按 `AGENTS.md` 规则确认线上 `commitSha`。

## 2026-06-24 11:16

- 任务：统一 PicWish 能力 taskId 可追溯响应
- 原因：不只橡皮擦，所有调用 PicWish/佐糖的能力都需要在接口响应和浏览器日志中回溯到具体 `task_id`，方便测试环境生成图片后记录到开发日志。
- 影响范围：`server/image-generation.ts` PicWish 通用任务、去背/脸部抠图/高清/去水印/智能背景/橡皮擦结果返回；`server/ai-orchestrator.ts` 图片编排响应；`client/src/lib/ai.ts` AI 图片响应类型；`client/src/components/canvas/InfiniteCanvas.tsx` 派生图片生成日志。
- AI 联调：
  - capability: PicWish `segmentation` / `self-face-cutout` / `scale` / `watermark` / `r-background` / `inpaint`
  - entry: `/api/images/remove-background`, `/api/images/enhance`, `/api/images/remove-watermark`, `/api/images/create-background`, `/api/images/erase`, `/api/images/expand`, `/api/ai/orchestrate`
  - model/provider: PicWish/佐糖 visual tasks
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: `/api/tasks/visual/{taskType}`
  - result: 成功响应会返回 `providerTaskId`；去背等多 task 链路会额外返回 `providerTaskIds`
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：`npm run check`、`npm run build` 均通过；代码回归确认 PicWish 通用任务成功后会返回 `providerTaskId/providerTaskIds`，前端派生图片生成会在 `[artx-ai-task]` 日志中打印完整 task ID 数组。
- 已知风险 / 待回归：尚未发布到测试环境；需要在测试环境实际跑一次去背、高清、去水印、智能背景、橡皮擦，确认浏览器 `[artx-ai-task]` 日志和接口响应里的 `providerTaskId/providerTaskIds` 能对应 Render `[picwish]` 日志。

## 2026-06-24 11:16

- 任务：修复图片竖状 bar 下载命令
- 原因：图片竖状工具栏的“下载”按钮没有接入已有的 `handleNodeAction("download")` 下载链路，点击后落入默认 toast 分支，导致下载没有生效。
- 影响范围：`client/src/components/canvas/InfiniteCanvas.tsx` 中图片竖状工具栏 `download` action、单张下载与批量下载临时缓存隔离逻辑。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：`npm run check`、`npm run build` 均通过；专项代码回归确认竖状 bar `download` action 会调用 `handleNodeAction("download", nodeId)`，单张下载写入 `__artx_single_download__` 时会清理批量缓存，批量下载写入 `__artx_download_nodes__` 时会清理单张缓存。
- 已知风险 / 待回归：尚未发布到测试环境；需要在含图片节点的画布中手动复测竖状 bar 下载入口弹出格式选择，并分别保存 PNG/JPG。

## 2026-06-24 11:02

- 任务：恢复图片节点裁切命令
- 原因：图片竖状工具栏的“裁切”入口没有接回最近的 `CropEditor` 裁切弹层，点击后落入默认 toast 分支，表现为裁切命令无效。
- 影响范围：`client/src/components/canvas/InfiniteCanvas.tsx` 中图片节点工具栏 `crop` action 到 `CropEditor` 的入口逻辑；未改动扩展、橡皮工具、旋转与反转、多平台封面等命令。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：`npm run check`、`npm run build` 均通过；专项代码回归确认 `crop` action 在默认 toast 之前触发 `setCropEditorState({ nodeId, imageSrc })`，`CropEditor` 确认后仍写回 `localSrc: croppedDataUrl` 与裁切后节点尺寸。
- 已知风险 / 待回归：本地项目页当前没有可直接点击的图片节点，浏览器交互回归未能完整点选裁切按钮；需要在含图片节点的画布中手动复测打开裁切弹层、确认裁切、取消裁切三条路径。

## 2026-06-24 10:42

- 任务：支持跨画布复制粘贴图片节点和画板
- 原因：用户需要在一个画布中单选或框选图片节点/画板后，通过快捷键或右键复制，切换到另一个画布后继续粘贴。
- 影响范围：`client/src/components/canvas/InfiniteCanvas.tsx` 的节点右键菜单、画布空白右键粘贴菜单、快捷键复制粘贴、跨画布本地剪贴板持久化。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：`npm run check`、`npm run build` 均通过。
- 已知风险 / 待回归：尚未发布到测试环境；需要在浏览器中复测图片节点和画板通过 `Ctrl/Cmd+C`、`Ctrl/Cmd+V` 以及右键复制/右键粘贴跨画布流转。

## 2026-06-24 10:42

- 任务：把橡皮擦 PicWish taskId 写回接口响应和前端可见日志
- 原因：用户需要在测试环境成功生成橡皮擦 AI 图片后，直接拿到 PicWish `inpaint` 任务 ID，避免只能去 Render 服务端日志里反查。
- 影响范围：`server/image-generation.ts` 橡皮擦返回值、`server/ai-orchestrator.ts` 响应透传、`client/src/lib/ai.ts` 类型与返回值、`client/src/components/canvas/InfiniteCanvas.tsx` 橡皮擦成功提示与控制台日志、`MEMORY.md` 项目规则、`docs/dev-log.md` 日志。
- AI 联调：
  - capability: image object erasure / eraser
  - entry: canvas image left toolbar eraser command
  - model/provider: PicWish / 佐糖 inpaint
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: `POST /api/tasks/visual/inpaint`, `GET /api/tasks/visual/inpaint/{task_id}`
  - result: 代码已将 PicWish 创建任务返回的 `taskId` 作为 `providerTaskId` 透传到 `/api/ai/orchestrate` 响应；前端成功后会 toast 显示任务 ID，并输出 `[artx-ai-task]` 控制台日志。
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：`npm run check`、`npm run build` 均通过。
- 已知风险 / 待回归：尚未发布到测试环境；真实 `providerTaskId` 只有在测试环境实际完成一次橡皮擦 AI 生成后才会出现。

## 2026-06-24 10:18

- 任务：修正引入标签 hover 缩略图预览
- 原因：用户要求鼠标 hover 到提示词输入框中的引入标签时，以标签中心为圆心放大显示对应缩略图，hover 结束后缩回消失。
- 影响范围：`client/src/components/canvas/InfiniteCanvas.tsx` 中画布底部提示词引用标签、右侧对话输入框图片引用标签和注释标签的 hover 预览样式。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：`npm run check`、`npm run build` 均通过。
- 已知风险 / 待回归：尚未发布到测试环境；需要在浏览器中分别 hover 底部提示词引用标签和右侧对话输入框引用标签，确认预览图片按原图比例显示且宽度不超过 160px。

## 2026-06-24 09:47

- 任务：替换橡皮擦 AI 能力并发布当前主站改动到测试环境
- 原因：原橡皮擦效果更接近局部模糊，不能稳定按用户紫色涂抹区域进行真实背景补齐；需要按 PicWish 智能消除笔文档替换为官方 inpaint 链路，并保留既有画布交互改动。
- 影响范围：`server/image-generation.ts` 橡皮擦链路、`scripts/verify-eraser-picwish-inpaint.mjs` 专项校验、`client/src/components/canvas/InfiniteCanvas.tsx` 当前画布交互改动、`MEMORY.md` 项目规则、`docs/dev-log.md` 日志。
- AI 联调：
  - capability: image object erasure / eraser
  - entry: canvas image left toolbar eraser command
  - model/provider: PicWish / 佐糖 inpaint
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: `POST /api/tasks/visual/inpaint`, `GET /api/tasks/visual/inpaint/{task_id}`
  - result: 已改为 PicWish 官方 white-remove / black-protect 蒙版契约，移除旧本地模糊兜底和旧二次合成判断。
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: `0f74789e71e47218fd649cf5814379017ac311e1`
  - deployment check: `deployment.json` 已返回 commitSha `0f74789e71e47218fd649cf5814379017ac311e1`，后端 `/api/health` 返回 `{"ok":true}`。
- 验证：`node scripts/verify-eraser-picwish-inpaint.mjs`、`npm run check`、`npm run build` 均通过；远端 `test/feature/interaction-framework` 已推送到 `0f74789e71e47218fd649cf5814379017ac311e1`。
- 已知风险 / 待回归：需要在测试链接用真实图片复测橡皮擦结果是否按紫色区域消除并补齐背景；`lithos-hero-test/` 仍为本地未跟踪临时目录，未纳入本次测试发布。

## 2026-06-24 00:00

- 任务：创建统一开发日志
- 原因：现有记录分散在 `MEMORY.md`、`BRANCH_FEATURES.md`、`docs/test-deployment.md` 和临时备注中，不利于追踪测试环境与 AI 第三方联调。
- 影响范围：新增日志入口，不改变产品代码。
- AI 联调：
  - capability: N/A
  - entry: N/A
  - model/provider: N/A
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: N/A
  - result: N/A
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: N/A
- 验证：文档创建完成。
- 已知风险 / 待回归：后续 AI 能力需要在接口返回或日志中补齐 `providerTaskId`，否则无法事后查询第三方任务号。
