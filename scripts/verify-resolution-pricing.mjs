#!/usr/bin/env node
/**
 * 分辨率分档计费 —— 人工对账脚本。
 *
 * 用途：把 quoteAiUsage 的分档结果打成表，供人眼复核定价是否合理。
 * 跑法：npx tsx scripts/verify-resolution-pricing.mjs
 *
 * ⚠️⚠️⚠️ 币种口径陷阱（本脚本最容易写错的地方，务必先读）：
 *   - quoteAiUsage().estimatedCost 的单位是 **人民币元**（上游腾讯云按 CNY 结算）
 *   - billing-config 里的 creditsPerHkd 单位是 **积分 / 港币**
 *   两者直接相除会算出虚高的毛利率（我第一版算出 85%，而代码注释记录的是 61.6%）。
 *   所以这里统一用 WORST_RATE = 331 积分/元人民币（Pro 年卡，全站最优惠汇率，
 *   也就是对我们最不利的口径）来折算收入。
 *
 *   自检锚点：medium 档 1K 在此口径下毛利率应 ≈ 61.6%（ai-credit-policy.ts 注释记录值）。
 *   若这个数字明显偏离，说明口径又混了，不要相信表里其他数字。
 */

import {
  AI_IMAGE_RESOLUTION_POLICIES,
  quoteAiUsage,
  resolveImageResolutionTier,
} from "../shared/ai-credit-policy.ts";
import {
  MEMBERSHIP_PLANS,
  SIGNUP_INITIAL_CREDITS,
  SIGNUP_IP_RATE_LIMIT,
} from "../shared/billing-config.ts";

