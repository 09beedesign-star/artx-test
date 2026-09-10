// 本地探活：逐个真实调用所有第三方 AI 接口与模型，确认「现在能不能用」。
//
// 用法：
//   npx tsx scripts/verify-ai-providers.mjs              # 全量
//   npx tsx scripts/verify-ai-providers.mjs --quick      # 跳过逐模型探测（快）
//   npx tsx scripts/verify-ai-providers.mjs --only=text  # 只测某一类
//     可选：text | image | models | meitu | picwish | engine | local
//
// ⚠️ 额度提示：本脚本会真实调用上游，**会产生少量消耗**。
//   - 文本模型：每个模型 1 次 5-token 请求
//   - 图片模型：每个模型提交 1 个出图任务（返回 task_id，任务确实入队）
//   只想确认「默认配置能不能用」时加 --quick，可把调用量降到每类 1 次。
//
// 设计原则：
//   1. **真实调用，不看配置猜**。配置齐全 ≠ 上游可用（实测过 gpt-5.4-mini
//      配置正确但上游已下线），只有发出请求拿到响应才算数。
//   2. env 加载口径必须与服务端一致 —— 复用 server/env.ts（其顶层自动执行
//      loadServerEnv()，先 .env.local 后 .env）。早前有脚本只读进程环境，
//      结论与真实运行时相反，把排查引向错误方向。
//   3. 区分「未配置」与「配置了但不可用」。前者是预期内的功能降级，
//      后者才是需要修的故障 —— 混为一谈会误报。
//   4. 每项都有超时，避免某个上游挂起拖死整个检测。

import process from "node:process";

await import("../server/env.ts");

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const ONLY = args.find(a => a.startsWith("--only="))?.split("=")[1];

const TIMEOUT_MS = 45_000;
const results = [];

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

function record(category, name, status, detail, ms) {
  results.push({ category, name, status, detail, ms });
  const icon =
    status === "ok" ? `${C.green}✓${C.reset}` :
    status === "skip" ? `${C.dim}—${C.reset}` :
    `${C.red}✗${C.reset}`;
  const time = ms != null ? `${C.dim}${(ms / 1000).toFixed(1)}s${C.reset}` : "";
  console.log(`  ${icon} ${name.padEnd(30)} ${detail || ""} ${time}`);
}

function want(category) {
  return !ONLY || ONLY === category;
}

async function timed(fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - t0 };
  } catch (error) {
    return { error, ms: Date.now() - t0 };
  }
}

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`超时 ${ms / 1000}s`)), ms)
    ),
  ]);
}

function briefError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(/\s+/g, " ").slice(0, 110);
}

// ── 1. AI 文本模型 ──────────────────────────────────────────────
// 逐个探测清单里的模型，而不是只测默认那个。默认模型能用不代表降级链可用，
// 反之亦然（实测过默认模型已下线、靠降级链兜住的情况，表现为响应极慢）。
async function checkTextModels() {
  console.log(`\n${C.bold}AI 文本模型${C.reset} ${C.dim}(${process.env.AI_TEXT_BASE_URL || "未配置"})${C.reset}`);

  const baseUrl = process.env.AI_TEXT_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.AI_TEXT_API_KEY;
  if (!baseUrl || !apiKey) {
    record("text", "AI_TEXT 配置", "skip", "未配置，纯文本能力不可用");
    return;
  }

  const configured = process.env.AI_TEXT_MODEL?.replace(/['"]/g, "");
  // 覆盖降级链上的全部模型，默认模型排最前
  const candidates = [...new Set([
    configured, "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-4o",
  ].filter(Boolean))];

  const list = QUICK ? candidates.slice(0, 1) : candidates;

  for (const model of list) {
    const { value, error, ms } = await timed(() =>
      withTimeout(
        fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        }).then(async r => ({ status: r.status, text: await r.text() }))
      )
    );

    const tag = model === configured ? `${C.cyan}(生效中)${C.reset}` : "";
    if (error) {
      record("text", `${model} ${tag}`, "fail", briefError(error), ms);
      continue;
    }
    if (value.status === 200) {
      record("text", `${model} ${tag}`, "ok", "可用", ms);
      continue;
    }

    let reason = `HTTP ${value.status}`;
    try {
      const j = JSON.parse(value.text);
      if (j?.error?.message) reason += ` ${j.error.message.slice(0, 70)}`;
    } catch { /* 非 JSON 响应，保留状态码即可 */ }

    // 429 是**临时**限流，与 400/503「模型不可用」性质不同：
    // 前者稍后重试即可，后者要改配置。混为一谈会让人误以为模型坏了。
    const transient = value.status === 429;
    record(
      "text",
      `${model} ${tag}`,
      transient ? "skip" : "fail",
      transient ? `限流（临时，非故障）` : reason,
      ms
    );
  }
}

