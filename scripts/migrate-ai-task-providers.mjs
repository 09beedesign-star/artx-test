/**
 * 把 aiTasks 里的脏 provider 值迁移成真实厂商名。
 *
 * 背景：server/index.ts 曾把 resolveModelRoute().provider（取值只有
 * "image"/"text" 的流水线分类）当成厂商名写库，另有两处硬编码 "AI"，
 * 中转站还被写成环境变量前缀 "AI_IMAGE"。这些值在健康度列表里
 * 都找不到对应条目，成本分组里变成无归属孤儿，且不会报任何错。
 *
 * 代码侧已在同一批改动里修好，本脚本只处理存量记录。
 *
 * 安全设计：
 * - 事务内 select ... for update 加行锁
 * - 迁移后逐项复核，条数/残留脏值不符即 throw 回滚
 * - 只改 provider 一个字段，其余字段原样保留
 * - 不认识的 provider 值一律跳过，不做兜底猜测
 *
 * 前置：必须先备份。
 * 用法：node scripts/migrate-ai-task-providers.mjs [--apply]
 * 不加 --apply 时只空跑，不写库。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BACKEND_ROOT = "/opt/artx-gray-backend";
const { Client } = require(path.join(BACKEND_ROOT, "current/node_modules/pg"));

const APPLY = process.argv.includes("--apply");

function readDatabaseUrl() {
  // 两个 .env.gray，父目录那个最终生效。
  // ⚠️ 不要用 shell 管道 + tr 解析 URL，会误删正常字符。
  for (const file of [`${BACKEND_ROOT}/.env.gray`, `${BACKEND_ROOT}/current/.env.gray`]) {
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^DATABASE_URL=(.*)$/m);
    if (match) return match[1].replace(/^['"]|['"]$/g, "");
  }
  throw new Error("DATABASE_URL not found in either .env.gray");
}

const PROVIDER_TENCENT_VOD = "腾讯云 VOD";
const PROVIDER_RELAY = "BKEEL";

/** 只迁移这四个已知脏值，其余一律不动。 */
const DIRTY_PROVIDERS = new Set(["image", "text", "AI", "AI_IMAGE"]);

/** 迁移后合法的厂商名，必须与 buildProviderHealth() 的 name 对齐。 */
const VALID_PROVIDERS = new Set([
  PROVIDER_TENCENT_VOD,
  PROVIDER_RELAY,
  "OpenAI",
  "PicWish/佐糖",
  "MEITU",
]);

/**
 * ⚠️ 按 model 的**字面值**判定，刻意不调用 normalizeImageModelId()。
 * 那个函数会把已下线的中转站模型映射到等价 VOD 模型，那是给「当前请求」
 * 用的。历史记录要还原的是当时真实发生的调用——这些任务发生在
 * 2026-09-11 切换 VOD 之前，当时确实走的中转站。用归一化后的 id 判断
 * 会把 70 条中转站历史调用错记成腾讯云 VOD，虚增 VOD 成本。
 */
function inferProvider(task) {
  const model = String(task.model || "").trim().toLowerCase();
  const capability = String(task.capabilityKey || task.capability || "");
  if (capability === "text_generation" || task.provider === "text") return PROVIDER_RELAY;
  if (model.startsWith("vod-")) return PROVIDER_TENCENT_VOD;
  return PROVIDER_RELAY;
}

async function main() {
  const client = new Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    // 加行锁，避免与在线写入竞争。
    const { rows } = await client.query(
      "select data from artx_json_documents where key = $1 for update",
      ["admin-data"]
    );
    if (!rows.length) throw new Error("admin-data document not found");

    const data = rows[0].data;
    const tasks = Array.isArray(data.aiTasks) ? data.aiTasks : [];
    const totalBefore = tasks.length;
    if (totalBefore === 0) throw new Error("aiTasks 为空，拒绝继续（疑似读到错误数据）");

    let migrated = 0;
    const mapping = new Map();
    for (const task of tasks) {
      const current = String(task.provider ?? "");
      if (!DIRTY_PROVIDERS.has(current)) continue;
      const target = inferProvider(task);
      if (!VALID_PROVIDERS.has(target)) {
        throw new Error(`推断出非法厂商名 "${target}"，拒绝写入`);
      }
      task.provider = target;
      migrated += 1;
      const key = `${current} → ${target}`;
      mapping.set(key, (mapping.get(key) || 0) + 1);
    }

    console.log(`aiTasks 总数：${totalBefore}`);
    console.log(`本次迁移：${migrated} 条\n`);
    for (const [k, v] of [...mapping].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)}  ${k}`);
    }

    // —— 硬闸门 ——
    if (tasks.length !== totalBefore) {
      throw new Error(`条数发生变化：${totalBefore} → ${tasks.length}，回滚`);
    }
    const remainingDirty = tasks.filter((t) => DIRTY_PROVIDERS.has(String(t.provider)));
    if (remainingDirty.length > 0) {
      throw new Error(`仍有 ${remainingDirty.length} 条脏值未迁移，回滚`);
    }
    const invalid = tasks.filter(
      (t) => !VALID_PROVIDERS.has(String(t.provider)) && !String(t.provider).startsWith("PicWish/佐糖 ")
    );
    if (invalid.length > 0) {
      const sample = [...new Set(invalid.map((t) => t.provider))].slice(0, 5);
      throw new Error(`存在 ${invalid.length} 条非法厂商名（样例 ${JSON.stringify(sample)}），回滚`);
    }

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\n[空跑] 未加 --apply，已回滚，数据库未改动。");
      return;
    }

    await client.query(
      "update artx_json_documents set data = $1::jsonb, updated_at = now() where key = $2",
      [JSON.stringify(data), "admin-data"]
    );
    await client.query("COMMIT");
    console.log("\n已提交。");

    // 写回后重新 select 复核，不能只看 exit code。
    const { rows: verifyRows } = await client.query(
      "select data from artx_json_documents where key = $1",
      ["admin-data"]
    );
    const verifyTasks = verifyRows[0].data.aiTasks || [];
    const byProvider = new Map();
    for (const task of verifyTasks) {
      const key = String(task.provider ?? "(空)");
      byProvider.set(key, (byProvider.get(key) || 0) + 1);
    }
    console.log(`\n复核：aiTasks ${verifyTasks.length} 条，provider 分布：`);
    for (const [name, count] of [...byProvider].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${name}`);
    }
    const stillDirty = verifyTasks.filter((t) => DIRTY_PROVIDERS.has(String(t.provider)));
    console.log(stillDirty.length === 0 ? "\n✅ 无残留脏值。" : `\n❌ 仍有 ${stillDirty.length} 条脏值！`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
