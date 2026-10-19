import pg from 'pg';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=#]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
});

const client = new pg.Client({ connectionString: envVars.DATABASE_URL });

const USERS = [
  '1b72e2dc-6081-443d-8a6a-8822f3052f53',
  'b75a2630-977e-4a3f-8a27-402347b49d2e',
  '2f18d459-39e3-48da-92fa-a893059aeade',
  '3993efed-848b-489f-9872-7ee6f09b92f7',
  '9c1a18e6-e9c7-4ff7-9925-e0232fc58742',
];

try {
  await client.connect();
  
  const result = await client.query(
    "SELECT data FROM artx_json_documents WHERE key = 'admin-data'"
  );
  const adminData = result.rows[0]?.data;
  
  console.log('\n📊 受影响用户的积分记录:\n');
  
  USERS.forEach(userId => {
    const userCredits = (adminData.credits || []).filter(c => c.userId === userId);
    const signupBonus = userCredits.find(c => c.source?.startsWith('signup-bonus:'));
    
    if (signupBonus) {
      console.log(`✅ ${userId}:`);
      console.log(`   金额: ${signupBonus.amount} 积分`);
      console.log(`   原因: ${signupBonus.reason}`);
      console.log(`   过期时间: ${signupBonus.expiryDate}`);
    } else {
      console.log(`❌ ${userId}: 未找到注册赠送记录`);
    }
  });
  
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
