import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 首页模型选择器 + 参考图的**接线**防护测试。
 *
 * 【为什么是源码断言而不是行为测试】
 * 这条链路横跨三个进程边界：首页 state → sessionStorage → 画布 effect → 出图 payload。
 * 真正会出事的从来不是某个函数算错了，而是**某一段没接上** ——
 * 本项目 2026-09-13 刚踩过：首页加了 model 字段，画布把它读出来了，
 * 但只用来「决定用哪个图片模型」，对「要不要出图」毫无影响，
 * 于是用户选的图片模型被当成纯装饰，提示词被判成 text 就永远拿不到图。
 *
 * 那次事故里，每个函数单独测都是对的。所以这里锚的是「接没接上」。
 *
 * ⚠️ 这也是本项目「测纯函数 ≠ 测修复」那条教训的直接应用：
 * 坏掉的通常是连接处，不是零件。
 */

const HOME_PAGE_PATH = "client/src/pages/HomePage.tsx";
const INFINITE_CANVAS_PATH = "client/src/components/canvas/InfiniteCanvas.tsx";

/**
 * 剥掉注释再断言。
 *
 * ⚠️ 不能用通用的块注释正则：InfiniteCanvas.tsx 有上百万字符，
 * 里面的正则字面量和字符串都可能出现 `/*` 片段，通用写法会从假起点
 * 一路吞到下一个结束符，实测会吃掉真实代码，让断言「假通过」。
 * 这里只剥「整行都是注释」的形态，宁可漏剥不可误删。
 */
function stripComments(source: string) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function readStripped(path: string) {
  return stripComments(readFileSync(path, "utf8"));
}

/**
 * 截取首页消费 effect 的正文。
 *
 * 用 readHandoffReferences(payload) 作为起锚（全文件唯一，已实测），
 * 用 effect 的收尾 `}, 360);` 作为止锚。
 *
 * ⚠️ 不能对整个 InfiniteCanvas.tsx 做断言：文件里有 30+ 处 referencesEnabled，
 * 其中好几处是合法的 `referencesEnabled: false`（比如单纯的文生图入口）。
 * 范围划错的断言比没有断言更糟 —— 它会逼着人去改正确的代码。
 *
 * ⚠️ 起锚也不能选得太靠后。最初这里锚的是 home-prompt-canvas-router，
 * 结果 hasImportedReferences / importedReferences 的**定义**都在它之前，
 * 三条断言因为「范围没覆盖到」而挂 —— 那不是代码的问题，是锚点的问题。
 * 起锚必须落在 effect 正文的最开头。
 */
function readHomeHandoffEffect() {
  const source = readStripped(INFINITE_CANVAS_PATH);
  const start = source.indexOf("readHandoffReferences(payload)");
  expect(start, "起锚 readHandoffReferences(payload) 没找到，测试范围失效").toBeGreaterThan(0);
  const end = source.indexOf("}, 360);", start);
  expect(end, "止锚 }, 360); 没找到，测试范围失效").toBeGreaterThan(start);
  const body = source.slice(start, end);
  // 范围合理性自检：太短说明锚错了，断言会变成空转。
  expect(body.length).toBeGreaterThan(800);
  return body;
}

