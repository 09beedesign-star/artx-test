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
 *   npx tsx scripts/verify-skill-outputs.mjs --only=image   # 只跑出图
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

const report = [];
const wanted = skillsArg ? skillsArg.split(",") : null;

if (!onlyArg || onlyArg === "image") {
  for (const [skillId, ratio] of Object.entries(IMAGE_SKILLS)) {
    if (wanted && !wanted.includes(skillId)) continue;
    console.log(`▶ 出图 ${skillId}（含对照）...`);
    report.push(await runImage(skillId, ratio));
  }
}
if (!onlyArg || onlyArg === "chat") {
  for (const skillId of CHAT_SKILLS) {
    if (wanted && !wanted.includes(skillId)) continue;
    console.log(`▶ 文本 ${skillId}...`);
    report.push(await runChat(skillId));
  }
}

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
console.log(`\n报告与图片：${OUT_DIR}`);
