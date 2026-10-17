import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「提示词尺寸意图」的**接线**测试。
 *
 * 纯函数的正确性在 client/src/lib/prompt-size-intent.test.ts 里测。
 * 这个文件只回答一个问题：**它到底有没有被接上**。
 *
 * ⚠️⚠️ 为什么必须单独测接线：
 * 这条链路有 6 段（前端裁决 → payload → ai.ts 两条出口 → orchestrator
 * → image-generation 的 targetSize → VOD 分支归一化）。
 * 任何一段断掉，表现都是同一个：「提示词写了 4K，出图还是 1536」，
 * 而且**零报错**。纯函数测得再全也照不到这种断裂。
 * 📌 判据：「透传」不等于「被消费」。
 */
// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

/**
 * ⚠️⚠️⚠️ 这里曾经自己抄了一份贪心的 stripComments：
 *     source.replace(/\/*[\s\S]*?\*\//g, "")
 * 它把 server/index.ts 里 `"image/*"` 的 /* 当成块注释开头，
 * 一口吞掉 41.8% 的源码 —— 本文件所有 not.toContain 断言当时全是恒绿的。
 * 📌 判据：检测器自己坏掉的时候，长得和「没有问题」一模一样。
 * 现已统一走 shared/strip-source-comments.ts，并在每次读文件时跑损耗自检。
 */
