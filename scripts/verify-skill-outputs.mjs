#!/usr/bin/env node
/**
 * 真实调用验证：确认 skill 确实改变了输出形态，而不只是被加载了。
 *
 * 做法是对照实验 —— 同一个最小提示词跑两遍：
 *   1) withSkill：带 skillId，服务端 getSkill() 注入技能 prompt
 *   2) baseline：不带 skillId，裸提示词
 * 两张图都落盘，人工或后续脚本比对形态差异。
 *
 * 用法：
 *   npx tsx scripts/verify-skill-outputs.mjs                # 全部
 *   npx tsx scripts/verify-skill-outputs.mjs --only=image   # 只跑文生图
 *   npx tsx scripts/verify-skill-outputs.mjs --only=edit    # 只跑图片编辑
 *   npx tsx scripts/verify-skill-outputs.mjs --only=chat    # 只跑文本
 *   npx tsx scripts/verify-skill-outputs.mjs --skills=cover-image-lab,infographic-designer
 *
 * 注意：会真实消耗额度。出图每个技能 2 张（含对照），文本每个技能 1 次。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// server/ 是 ESM + TS，必须走 tsx 启动，env 也要先塞进 process.env。
process.loadEnvFile?.(".env");

const OUT_DIR = process.env.SKILL_VERIFY_OUT || "/tmp/artx-skill-verify";
fs.mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith("--only="))?.split("=")[1];
const skillsArg = args.find(a => a.startsWith("--skills="))?.split("=")[1];
// 模型 A/B：用于验证便宜档模型能否撑住技能契约。
// 例：--model=claude-sonnet-5 —— 产出文件名会带 .sonnet 后缀，便于与默认档对比。
const modelArg = args.find(a => a.startsWith("--model="))?.split("=")[1];
const SUFFIX = modelArg ? `.${modelArg.replace(/[^a-z0-9.-]/gi, "")}` : "";

// 出图比例：优先用商店条目里声明的 canvasSizes[0] 推导，推不出来回落到 16:9。
// 个别技能可在这里显式覆盖（如信息图竖版更好看）。
const RATIO_OVERRIDES = {
  "infographic-designer": "9:16",
};
const RATIO_LADDER = [
  ["1:1", 1], ["16:9", 16 / 9], ["9:16", 9 / 16],
  ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["2:3", 2 / 3],
];
const storeSource = fs.readFileSync("client/src/lib/skill-store.ts", "utf8");
function ratioForSkill(skillId) {
  if (RATIO_OVERRIDES[skillId]) return RATIO_OVERRIDES[skillId];
  const at = storeSource.indexOf(`id: "${skillId}"`);
  if (at < 0) return "16:9";
  const tail = storeSource.slice(at, at + 2000);
  const m = tail.match(/canvasSizes:\s*\[\s*"(\d+)\s*x\s*(\d+)"/);
  if (!m) return "16:9";
  const target = Number(m[1]) / Number(m[2]);
  return RATIO_LADDER.reduce((best, cur) =>
    Math.abs(cur[1] - target) < Math.abs(best[1] - target) ? cur : best
  )[0];
}

const cases = JSON.parse(
  fs.readFileSync("docs/skill-validation-cases.json", "utf8")
);

// 从校验用例里动态取，以后新增技能不用改脚本。
const CHAT_SKILLS = cases
  .filter(item => item.capability === "chat")
  .map(item => item.skillId);
const IMAGE_SKILLS = Object.fromEntries(
  cases
    .filter(item => item.capability === "text_to_image")
    .map(item => [item.skillId, ratioForSkill(item.skillId)])
);
// image_edit 需要参考图，单独一组。之前这类技能被整个漏掉了 ——
// 脚本只认 chat / text_to_image，image-local-edit 从来没被真实调用过。
const EDIT_SKILLS = cases
  .filter(item => item.capability === "image_edit")
  .map(item => item.skillId);

/**
 * ⚠️ baseline 对照的前提：不传 skillId 时**真的没有技能被注入**。
 * 但 ai-orchestrator.ts:136 在缺 skillId 时会回落到 matchSkill()，
 * 而 matchSkill 只要提示词里出现技能 id 或 title 就会自动命中
 * （skill-registry.ts:68）。
 * 一旦 minimumPrompt 里含技能标题，baseline 也会被注入同一个技能 ——
 * 两组跑出来几乎一样，于是得出「skill 没生效」的**伪阴性**结论，
 * 而且全程零报错。开跑前先把这种用例挑出来。
 */
function assertBaselineClean() {
  const dirty = [];
  for (const item of cases) {
    const prompt = (item.minimumPrompt || "").toLowerCase();
    const at = storeSource.indexOf(`id: "${item.skillId}"`);
    const name = at >= 0
      ? storeSource.slice(at, at + 400).match(/name:\s*"([^"]+)"/)?.[1]
      : undefined;
    if (prompt.includes(item.skillId.toLowerCase())) dirty.push(`${item.skillId}（提示词含技能 id）`);
    else if (name && prompt.includes(name.toLowerCase())) dirty.push(`${item.skillId}（提示词含技能名「${name}」）`);
  }
  if (dirty.length) {
    console.error("✗ baseline 对照会被 matchSkill 污染，结论不可信：");
    for (const line of dirty) console.error(`  - ${line}`);
    console.error("  改掉 docs/skill-validation-cases.json 里的提示词措辞后重跑。");
    process.exit(1);
  }
}

