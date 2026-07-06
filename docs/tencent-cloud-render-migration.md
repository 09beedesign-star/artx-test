# ArtX Render 后端迁移到腾讯云

## 目标

把当前 Render 后端迁到腾讯云灰度服务器，同时控制服务器磁盘占用。线上只保留构建产物、生产依赖、环境变量、持久化数据目录和进程管理配置；不要把本地 `node_modules`、缓存、测试输出或未使用的大目录整包上传。

## 体积判断

当前本地项目的实际大头是依赖和运行数据，不是后端代码：

- `server/` 约数百 KB。
- `dist/index.js` 约数百 KB。
- `dist/` 约几十 MB。
- `node_modules/` 可接近 1GB。
- `/uploads` 会随 AI 生成图片持续增长。

服务器建议预留：

- 后端最小运行空间：`500M - 1.5G`。
- 前端和后端同机部署：`2G - 3G`。
- 本地保存生成图片的灰度/生产环境：`20G+`。
- 图片量增长后，应把长期资产迁到腾讯云 COS/CDN。

## 发布包

在本地生成腾讯云发布包：

```bash
GRAY_PUBLIC_URL=https://backstage.artxsd.com pnpm run package:tencent-cloud
```

脚本会在 `output/tencent-cloud/` 生成 `.tar.gz`，只包含：

- `dist/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `patches/`，如果存在
- 腾讯云部署模板

发布包不包含真实环境变量、不包含 `node_modules`。

打包脚本会把 `VITE_API_BASE_URL`、`VITE_AUTH_API_BASE_URL`、`VITE_AI_API_BASE_URL` 和 `VITE_TEST_BACKEND_URL` 默认设为 `GRAY_PUBLIC_URL`，避免灰度前端继续请求 Render 测试后端。

## GitHub Actions 自动发布

`.github/workflows/deploy-tencent-cloud.yml` 会在 `feature/interaction-framework` 或 `test/feature/interaction-framework` 更新后自动发布到腾讯云测试/灰度环境。

需要在 GitHub 仓库配置 Secret：

```text
TENCENT_CLOUD_SSH_PRIVATE_KEY
```

这个 Secret 填部署用 SSH 私钥内容；不要提交到仓库。workflow 会：

- 安装依赖并运行 `pnpm run check`、`pnpm run check:skills`
- 构建指向 `https://backstage.artxsd.com` 的发布包
- 上传到 `43.161.241.133:/tmp`
- 解压到 `/opt/artx-gray-backend/releases`
- 切换 `/opt/artx-gray-backend/current`
- 重启 `artx-gray-backend.service`
- 验证公网 `https://backstage.artxsd.com/deployment.json`

默认自动发布只跑非消耗型 smoke。手动触发 workflow 时把 `run_full_smoke` 设为 `true`，才会额外跑 Skill 生图和 Wallyt 回调验证。

## 服务器目录

推荐目录：

```text
/var/www/artx-backstage/releases   # 每次上传解压的版本
/var/www/artx-backstage/current    # 指向当前版本的软链接
/var/lib/artx                 # 后端持久化数据
/var/lib/artx/uploads         # 生成图片和上传图片
/var/log/artx                 # PM2 日志
```

后端运行环境变量：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
ARTX_DATA_DIR=/var/lib/artx
ARTX_UPLOADS_DIR=/var/lib/artx/uploads
ARTX_ADMIN_DATA_BACKEND=json
ARTX_AUTH_DATA_BACKEND=json
```

真实 token、支付密钥、OAuth secret、数据库密码只放服务器环境或进程管理器，不写进仓库。

## 部署步骤

在服务器上执行：

```bash
mkdir -p /var/www/artx-backstage/releases /var/lib/artx/uploads /var/log/artx
tar -xzf artx-backstage-YYYYMMDD-HHMMSS.tar.gz -C /var/www/artx-backstage/releases
ln -sfn /var/www/artx-backstage/releases/artx-backstage-YYYYMMDD-HHMMSS /var/www/artx-backstage/current
cd /var/www/artx-backstage/current
pnpm install --prod --frozen-lockfile
pm2 startOrReload deploy/tencent-cloud/ecosystem.config.cjs
pm2 save
```

Nginx 示例在 `deploy/tencent-cloud/artx-backstage.nginx.conf`：

- `backstage.artxsd.com/` 指向 `dist/public`
- `backstage.artxsd.com/api/` 反向代理到 `127.0.0.1:3000/api/`
- `backstage.artxsd.com/uploads/` 反向代理到 `127.0.0.1:3000/uploads/`

灰度环境未正式开放前，应启用 Basic Auth、IP 白名单、账号白名单或邀请码之一。

## 验证

服务器上先跑审计：

```bash
APP_DIR=/var/www/artx-backstage/current \
ARTX_DATA_DIR=/var/lib/artx \
ARTX_UPLOADS_DIR=/var/lib/artx/uploads \
BACKEND_URL=http://127.0.0.1:3000 \
PUBLIC_URL=https://backstage.artxsd.com \
scripts/audit-tencent-cloud-backend.sh
```

必须验证：

- `df -h` 空间足够。
- `du -sh /var/www/artx-backstage/current /var/lib/artx /var/lib/artx/uploads` 体积符合预期。
- `http://127.0.0.1:3000/api/health` 正常。
- `https://backstage.artxsd.com/api/health` 正常。
- 登录、支付回调、AI 图片生成、`/uploads/...` 图片访问正常。
- 前端 API 请求已经指向腾讯云灰度后端，不再打到 Render。

灰度 smoke 脚本：

```bash
BACKEND_URL=https://backstage.artxsd.com \
PUBLIC_URL=https://backstage.artxsd.com \
node scripts/verify-tencent-cloud-gray.mjs
```

默认只验证健康检查、支付配置和图片代理，不消耗 AI 额度、不创建用户，也不模拟成功支付。需要验证登录时加 `RUN_AUTH=1`。确认服务器环境变量完整后再打开真实链路：

```bash
BACKEND_URL=https://backstage.artxsd.com \
PUBLIC_URL=https://backstage.artxsd.com \
RUN_AUTH=1 \
RUN_SKILL_IMAGE=1 \
RUN_WALLYT_CALLBACK=1 \
node scripts/verify-tencent-cloud-gray.mjs
```

`RUN_SKILL_IMAGE=1` 会创建 Skill 生图后台任务并下载生成图，验证 `/uploads` 可访问。`RUN_WALLYT_CALLBACK=1` 会创建一笔 HKD 10 测试充值订单，并使用服务器环境中的 `WALLYT_SIGNATURE_KEY` 生成威富通回调签名；脚本不会打印密钥值。

## 回滚

保留旧 release 目录时，回滚只需要切软链接并重载 PM2：

```bash
ln -sfn /var/www/artx-backstage/releases/OLD_RELEASE /var/www/artx-backstage/current
cd /var/www/artx-backstage/current
pm2 startOrReload deploy/tencent-cloud/ecosystem.config.cjs
```

不要删除 `/var/lib/artx`，它是运行数据和上传图片目录。
