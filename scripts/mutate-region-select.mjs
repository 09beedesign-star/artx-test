#!/usr/bin/env node
/**
 * 局部框选功能的变异自证（2026-09-23）。
 *
 * 判据：源码断言全绿说明不了任何问题 —— 必须证明「改坏实现时它真的会红」。
 * 每条变异 = 一种真实会犯的错误；跑完必须逐条确认对应断言被杀掉。
 *
 * 用法：node scripts/mutate-region-select.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const CANVAS = "client/src/components/canvas/InfiniteCanvas.tsx";
const MASK = "client/src/components/canvas/region-select-mask.ts";
const TEST = "client/src/components/canvas/region-select-edit.test.ts";

const MUTATIONS = [
  {
    name: "M01 羽化比例改成 0（硬边 → 必然露缝）",
    file: MASK,
    from: "REGION_SELECT_FEATHER_RATIO = 0.04",
    to: "REGION_SELECT_FEATHER_RATIO = 0",
  },
  {
    name: "M02 羽化下限改成 0（小图退化成硬边）",
    file: MASK,
    from: "REGION_SELECT_FEATHER_MIN_PX = 8",
    to: "REGION_SELECT_FEATHER_MIN_PX = 0",
  },
  {
    name: "M03 去掉 canvas blur（羽化常量算了也白算）",
    file: MASK,
    from: "ctx.filter = `blur(${feather / 2}px)`;",
    to: "ctx.filter = `none`;",
  },
  {
    name: "M04 挖洞不内缩（可编辑区比用户框的大一圈）",
    file: MASK,
    from: "const inset = feather / 2;",
    to: "const inset = 0;",
  },
  {
    name: "M05 小选区不夹羽化上限（框了但几乎没改）",
    file: MASK,
    from: "regionShortEdge / 3",
    to: "Number.MAX_SAFE_INTEGER",
  },
  {
    name: "M06 蒙版语义写反（destination-out → source-over）",
    file: MASK,
    from: 'ctx.globalCompositeOperation = "destination-out";',
    to: 'ctx.globalCompositeOperation = "source-over";',
  },
  {
    name: "M07 删掉边缘融合约束（用户那条硬需求）",
    file: MASK,
    from: "边缘必须与周围原图自然衔接",
    to: "随便改改就行",
  },
  {
    name: "M08 删掉「不允许出现矩形边框」约束",
    file: MASK,
    from: "不允许出现可见的矩形边框",
    to: "无所谓边框",
  },
  {
    name: "M09 前缀不带选区坐标（模型不知道改哪儿）",
    file: MASK,
    from: "`框选区域：左上角 x=${(region.x * 100).toFixed(1)}%",
    to: "`框选区域：某处",
  },
  {
    name: "M10 选区传像素而不是比例（缩放级别被烤进数据）",
    file: CANVAS,
    from: "(event.clientX - rect.left) / rect.width",
    to: "(event.clientX - rect.left)",
  },
  {
    name: "M11 不拦退化矩形（零编辑区蒙版照常计费）",
    file: CANVAS,
    from: "if (region.w < REGION_SELECT_MIN_RATIO || region.h < REGION_SELECT_MIN_RATIO) {",
    to: "if (false) {",
  },
  {
    name: "M12 叠层漏掉 nodrag nopan（按下变成拖节点）",
    file: CANVAS,
    from: 'ref={regionSelectRectRef}\n              className="absolute inset-0 nodrag nopan"',
    to: 'ref={regionSelectRectRef}\n              className="absolute inset-0"',
  },
  {
    name: "M13 叠层光标不是 crosshair（点了没有选区感）",
    file: CANVAS,
    from: 'zIndex: 96,\n                cursor: "crosshair",',
    to: "zIndex: 96,\n                cursor: \"default\",",
  },
  {
    name: "M14 漏掉 onPointerCancel（start ref 残留）",
    file: CANVAS,
    from: "onPointerCancel={handleRegionSelectPointerUp}\n              onClick={event => {\n                event.preventDefault();\n                event.stopPropagation();\n              }}\n            >\n              {regionSelectPreview && (",
    to: "onClick={event => {\n                event.preventDefault();\n                event.stopPropagation();\n              }}\n            >\n              {regionSelectPreview && (",
  },
  {
    name: "M15 占位 payload 漏掉 maskSrc（守护器抢先起错任务）",
    file: CANVAS,
    from: '                operation: regionMaskSrc ? "annotation_edit" : "edit",\n                ...(regionMaskSrc\n                  ? { maskSrc: regionMaskSrc, preserveSource: true }',
    to: '                operation: regionMaskSrc ? "annotation_edit" : "edit",\n                ...(regionMaskSrc\n                  ? { preserveSource: true }',
  },
  {
    name: "M16 前台直调漏掉 preserveSource（贴回整条不生效）",
    file: CANVAS,
    from: '                  maskSrc: regionMaskSrc,\n                  operation: "annotation_edit",\n                  preserveSource: true,',
    to: '                  maskSrc: regionMaskSrc,\n                  operation: "annotation_edit",',
  },
  {
    name: "M17 蒙版失败降级成整图重绘（最严重的静默事故）",
    file: CANVAS,
    from: "          notifyAiFailure(\n            \"局部重绘失败\",",
    to: "          console.warn(\n            \"局部重绘失败\",",
  },
  {
    name: "M18 约束加在提示词增强之前（会被增强洗掉）",
    file: CANVAS,
    from: "const regionRect = payload.region || null;",
    to: "const regionRect = payload.region || null;\n      buildRegionEditPromptPrefix;\n      const optimizedText = 0;",
  },
  {
    name: "M19 蒙版用面板旧 src 而不是节点当前图（选区落错位置）",
    file: CANVAS,
    from: "createRegionSelectMask(latestImageSrc, regionRect)",
    to: "createRegionSelectMask(payload.imageSrc, regionRect)",
  },
  {
    name: "M20 局部标签挪到 header（覆盖紫色全图标签）",
    file: CANVAS,
    from: "              data-region-ref-token\n",
    to: "              data-region-ref-tokenX\n",
  },
  {
    name: "M21 局部标签配色改成紫色（与全图引用分不清）",
    file: CANVAS,
    from: '                  ? "oklch(0.72 0.18 200 / 0.18)"\n                  : "oklch(0.62 0.16 200 / 0.14)",',
    to: '                  ? "oklch(0.58 0.22 290 / 0.18)"\n                  : "oklch(0.58 0.22 290 / 0.14)",',
  },
  {
    name: "M22 入口 icon 换成普通图标（不是截图里那枚）",
    file: CANVAS,
    from: "            <SquareDashedMousePointer size={COMPOSER_REF_TOKEN_SIZE.iconSize} />",
    to: "            <X size={COMPOSER_REF_TOKEN_SIZE.iconSize} />",
  },
  {
    name: "M23 面板卸载不复位框选模式（节点永久吞点击）",
    file: CANVAS,
    from: "  useEffect(() => {\n    return () => {\n      window.dispatchEvent(\n        new CustomEvent(REGION_SELECT_MODE_EVENT, {\n          detail: { nodeId: asset.id, active: false },\n        })\n      );\n    };\n  }, [asset.id]);",
    to: "  useEffect(() => {\n    return () => {};\n  }, [asset.id]);",
  },
  {
    name: "M24 Esc 监听改成冒泡阶段（按 Esc 直接关掉面板）",
    file: CANVAS,
    from: '    window.addEventListener("keydown", handler, true);\n    return () => window.removeEventListener("keydown", handler, true);',
    to: '    window.addEventListener("keydown", handler);\n    return () => window.removeEventListener("keydown", handler);',
  },
  {
    name: "M25 入口 icon 尺寸写死字面量（与引用标签脱钩）",
    file: CANVAS,
    from: "            size={COMPOSER_REF_TOKEN_SIZE.iconSize}\n            cutoutBg=",
    to: "            size={18}\n            cutoutBg=",
  },
];

function run() {
  try {
    const out = execSync(
      `npx vitest run ${TEST} --reporter=json 2>/dev/null`,
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    const json = JSON.parse(out.slice(out.indexOf("{")));
    return { failed: json.numFailedTests, total: json.numTotalTests };
  } catch (e) {
    const text = String(e.stdout || "");
    const at = text.indexOf("{");
    if (at >= 0) {
      try {
        const json = JSON.parse(text.slice(at));
        return { failed: json.numFailedTests, total: json.numTotalTests };
      } catch {
        /* fallthrough */
      }
    }
    return { failed: -1, total: -1 };
  }
}

const base = run();
console.log(`基线：${base.failed} failed / ${base.total} total`);
if (base.failed !== 0) {
  console.error("基线就不是全绿，先修基线再做变异自证");
  process.exit(1);
}

const results = [];
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    results.push({ name: m.name, status: "ANCHOR_MISS" });
    console.log(`✗ ${m.name} —— 变异锚点没命中，这条变异本身是无效的`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  const r = run();
  writeFileSync(m.file, original);
  const killed = r.failed > 0;
  results.push({ name: m.name, status: killed ? "KILLED" : "SURVIVED", failed: r.failed });
  console.log(`${killed ? "✓ 杀掉" : "✗ 存活"} ${m.name}（failed=${r.failed}）`);
}

const survived = results.filter(r => r.status !== "KILLED");
console.log("\n──────── 汇总 ────────");
console.log(`变异总数 ${results.length}，杀掉 ${results.length - survived.length}，未杀 ${survived.length}`);
if (survived.length) {
  console.log("未杀清单（要么补断言，要么确认是等价变异）：");
  survived.forEach(r => console.log(`  · [${r.status}] ${r.name}`));
}
