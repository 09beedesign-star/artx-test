#!/usr/bin/env node
/**
 * 非算力成本测算：出图之外的存储 / 流量花费。
 *
 * 【关键前提，先读】
 * 生图请求传的是 StorageMode: "Temporary"（tencent-vod-aigc.ts:316/470，全仓无人传 Permanent）。
 * 官方口径：Temporary = 文件**不存进云点播**，只给 7 天有效期的临时 URL。
 * 已用 SearchMedia 实测验证：媒资库 TotalCount = 0。
 * → 所以**没有点播存储费**，成本只剩「下行流量」。
 *
 * 实测数据：
 *   单张 1K PNG 平均 1.64 MB（36 张样本，中位 1.52 / 区间 0.83~2.57）
 *
 * 官方单价（2026-09 刊例）：
 *   点播存储        0.0048 元/GB/日 = 0.148 元/GB/月
 *   点播 CDN 流量   约 0.15~0.24 元/GB（阶梯）
 *   源站外网下行     0.5 元/GB（不走 CDN 时）
 */

const AVG_MB = 1.64;                 // 实测单张均值
const CDN_PER_GB = 0.20;             // CDN 流量取中间值
const ORIGIN_PER_GB = 0.5;           // 源站直拉
const VOD_STORAGE_PER_GB_DAY = 0.0048;
const COST_PER_IMAGE = 0.078;        // 1K medium 算力成本

const MB_PER_GB = 1024;

function fmt(n, d = 3) {
  return Number(n.toFixed(d));
}

/**
 * 每张图的流量次数：生成后至少下行 1 次（画布展示）。
 * 实际还会有缩略图重复加载、用户下载、分享后他人查看等。
 * 这里给三档场景。
 */
const VIEW_SCENARIOS = [
  { name: "保守（仅生成后看 1 次）", views: 1 },
  { name: "典型（画布展示+刷新+下载）", views: 3 },
  { name: "重度（多次浏览+分享传播）", views: 8 },
];

console.log("═".repeat(72));
console.log("非算力成本测算 —— 单张图");
console.log("═".repeat(72));
console.log(`实测单张体积：${AVG_MB} MB`);
console.log(`算力成本：¥${COST_PER_IMAGE}/张（1K medium）\n`);

console.log("【存储费】");
console.log("  StorageMode=Temporary → 不入媒资库（实测 SearchMedia TotalCount=0）");
console.log("  → 点播存储费 ¥0.00");
console.log(`  （对比：若改成 Permanent，单张 ${AVG_MB}MB 按 ${VOD_STORAGE_PER_GB_DAY} 元/GB/日，`);
console.log(`   存一年 = ¥${fmt(AVG_MB / MB_PER_GB * VOD_STORAGE_PER_GB_DAY * 365, 4)}/张）\n`);

console.log("【流量费】按 CDN ¥%s/GB", CDN_PER_GB);
for (const s of VIEW_SCENARIOS) {
  const gb = AVG_MB * s.views / MB_PER_GB;
  const cost = gb * CDN_PER_GB;
  const pct = cost / COST_PER_IMAGE * 100;
  console.log(
    `  ${s.name.padEnd(26)} ${String(s.views).padStart(2)} 次下行 = ` +
    `¥${fmt(cost, 4)}/张（占算力成本 ${pct.toFixed(1)}%）`
  );
}

console.log("\n【合计单张成本】");
for (const s of VIEW_SCENARIOS) {
  const traffic = AVG_MB * s.views / MB_PER_GB * CDN_PER_GB;
  const total = COST_PER_IMAGE + traffic;
  console.log(
    `  ${s.name.padEnd(26)} ¥${fmt(total, 4)}` +
    `（算力 ${COST_PER_IMAGE} + 流量 ${fmt(traffic, 4)}）`
  );
}

console.log("\n" + "═".repeat(72));
console.log("规模推演（按典型 3 次下行）");
console.log("═".repeat(72));
const SCALES = [
  { name: "本次验证", imgs: 36 },
  { name: "每天 100 张", imgs: 100 * 30 },
  { name: "每天 1000 张", imgs: 1000 * 30 },
  { name: "每天 10000 张", imgs: 10000 * 30 },
];
console.log("场景".padEnd(16), "月出图".padStart(10), "算力".padStart(12), "流量".padStart(12), "流量占比".padStart(10));
for (const s of SCALES) {
  const compute = s.imgs * COST_PER_IMAGE;
  const traffic = s.imgs * AVG_MB * 3 / MB_PER_GB * CDN_PER_GB;
  console.log(
    s.name.padEnd(16),
    String(s.imgs).padStart(10),
    ("¥" + fmt(compute, 1)).padStart(12),
    ("¥" + fmt(traffic, 1)).padStart(12),
    (fmt(traffic / compute * 100, 1) + "%").padStart(10)
  );
}

console.log("\n【毛利影响】默认档 70 积分/张");
console.log("  按 Pro 年卡最优汇率 331 积分/元 → 售价 ¥%s/张", fmt(70 / 331, 4));
const price = 70 / 331;
for (const s of VIEW_SCENARIOS) {
  const traffic = AVG_MB * s.views / MB_PER_GB * CDN_PER_GB;
  const total = COST_PER_IMAGE + traffic;
  console.log(
    `  ${s.name.padEnd(26)} 毛利率 ${fmt((price - total) / price * 100, 1)}%` +
    `（不含流量时 ${fmt((price - COST_PER_IMAGE) / price * 100, 1)}%）`
  );
}

console.log("\n⚠️ 7 天后临时 URL 失效 —— 这是比钱更值得关注的问题，见结论。");
