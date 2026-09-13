/**
 * 美图通道下线的防护测试（2026-09-13）。
 *
 * 背景：
 * 美图账号被上游停用 —— 探测拿到的是外层 `{"code":403}`，真正原因藏在被转义的
 * 内层 `{"code":1003,"message":"access key is disabled"}`。更关键的是，这条通道
 * 在代码里**从未被命中过一次**：
 *
 *   前端 InfiniteCanvas 硬编码 `provider: "meitu"` + `promptPos`
 *     → client/src/lib/ai.ts 传给 /api/ai/orchestrate
 *     → ai-orchestrator 专门透传（还写了注释解释"否则分支永远不命中"）
 *     → image-generation 的 `input.provider === "meitu" && input.promptKind === "edit"`
 *
 * 最后那个条件恒假：`promptKind` 根本不在 OrchestrateRequest 字段里，前端也从不传。
 * 于是整条参数链从前端到后端全程空转。📌 **"参数被认真地一路透传"不等于"它有人消费"** ——
 * 判断一条链是否活着，要看接收端的分支条件能不能成立，不能看中间环节写得多正规。
 *
 * 本文件分两层，少任何一层都等于没写：
 *   A. 源码层 —— 锁住实现文件/入参/后台条目不得复活；
 *   B. 契约层 —— 锁住擦字降级链的实际形态与蒙版函数的通道无关性。
 *
 * ⚠️ 所有断言都**先剥离注释**再匹配。仓库里刻意保留了多处"为什么删掉美图"的
 * 说明性注释（admin-store.ts / image-generation.ts / inpaint-mask.ts / 本文件），
 * 不剥离的话这些断言会命中自己的注释，挂得莫名其妙。**注释不是实现。**
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

/** 剥离整行注释。理由见文件头 —— 这是必需步骤，不是洁癖。 */
function stripComments(source: string) {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

describe("A. 源码层：美图通道不得复活", () => {
  it("meitu-client 实现与测试文件都已删除", () => {
    expect(exists("server/meitu-client.ts")).toBe(false);
    expect(exists("server/meitu-client.test.ts")).toBe(false);
  });

  it("没有任何模块还在 import meitu-client", () => {
    // 覆盖 server / client / scripts 三处，含动态 import（scripts 里用的是
    // `await import("../server/meitu-client.ts")`，静态 grep 语法不同，一并锁住）。
    const dirs = ["server", "client/src", "scripts"];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      const abs = path.join(repoRoot, dir);
      if (!fs.existsSync(abs)) return;
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
        if (rel.endsWith("meitu-channel-removal.test.ts")) continue;
        if (stripComments(read(rel)).includes("meitu-client")) offenders.push(rel);
      }
    };
    dirs.forEach(walk);

    expect(offenders, `这些文件仍在引用已删除的 meitu-client：${offenders.join(", ")}`).toEqual([]);
  });

  it("供应商专属入参 provider / promptPos 已从全链路移除", () => {
    // ⚠️ 这两个字段是**纯粹为美图存在**的，删通道时必须一并删。
    // 留着它们会变成新的"看起来能用其实没人消费"的死参数，
    // 下一个人接手时又要重新追一遍才能确认它是空转的。
    const orchestrator = stripComments(read("server/ai-orchestrator.ts"));
    expect(orchestrator).not.toMatch(/provider\?:\s*["']auto["']/);
    expect(orchestrator).not.toMatch(/promptPos\s*[?:]/);

    const imageGeneration = stripComments(read("server/image-generation.ts"));
    expect(imageGeneration).not.toMatch(/promptPos\s*[?:]/);
    expect(imageGeneration).not.toMatch(/input\.provider\s*===/);

    const clientAi = stripComments(read("client/src/lib/ai.ts"));
    expect(clientAi).not.toMatch(/promptPos/);

    const canvas = stripComments(read("client/src/components/canvas/InfiniteCanvas.tsx"));
    expect(canvas).not.toMatch(/provider:\s*["']meitu["']/);
    expect(canvas).not.toMatch(/promptPos/);
  });

  it("后台健康度、就绪清单、结算入口都不再有 ai_meitu 条目", () => {
    const adminStore = stripComments(read("server/admin-store.ts"));
    expect(adminStore).not.toMatch(/id:\s*"ai_meitu"/);
    expect(adminStore).not.toMatch(/ai_meitu:\s*\{/);
    expect(adminStore).not.toMatch(/name:\s*"MEITU"/);
    // 裸的 ACCESS_KEY / SECRET_KEY 是美图**独有**的凭据键名（没有 MEITU_ 前缀），
    // 通道删了就不该再有任何地方去探测它们的存在性。
    expect(adminStore).not.toMatch(/envStatus\(\[\s*"ACCESS_KEY"/);
  });

  it("余额查询模块不再有美图实现", () => {
    const billing = stripComments(read("server/provider-billing.ts"));
    expect(billing).not.toMatch(/getMeituBilling/);
  });

  it("探活与运维脚本不再探测美图", () => {
    const verifyProviders = stripComments(read("scripts/verify-ai-providers.mjs"));
    expect(verifyProviders).not.toMatch(/checkMeitu/);

    const probeBilling = stripComments(read("scripts/probe-provider-billing.mjs"));
    expect(probeBilling).not.toMatch(/probeMeitu/);

    const verifyAdmin = stripComments(read("scripts/verify-admin-providers.mjs"));
    expect(verifyAdmin).not.toMatch(/ai_meitu:/);
  });

  it("env 模板不再要求填写美图凭据", () => {
    // 模板里留着废弃密钥位，会让下一个部署的人真去申请一把用不上的 key。
    for (const file of [".env.example", "deploy/tencent-cloud/artx-server.env.example"]) {
      const lines = read(file)
        .split("\n")
        .map((line) => line.trim())
        // 注释掉的行不算"要求填写"，模板里保留了下线说明。
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      const offenders = lines.filter((line) => /^(ACCESS_KEY|SECRET_KEY|MEITU_)/.test(line));
      expect(offenders, `${file} 仍在要求配置美图凭据：${offenders.join(", ")}`).toEqual([]);
    }
  });

  it("历史数据迁移脚本刻意保留 MEITU（这不是残留）", () => {
    // 📌 反向锁：库里存量 aiTasks 中有走过美图的**真实历史记录**。
    // 把 "MEITU" 从合法厂商白名单里删掉，这批记录会落进"脏值"分支被改写，
    // 等于用今天的通道现状去篡改昨天真实发生的调用，虚增其他厂商成本。
    // 有人做全局清理时很容易顺手删掉它，所以在这里明确锁住。
    const migrate = stripComments(read("scripts/migrate-ai-task-providers.mjs"));
    expect(migrate).toMatch(/VALID_PROVIDERS[\s\S]*"MEITU"/);
  });
});

describe("B. 契约层：擦字降级链与蒙版函数", () => {
  it("擦字降级链是 参数化引擎 → 佐糖 → 本地像素擦除，中间没有美图", () => {
    const code = stripComments(read("server/image-generation.ts"));
    // 三个通道都必须还在（只删美图，不能把整条链删塌）。
    expect(code).toMatch(/TEXT_ENGINE_BASE_URL|callTextEngine|textEngine/i);
    expect(code).toMatch(/picwish|佐糖/i);
    expect(code).toMatch(/buildInpaintMask/);
    // 美图的调用点必须彻底消失。
    expect(code).not.toMatch(/inpaintWithMeitu|meituInpaint|callMeitu/i);
  });

  it("蒙版函数已迁出且与具体上游解耦", () => {
    expect(exists("server/inpaint-mask.ts")).toBe(true);
    const mask = stripComments(read("server/inpaint-mask.ts"));

    // 📌 这是整次移除的**前提条件**：原 buildMeituMask 是通道无关的
    // alpha→白黑二值蒙版转换，佐糖也在复用它。如果当初跟着 meitu-client.ts
    // 一起删掉，佐糖擦除会一并挂掉，而且不会有任何编译期报错提示你。
    // 教训：以供应商命名通用函数，会让"删除该供应商"变成牵一发动全身。
    expect(mask).toMatch(/export\s+async\s+function\s+buildInpaintMask/);
    // 不得再依赖美图专属配置读取。
    expect(mask).not.toMatch(/getMeituConfig/);

    // 新键名生效，旧键名仅作向后兼容（两者都要在，缺任一都算回归：
    // 只有新名 → 线上已配的旧变量突然失效；只有旧名 → 改名等于没做）。
    expect(mask).toMatch(/INPAINT_MASK_EXPAND_PX/);
    expect(mask).toMatch(/INPAINT_MASK_FEATHER_PX/);
    expect(mask).toMatch(/MEITU_MASK_EXPAND_PX/);
    expect(mask).toMatch(/MEITU_MASK_FEATHER_PX/);
  });

  it("佐糖擦除调用的是迁出后的 buildInpaintMask，不是残留的旧名", () => {
    const code = stripComments(read("server/image-generation.ts"));
    expect(code).toMatch(/buildInpaintMask\(/);
    expect(code).not.toMatch(/buildMeituMask/);
  });
});
