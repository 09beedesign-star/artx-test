# ArtX 测试发布防错流程

## 固定目标

- 测试前端链接：<https://backstage.artxsd.com>
- 测试发布 remote：`test`
- 测试发布分支：`feature/interaction-framework`（完整远端引用：`test/feature/interaction-framework`）
- 测试后端：<https://backstage.artxsd.com>

测试环境只认远端引用 `test/feature/interaction-framework` 对应的腾讯云测试/灰度部署结果。`test/main`、`gh-pages` 手工产物、Manus 临时预览、Render URL 都不能作为“已提交测试环境”的判断依据。

## 用户口径

当用户说“提交到测试环境”、“把当前任务发布到测试环境”或只说“发布到测试环境”时，按这句执行：

> 先同步最新 `test/feature/interaction-framework`，再合入当前任务改动，本地完成必要检查，推送到 remote `test` 的 `feature/interaction-framework`，由 GitHub Actions 自动部署到腾讯云测试/灰度环境 `https://backstage.artxsd.com`，不要发布正式环境。

发布后必须检查 `deployment.json` 或浏览器里的 `window.__ARTX_BUILD__`，确认线上 `commitSha` 与远端引用 `test/feature/interaction-framework` 一致。

## 多任务发布规则

1. 每个任务可以在自己的 `codex/...` 分支开发。
2. 进测试前，先同步最新测试分支：

   ```bash
   git fetch test --prune
   ```

3. 从远端引用 `test/feature/interaction-framework` 创建或更新一个干净发布分支，再合入目标任务改动。
4. 合并后运行：

   ```bash
   pnpm run check
   pnpm run build
   ```

5. 推送到测试发布分支：

   ```bash
   git push test HEAD:feature/interaction-framework
   ```

6. 等 GitHub Actions 自动部署到腾讯云测试/灰度环境成功后，运行：

   ```bash
   scripts/verify-test-deployment.sh
   ```

## 如何确认线上版本

测试站每次部署都会暴露两处版本信息：

- `https://backstage.artxsd.com/deployment.json`
- 浏览器控制台执行 `window.__ARTX_BUILD__`

必须确认这些字段与预期一致：

- `commitSha` 等于远端引用 `test/feature/interaction-framework` 当前提交。
- `branch` 是 `feature/interaction-framework`。
- `backendUrl` 是 `https://backstage.artxsd.com`。

如果线上没看到修改，先检查这三项，不要先假设代码没生效。

## AI 能力检查

测试前端构建时固定写入：

- `VITE_API_BASE_URL=https://backstage.artxsd.com`
- `VITE_AUTH_API_BASE_URL=https://backstage.artxsd.com`
- `VITE_AI_API_BASE_URL=https://backstage.artxsd.com`

前端 AI/API/Auth 请求应全部打到腾讯云测试/灰度后端。若 AI 表现异常，优先检查 `https://backstage.artxsd.com/api/health`、`artx-gray-backend.service` 和腾讯云环境变量，而不是重新发布前端。

发布后默认验证：

- `https://backstage.artxsd.com/deployment.json`
- `https://backstage.artxsd.com/api/health`
- 登录
- AI 生图 / Skill 生图
- 图片代理和生成图下载
- 支付回调相关链路仅在本任务涉及支付时验证

## 图片 AI 能力接口

测试/灰度后端中的图片 AI 能力统一由 `server/index.ts` 暴露，前端通过 `client/src/lib/ai.ts` 调用。佐糖/PicWish 凭据只配置在腾讯云后端环境变量中，代码仓库只保留变量名和调用路径，不写入密钥值。

| 能力 | 前端命令入口 | 前端 API | 后端路由 | 后端能力 |
| --- | --- | --- | --- | --- |
| 去背景 | 图片节点左侧树状 bar「去背景」 | `removeImageBackground` | `POST /api/images/remove-background` | PicWish `segmentation` + 前景保护后处理 |
| HD 高清化 | 图片节点左侧树状 bar「HD 4K」 | `enhanceImageToHd` | `POST /api/images/enhance` | PicWish `scale` |
| 橡皮擦除 | 图片节点左侧树状 bar「橡皮工具」 | `eraseImageObjects` | `POST /api/images/erase` | PicWish `inpaint`，涂抹蒙版黑色为擦除区域、白色为保护区域 |
| 去水印能力 | 图片节点左侧树状 bar「去水印」 | `removeImageWatermark` | `POST /api/images/remove-watermark` | PicWish `watermark` |
| 智能创建背景 | 顶部常驻栏「智能创建背景」 | `createProductBackground` | `POST /api/images/create-background` | PicWish `r-background` |

去水印能力不复用橡皮擦除接口；橡皮擦除继续只调用 PicWish `inpaint`，避免去水印和涂抹擦除两类能力互相影响。

## 禁止事项

- 不要把分叉很久的本地分支直接强推覆盖测试分支。
- 不要把 `test/main` 当作测试站来源。
- 不要把 Manus 临时预览当作测试发布结果。
- 不要手工更新 `gh-pages` 来绕过 GitHub Actions。
- 不要把测试发布到正式站点 `https://www.artxsd.com`。
- 不要把测试改动直接推到生产分支。
