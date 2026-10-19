#!/usr/bin/env node
/**
 * 补发 2026-10-19 注册用户的初始 350 积分
 *
 * 背景：activeUntil 原为 "2026-10-18"，10-19 改为永久发放。
 * 10-19 当天已注册的用户（共 3 位）没有拿到初始积分，需要补发。
 *
 * 安全措施：
 * 1. 只补 10-19 注册的用户（`createdAt LIKE '2026-10-19%'`）
 * 2. 已有 signup batch 的用户跳过（幂等）
 * 3. 先打印清单，确认后再执行
 * 4. 调用 grantSignupInitialCredits（已有幂等逻辑）
 */

import pg from "pg";
import process from "node:process";
import { grantSignupInitialCredits } from "../server/admin-store.ts";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432", 10),
  database: process.env.PG_DATABASE || "artx",
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    // 查询 10-19 注册的所有用户（auth 库）
    const authResult = await client.query(`
      SELECT id, username, email, "createdAt"
      FROM "auth-users"
      WHERE "createdAt" >= '2026-10-19T00:00:00Z'
        AND "createdAt" < '2026-10-20T00:00:00Z'
      ORDER BY "createdAt"
    `);

    if (authResult.rows.length === 0) {
      console.log("✅ 没有找到 10-19 注册的用户，无需补发");
      return;
    }

    console.log(`\n📊 找到 ${authResult.rows.length} 位 10-19 注册的用户：\n`);
    for (const row of authResult.rows) {
      console.log(
        `  ${row.id} | ${row.username || row.email} | ${row.createdAt}`,
      );
    }

    // 查询 admin-data 的 creditBatches，看哪些用户已经有 signup batch
    const adminResult = await client.query(`
      SELECT value FROM artx_json_documents WHERE key = 'admin-data'
    `);
    if (adminResult.rows.length === 0) {
      console.error("❌ admin-data 不存在，无法补发");
      process.exit(1);
    }

    const adminData = adminResult.rows[0].value;
    const batches = adminData.creditBatches || [];
    const signupUserIds = new Set();
    for (const batch of batches) {
      if (batch.source && batch.source.startsWith("signup-bonus/")) {
        signupUserIds.add(batch.userId);
      }
    }

    const needBackfill = [];
    const alreadyGranted = [];
    for (const user of authResult.rows) {
      if (signupUserIds.has(user.id)) {
        alreadyGranted.push(user);
      } else {
        needBackfill.push(user);
      }
    }

    if (alreadyGranted.length > 0) {
      console.log(`\n✅ ${alreadyGranted.length} 位用户已有 signup batch，跳过：\n`);
      for (const user of alreadyGranted) {
        console.log(`  ${user.id} | ${user.username || user.email}`);
      }
    }

    if (needBackfill.length === 0) {
      console.log("\n✅ 所有用户均已发放，无需补发");
      return;
    }

    console.log(`\n💰 ${needBackfill.length} 位用户需要补发：\n`);
    for (const user of needBackfill) {
      console.log(`  ${user.id} | ${user.username || user.email}`);
    }

    const DRY_RUN = process.env.DRY_RUN !== "false";
    if (DRY_RUN) {
      console.log("\n🔍 DRY_RUN 模式（默认）：只展示清单，不执行补发");
      console.log("   若要真实补发，请设置环境变量 DRY_RUN=false 再运行\n");
      return;
    }

    console.log("\n🚀 开始补发...\n");
    let success = 0;
    let failed = 0;

    for (const user of needBackfill) {
      try {
        const amount = await grantSignupInitialCredits({
          userId: user.id,
          username: user.username || user.email || user.id,
          now: new Date(user.createdAt),
        });
        if (amount > 0) {
          console.log(`  ✅ ${user.id} 发放 ${amount} 积分`);
          success++;
        } else {
          console.log(`  ⚠️  ${user.id} 返回 0（可能已发放或条件不满足）`);
        }
      } catch (err) {
        console.error(`  ❌ ${user.id} 失败:`, err.message);
        failed++;
      }
    }

    console.log(`\n📊 补发完成：成功 ${success}，失败 ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("❌ 补发脚本异常:", err);
    process.exit(1);
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