const { AIOrchestrator } = await import("../server/ai-orchestrator.ts");
const orchestrator = new AIOrchestrator();

async function saveImage(src, name) {
  if (!src) return null;
  const file = path.join(OUT_DIR, name);
  if (src.startsWith("data:")) {
    const base64 = src.slice(src.indexOf(",") + 1);
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    return file;
  }
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`下载图片失败 ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
  return null;
}

async function runImage(skillId, ratio) {
  const item = cases.find(c => c.skillId === skillId);
  if (!item) throw new Error(`校验用例缺少 ${skillId}`);
  const prompt = item.minimumPrompt;
  const row = { skillId, capability: "text_to_image", prompt, runs: [] };
  for (const variant of ["withSkill", "baseline"]) {
    const started = Date.now();
    try {
      const result = await orchestrator.run({
        capability: "text_to_image",
        intent: "skill-output-verification",
        operation: "generate",
        prompt,
        ratio,
        count: 1,
        ...(variant === "withSkill" ? { skillId } : {}),
      });
      const src = result.images?.[0]?.src;
      const file = await saveImage(src, `${skillId}-${variant}.png`);
      row.runs.push({
        variant,
        ok: Boolean(file),
        ms: Date.now() - started,
        model: result.model,
        route: result.route,
        skillEcho: result.skill || null,
        width: result.images?.[0]?.width,
        height: result.images?.[0]?.height,
        file,
      });
    } catch (error) {
      row.runs.push({
        variant,
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return row;
}

/**
 * image_edit 的参考图：本地用 sharp 合成，不花钱、不依赖外网、结果可复现。
 * 画一个纯色主体 + 杂色背景，这样"换背景、保主体"的效果能肉眼判定。
 */
async function ensureReferenceImage() {
  const file = path.join(OUT_DIR, "_reference.png");
  if (fs.existsSync(file)) return file;
  const { default: sharp } = await import("sharp");
  const W = 768, H = 768;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#7a6a55"/>
    <circle cx="140" cy="120" r="90" fill="#9b8a70" opacity="0.7"/>
    <rect x="0" y="560" width="${W}" height="208" fill="#5d5142"/>
    <rect x="236" y="196" width="296" height="376" rx="26" fill="#1f6feb"/>
    <rect x="276" y="246" width="216" height="26" rx="13" fill="#ffffff" opacity="0.92"/>
    <circle cx="384" cy="430" r="78" fill="#ffd166"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function runEdit(skillId) {
  const item = cases.find(c => c.skillId === skillId);
  if (!item) throw new Error(`校验用例缺少 ${skillId}`);
  const refFile = await ensureReferenceImage();
  const imageSrc = `data:image/png;base64,${fs.readFileSync(refFile).toString("base64")}`;
  const prompt = item.minimumPrompt;
  const row = { skillId, capability: "image_edit", prompt, reference: refFile, runs: [] };
  for (const variant of ["withSkill", "baseline"]) {
    const started = Date.now();
    try {
      const result = await orchestrator.run({
        capability: "image_edit",
        intent: "skill-output-verification",
        operation: "edit",
        prompt,
        imageSrc,
        count: 1,
        ...(variant === "withSkill" ? { skillId } : {}),
      });
      const src = result.images?.[0]?.src;
      const file = await saveImage(src, `${skillId}-${variant}.png`);
      row.runs.push({
        variant,
        ok: Boolean(file),
        ms: Date.now() - started,
        model: result.model,
        route: result.route,
        skillEcho: result.skill || null,
        width: result.images?.[0]?.width,
        height: result.images?.[0]?.height,
        file,
      });
    } catch (error) {
      row.runs.push({
        variant,
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return row;
}

async function runChat(skillId) {
  const item = cases.find(c => c.skillId === skillId);
  if (!item) throw new Error(`校验用例缺少 ${skillId}`);
  const prompt = item.minimumPrompt;
  const started = Date.now();
  try {
    const result = await orchestrator.run({
      capability: "chat",
      intent: "skill-output-verification",
      operation: "chat",
      prompt,
      skillId,
      ...(modelArg ? { model: modelArg } : {}),
    });
    const text = result.text || "";
    const file = path.join(OUT_DIR, `${skillId}${SUFFIX}.md`);
    fs.writeFileSync(file, `# ${skillId}\n\n## 输入\n\n${prompt}\n\n## 输出\n\n${text}\n`);
    return {
      skillId,
      capability: "chat",
      ok: text.length > 0,
      ms: Date.now() - started,
      model: result.model,
      route: result.route,
      skillEcho: result.skill || null,
      chars: text.length,
      usage: result.usage || null,
      file,
      preview: text.slice(0, 400),
    };
  } catch (error) {
    return {
      skillId,
      capability: "chat",
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

assertBaselineClean();

const wanted = skillsArg ? skillsArg.split(",") : null;
// 单个技能含对照约 55 秒，18 个串行要半小时。并发压缩墙钟时间，
// 但别开太大 —— 上游是按任务排队的，并发过高只会堆在队列里还更容易触发限流。
const CONCURRENCY = Number(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] || 4);

const jobs = [];
if (!onlyArg || onlyArg === "image") {
  for (const [skillId, ratio] of Object.entries(IMAGE_SKILLS)) {
    if (wanted && !wanted.includes(skillId)) continue;
    jobs.push({ label: `出图 ${skillId}`, run: () => runImage(skillId, ratio) });
  }
}
if (!onlyArg || onlyArg === "edit") {
  for (const skillId of EDIT_SKILLS) {
    if (wanted && !wanted.includes(skillId)) continue;
    jobs.push({ label: `改图 ${skillId}`, run: () => runEdit(skillId) });
  }
}
if (!onlyArg || onlyArg === "chat") {
  for (const skillId of CHAT_SKILLS) {
    if (wanted && !wanted.includes(skillId)) continue;
    jobs.push({ label: `文本 ${skillId}`, run: () => runChat(skillId) });
  }
}

const report = new Array(jobs.length);
let cursor = 0;
let done = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++;
    const job = jobs[index];
    console.log(`▶ [${index + 1}/${jobs.length}] ${job.label} ...`);
    report[index] = await job.run();
    console.log(`  ✔ 完成 ${++done}/${jobs.length}：${job.label}`);
  }
}
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker)
);

