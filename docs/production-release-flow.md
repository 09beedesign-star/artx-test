# ArtX 正式发布默认流程

## 默认原则

- 正式发布必须先经过测试/灰度环境验收，不要从本地或临时分支直接发布正式环境。
- 测试/灰度入口：`https://backstage.artxsd.com`
- 正式入口：`https://www.artxsd.com`
- Render 不再作为测试/灰度后端；测试/灰度 API 默认使用腾讯云 `https://backstage.artxsd.com`。
- 正式环境应与灰度环境隔离代码目录、服务名和数据目录，避免测试数据污染正式用户数据。
- 凭据只放服务器环境变量、systemd EnvironmentFile、GitHub Secrets 或云服务商密钥管理中，文档和代码只记录变量名与位置。

## 环境分层

### 测试/灰度环境

- 域名：`https://backstage.artxsd.com`
- 后端目录：`/opt/artx-gray-backend/current`
- 服务名：`artx-gray-backend.service`
- 本机端口：`127.0.0.1:3002`
- 数据目录：`/var/lib/artx-gray`
- 上传目录：`/var/lib/artx-gray/uploads`
- 发布触发：测试分支更新后由 `.github/workflows/deploy-tencent-cloud.yml` 自动部署。

### 正式环境

正式环境应单独建立，推荐：

- 域名：`https://www.artxsd.com`
- 后端目录：`/opt/artx-prod/current`
- 服务名：`artx-prod.service`
- 本机端口：`127.0.0.1:3003`
- 数据目录：`/var/lib/artx-prod`
- 上传目录：`/var/lib/artx-prod/uploads`
- 管理后台继续独立使用 `admin.artxsd.com`，不要把正式用户站点和管理后台混成同一入口。

## 发布前检查

正式发布前必须确认：

- `https://backstage.artxsd.com/deployment.json` 的 `backendUrl` 是 `https://backstage.artxsd.com`。
- 灰度完整 smoke 通过：
  - `/api/health`
  - 登录
  - Skill 生图
  - Wallyt 支付回调
  - 图片代理 `/api/images/proxy`
  - 生成图 `/uploads/...` 下载
- 当前变更已在灰度环境人工验收通过。
- 正式环境数据目录、上传目录、Nginx 配置和 systemd 服务已经备份。
- 正式环境密钥配置齐全，且没有把 token、支付密钥、数据库密码写入代码或聊天内容。

## 推荐发布步骤

1. 确认测试分支已自动发布到 `https://backstage.artxsd.com`。
2. 在灰度环境跑非消耗 smoke：

```bash
BACKEND_URL=https://backstage.artxsd.com \
PUBLIC_URL=https://backstage.artxsd.com \
node /opt/artx-gray-backend/current/scripts/verify-tencent-cloud-gray.mjs
```

3. 在需要正式验收 AI/支付时，手动跑完整 smoke：

```bash
BACKEND_URL=https://backstage.artxsd.com \
PUBLIC_URL=https://backstage.artxsd.com \
RUN_AUTH=1 \
RUN_WALLYT_CALLBACK=1 \
RUN_SKILL_IMAGE=1 \
node /opt/artx-gray-backend/current/scripts/verify-tencent-cloud-gray.mjs
```

4. 备份正式环境：

```bash
systemctl status artx-prod.service
du -sh /opt/artx-prod /var/lib/artx-prod /var/lib/artx-prod/uploads
```

5. 构建正式发布包时显式设置正式域名：

```bash
GRAY_PUBLIC_URL=https://www.artxsd.com \
RELEASE_NAME=artx-prod-YYYYMMDD-HHMMSS \
pnpm run package:tencent-cloud
```

6. 上传正式发布包到服务器，解压到 `/opt/artx-prod/releases/RELEASE_NAME`。
7. 复制正式环境专用 `.env` 或 `.env.prod`，确认：

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3003
ARTX_DATA_DIR=/var/lib/artx-prod
ARTX_UPLOADS_DIR=/var/lib/artx-prod/uploads
PUBLIC_APP_URL=https://www.artxsd.com
APP_PUBLIC_URL=https://www.artxsd.com
SITE_URL=https://www.artxsd.com
OAUTH_PUBLIC_BASE_URL=https://www.artxsd.com
OAUTH_FRONTEND_URL=https://www.artxsd.com
WALLYT_NOTIFY_URL=https://www.artxsd.com/api/billing/wallyt/callback
```

8. 切换正式 `current` 软链接并重启：

```bash
ln -sfn /opt/artx-prod/releases/RELEASE_NAME /opt/artx-prod/current
cd /opt/artx-prod/current
pnpm install --prod --frozen-lockfile
systemctl restart artx-prod.service
```

9. 验证正式公网：

```bash
curl -fsS https://www.artxsd.com/api/health
curl -fsS https://www.artxsd.com/deployment.json
```

10. 人工验证正式站点关键链路：

- 首页和工作区打开正常
- 登录/注册正常
- AI 生图和 Skill 生图正常
- 图片代理正常
- 生成图下载正常
- 支付下单和回调正常
- 后台管理端仍通过 `admin.artxsd.com` 正常访问

## 回滚

保留上一个正式 release。回滚时不要删除数据目录，只切代码版本：

```bash
ln -sfn /opt/artx-prod/releases/PREVIOUS_RELEASE /opt/artx-prod/current
systemctl restart artx-prod.service
curl -fsS https://www.artxsd.com/api/health
```

如果问题来自数据或支付回调，不要直接回滚数据；先停写入、备份现场，再单独处理。

## 默认记忆

以后用户说“发布正式环境”，默认含义是：

1. 先确认 `https://backstage.artxsd.com` 灰度通过。
2. 再发布到 `https://www.artxsd.com`。
3. 正式服务、正式数据、正式上传目录必须与灰度隔离。
4. 发布后必须验证 AI、Skill、支付回调、图片代理、下载、登录和后台管理入口。
