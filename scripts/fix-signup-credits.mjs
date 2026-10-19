/**
 * 修复注册赠送积分问题
 * 1. 移除 activeUntil 限制，让新注册永久有效
 * 2. 为 5 位受影响用户补发 350 积分
 */
import pg from 'pg';
import { readFileSync } from 'fs';

// 读取 .env 文件
const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=#]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
});

const client = new pg.Client({ connectionString: envVars.DATABASE_URL });

// 受影响的 5 位用户
const AFFECTED_USERS = [
  { id: '1b72e2dc-6081-443d-8a6a-8822f3052f53', username: '646662310@qq com', createdAt: '2026-10-19T00:47:27.288Z' },
  { id: 'b75a2630-977e-4a3f-8a27-402347b49d2e', username: '646662310@qq.com', createdAt: '2026-10-19T01:05:48.403Z' },
  { id: '2f18d459-39e3-48da-92fa-a893059aeade', username: 'zlluwu@qq.com', createdAt: '2026-10-19T01:59:48.082Z' },
  { id: '3993efed-848b-489f-9872-7ee6f09b92f7', username: 'slongw1988@gmail.com', createdAt: '2026-10-19T02:24:13.083Z' },
  { id: '9c1a18e6-e9c7-4ff7-9925-e0232fc58742', username: '2546595948@qq.com', createdAt: '2026-10-19T02:28:23.844Z' },
];

try {
  await client.connect();
  console.log('✅ 已连接到数据库');

  // 1. 读取 admin-data
  const adminResult = await client.query(
    "SELECT data FROM artx_json_documents WHERE key = 'admin-data'"
  );
  const adminData = adminResult.rows[0]?.data;
  
  if (!adminData) {
    throw new Error('未找到 admin-data 文档');
  }

  console.log('\n📋 当前配置:', JSON.stringify(adminData.signupInitialCredits, null, 2));

  // 2. 修改配置：移除 activeUntil
  const oldConfig = adminData.signupInitialCredits || {};
  const newConfig = {
    ...oldConfig,
    enabled: true,
    credits: 350,
    expiryDays: 3,
    activeUntil: null,  // 移除截止日期，永久有效
    configVersion: (oldConfig.configVersion || 0) + 1,
  };

  adminData.signupInitialCredits = newConfig;
  console.log('\n✏️  新配置:', JSON.stringify(newConfig, null, 2));

  // 3. 为受影响用户补发积分
  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setDate(expiryDate.getDate() + 3);

  AFFECTED_USERS.forEach(user => {
    const idempotencyKey = `signup-bonus:${user.id}`;
    
    // 检查是否已发放
    const alreadyGranted = (adminData.credits || []).some(
      entry => entry.userId === user.id && entry.source === idempotencyKey
    );
    
    if (alreadyGranted) {
      console.log(`⏭️  跳过 ${user.username}（已有积分记录）`);
      return;
    }

    // 添加积分记录
    if (!adminData.credits) adminData.credits = [];
    adminData.credits.push({
      userId: user.id,
      amount: 350,
      reason: '新用户注册初始额度',
      source: idempotencyKey,
      operator: '系统',
      createdAt: now.toISOString(),
      expiryDate: expiryDate.toISOString(),
    });

    // 添加批次记录
    if (!adminData.creditBatches) adminData.creditBatches = [];
    adminData.creditBatches.push({
      userId: user.id,
      username: user.username,
      amount: 350,
      reason: '新用户注册初始额度',
      source: `signup-bonus:${user.id}`,
      operator: '系统',
      createdAt: now.toISOString(),
      expiryDays: 3,
    });

    console.log(`✅ 为 ${user.username} 补发 350 积分（有效期 3 天）`);
  });

  // 4. 写回数据库
  await client.query(
    `
      INSERT INTO artx_json_documents (key, data, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key) DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = now()
    `,
    ['admin-data', JSON.stringify(adminData)]
  );

  console.log('\n✅ 数据已保存到数据库');
  console.log('\n📊 修复摘要:');
  console.log(`  - 移除了 activeUntil 限制（原值: ${oldConfig.activeUntil}）`);
  console.log(`  - 为 ${AFFECTED_USERS.length} 位用户补发了 350 积分`);
  console.log(`  - 未来新注册用户将自动获得 350 积分（有效期 3 天）`);

} catch (error) {
  console.error('\n❌ 错误:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
