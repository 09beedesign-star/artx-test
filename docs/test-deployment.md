# ArtX 测试发布防错流程

## 固定目标

- 测试前端链接：<https://09beedesign-star.github.io/artx-test/>
- 测试发布 remote：`test`
- 测试发布分支：`feature/interaction-framework`
- 测试后端：<https://artx-test.onrender.com>

测试环境只认 `test/feature/interaction-framework` 触发的 GitHub Pages artifact。`test/main`、`gh-pages` 手工产物、Manus 临时预览都不能作为“已提交测试环境”的判断依据。

## 用户口径

当用户说“把当前任务发布到测试环境”或只说“发布到测试环境”时，按这句执行：

> 先同步最新 `test/feature/interaction-framework`，再合入当前任务改动，验证后推送到 `test/feature/interaction-framework`，不要发布正式环境。

发布后必须检查 `deployment.json` 或浏览器里的 `window.__ARTX_BUILD__`，确认线上 `commitSha` 与 `test/feature/interaction-framework` 一致。

## 多任务发布规则

1. 每个任务可以在自己的 `codex/...` 分支开发。
2. 进测试前，先同步最新测试分支：

   ```bash
   git fetch test --prune
   ```

3. 从 `test/feature/interaction-framework` 创建或更新一个干净发布分支，再合入目标任务改动。
4. 合并后运行：

   ```bash
   pnpm run check
   pnpm run build
   ```

5. 推送到测试发布分支：

   ```bash
   git push test HEAD:feature/interaction-framework
   ```

6. 等 GitHub Actions 的 Pages deployment 成功后，运行：

   ```bash
   scripts/verify-test-deployment.sh
   ```

## 如何确认线上版本

测试站每次构建都会暴露两处版本信息：

- `https://09beedesign-star.github.io/artx-test/deployment.json`
- 浏览器控制台执行 `window.__ARTX_BUILD__`

必须确认这些字段与预期一致：

- `commitSha` 等于 `test/feature/interaction-framework` 当前提交。
- `branch` 是 `feature/interaction-framework`。
- `backendUrl` 是 `https://artx-test.onrender.com`。

如果线上没看到修改，先检查这三项，不要先假设代码没生效。

## AI 能力检查

GitHub Pages 构建时固定写入：

- `VITE_API_BASE_URL=https://artx-test.onrender.com`
- `VITE_AUTH_API_BASE_URL=https://artx-test.onrender.com`
- `VITE_AI_API_BASE_URL=https://artx-test.onrender.com`

前端 AI/API/Auth 请求应全部打到测试后端。若 AI 表现异常，优先检查 Render 环境变量和 `/api/health`，而不是重新发布前端。

## 禁止事项

- 不要把分叉很久的本地分支直接强推覆盖测试分支。
- 不要把 `test/main` 当作测试站来源。
- 不要把 Manus 临时预览当作测试发布结果。
- 不要手工更新 `gh-pages` 来绕过 GitHub Actions。
