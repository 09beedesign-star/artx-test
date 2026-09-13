/**
 * 过期上传清理的调度方式防护测试。
 *
 * 背景（2026-09-13）：
 * 清理原先挂在 `server/index.ts` 的 `setInterval(runCleanup, 24h)` 上。真实问题不是
 * "重启会断档"，而是 **那个周期清理从未触发过一次**：生产 7 天重启 29 次（每次部署都重启），
 * 进程从未连续存活满 24 小时；再加上 `timer.unref()`，它连阻止进程退出都做不到。
 *
 * 更麻烦的是这个缺陷一直被掩盖：上传目录最老文件 9 天、保留期 10 天，
 * 从没有文件到达过清理线 —— 日志永远是"没删东西"，与"定时器没跑"表现完全一致，无法区分。
 * 也就是说**靠观察线上行为是发现不了它的**，只能靠这里的源码级红线锁住。
 *
 * 本文件分两层（少了任何一层都等于没写）：
 *   A. 源码层 —— 锁住 index.ts 不得把进程内周期调度加回来；
 *   B. 契约层 —— 锁住 CLI 入口、构建产物、systemd 单元三者路径/身份/环境变量对得上。
 *      这三者只要有一个对不上，线上表现都是"任务成功、删 0 个文件、零报错"。
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/**
 * 剥离整行注释。
 *
 * ⚠️ 这一步是必需的，不是洁癖：本文件断言的关键词（setInterval、24 小时等）
 * 恰恰大量出现在上面那些解释"为什么删掉它"的注释里。不剥离的话断言恒挂，
 * 而且挂得莫名其妙。**注释不是实现，断言只能锚实现。**
 */
