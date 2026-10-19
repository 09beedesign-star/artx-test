/**
 * 扫描 client/src 里所有「与主题相关」的硬编码颜色用法，输出频次清单。
 * 用途：生成 html.light 覆盖层要处理的类名全集，避免靠肉眼漏项。
 *
 * 用法：node scripts/theme-scan-usages.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("../client/src", import.meta.url).pathname;

const PREFIX =
  "bg|text|border|ring|divide|from|via|to|fill|stroke|placeholder|outline|accent|caret|shadow|decoration";
const NAMED = "white|black|slate|gray|zinc|neutral|stone|red|green|blue|indigo|violet|purple";

const RE_UTIL = new RegExp(
  `(?:^|[\\s"'\\\`])((?:${PREFIX})-?(?:\\[[^\\]]*\\]|(?:(?:${NAMED})(?:-\\d{2,3})?))(?:\\/\\d{1,3})?)`,
  "g",
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(p, out);
    } else if ([".tsx", ".ts", ".css"].includes(extname(p))) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(ROOT);
const counts = new Map();
const fileHits = new Map();

for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(RE_UTIL)) {
    const cls = m[1];
    // 只看带颜色字面量的（hex / rgb / white / black / 具名色阶）
    if (!/\[#|white|black|rgb/.test(cls)) continue;
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
    if (!fileHits.has(cls)) fileHits.set(cls, new Set());
    fileHits.get(cls).add(f.replace(ROOT, ""));
  }
}

const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      rows.map(([cls, n]) => ({ cls, n, files: [...fileHits.get(cls)].length })),
      null,
      2,
    ),
  );
} else {
  console.log(`命中 ${rows.length} 个不同类名，共 ${rows.reduce((s, r) => s + r[1], 0)} 次\n`);
  for (const [cls, n] of rows) {
    console.log(String(n).padStart(5) + "  " + cls.padEnd(34) + `  (${fileHits.get(cls).size} 文件)`);
  }
}