fs.writeFileSync(
  path.join(OUT_DIR, "report.json"),
  JSON.stringify(report, null, 2)
);

console.log("\n=== 结果 ===");
for (const row of report) {
  if (row.capability === "chat") {
    console.log(
      `${row.ok ? "OK " : "FAIL"} ${row.skillId} [chat] ${row.chars ?? 0} 字 ${row.ms}ms` +
      (row.usage
        ? ` | in ${row.usage.promptTokens ?? "?"} / out ${row.usage.completionTokens ?? "?"} token`
        : " | usage 未回传") +
      ` skill=${row.skillEcho} -> ${row.file || row.error}`
    );
  } else {
    for (const run of row.runs) {
      console.log(
        `${run.ok ? "OK " : "FAIL"} ${row.skillId} [${run.variant}] ${run.width}x${run.height} ${run.ms}ms skill=${run.skillEcho} route=${run.route} -> ${run.file || run.error}`
      );
    }
  }
}
/**
 * 判据收口。
 *
 * ⚠️ 「有图返回」**不等于** skill 生效 —— 不带 skillId 也一样出图。
 *    所以逐条验三件事，任何一条不过都算 FAIL：
 *    1. withSkill 出图成功
 *    2. skillEcho === skillId（服务端确实 getSkill() 命中了，不是静默回落到 undefined）
 *    3. 与 baseline 的**字节内容不同**（证明注入的 prompt 真的进了模型，
 *       而不是被 buildPrompt 丢掉）
 *    第 3 条是最容易被忽略的：前两条全过、但 skill prompt 被某个分支吞掉时，
 *    两张图会一模一样，而报告依然全绿。
 */
const crypto = await import("node:crypto");
const md5 = f => (f && fs.existsSync(f))
  ? crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex")
  : null;

const imageRows = report.filter(r => r.runs);
if (imageRows.length) {
  console.log("\n=== 判据核验（出图成功 / skill 回显 / 与对照有差异）===");
  let failed = 0;
  for (const row of imageRows) {
    const withSkill = row.runs.find(r => r.variant === "withSkill");
    const baseline = row.runs.find(r => r.variant === "baseline");
    const a = md5(withSkill?.file);
    const b = md5(baseline?.file);
    const checks = {
      出图: Boolean(withSkill?.ok),
      回显: withSkill?.skillEcho === row.skillId,
      有差异: Boolean(a && b && a !== b),
    };
    // baseline 自己失败时，「有差异」无从判定，不因此判 skill 不合格。
    const undecidable = !b;
    const pass = checks.出图 && checks.回显 && (checks.有差异 || undecidable);
    if (!pass) failed++;
    const detail = Object.entries(checks)
      .map(([k, v]) => `${k}${v ? "✓" : (k === "有差异" && undecidable ? "?" : "✗")}`)
      .join(" ");
    console.log(`${pass ? "PASS" : "FAIL"} ${row.skillId.padEnd(30)} ${detail}` +
      (undecidable ? "  (对照未产出，差异项无法判定)" : ""));
  }
  console.log(failed ? `\n${failed}/${imageRows.length} 项不合格` : `\n${imageRows.length}/${imageRows.length} 项全部合格 ✅`);
}

console.log(`\n报告与图片：${OUT_DIR}`);