/** Pro 年卡汇率：积分 / 元人民币。对我们最不利，故用作红线自检口径。 */
const WORST_RATE = 331;
const MARGIN_FLOOR = 0.55;
const MODELS = [
  "vod-og25-sunburst-low",
  "vod-og25-sunburst-medium",
  "vod-og25-sunburst-high",
];
const TIERS = ["1k", "2k", "4k", "8k"];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  ❌ ${msg}`);
};

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const yuan = (n) => `¥${n.toFixed(4)}`;

// ── 1. 回归保护：不传分辨率必须与改造前逐位一致 ──────────────────
console.log("\n【1】零回归检查：不传 resolutionTier 时结果必须与改造前一致");
for (const model of MODELS) {
  const bare = quoteAiUsage({ capability: "text_to_image", model });
  const explicit1k = quoteAiUsage({ capability: "text_to_image", model, resolutionTier: "1k" });
  if (bare.chargedCredits !== explicit1k.chargedCredits) {
    fail(`${model}: 缺省档(${bare.chargedCredits}) ≠ 显式 1k(${explicit1k.chargedCredits})`);
  } else {
    console.log(`  ✓ ${model}: ${bare.chargedCredits} 积分（缺省 == 1k）`);
  }
}

// ── 2. 落档判定：按短边，不按长边 ────────────────────────────────
console.log("\n【2】落档判定（按输出短边像素）");
const cases = [
  [1024, 1024, "1k"],
  [1088, 1088, "1k"], // OG 系列实际输出 1088，放宽
  [1089, 1089, "2k"],
  [1024, 4096, "1k"], // 长条：长边 4096 但短边 1024，不应升档
  [2048, 2048, "2k"],
  [2160, 3840, "4k"],
  [4096, 4096, "4k"],
  [4097, 4097, "8k"],
];
for (const [w, h, expected] of cases) {
  const got = resolveImageResolutionTier(w, h);
  if (got !== expected) fail(`${w}×${h} 应为 ${expected}，实际 ${got}`);
  else console.log(`  ✓ ${String(`${w}×${h}`).padEnd(12)} → ${got}`);
}

// ── 3. 分档报价表 ────────────────────────────────────────────────
console.log("\n【3】分档报价表（模型 = vod-og25-sunburst-medium）");
console.log("  档位   积分   倍率   成本        收入(331)   毛利率   上游原生");
for (const policy of AI_IMAGE_RESOLUTION_POLICIES) {
  const q = quoteAiUsage({
    capability: "text_to_image",
    model: "vod-og25-sunburst-medium",
    resolutionTier: policy.tier,
  });
  const revenue = q.chargedCredits / WORST_RATE;
  const margin = (revenue - q.estimatedCost) / revenue;
  if (margin <= MARGIN_FLOOR) fail(`${policy.tier} 毛利率 ${pct(margin)} 跌破 ${pct(MARGIN_FLOOR)} 红线`);
  console.log(
    `  ${policy.tier.padEnd(6)} ${String(q.chargedCredits).padStart(4)}  ` +
      `${policy.creditsMultiplier.toFixed(2)}×  ${yuan(q.estimatedCost).padEnd(10)}  ` +
      `${yuan(revenue).padEnd(10)}  ${pct(margin).padStart(6)}   ${policy.nativeUpstream ? "是" : "本地放大"}`,
  );
}

// 口径自检锚点
const anchor = quoteAiUsage({
  capability: "text_to_image",
  model: "vod-og25-sunburst-medium",
  resolutionTier: "1k",
});
const anchorMargin =
  (anchor.chargedCredits / WORST_RATE - anchor.estimatedCost) / (anchor.chargedCredits / WORST_RATE);
console.log(
  `\n  口径自检：medium@1k 毛利率 ${pct(anchorMargin)}（代码注释记录值 ≈61.6%，偏差应 <2pt）`,
);
if (Math.abs(anchorMargin - 0.616) > 0.02) {
  fail(`口径可能混了币种：自检锚点 ${pct(anchorMargin)} 偏离 61.6% 超过 2pt`);
}

// ── 4. 积分涨幅 vs 成本涨幅 ──────────────────────────────────────
console.log("\n【4】升档划算度（积分倍率必须低于成本倍率，让用户觉得升档不亏）");
for (const policy of AI_IMAGE_RESOLUTION_POLICIES) {
  if (policy.tier === "1k") continue;
  if (!policy.nativeUpstream) {
    console.log(`  – ${policy.tier}: 本地放大，上游成本不涨，不适用该规则`);
    continue;
  }
  if (policy.creditsMultiplier >= policy.costMultiplier) {
    fail(`${policy.tier}: 积分倍率 ${policy.creditsMultiplier} 不低于成本倍率 ${policy.costMultiplier}`);
  } else {
    console.log(
      `  ✓ ${policy.tier}: 积分 ${policy.creditsMultiplier}× < 成本 ${policy.costMultiplier}×`,
    );
  }
}

// ── 5. 各套餐出图张数 ────────────────────────────────────────────
console.log("\n【5】各套餐可出图张数（medium 档）");
const perTier = {};
for (const tier of TIERS) {
  perTier[tier] = quoteAiUsage({
    capability: "text_to_image",
    model: "vod-og25-sunburst-medium",
    resolutionTier: tier,
  }).chargedCredits;
}
console.log(`  单张积分：${TIERS.map((t) => `${t}=${perTier[t]}`).join("  ")}`);
console.log("\n  套餐                积分      1K     2K     4K     8K");
for (const plan of MEMBERSHIP_PLANS) {
  const credits = plan.monthlyCredits ?? plan.credits ?? 0;
  if (!credits) continue;
  const row = TIERS.map((t) => String(Math.floor(credits / perTier[t])).padStart(5)).join("  ");
  console.log(`  ${String(plan.name ?? plan.id).padEnd(18)} ${String(credits).padStart(6)}   ${row}`);
}

// ── 6. 注册初始额度 ──────────────────────────────────────────────
console.log("\n【6】注册初始额度");
console.log(`  额度：${SIGNUP_INITIAL_CREDITS.credits} 积分`);
console.log(
  `  等于：1K ${Math.floor(SIGNUP_INITIAL_CREDITS.credits / perTier["1k"])} 张 / ` +
    `2K ${Math.floor(SIGNUP_INITIAL_CREDITS.credits / perTier["2k"])} 张 / ` +
    `4K ${Math.floor(SIGNUP_INITIAL_CREDITS.credits / perTier["4k"])} 张`,
);
console.log(`  有效期：${SIGNUP_INITIAL_CREDITS.expiryDays} 天`);
console.log(`  活动截止：${SIGNUP_INITIAL_CREDITS.activeUntil ?? "永久（⚠️ 确认是否有意）"}`);
const cashCost =
  (SIGNUP_INITIAL_CREDITS.credits / perTier["1k"]) *
  quoteAiUsage({ capability: "text_to_image", model: "vod-og25-sunburst-medium" }).estimatedCost;
console.log(`  最坏现金成本：${yuan(cashCost)} / 人（全部烧在 1K 上）`);
console.log(
  `  IP 限频：精确 IP ${SIGNUP_IP_RATE_LIMIT.maxPerWindow} 次 / ` +
    `网段 ${SIGNUP_IP_RATE_LIMIT.maxPerSubnetWindow} 次 / ` +
    `窗口 ${SIGNUP_IP_RATE_LIMIT.windowHours}h`,
);
if (SIGNUP_IP_RATE_LIMIT.maxPerSubnetWindow <= SIGNUP_IP_RATE_LIMIT.maxPerWindow * 3) {
  fail("网段配额未显著宽于精确 IP 配额，共享出口用户会被误伤");
}
console.log(
  `  网段每日成本上限：${yuan((SIGNUP_IP_RATE_LIMIT.maxPerSubnetWindow * cashCost))} / 网段 / 天`,
);

console.log(
  failures === 0
    ? "\n✅ 全部检查通过\n"
    : `\n❌ ${failures} 项检查未通过，定价参数不要上线\n`,
);
process.exit(failures === 0 ? 0 : 1);