function readSource(filePath: string): string {
  const raw = readFileSync(filePath, "utf-8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped);
  return stripped;
}

function stripComments(source: string): string {
  return stripSourceComments(source);
}

const CANVAS = resolve(__dirname, "InfiniteCanvas.tsx");
const AI_LIB = resolve(__dirname, "../../lib/ai.ts");
const ORCHESTRATOR = resolve(__dirname, "../../../../server/ai-orchestrator.ts");
const IMAGE_GEN = resolve(__dirname, "../../../../server/image-generation.ts");
const SERVER_INDEX = resolve(__dirname, "../../../../server/index.ts");

describe("prompt size intent wiring", () => {
  it("strips comments before scanning source (self-check)", () => {
    const sample = [
      "const a = 1; // resolveOutputSizeFromPromptAndSelector",
      "/* targetWidth: 1 */",
      "const b = 2;",
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).not.toContain("resolveOutputSizeFromPromptAndSelector");
    expect(stripped).not.toContain("targetWidth: 1");
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
  });

  /**
   * ⚠️⚠️ 这条守的是**检测器自己**。
   * 本文件扫 5 个源文件，其中 server/index.ts 含 `"image/*"`。
   * 一旦剥离函数退化成贪心正则，它会被吃掉 41.8% ——
   * 届时下面每一条 not.toContain 都会变成恒绿的装饰品，而且不报任何错。
   */
  it("never lets comment stripping eat the scanned sources", () => {
    for (const file of [CANVAS, AI_LIB, ORCHESTRATOR, IMAGE_GEN, SERVER_INDEX]) {
      const raw = readFileSync(file, "utf-8");
      expect(raw.length).toBeGreaterThan(1000);
      expect(() => assertStripKeptSource(raw, stripSourceComments(raw))).not.toThrow();

      /*
       * 反向：旧的贪心实现必须被这个闸门拦下，否则闸门本身是摆设。
       *
       * ⚠️⚠️ 这里**不能**直接拿 server/index.ts 原样去跑旧正则。
       *    原先那样写过，判据实际是「该文件恰好被吃掉超过 30%」——
       *    而这个比例会随文件增长**自然漂移**：
       *    2026-10-17 往 index.ts 新增约 6KB 不含块注释起始符的代码后，
       *    损失率从 33.0% 掉到 29.1%，这条反向断言就莫名变红了。
       *    📌 判据：**检测器的判据不能绑在业务文件的体积或比例上**，
       *       否则任何无关改动都会让它随机变红或变绿。
       *
       * ✅ 改成在真实文件后面接一段**确定性的坏样本**：
       *    一个含 image 通配 MIME 字面量的字符串 + 一大段本应保留的代码。
       *    贪心正则会把那个 MIME 里的斜杠星号当成块注释开头，
       *    一路吞到后面第一个块注释结束符，把这段代码整块吃掉；
       *    正确实现则一个字符都不少。
       *    这样判据回到「贪心正则会吃掉本该保留的源码」本身。
       */
      if (file === SERVER_INDEX) {
        const victim = `const keep = ${"1 + ".repeat(4000)}1;`;
        const sample = `${raw}\nconst mime = "image/*";\n${victim}\n/* 真注释 */\n`;
        // 正确实现：受害代码必须完整保留。
        expect(stripSourceComments(sample)).toContain(victim);
        // 旧实现：把 MIME 里的斜杠星号当注释开头，吞掉 victim —— 必须被闸门拦住。
        const legacy = sample.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(legacy).not.toContain(victim);
        expect(() => assertStripKeptSource(sample, legacy)).toThrow(/吃掉了/);
      }
    }
  });

  it("keeps both text-to-image payloads wired to the prompt size decision", () => {
    const source = readSource(CANVAS);

    // 纯文生图有两条出口：无技能分支与技能分支。
    // 只接一条 = 用户挂着技能写「4K」时静默失效，现象随技能开关随机出现。
    const decisions = source.match(
      /resolveOutputSizeFromPromptAndSelector\(\{/g
    );
    expect(decisions?.length ?? 0).toBeGreaterThanOrEqual(2);

    // 必须用用户原话解析，不能用大模型改写过的 finalImagePrompt ——
    // 后者会把 "4K" 这类参数词改写掉，导致尺寸要求随机失效。
    const decisionBlocks = source.match(
      /resolveOutputSizeFromPromptAndSelector\(\{[\s\S]{0,260}?\}\);/g
    );
    expect(decisionBlocks?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const block of decisionBlocks || []) {
      expect(block).toContain("prompt: rawSubmittedComposerPrompt");
      expect(block).not.toContain("prompt: finalImagePrompt");
      // 2026-10-17：记忆里写的分辨率是回退层。技能/非技能两条出口都必须带上，
      // 只接一条 = 挂着技能时记忆分辨率静默失效。
      // 必须传分层来源（对话 > 项目 > 长期），不能传拼好的整段文本：
      // 整段文本长期记忆在最前，从头扫 = 长期永远赢，与用户要求相反。
      expect(block).toMatch(/\bmemorySources\b/);
      expect(block).not.toMatch(/\bmemoryContext\b/);
    }
    // 来源必须来自完整记忆文档，而不是只存 contextEnabled 布尔。
    expect(source).toContain("listUserMemorySourcesByPriority({");
    expect(source).toContain("setMemoryDoc(document)");

    // 裁决结果必须真的进 payload 的 ratio，而不是算完就丢。
    expect(source).toContain(": promptSizeDecision.ratio");
    expect(source).toContain("promptSizeDecision.width");
    expect(source).toContain("promptSizeDecision.height");
  });

  it("carries the size intent through the regenerate round trip", () => {
    const source = readSource(CANVAS);

    // 写入端与读回端必须成对存在：
    // 只写不读 / 只读不写，现象都是「再次生成变小了」，且都不报错。
    expect(source).toContain("generationTargetWidth: detail.targetWidth");
    expect(source).toContain("generationTargetHeight: detail.targetHeight");
    expect(source).toContain("data.generationTargetWidth");
    expect(source).toContain("data.generationTargetHeight");

    // 重放 payload 也要带上，否则点一次「再次生成」就掉档。
    expect(source).toContain("targetWidth: detail.targetWidth");
    expect(source).toContain("targetHeight: detail.targetHeight");

    // 后台续跑（刷新页面后自动恢复）同样要带。
    expect(source).toContain("targetWidth: task.targetWidth");
    expect(source).toContain("targetHeight: task.targetHeight");
  });

  it("forwards the size intent on both generateImages exits in ai.ts", () => {
    const source = readSource(AI_LIB);
    const generateBlock = source.match(
      /export async function generateImages\(\{[\s\S]*?\n\}\n/
    )?.[0];
    expect(generateBlock).toBeTruthy();

    /**
     * 两条出口：后台任务 startBackgroundImageGeneration 与同步 postAiOrchestrate。
     * 只接一条 = 按路径随机失效。
     *
     * ⚠️⚠️ 这里**不能**只数 `targetWidth,` 出现了几次。
     * 变异实测：函数签名的解构里本身就有一个 `targetWidth,`，
     * 删掉后台任务那条出口后总数仍然 >= 2，**断言恒绿**。
     * 📌 判据锁错了对象 —— 要锁的是「每个具体出口块内部有没有」，
     *    不是「整个函数里出现了几次」。
     */
    const backgroundExit = generateBlock!.match(
      /await startBackgroundImageGeneration\(\{[\s\S]*?\}\);/
    )?.[0];
    expect(backgroundExit).toBeTruthy();
    expect(backgroundExit!.length).toBeGreaterThan(80);
    expect(backgroundExit).toContain("targetWidth,");
    expect(backgroundExit).toContain("targetHeight,");

    const orchestrateExit = generateBlock!.match(
      /await postAiOrchestrate\(\{[\s\S]*?\}, "图像生成失败"\);/
    )?.[0];
    expect(orchestrateExit).toBeTruthy();
    expect(orchestrateExit!.length).toBeGreaterThan(80);
    expect(orchestrateExit).toContain("targetWidth,");
    expect(orchestrateExit).toContain("targetHeight,");

    /**
     * 后台任务的启动函数自己也得**下发**，不是只在签名里收下。
     * 同理必须锁到 startImageGenerationTask 的实参块 —— 只测
     * 「函数体里出现过 targetWidth」的话，签名里那个就够让它恒绿。
     */
    const backgroundBlock = source.match(
      /export async function startBackgroundImageGeneration\(\{[\s\S]*?\n\}\n/
    )?.[0];
    expect(backgroundBlock).toBeTruthy();
    expect(backgroundBlock!.length).toBeGreaterThan(300);
    const backgroundDispatch = backgroundBlock!.match(
      /return startImageGenerationTask\(\{[\s\S]*?\}\);/
    )?.[0];
    expect(backgroundDispatch).toBeTruthy();
    expect(backgroundDispatch!.length).toBeGreaterThan(80);
    expect(backgroundDispatch).toContain("targetWidth,");
    expect(backgroundDispatch).toContain("targetHeight,");
  });

  /**
   * ⚠️⚠️ 后台任务链路（前端 → POST /api/images/tasks → runBackgroundImageTask
   * → orchestrator.run → generateImages）目前是**整体透传**，
   * 所以 targetWidth/targetHeight 不需要在 server/index.ts 里逐个登记。
   *
   * 但这是个**脆弱的隐式契约**：哪天有人为了"更安全"在端点或分支里
   * 加一层字段白名单（只挑 prompt/model/ratio 之类），
   * 尺寸意图就会被静默丢掉 —— 前端照常发、后端照常收、出图尺寸不变、零报错。
   * 📌 判据：透传不是靠"有人记得传"，而是靠"没人有机会漏"。
   * 这条断言把「整体透传」这件事本身钉死。
   */
  it("keeps the background task endpoint free of a field allowlist", () => {
    const source = readSource(SERVER_INDEX);

    // 端点必须把整个 req.body 交给分发函数，不能改成挑字段重组。
    expect(source).toContain("await runBackgroundImageTask(req.body, user)");

    // 文生图分支必须把 input 整体展开给 orchestrator，
    // 只有这样新增的尺寸字段才能自动走通。
    const textToImageCase = source.match(
      /case "text_to_image":[\s\S]*?const result = await orchestrator\.run\(\{[\s\S]{0,200}?\}\);/
    )?.[0];
    expect(textToImageCase).toBeTruthy();
    // 长度自检：正则没匹配到一个空壳（空壳会让下面的 toContain 失去意义）。
    expect(textToImageCase!.length).toBeGreaterThan(120);
    expect(textToImageCase).toContain("...input,");
  });

  it("passes the size intent into generateImages from the orchestrator", () => {
    const source = readSource(ORCHESTRATOR);
    const generateCall = source.match(
      /const result = await generateImages\(\{[\s\S]*?\}\);/
    )?.[0];
    expect(generateCall).toBeTruthy();
    // 图片编辑分支一直在传这两个字段，唯独文生图这条曾经没接 ——
    // 于是「提示词写 4K」在编辑时生效、在生成时静默失效。
    expect(generateCall).toContain("targetWidth: input.targetWidth");
    expect(generateCall).toContain("targetHeight: input.targetHeight");
  });

  /**
   * ⚠️⚠️⚠️ 最关键的一条：服务端必须**消费**它。
   *
   * 前面五段全对，只要这里不吃 input.targetWidth，
   * 整条链路就是「透传但没被消费」—— 出图尺寸纹丝不动且零报错。
   */
  it("lets the prompt size override the ratio-derived target size on the server", () => {
    const source = readSource(IMAGE_GEN);
    const generateBlock = source.match(
      /export async function generateImages\(input: ImageGenerateInput\)[\s\S]*?const tryVodGeneration/
    )?.[0];
    expect(generateBlock).toBeTruthy();

    expect(generateBlock).toContain("coerceTargetDimension(input.targetWidth)");
    expect(generateBlock).toContain("coerceTargetDimension(input.targetHeight)");
    // targetSize 必须优先吃提示词像素，ratio 只作为兜底。
    expect(generateBlock).toContain("promptTargetWidth ?? ratio.width");
    expect(generateBlock).toContain("promptTargetHeight ?? ratio.height");
    // 反向锁：旧写法（四个参数全用 ratio）必须消失，否则等于没改。
    expect(generateBlock).not.toContain(
      "__testResolveHighDefinitionTargetSize(ratio.width, ratio.height, ratio.width, ratio.height)"
    );
  });

  /**
   * 现网**所有**出图都走 VOD 分支，而它原本直接 return，
   * 绕过中转站分支里的 targetSize 归一化。
   * 只改 targetSize 的计算式而不动这里 = 改了个没人走的分支。
   * 📌 「同一份逻辑的多个出口，只改一个等于没做。」
   */
  it("applies the target size inside the VOD branch that production actually uses", () => {
    const source = readSource(IMAGE_GEN);
    const vodBlock = source.match(
      /const tryVodGeneration = async[\s\S]*?withProviderTaskIds\(\{ images: images\.slice/
    )?.[0];
    expect(vodBlock).toBeTruthy();

    expect(vodBlock).toContain("hasPromptSizeTarget");
    expect(vodBlock).toContain("__testNormalizeGeneratedImagesToTargetAspect");
    expect(vodBlock).toContain("targetSize.width");
    expect(vodBlock).toContain("targetSize.height");
  });

  it("leaves prompts without size intent completely untouched", () => {
    const source = readSource(IMAGE_GEN);
    const vodBlock = source.match(
      /const tryVodGeneration = async[\s\S]*?withProviderTaskIds\(\{ images: images\.slice/
    )?.[0];
    // 必须是条件式归一化：无条件跑 sharp 会让每一张普通图都被无谓重编码。
    expect(vodBlock).toContain("hasPromptSizeTarget && rawVodImages.length > 0");
    expect(vodBlock).toContain(": rawVodImages");
  });
});
