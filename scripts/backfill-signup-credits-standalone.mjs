#!/usr/bin/env node
/**
 * 补发 10-19 注册用户的初始 350 积分（独立版，不依赖 server/ 模块）
 * 
 * 背景：10-18 23:59:59 注册初始积分活动过期，10-19 及之后注册的用户没收到积分。
 * 现已改为长期规则（删除 activeUntil），需补发已注册但未发放的用户。
 * 
 * ⚠️ 本脚本独立操作数据库，不经过应用层 API。
 * 必须在生产机上、项目目录内运行（需要 .env 和 node_modules）。
 * 
 * 用法：
 *   cd /opt/artx-gray-backend/current
 *   source .env
 *   npx tsx scripts/backfill-signup-credits-standalone.mjs
 */

import pg from "pg";
import fs from "fs";

// 手动加载 .env（必须在 connect 前，dotenv 不在生产依赖）
const envPath = new URL("../.env", import.meta.url);
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

const SIGNUP_CREDITS = 350;
const EXPIRY_DAYS = 3;
const AFFECTED_DATE_START = "2026-10-19";  // 含此日

async function main() {
  // 使用 DATABASE_URL 连接（生产环境配置）
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  await client.connect();

  try {
    // 1. 从独立的 auth-users key 查 10-19 及之后注册的用户
    const authRes = await client.query(`
      SELECT data FROM artx_json_documents WHERE key = 'auth-users'
    `);
    if (authRes.rows.length === 0) {
      console.log("❌ auth-users key not found");
      return;
    }
    const authData = authRes.rows[0].data;
    const affectedUsers = authData.users.filter(
      (u) => u.createdAt && u.createdAt >= AFFECTED_DATE_START
    );

    console.log(`\n📋 受影响用户（${AFFECTED_DATE_START} 及之后注册）: ${affectedUsers.length} 人\n`);
    if (affectedUsers.length === 0) {
      console.log("✅ 无需补发");
      return;
    }

    // 2. 读取 admin-data 判断哪些还没发过
    const adminRes = await client.query(`
      SELECT data FROM artx_json_documents WHERE key = 'admin-data'
    `);
    if (adminRes.rows.length === 0) {
      console.log("❌ admin-data key not found");
      return;
    }
    const adminData = adminRes.rows[0].data;

    const toGrant = [];
    for (const user of affectedUsers) {
      const idempotencyKey = `signup-bonus:${user.id}`;
      const alreadyGranted =
        adminData.credits?.some((e) => e.userId === user.id && e.source === idempotencyKey) ||
        adminData.creditBatches?.some((b) => b.userId === user.id && b.source.startsWith("signup-bonus/"));

      if (!alreadyGranted) {
        toGrant.push(user);
      }
    }

    console.log(`需要补发: ${toGrant.length} 人\n`);
    if (toGrant.length === 0) {
      console.log("✅ 所有受影响用户已发放，无需补发");
      return;
    }

    console.log("用户清单:");
    toGrant.forEach((u) => {
      console.log(`  - ${u.username} (${u.id}) 注册于 ${u.createdAt}`);
    });

    console.log(`\n⚠️  本脚本将为以上 ${toGrant.length} 位用户各发放 ${SIGNUP_CREDITS} 积分（有效期 ${EXPIRY_DAYS} 天）`);
    console.log("⚠️  确认后请手动执行补发逻辑或使用应用层 API");
    console.log("\n💡 推荐做法：让用户重新登录，触发 ensureUser → grantSignupInitialCredits 自动发放");

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