function stripComments(source: string) {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** 切出 scheduleUploadCleanup 的函数体，避免拿整个文件做 toContain（等于没锁）。 */
function readScheduleFunctionBody(source: string) {
  const start = source.indexOf("function scheduleUploadCleanup()");
  expect(start, "server/index.ts 里找不到 scheduleUploadCleanup，函数被改名了就要同步改本测试").toBeGreaterThan(-1);

  // 从函数起点向后做花括号配平，取到函数结束。
  const openIndex = source.indexOf("{", start);
  let depth = 0;
  let end = openIndex;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  expect(end, "scheduleUploadCleanup 花括号未配平").toBeGreaterThan(openIndex);
  return source.slice(start, end);
}

describe("过期上传清理：调度方式（源码层）", () => {
  const indexSource = read("server/index.ts");
  const indexCode = stripComments(indexSource);

  it("scheduleUploadCleanup 内不得出现任何进程内周期调度", () => {
    const body = stripComments(readScheduleFunctionBody(indexSource));

    // 正向点名已知的两种写法。
    expect(body).not.toMatch(/setInterval/);
    expect(body).not.toMatch(/setTimeout/);

    // ⚠️ 反向断言：只点名 setInterval/setTimeout 只能守住已知出口。
    // 换成 node:timers 的 promises 版、或者自己写个递归 schedule，同样是进程内周期调度，
    // 同样会被部署重启打断。这里把"周期"这个语义本身也锁上。
    expect(body).not.toMatch(/node:timers/);
    expect(body).not.toMatch(/setIntervalAsync|scheduleJob|node-cron|cron\.schedule/);
    expect(body).not.toMatch(/24\s*\*\s*60\s*\*\s*60/);
  });

  it("整个 server/index.ts 都不得再出现 setInterval", () => {
    // 这条比上一条宽，是有意的：防止有人把周期逻辑挪到 index.ts 的别处再调用。
    // 📌 将来若真有正当的 setInterval 需求，先问一句"这活是不是该交给 systemd timer"，
    //    确认确实需要再在此处放行并写明理由 —— 不要直接删掉这条断言。
    expect(indexCode).not.toMatch(/setInterval/);
  });

  it("已删除的 24 小时间隔常量不得复活", () => {
    expect(indexCode).not.toMatch(/UPLOAD_CLEANUP_INTERVAL_MS/);
  });

  it("启动时的那一次兜底清理必须保留", () => {
    // 反向的一面：不能因为"改成 timer 了"就把启动清理也删掉。
    // timer 未部署 / 被 disable 时，这是唯一的清理路径。
    const body = readScheduleFunctionBody(indexSource);
    expect(body).toMatch(/cleanupExpiredUploads\(\)/);
    expect(indexCode).toMatch(/scheduleUploadCleanup\(\)/);
  });
});

describe("过期上传清理：CLI 与 systemd 契约（契约层）", () => {
  const cliSource = read("server/cleanup-uploads-cli.ts");
  const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const serviceUnit = read("deploy/uploads-cleanup/artx-uploads-cleanup.service");
  const timerUnit = read("deploy/uploads-cleanup/artx-uploads-cleanup.timer");
  const backendService = read("server/index.ts"); // 仅用于存在性，真实口径见下面的显式常量

  /**
   * 生产主服务 artx-gray-backend.service 里的值（2026-09-13 实地 SSH 核对）。
   * ⚠️ 这两个值一旦和清理任务不一致，线上表现是"清理成功、删 0 个文件、零报错"——
   * 最难查的那种故障。所以写死在测试里做交叉校验。
   */
  const PRODUCTION_UPLOADS_DIR = "/var/lib/artx-shared/uploads";
  const PRODUCTION_DATA_DIR = "/var/lib/artx-gray";
  const PRODUCTION_RUN_USER = "artx";

  it("CLI 入口必须被打进构建产物", () => {
    const build = packageJson.scripts.build;
    expect(build).toContain("server/cleanup-uploads-cli.ts");

    // 交叉校验：systemd 里 ExecStart 指的产物名，必须和 esbuild 的 entry 推导出来的一致。
    // 光断言"build 里有这个 entry"挡不住有人改了文件名却忘了改单元文件。
    expect(serviceUnit).toContain("dist/cleanup-uploads-cli.js");
  });

  it("CLI 失败必须以非零码退出（否则 systemd 认为成功，告警永远不响）", () => {
    expect(cliSource).toMatch(/process\.exit\(1\)/);
    expect(cliSource).toMatch(/\.catch\(/);
  });

  it("CLI 必须支持 --dry-run（上线首跑用它核对目录口径）", () => {
    expect(cliSource).toContain("--dry-run");
  });

  it("service 的运行身份必须与主服务一致", () => {
    // 用 root 跑会把新建的空目录属主弄成 root，之后后端（artx 身份）再写入就 EACCES。
    expect(serviceUnit).toMatch(new RegExp(`^User=${PRODUCTION_RUN_USER}$`, "m"));
    expect(serviceUnit).toMatch(new RegExp(`^Group=${PRODUCTION_RUN_USER}$`, "m"));
    expect(serviceUnit).not.toMatch(/^User=root$/m);
  });

  it("service 的目录环境变量必须与主服务逐字一致", () => {
    expect(serviceUnit).toContain(`Environment=ARTX_UPLOADS_DIR=${PRODUCTION_UPLOADS_DIR}`);
    expect(serviceUnit).toContain(`Environment=ARTX_DATA_DIR=${PRODUCTION_DATA_DIR}`);
    expect(serviceUnit).toContain(`ReadWritePaths=`);
    expect(serviceUnit).toContain(PRODUCTION_UPLOADS_DIR);
  });

  it("service 必须走 current 软链而不是写死某个 release 目录", () => {
    // current 每次部署重新指向新 release。写死 release 路径 = 部署后清理任务指向旧包，
    // 且旧包会被 artx-release-cleanup 删掉，最终 ExecStart 文件不存在。
    expect(serviceUnit).toContain("/opt/artx-gray-backend/current/dist/cleanup-uploads-cli.js");
    expect(serviceUnit).not.toMatch(/\/opt\/artx-gray-backend\/releases\//);
  });

  it("timer 必须开启 Persistent，错过的那次要能补跑", () => {
    // 这正是替换 setInterval 的核心价值：机器在计划点关机/重启，开机后补跑。
    expect(timerUnit).toMatch(/^Persistent=true$/m);
    expect(timerUnit).toMatch(/^OnCalendar=/m);
    expect(timerUnit).toMatch(/^WantedBy=timers\.target$/m);
  });

  it("timer 的执行时刻必须排在每日备份之后", () => {
    // 03:20 artx-backup（+最多 10min 随机延迟）→ 清理必须晚于 03:30，
    // 保证被删的文件已经进过当天备份，误删还能捞回来。
    const match = timerUnit.match(/^OnCalendar=\*-\*-\* (\d{2}):(\d{2}):\d{2}$/m);
    expect(match, "OnCalendar 必须是每日固定时刻的形式").not.toBeNull();
    const hour = Number(match![1]);
    const minute = Number(match![2]);
    const minutes = hour * 60 + minute;
    expect(minutes).toBeGreaterThan(3 * 60 + 30); // 晚于备份最晚完成时间
    expect(minutes).toBeLessThan(4 * 60 + 2); // 早于 04:02 的 cos-sync
  });

  it("部署文档必须存在且写明了 dry-run 核对步骤", () => {
    const readme = read("deploy/uploads-cleanup/README.md");
    expect(readme).toContain("--dry-run");
    expect(readme).toContain(PRODUCTION_UPLOADS_DIR);
    expect(backendService.length).toBeGreaterThan(0);
  });
});
