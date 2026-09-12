/**
 * 核对后台「第三方接口」健康度列表是否包含预期供应商，并打印各自配置状态。
 *
 * 只读脚本：登录 → 拉 /api/admin/providers → 打印 + 校验必备条目。不写任何数据。
 *
 * 用法：
 *   node scripts/verify-admin-providers.mjs <base> <账号> <密码>
 * 例：
 *   node scripts/verify-admin-providers.mjs https://backstage.artxsd.com 09bee '******'
 *
 * 接口口径（见 server/auth-store.ts 的 handleAuthAction）：
 *   - 路由是 POST /api/auth/:action，action 在**路径**里（/api/auth/login），
 *     不是 /api/auth + body.action
 *   - 登录字段是 `username`（不是 account）+ `password`
 *   - 返回体是**扁平**的 { token, user }，不是 { session: { token, user } }
 *
 * ⚠️ 登录失败会累加 failedLoginCount，连续 5 次锁 15 分钟。别拿它爆破试密码。
 */

/** 必须存在的 AI 供应商条目：id → 展示名（与 buildProviderHealth 的 name 一致）。 */
const REQUIRED_AI_PROVIDERS = {
  ai_tencent_vod: "腾讯云 VOD",
  ai_picwish: "PicWish/佐糖",
  ai_meitu: "MEITU",
};

const base = (process.argv[2] || "https://backstage.artxsd.com").replace(/\/+$/, "");
const account = process.argv[3];
const password = process.argv[4];

if (!account || !password) {
  console.error("用法: node scripts/verify-admin-providers.mjs <base> <账号> <密码>");
  process.exit(2);
}

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: account, password }),
});

const loginBody = await login.json().catch(() => ({}));
if (!login.ok) {
  console.error("登录失败:", login.status, JSON.stringify(loginBody).slice(0, 300));
  process.exit(1);
}

const token = loginBody?.token;
if (!token) {
  console.error("登录成功但拿不到 token:", JSON.stringify(loginBody).slice(0, 300));
  process.exit(1);
}
console.log(`登录成功 (${base}), role = ${loginBody?.user?.role}`);

const res = await fetch(`${base}/api/admin/providers`, {
  headers: { authorization: `Bearer ${token}` },
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("拉取 providers 失败:", res.status, JSON.stringify(body).slice(0, 300));
  process.exit(1);
}

const providers = body.providers || [];
console.log(`\n第三方接口共 ${providers.length} 条，其中 AI 相关:`);
for (const p of providers) {
  if (!String(p.id).startsWith("ai_")) continue;
  console.log(
    `  ${String(p.id).padEnd(16)} ${String(p.name).padEnd(13)} ` +
    `${String(p.state).padEnd(5)} ${String(p.credentialStatus).padEnd(12)} ${p.configLocation}`
  );
}

let failed = false;
console.log("");
for (const [id, expectedName] of Object.entries(REQUIRED_AI_PROVIDERS)) {
  const hit = providers.find((p) => p.id === id);
  if (!hit) {
    console.error(`[FAIL] 缺少条目 ${id}`);
    failed = true;
    continue;
  }
  if (hit.name !== expectedName) {
    // 名称还兼任成本分组的连接键，写错会导致「有健康度但没数据」。
    console.error(`[FAIL] ${id} 展示名为 "${hit.name}"，期望 "${expectedName}"`);
    failed = true;
    continue;
  }
  const mark = hit.state === "在线" ? "OK" : "WARN";
  console.log(`[${mark}] ${expectedName}: state=${hit.state}, credential=${hit.credentialStatus}`);
  if (hit.state !== "在线") {
    console.error(`      └ 服务器可能缺变量，检查: ${hit.configLocation}`);
  }
}

process.exit(failed ? 1 : 0);