describe("首页模型选择器必须真正接上（2026-09-13 回归锁）", () => {
  it("首页交接载荷不得把 model 硬编码成 auto", () => {
    const source = readStripped(HOME_PAGE_PATH);

    /**
     * 这正是 bug 时期的写法。用户在首页选了 mj，
     * 载荷里却永远写死 "auto" —— 选择器就是个纯装饰。
     */
    expect(source).not.toMatch(/model:\s*["']auto["']/);
    // 正向锚点：必须传用户真选的 state。
    expect(source).toMatch(/model:\s*homeImageModelId/);
  });

  it("首页的模型选择器是共用组件，不是自己另写一份", () => {
    const source = readStripped(HOME_PAGE_PATH);

    /**
     * 模型清单会持续变动（新模型上线、权益调整）。
     * 首页若自绘一份下拉，两处渲染实现必然对不上 ——
     * 这就是本项目反复踩的「同一份数据多个出口」。
     */
    expect(source).toMatch(/from "@\/components\/canvas\/ModelSelector"/);
    expect(source).toMatch(/<ModelSelector/);

    // 反向断言：空壳按钮（无 onClick 的写死文案）不能再回来。
    expect(source).not.toMatch(/图像生成\s*<\/span>\s*<ChevronDown/);
  });

  it("模型偏好读写必须走收口函数，不得在首页直写 localStorage key", () => {
    const source = readStripped(HOME_PAGE_PATH);

    // 存储格式的知识一旦复制到第二处，两处迟早对不上（auto 的双 key 语义尤其）。
    expect(source).toMatch(/readPreferredImageModelId/);
    expect(source).toMatch(/writePreferredImageModelId/);
    expect(source).not.toContain("artx:canvas-assistant-image-model");
    expect(source).not.toContain("artx:canvas-assistant-auto-mode");
  });

  it("交接 key 必须用常量，首页与画布不得各写一份裸字符串", () => {
    const home = readStripped(HOME_PAGE_PATH);
    expect(home).not.toContain("artx:pending-home-prompt");
    expect(home).toMatch(/writeHomePromptHandoff/);

    // 画布活代码这一侧同样要走常量。
    const effect = readHomeHandoffEffect();
    expect(effect).not.toContain("artx:pending-home-prompt");
    // 起锚本身就证明了消费侧走的是收口后的解析函数。
    expect(effect).toMatch(/readHandoffReferences\(payload\)/);
  });
});

describe("首页参考图必须真正驱动出图（静默失效锁）", () => {
  it("⚠️ referencesEnabled 由实际导入成功的图决定，不得写死 false", () => {
    const effect = readHomeHandoffEffect();

    /**
     * 这是整条链路最容易做成静默失效的一环。
     *
     * 首页把图塞进了 sessionStorage，画布若只是读出来放着、
     * 不驱动 referencesEnabled，表现就是
     * 「首页明明加了参考图，出来的图跟参考图毫无关系」，且全程零报错。
     */
    expect(effect).not.toMatch(/referencesEnabled:\s*false/);
    expect(effect).toMatch(/referencesEnabled:\s*hasImportedReferences/);
    expect(effect).toMatch(/referencedAssets:\s*hasImportedReferences/);
  });

  it("⚠️ hasImportedReferences 必须来自导入结果，而不是首页传了几张", () => {
    const effect = readHomeHandoffEffect();

    /**
     * 图可能加载失败。此时若按「首页传了几张」置 true，
     * 提示词里会凭空多出「参考当前画布和已引用素材进行生成。」（ai.ts:706），
     * 而实际一张图都没有 —— 模型会被这句话带偏。
     *
     * 反向断言：不能拿 handoffReferences（首页传来的原始列表）当依据。
     */
    expect(effect).toMatch(/hasImportedReferences\s*=\s*importedReferences\.length\s*>\s*0/);
    expect(effect).not.toMatch(/hasImportedReferences\s*=\s*handoffReferences\.length/);
  });

  it("导入失败时必须告诉用户，不能静默降级成纯文生图", () => {
    const effect = readHomeHandoffEffect();
    // 用户加了参考图却得到一张毫不相干的图，比直接报错更难排查。
    expect(effect).toMatch(/handoffReferences\.length\s*>\s*0\s*&&\s*!hasImportedReferences/);
    expect(effect).toContain("首页参考图未能载入");
  });

  it("带参考图时必须走路由，不能只把文字扔给模型", () => {
    const effect = readHomeHandoffEffect();

    /**
     * 与画布侧 needsReferenceComprehension（:21046）同理：
     * 只传文字的话，模型无从知道「参考这张图的配色」指的是哪张。
     * 所以哪怕用户已选定具体模型，带图时也要把图交给路由。
     */
    expect(effect).toMatch(/homeSelectedImageModel\s*&&\s*!hasImportedReferences/);
    expect(effect).toMatch(/referencedAssets:\s*importedReferences/);
    expect(effect).toMatch(/forceModelDecision:\s*hasImportedReferences/);
  });

  it("选定具体模型时必须钳到 image，不接受回落成文字", () => {
    const effect = readHomeHandoffEffect();
    // 用户明确选了出图模型，路由却判成 text，用户就永远拿不到图。
    expect(effect).toMatch(/mode:\s*"image"\s*as\s*const/);
  });

  it("⚠️ 本轮用掉的引用必须清账，否则标签会自动回插到空输入框", () => {
    const effect = readHomeHandoffEffect();

    /**
     * :20221 的同步 effect 会把「在 referencedAssets 里但不在 segments 里」的
     * 素材当成 missingAssets **自动插回**输入框。
     * 而 finally 里刚把 segments 重置成一个空文本段 ——
     * 不清账的话，用户看到的是「生成完了，空输入框里莫名其妙又冒出几个图片标签」，
     * 并且下一次提交会把它们再带上一遍（重复扣费）。
     *
     * 画布侧 handleSubmit（:20903）本来就做了这件事，这里必须对齐。
     */
    expect(effect).toMatch(/onMergeReferences\(\[\]\)/);
    expect(effect).toMatch(/syncedReferenceIdsRef\.current\.clear\(\)/);
  });

  it("参考图导入复用粘贴链路，不另造一套节点形状", () => {
    const source = readStripped(INFINITE_CANVAS_PATH);
    const start = source.indexOf("const importHomePromptReferences");
    expect(start, "importHomePromptReferences 没找到").toBeGreaterThan(0);
    const body = source.slice(start, start + 2000);

    /**
     * 复用 pasteClipboardImageSources 是刻意的：这样首页参考图与
     * 「对话框粘贴的图」「画布选中引用的图」共享同样的节点形状、
     * 引用标签样式和删除行为 —— 正是用户反复强调的
     * 「所有属性保持完全一致」。
     */
    expect(body).toMatch(/pasteClipboardImageSources/);
    // 必须真正登记进 referencedAssets，否则引用标签不会出现。
    expect(body).toMatch(/setReferencedAssets/);
  });
});
