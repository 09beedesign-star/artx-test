/**
 * 过期上传文件清理 —— 独立 CLI 入口，供 systemd timer 调用。
 *
 * 为什么需要它（2026-09-13）：
 * 原先清理挂在 server/index.ts 的 `setInterval(runCleanup, 24h)` 上，有两个问题，
 * 第二个比第一个严重得多：
 *
 *   1. 服务重启清理就断档；
 *   2. ⚠️ **周期清理实际上从未触发过一次**。生产 7 天内重启了 29 次（每次部署都重启），
 *      进程从来没有连续存活满 24 小时，所以只有启动时那一次 runCleanup() 在跑。
 *      加之 `timer.unref()`，这个定时器连阻止进程退出的能力都没有。
 *
 * 而且这个缺陷一直被掩盖着：上传目录里最老的文件才 9 天，保留期是 10 天，
 * 也就是说**还没有任何文件到达过清理线**，看日志永远是"没删东西"，
 * 与"定时器没跑"的表现完全一致，无法区分。
 *
 * 退出码：0 成功，1 失败（systemd 会记录并可据此告警）。
 * 输出单行 JSON，便于 journalctl 检索与后续接监控。
 */

import { cleanupExpiredUploads } from "./local-image-storage";
import { cleanupExpiredModels3D, getModel3DRoot } from "./model3d-storage";

async function main() {
  const startedAt = Date.now();
  const dryRun = process.argv.includes("--dry-run");
  // --models3d-only：3D 画布模型文件只保留 48 小时，由 artx-models3d-cleanup.timer 每小时调用，
  // 只扫 uploads/models3d，不碰图片/反馈附件（它们走每日 03:50 那个 timer）。
  const models3dOnly = process.argv.includes("--models3d-only");

  if (models3dOnly) {
    if (dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", target: "models3d", root: getModel3DRoot() }));
      return;
    }
    const result = await cleanupExpiredModels3D();
    console.log(JSON.stringify({ mode: "cleanup", target: "models3d", ...result, elapsedMs: Date.now() - startedAt }));
    return;
  }

  if (dryRun) {
    // 干跑只报告将要清理的口径，不做删除 —— 首次上线到生产时先跑这个确认路径正确。
    const { getUploadRetentionDays, getFeedbackRetentionDays, getUploadsRoot } = await import(
      "./local-image-storage"
    );
    console.log(
      JSON.stringify({
        mode: "dry-run",
        uploadsRoot: getUploadsRoot(),
        retentionDays: getUploadRetentionDays(),
        feedbackRetentionDays: getFeedbackRetentionDays(),
      })
    );
    return;
  }

  const result = await cleanupExpiredUploads();
  // 每日任务顺带回收一次过期模型，作为每小时 timer 的冗余兜底。
  const models3d = await cleanupExpiredModels3D();
  console.log(
    JSON.stringify({
      mode: "cleanup",
      ...result,
      models3dDeletedFiles: models3d.deletedFiles,
      elapsedMs: Date.now() - startedAt,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      mode: "cleanup",
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
