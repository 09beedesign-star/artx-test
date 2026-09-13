# 过期上传文件清理（systemd timer）

## 这是在修什么

清理逻辑原先挂在 `server/index.ts` 的 `setInterval(runCleanup, 24h)` 上。真实问题比"重启会断档"严重得多：

- 生产 7 天内重启 **29 次**（每次部署都重启），进程从未连续存活满 24 小时 → **那个周期清理从未触发过一次**；
- 代码里还有 `timer.unref()`，它连阻止进程退出的能力都没有；
- 实际生效的只有"启动时那一次"。

缺陷一直被掩盖：上传目录最老文件 9 天、保留期 10 天，**从没有文件到达过清理线**，日志永远是"没删东西"——与"定时器压根没跑"表现完全一致，无法区分。等到有文件超期时才会暴露，那时磁盘已经涨上去了。

现在：周期由 systemd timer 驱动，`server/index.ts` 只保留**启动时一次**作为兜底（timer 未部署/被禁用时仍有清理）。

## 部署

在服务器上（`root@43.161.241.133`）：

```bash
# 1. 确认发布包里有 CLI 产物（build 脚本已加该 entry）
ls -l /opt/artx-gray-backend/current/dist/cleanup-uploads-cli.js

# 2. 安装单元文件
install -m 0644 artx-uploads-cleanup.service /etc/systemd/system/
install -m 0644 artx-uploads-cleanup.timer   /etc/systemd/system/
systemctl daemon-reload

# 3. 先干跑确认路径口径正确（不删任何文件）
sudo -u artx env \
  ARTX_DATA_DIR=/var/lib/artx-gray \
  ARTX_UPLOADS_DIR=/var/lib/artx-shared/uploads \
  /usr/bin/node /opt/artx-gray-backend/current/dist/cleanup-uploads-cli.js --dry-run
# 期望输出 uploadsRoot=/var/lib/artx-shared/uploads，retentionDays 与 .env.gray 一致

# 4. 手动跑一次真实清理
systemctl start artx-uploads-cleanup.service
systemctl status artx-uploads-cleanup.service --no-pager
tail -n 5 /var/log/artx/uploads-cleanup.log

# 5. 启用定时器
systemctl enable --now artx-uploads-cleanup.timer
systemctl list-timers artx-uploads-cleanup.timer --no-pager
```

## 验证清单

| 检查项 | 命令 | 期望 |
| --- | --- | --- |
| CLI 产物存在 | `ls dist/cleanup-uploads-cli.js` | 文件存在 |
| 清理的是对的目录 | `--dry-run` 输出的 `uploadsRoot` | `/var/lib/artx-shared/uploads` |
| 新建目录属主正确 | `ls -ld /var/lib/artx-shared/uploads/images` | `artx artx`，不能是 `root` |
| timer 已排程 | `systemctl list-timers artx-uploads-cleanup.timer` | NEXT 有值 |
| 错过会补跑 | 单元文件含 `Persistent=true` | 是 |

## 常见坑

- **`ARTX_UPLOADS_DIR` 写错 → 静默无效**：清理会成功退出、删 0 个文件、不报错。上线后务必用 `--dry-run` 核对 `uploadsRoot`。
- **别用 `User=root` 跑**：会把新建的空目录属主弄成 `root`，之后后端（`artx` 身份）往里写就 `EACCES`。
- **`current` 是软链**，每次部署重新指向新 release 目录。`ExecStart` 走 `current/` 而不是具体 release 路径，才能跟着部署自动更新。
- **两个 `.env.gray`，父目录那个最终生效**（systemd 顺序加载，后者覆盖前者）。service 里两个 `EnvironmentFile=-` 的顺序与主服务保持一致。
- **改周期请改 timer 的 `OnCalendar`**，不要把 `setInterval` 加回 `server/index.ts`（有防护测试 `server/uploads-cleanup-schedule.test.ts` 锁着）。

## 时间点排布

```
03:20  artx-backup            （+ 最多 10min 随机延迟）
03:50  artx-uploads-cleanup   ← 本任务，排在备份之后，被删文件已进过当天备份
04:02  artx-cos-sync-daily
04:10  artx-release-cleanup   （仅周日）
```
