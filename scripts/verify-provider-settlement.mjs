#!/usr/bin/env node
/**
 * 只读验证：线上第三方接口面板是否返回「最近调用详情 + 结算入口 + 余额」。
 *
 * 用法：node scripts/verify-provider-settlement.mjs <base> <账号> <密码>
 * 例：  node scripts/verify-provider-settlement.mjs https://backstage.artxsd.com 09bee '***'
 *
 * ⚠️ 登录接口口径（server/auth-store.ts:1075）：
 *   - 路由 POST /api/auth/:action，action 在**路径里**（/api/auth/login）
 *   - 请求体字段是 `username`（不是 account）+ password
 *   - 返回体是**扁平**的 { token, user }
 *   - 失败登录累加 failedLoginCount，**5 次锁 15 分钟** —— 别拿它试密码
 *
 * 纯只读，不写任何数据。
 */
const [base, account, password] = process.argv.slice(2);
if (!base || !account || !password) {
  console.error("用法: node scripts/verify-provider-settlement.mjs <base> <账号> <密码>");
  process.exit(1);
}

const loginRes = await fetch(`${base.replace(/\/+$/, "")}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: account, password }),
});
const loginBody = await loginRes.json().catch(() => null);
if (!loginRes.ok || !loginBody?.token) {
  console.error(`登录失败 HTTP ${loginRes.status}:`, JSON.stringify(loginBody).slice(0, 200));
  process.exit(1);
}

const res = await fetch(`${base.replace(/\/+$/, "")}/api/admin/providers`, {
  headers: { authorization: `Bearer ${loginBody.token}` },
});
const body = await res.json();
const providers = body.providers || [];

console.log(`共 ${providers.length} 个第三方接口条目\n`);

let withLastCall = 0;
let withBalance = 0;

for (const p of providers) {
  console.log(`▸ ${p.name} (${p.id}) · ${p.category} · ${p.state}`);
  console.log(`  延迟 ${p.latencyMs}ms · 最近检查 ${p.lastCheckedAt}`);

  if (p.lastCall) {
    withLastCall += 1;
    const c = p.lastCall;
    console.log(
      `  最近调用：${c.capability} / ${c.model} · ${c.status} · ${c.latencyMs}ms · ${c.relativeTime}`
    );
    console.log(`            上游任务号 ${c.providerTaskId} · 成本 ${c.estimatedCost}`);
  } else {
    console.log("  最近调用：无记录（延迟为静态基线）");
  }

  if (p.recentStats?.total) {
    const s = p.recentStats;
    console.log(
      `  近 24h：${s.total} 次 · 成功 ${s.succeeded} · 失败 ${s.failed} · 平均 ${s.avgLatencyMs}ms`
    );
  }

  if (p.settlement) {
    const s = p.settlement;
    if (s.billingApi) {
      if (s.balanceSummary) {
        withBalance += 1;
        console.log(`  余额：${s.balanceSummary}`);
      } else if (s.balanceError) {
        console.log(`  余额查询失败：${s.balanceError}`);
      } else {
        console.log("  余额：查询中/无返回");
      }
    } else {
      console.log("  余额：该厂商未开放接口");
    }
    console.log(`  结算入口：${s.label} → ${s.consoleUrl || "(无)"}`);
  }
  console.log("");
}

console.log(`--- 汇总：${withLastCall} 个有调用记录，${withBalance} 个查到实时余额 ---`);