// ── 2. AI 图片模型 ──────────────────────────────────────────────
async function checkImageProvider() {
  console.log(`\n${C.bold}AI 图片接口${C.reset} ${C.dim}(${process.env.AI_IMAGE_BASE_URL || "未配置"})${C.reset}`);

  const baseUrl = process.env.AI_IMAGE_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.AI_IMAGE_API_KEY;
  if (!baseUrl || !apiKey) {
    record("image", "AI_IMAGE 配置", "skip", "未配置，出图能力不可用");
    return;
  }

  const configured = process.env.AI_IMAGE_MODEL?.replace(/['"]/g, "");
  const candidates = QUICK
    ? [configured]
    : [...new Set([configured, "og-image2-medium", "og-image2-low", "og-image2-high"].filter(Boolean))];

  for (const model of candidates) {
    const { value, error, ms } = await timed(() =>
      withTimeout(
        fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "a red circle, simple" }],
          }),
        }).then(async r => ({ status: r.status, text: await r.text() }))
      )
    );

    const tag = model === configured ? `${C.cyan}(生效中)${C.reset}` : "";
    if (error) {
      record("image", `${model} ${tag}`, "fail", briefError(error), ms);
      continue;
    }
    // 出图是**异步**接口：正常返回 202 Accepted + task_id，不是 200。
    // 早前把状态码写死成 200，导致三个模型明明拿到了 task_id 却被判故障 ——
    // 典型的「用同步接口的直觉去判异步接口」误报。
    const accepted =
      (value.status === 200 || value.status === 202) &&
      /task_id|"success"\s*:\s*true/i.test(value.text);
    record(
      "image",
      `${model} ${tag}`,
      accepted ? "ok" : "fail",
      accepted ? "受理成功" : `HTTP ${value.status} ${value.text.slice(0, 70)}`,
      ms
    );
  }
}

// ── 3. 模型清单（站点实际暴露给前端的） ────────────────────────
async function checkModelCatalog() {
  console.log(`\n${C.bold}模型清单${C.reset}`);

  // 实现在 image-generation.ts，不是同名的 image-model-catalog（那只有测试文件）
  const { value, error, ms } = await timed(async () => {
    const { listImageModelCatalog } = await import("../server/image-generation.ts");
    return withTimeout(listImageModelCatalog());
  });

  if (error) {
    record("models", "listImageModelCatalog", "fail", briefError(error), ms);
    return;
  }

  // 返回结构是 { image: [...], source }，不是 { models }
  const models = Array.isArray(value?.image) ? value.image : [];
  record(
    "models",
    "可用模型数",
    models.length > 0 ? "ok" : "fail",
    `${models.length} 个${value?.source ? `（来源 ${value.source}）` : ""}`,
    ms
  );

  if (models.length > 0) {
    const ids = models.map(m => m?.id || m?.model || m).filter(Boolean);
    console.log(`    ${C.dim}${ids.join(", ")}${C.reset}`);
  }
}

