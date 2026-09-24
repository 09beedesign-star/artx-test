/**
 * 后端贴回修复的变异自证（2026-09-23 第二轮）。
 *
 * 每条变异 = 一种真实会犯的错误（多数就是修复前的原样）。
 * 跑完必须「条条被杀」；有存活的说明对应断言是恒绿的，没有信息量。
 *
 * 用 writeFileSync 回写原文还原，**不用 git checkout** ——
 * 仓库有并发会话在改，checkout 会连别人的改动一起冲掉。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  backend: join(ROOT, "server/image-generation.ts"),
  aiClient: join(ROOT, "client/src/lib/ai.ts"),
  orchestrator: join(ROOT, "server/ai-orchestrator.ts"),
  canvas: join(ROOT, "client/src/components/canvas/InfiniteCanvas.tsx"),
};
const TEST = "client/src/components/canvas/region-select-edit.test.ts";

/** @type {{id:string,file:keyof typeof F,from:string,to:string,why:string}[]} */
const MUTATIONS = [
  {
    id: "B01",
    file: "backend",
    from: "if (isVodMaskModel && input.regionSelectEdit !== true) {",
    to: "if (isVodMaskModel) {",
    why: "还原成修复前的无条件早退（本次线上缺陷的原样）",
  },
  {
    id: "B02",
    file: "backend",
    from: "if (isVodMaskModel && input.regionSelectEdit !== true) {",
    to: "if (isVodMaskModel && input.regionSelectEdit === true) {",
    why: "判断写反：只有框选才早退，等于把修复方向搞反",
  },
  {
    id: "B03",
    file: "backend",
    from: "input.regionSelectEdit === true ? maskImageData.buffer : ogCompositeMaskBuffer",
    to: "ogCompositeMaskBuffer",
    why: "贴回改用膨胀蒙版，选区被悄悄放大",
  },
  {
    id: "B04",
    file: "backend",
    from: "  regionSelectEdit?: boolean;",
    to: "  regionSelectEditX?: boolean;",
    why: "后端入参类型里字段名写错",
  },
  {
    id: "B05",
    file: "aiClient",
    from: "  preserveSourceSize,\n  regionSelectEdit,\n  targetWidth,",
    to: "  preserveSourceSize,\n  targetWidth,",
    why: "客户端解构漏掉该字段（tsc 不报错，字段静默丢失）",
  },
  {
    id: "B06",
    file: "aiClient",
    from: "      preserveSourceSize,\n      regionSelectEdit,\n      imageSrc,",
    to: "      preserveSourceSize,\n      imageSrc,",
    why: "后台任务出口漏传（正是本次链路走的那条）",
  },
  {
    id: "B07",
    file: "aiClient",
    from: "    preserveSourceSize,\n    regionSelectEdit,\n    imageSrc,",
    to: "    preserveSourceSize,\n    imageSrc,",
    why: "orchestrate 出口漏传（多出口只改一个）",
  },
  {
    id: "B08",
    file: "orchestrator",
    from: "        regionSelectEdit: input.regionSelectEdit,\n",
    to: "",
    why: "orchestrator 只声明类型不真传 —— 经典「透传≠被消费」",
  },
  {
    id: "B09",
    file: "canvas",
    from: "                      preserveSource: true,\n                      regionSelectEdit: true,\n",
    to: "                      preserveSource: true,\n",
    why: "占位 backgroundTaskInput 漏字段（守护器会用错载荷抢跑）",
  },
  {
    id: "B10",
    file: "canvas",
    from: "                        preserveSource: true,\n                        regionSelectEdit: true,\n",
    to: "                        preserveSource: true,\n",
    why: "真实 backgroundTaskInput 漏字段",
  },
];

let killed = 0;
const survivors = [];

for (const m of MUTATIONS) {
  const path = F[m.file];
  const original = readFileSync(path, "utf8");
  if (!original.includes(m.from)) {
    survivors.push(`${m.id} [锚点失效] ${m.why}`);
    console.log(`✗ ${m.id} 锚点没匹配到，变异未施加 —— 这条自证无效`);
    continue;
  }
  writeFileSync(path, original.replace(m.from, m.to));
  let failed = false;
  try {
    execSync(`npx vitest run ${TEST}`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    failed = true;
  }
  writeFileSync(path, original);
  if (failed) {
    killed += 1;
    console.log(`✓ ${m.id} 被杀 — ${m.why}`);
  } else {
    survivors.push(`${m.id} ${m.why}`);
    console.log(`✗ ${m.id} 存活 — ${m.why}`);
  }
}

console.log(`\n结果：${killed}/${MUTATIONS.length} 被杀`);
if (survivors.length) {
  console.log("存活（对应断言恒绿，必须补）:");
  survivors.forEach(s => console.log("  - " + s));
  process.exit(1);
}
