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

- 测试前端：<https://09beedesign-star.github.io/artx-test/>
- 测试后端：<https://artx-test.onrender.com>
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

## 2026-06-24 16:10

- 任务：强制测试环境重建以校验橡皮擦 taskId 合约
- 原因：本地代码与远端测试分支都已包含 PicWish `providerTaskId/providerTaskIds` 返回逻辑，但测试后端接口实测仍未返回这些字段，需要通过一次最小变更触发 Render 重新构建，确认是否为部署未跟上导致。
- 影响范围：仅追加开发日志，业务代码不变；用于触发测试分支重新部署并复测 `/api/images/erase` 与 `/api/ai/orchestrate`。
- AI 联调：
  - capability: `element_erasure`
  - entry: `/api/images/erase`, `/api/ai/orchestrate`
  - model/provider: PicWish / 佐糖 inpaint
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId: N/A
  - request endpoint: `POST /api/tasks/visual/inpaint`, `GET /api/tasks/visual/inpaint/{task_id}`
  - result: 待测试环境重建完成后复测
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: 待发布
  - deployment check: 待发布
- 验证：待测试环境部署完成后补充。
- 已知风险 / 待回归：若重建后接口仍缺少 `providerTaskId/providerTaskIds`，则需要进一步排查 Render 实际构建来源或运行产物缓存。

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

## 2026-06-24 18:10

- 任务：修正橡皮擦 PicWish 官方对象消除接口
- 原因：Render 新版本已确认真正调用到 PicWish，但 `POST /api/tasks/visual/inpaint` 创建成功后立刻轮询返回 `state=-1`；同时 PicWish 官方 remove-objects 文档实际给出的对象擦除接口是 `visual/watermark` 配 `mask_file/mask_url`，说明当前橡皮擦选错了接口。
- 影响范围：`server/image-generation.ts` 橡皮擦 PicWish 路由；`scripts/verify-eraser-picwish-inpaint.mjs` 专项校验；`MEMORY.md`、`docs/dev-log.md` 文档同步。
- AI 联调：
  - capability: image object erasure / eraser
  - entry: canvas image left toolbar eraser command
  - model/provider: PicWish / 佐糖 masked removal
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId:
    - `0de68636-395d-4edd-a98e-78ac72266437`
    - `b281edb1-2933-460f-80a5-21add7de99f4`
  - request endpoint:
    - 失败旧链路：`POST /api/tasks/visual/inpaint`, `GET /api/tasks/visual/inpaint/{task_id}`
    - 修正新链路：`POST /api/tasks/visual/watermark`, `GET /api/tasks/visual/watermark/{task_id}`
  - result: Render 线上日志已证明旧 `inpaint` 会创建任务但立刻 `state=-1` 失败；改为官方 remove-objects `watermark` 链路并继续透传 `providerTaskId/providerTaskIds`。
  - error: `PicWish inpaint task failed`
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: `/api/health` 已返回 `{"ok":true,"eraserTaskIdContract":true}`，确认后端已切到新代码。
- 验证：已通过 Render 日志确认旧错误链路的真实失败位置；待重新发布测试环境后，使用固定样本与前端真实擦除再回归。
- 已知风险 / 待回归：需要再次发布并验证 `providerTaskId/providerTaskIds` 是否随成功响应返回，且图片效果不再是失败/空结果。

## 2026-06-24 20:38

- 任务：补齐橡皮擦真实前端蒙版转换兼容
- 原因：测试环境已证明 PicWish `visual/watermark` 对象消除链路可成功返回 `providerTaskId`；`rectangles` 和前端同形态的透明洞蒙版均成功，但黑底白块类蒙版失败，需要服务端同时兼容真实前端透明擦除洞和旧/测试白色涂抹区域。
- 影响范围：`server/image-generation.ts` 的 `createPicWishEraseMask`；橡皮擦专项校验脚本；智能背景和去水印校验脚本中关于橡皮擦路由的旧断言。
- AI 联调：
  - capability: image object erasure / eraser
  - entry: canvas image left toolbar eraser command
  - model/provider: PicWish / 佐糖 masked removal
  - generationId: N/A
  - backendTaskId: N/A
  - providerTaskId:
    - 成功 rectangles：`1624b20a-a32d-49e7-b0c6-586b948c3116`
    - 成功透明洞蒙版：`c59f4121-d585-4825-8bc2-db0b83f37441`
    - 失败黑底白块旧蒙版：`2bdd8a54-7dad-4d41-885d-6c7ddcb9d85a`、`0ecb02d2-4098-41cb-b98a-87fa38fd01d5`
  - request endpoint: `POST /api/tasks/visual/watermark`, `GET /api/tasks/visual/watermark/{task_id}`
  - result: 服务端蒙版转换改为优先识别透明擦除洞；若不存在透明洞，则识别白色高亮区域为擦除区域；无有效擦除区域时直接失败。
  - error: N/A
- 测试环境：
  - frontend: <https://09beedesign-star.github.io/artx-test/>
  - backend: <https://artx-test.onrender.com>
  - branch: `test/feature/interaction-framework`
  - commitSha: N/A
  - deployment check: 待发布后更新。
- 验证：待发布后重新用固定黑底白块蒙版、前端透明洞蒙版和真实页面擦除流程回归。
- 已知风险 / 待回归：需要确认成功图片视觉上确实擦除目标区域，而不只是接口返回图片。