// ── 4. 美图（局部重绘，擦字通道之一） ──────────────────────────
async function checkMeitu() {
  console.log(`\n${C.bold}美图 API${C.reset}`);

  const { value, error, ms } = await timed(async () => {
    const { getMeituConfig } = await import("../server/meitu-client.ts");
    return getMeituConfig();
  });

  if (error) {
    record("meitu", "美图配置", "fail", briefError(error), ms);
    return;
  }
  // 键名是 ACCESS_KEY / SECRET_KEY，不是 MEITU_API_KEY —— 先前探测搞错过
  const hasCreds = Boolean(value?.apiKey && value?.apiSecret);
  if (!hasCreds) {
    record("meitu", "凭据", "skip", "未配置，该擦字通道跳过", ms);
    return;
  }
  record("meitu", "凭据", "ok", "ACCESS_KEY + SECRET_KEY 已配置", ms);

  // 光有凭据不代表签名能过。发一个真实签名请求验证鉴权。
  //
  // 端点是 /api/v1/sdk/sync/push（meitu-client.ts:622），
  // inpaintTask 是**请求体参数**而非 URL 路径 —— 早前把它拼进 URL，
  // 拿到的 404 "no route found" 根本没验证到签名，是无效探测。
  //
  // 判定口径：401/403 = 凭据被拒（真故障）；
  // 其他状态（含 500 "task service not found"）= 签名已通过、仅业务参数不全。
  const probe = await timed(async () => {
    const { buildSignedHeaders } = await import("../server/meitu-client.ts");
    const url = `${value.formulaBaseUrl}/api/v1/sdk/sync/push`;
    // 参数顺序：(method, url, headers, body, accessKey, secretKey)
    const body = JSON.stringify({ task: value.inpaintTask });
    const headers = buildSignedHeaders(
      "POST",
      url,
      { "Content-Type": "application/json" },
      body,
      value.apiKey,
      value.apiSecret
    );
    return withTimeout(
      fetch(url, { method: "POST", headers, body }).then(async r => ({
        status: r.status,
        text: await r.text(),
      })),
      20_000
    );
  });

  if (probe.error) {
    record("meitu", "签名鉴权", "fail", briefError(probe.error), probe.ms);
    return;
  }
  const authFailed = probe.value.status === 401 || probe.value.status === 403;
  record(
    "meitu",
    "签名鉴权",
    authFailed ? "fail" : "ok",
    authFailed
      ? `凭据被拒 HTTP ${probe.value.status}`
      : `签名有效（HTTP ${probe.value.status}，参数不全属预期）`,
    probe.ms
  );
}

// ── 5. 佐糖 PicWish（抠图/擦除/扩图） ──────────────────────────
async function checkPicwish() {
  console.log(`\n${C.bold}佐糖 PicWish${C.reset}`);

  const apiKey = process.env.PICWISH_API_KEY;
  if (!apiKey) {
    record("picwish", "PICWISH_API_KEY", "skip", "未配置，抠图/扩图不可用");
    return;
  }

  // 佐糖有**两个不同域名**，早前在这里混用过导致 404 误报：
  //   PICWISH_BASE_URL          → techsz.aoscdn.com  任务类（抠图/擦除/扩图）
  //   PICWISH_TEMPLATE_BASE_URL → aw.aoscdn.com      背景模板
  // 与其在脚本里重复拼端点（代码一改就失效），不如直接调用项目自己的函数。
  const { value, error, ms } = await timed(async () => {
    const { getPicWishBackgroundTemplates } = await import(
      "../server/picwish-background-templates.ts"
    );
    return withTimeout(getPicWishBackgroundTemplates(), 20_000);
  });

  if (error) {
    record("picwish", "鉴权与连通", "fail", briefError(error), ms);
    return;
  }
  const count = Array.isArray(value) ? value.length : 0;
  record(
    "picwish",
    "鉴权与连通",
    count > 0 ? "ok" : "fail",
    count > 0 ? `可用（背景模板 ${count} 个）` : "返回空模板列表",
    ms
  );
}

