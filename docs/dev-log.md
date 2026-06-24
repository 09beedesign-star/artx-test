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
