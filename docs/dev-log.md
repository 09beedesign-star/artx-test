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