// ── 6. 本地擦字引擎 ────────────────────────────────────────────
async function checkTextEngine() {
  console.log(`\n${C.bold}参数化擦字引擎${C.reset} ${C.dim}(${process.env.TEXT_ENGINE_BASE_URL || "未配置"})${C.reset}`);

  const { value, error, ms } = await timed(async () => {
    const mod = await import("../server/text-engine-client.ts");
    const configured = mod.isTextEngineConfigured();
    if (!configured) return { configured: false, healthy: false };
    const healthy = await withTimeout(mod.isTextEngineHealthy(), 15_000);
    return { configured: true, healthy };
  });

  if (error) {
    record("engine", "引擎健康检查", "fail", briefError(error), ms);
    return;
  }
  if (!value.configured) {
    record("engine", "TEXT_ENGINE_BASE_URL", "skip", "未配置，走美图/佐糖/本地兜底", ms);
    return;
  }
  record(
    "engine",
    "健康检查",
    value.healthy ? "ok" : "fail",
    value.healthy ? "ready" : "已配置但服务未响应（引擎没启动？）",
    ms
  );
}

// ── 7. 本地站点接口 ────────────────────────────────────────────
// 注意区分「本地实现」与「proxyJson 代理到远程」：
// /api/ai/orchestrate 是代理，用本地 dev token 必然 401，那是远程登录态问题，
// 不代表本地代码有故障。这里只探本地实现的接口。
async function checkLocalEndpoints() {
  console.log(`\n${C.bold}本地站点接口${C.reset} ${C.dim}(localhost:3000)${C.reset}`);

  const probes = [
    { name: "/api/ai/models", path: "/api/ai/models", kind: "本地实现" },
    { name: "/api/auth/dev-session", path: "/api/auth/dev-session", kind: "本地实现" },
    { name: "/api/ai/model-entitlements", path: "/api/ai/model-entitlements", kind: "本地实现" },
  ];

  for (const probe of probes) {
    const { value, error, ms } = await timed(() =>
      withTimeout(
        fetch(`http://localhost:3000${probe.path}`).then(r => r.status),
        10_000
      )
    );
    if (error) {
      record("local", probe.name, "fail", `${briefError(error)}（dev server 没起？）`, ms);
      continue;
    }
    record("local", probe.name, value === 200 ? "ok" : "fail", `HTTP ${value}`, ms);
  }

  // 代理接口单独说明，避免把远程登录态问题误判成本地故障
  const { value } = await timed(() =>
    withTimeout(
      fetch("http://localhost:3000/api/ai/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      }).then(r => r.status),
      15_000
    ).catch(() => null)
  );
  if (value === 401) {
    record("local", "/api/ai/orchestrate", "skip", "代理到远程，需真实账号登录（非本地故障）");
  } else if (value === 200) {
    record("local", "/api/ai/orchestrate", "ok", "远程已登录，可用");
  } else {
    record("local", "/api/ai/orchestrate", "skip", `代理到远程，HTTP ${value ?? "无响应"}`);
  }
}

// ── 汇总 ────────────────────────────────────────────────────────
async function main() {
  console.log(`${C.bold}AI 接口与模型探活${C.reset}`);
  console.log(`${C.dim}真实调用上游，非配置检查${QUICK ? " | 快速模式" : ""}${ONLY ? ` | 仅 ${ONLY}` : ""}${C.reset}`);

  if (want("text")) await checkTextModels();
  if (want("image")) await checkImageProvider();
  if (want("models")) await checkModelCatalog();
  if (want("meitu")) await checkMeitu();
  if (want("picwish")) await checkPicwish();
  if (want("engine")) await checkTextEngine();
  if (want("local")) await checkLocalEndpoints();

  const ok = results.filter(r => r.status === "ok").length;
  const fail = results.filter(r => r.status === "fail").length;
  const skip = results.filter(r => r.status === "skip").length;

  console.log(`\n${C.bold}汇总${C.reset}`);
  console.log(`  ${C.green}可用 ${ok}${C.reset}   ${C.red}故障 ${fail}${C.reset}   ${C.dim}未配置/跳过 ${skip}${C.reset}`);

  if (fail > 0) {
    console.log(`\n${C.red}${C.bold}需要关注${C.reset}`);
    for (const r of results.filter(x => x.status === "fail")) {
      console.log(`  ${C.red}✗${C.reset} [${r.category}] ${r.name} — ${r.detail}`);
    }
  }

  // 退出码只由「配置了但不可用」决定；未配置属预期降级，不算失败
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(error => {
  console.error(`\n${C.red}探活脚本自身异常：${C.reset}`, error);
  process.exit(2);
});
