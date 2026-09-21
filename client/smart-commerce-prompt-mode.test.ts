import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSource = readFileSync(
  resolve(here, "SmartCommerceProductDialog.tsx"),
  "utf8"
);
const canvasSource = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");
const serverSource = readFileSync(
  resolve(here, "../../../../server/image-generation.ts"),
  "utf8"
);

/** 截取智能电商产品图事件处理器的函数体，把断言限制在这一段里。 */
function smartCommerceHandler() {
  const start = canvasSource.indexOf(
    "const detail = (event as CustomEvent<SmartCommerceProductCreateDetail>)"
  );
  expect(start, "找不到智能电商产品图的事件处理器").toBeGreaterThan(-1);
  const end = canvasSource.indexOf(
    'window.addEventListener("smart-commerce-product-create"',
    start
  );
  expect(end).toBeGreaterThan(start);
  return canvasSource.slice(start, end);
}

describe("智能电商产品图：默认背景 / 提示词生图 双模式", () => {
  it("对话框提供可随时来回切换的两个模式，默认停在模板模式", () => {
    // 用户诉求是「动态切换」，所以必须是显式开关，
    // 不能做成「填了提示词就自动改走另一条链路」的隐式推断——
    // 那样用户填完又想用模板时无从取消。
    expect(dialogSource).toContain(
      'useState<SmartCommerceBackgroundMode>("template")'
    );
    expect(dialogSource).toContain('{ id: "template", label: "默认背景"');
    expect(dialogSource).toContain('{ id: "prompt", label: "提示词生图"');
    expect(dialogSource).toContain("onClick={() => setBackgroundMode(mode.id)}");
    expect(dialogSource).toContain('aria-label="背景生成方式"');
  });

  it("提示词模式渲染输入框，模板模式渲染模板入口，二者互斥", () => {
    expect(dialogSource).toContain("isPromptMode ? (");
    expect(dialogSource).toContain("onChange={event => setCustomPrompt(event.target.value)}");
    // 模板入口没有被删掉，只是收进了 template 分支
    expect(dialogSource).toContain("电商背景模板库");
    expect(dialogSource).toContain("setShowPicwishSelector(true)");
  });

  it("提示词为空时禁止提交", () => {
    // 否则会拿一句空描述去调图片模型，白白消耗额度。
    expect(dialogSource).toContain(
      "imageSrc && !isCreating && (!isPromptMode || customPrompt.trim())"
    );
    expect(dialogSource).toContain('toast("请先输入背景提示词"');
  });

  it("事件里带上 backgroundMode 与 customPrompt，且提示词模式必须清空 sceneType", () => {
    expect(dialogSource).toContain("backgroundMode,");
    expect(dialogSource).toContain('customPrompt: isPromptMode ? trimmedPrompt : ""');
    // sceneType 是 PicWish 模板编号。提示词模式不走 PicWish，
    // 带上它会让服务端命中一个跟用户描述无关的模板。
    expect(dialogSource).toContain(
      "sceneType: isPromptMode ? undefined : selectedPicwishTemplate?.id"
    );
  });

  it("两种模式都保留「产品主体不可改」的强约束", () => {
    // 这是电商图的底线，比背景长什么样重要得多，任何一条链路都不能丢。
    expect(dialogSource).toContain("const productProtectionRules = [");
    const promptBranch = dialogSource.slice(
      dialogSource.indexOf("const prompt = isPromptMode"),
      dialogSource.indexOf("const templateName =")
    );
    // 展开运算符在两个分支里各出现一次
    const spreadCount =
      promptBranch.split("...productProtectionRules").length - 1;
    expect(spreadCount, "提示词分支与模板分支都要带上主体保护约束").toBe(2);
  });
});

describe("画布侧：按模式分流到不同生图链路", () => {
  it("提示词模式固定使用 gem 图片模型", () => {
    expect(canvasSource).toContain(
      'const SMART_COMMERCE_PROMPT_IMAGE_MODEL_ID = normalizeImageModelId("gem")'
    );
    const handler = smartCommerceHandler();
    expect(handler).toContain('const isPromptMode = detail.backgroundMode === "prompt"');
    expect(handler).toContain(
      "model: isPromptMode\n          ? SMART_COMMERCE_PROMPT_IMAGE_MODEL_ID\n          : DEFAULT_IMAGE_AI_MODEL_ID"
    );
  });

  it("提示词模式不得携带 backgroundTaskInput", () => {
    /**
     * 这条是整个改动最容易踩的坑：
     * runDerivedImageGeneration 里 backgroundTaskInput 的优先级**高于** run()，
     * 一旦带上，请求会被后台任务链路接管并回到 PicWish 分支，
     * 下面精心写的 run() 根本不会执行——表现为「切了提示词模式但出图跟没切一样」。
     */
    const handler = smartCommerceHandler();
    expect(handler).toContain("backgroundTaskInput: isPromptMode\n          ? undefined");
  });

  it("提示词模式走 editImageWithPrompt 而不是 createProductBackground", () => {
    const handler = smartCommerceHandler();
    const editIndex = handler.indexOf("await editImageWithPrompt({");
    const createIndex = handler.indexOf("return createProductBackground({");
    expect(editIndex, "提示词模式需要调用 editImageWithPrompt").toBeGreaterThan(-1);
    expect(createIndex, "模板模式仍然保留 createProductBackground").toBeGreaterThan(-1);
    // 模板分支是 early return，必须排在提示词分支之前
    expect(createIndex).toBeLessThan(editIndex);
    expect(handler).toContain("if (!isPromptMode) {");
  });

  it("多张生成靠循环，且每张追加差异化指令", () => {
    // editImageWithPrompt 一次只回 1 张（服务端没有 count 参数），
    // 想要 N 张必须循环 N 次，不能指望传个 count 了事。
    const handler = smartCommerceHandler();
    expect(handler).toContain("for (let index = 0; index < smartProductCount; index += 1)");
    expect(handler).toContain("smartProductCount > 1");
    expect(handler).toContain("与其他方案形成明显差异");
  });

  it("单张失败不中断整批，全失败才抛错", () => {
    const handler = smartCommerceHandler();
    expect(handler).toContain("let lastError: unknown = null");
    expect(handler).toContain("if (collected.length === 0) {");
    expect(handler).toContain("throw lastError instanceof Error");
  });

  it("提示词模式不把固定的 style 文案当风格名喂给模型", () => {
    // 提示词模式下 style 恒为「自定义提示词背景」，
    // 拼进提示词只会污染描述，真正的用户意图在 detail.prompt 里。
    const handler = smartCommerceHandler();
    expect(handler).toContain("!isPromptMode && detail.style ? `背景风格：${detail.style}` : \"\"");
  });
});

describe("为什么不能把自定义提示词塞进原有的 PicWish 链路", () => {
  it("createProductBackground 仍然是纯 PicWish 管线，未被本次改动污染", () => {
    /**
     * 这条是「约束说明」而非功能断言：
     * 它锁住了上面分流设计的前提——服务端这条链路全程不经过图片大模型，
     * 所以自定义提示词必须另走 image_edit。
     * 若哪天这里被改成支持大模型，本测试会失败，提醒回来重新评估分流是否还有必要。
     */
    const fn =
      serverSource.match(
        /export async function createProductBackground[\s\S]*?return withProviderTaskIds/
      )?.[0] || "";
    expect(fn, "找不到 createProductBackground").not.toBe("");
    expect(fn).toContain("removeBackgroundWithPicWish");
    expect(fn).toContain("createBackgroundWithPicWish({");
    expect(fn).not.toContain("generateImages(");
  });
});
