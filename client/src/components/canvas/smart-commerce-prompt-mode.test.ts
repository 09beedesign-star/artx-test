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

describe("画布侧：智能产品图入口已移除，能力由电商画布页独立承接", () => {
  /**
   * 【2026-11-12】用户要求「画布当中的智能产品图板块去掉」，随后又要求
   * 「彻底清除这段死代码」，所以画布侧的工具栏入口、Dialog 挂载与
   * smart-commerce-product-create 事件出图引擎已整块删除。
   *
   * ⚠️ 这里不是「把测试删掉」：两条断言从两个方向锁住结果 ——
   *   ① 画布里确实不再残留该链路（防半删 / 防复活成半截）；
   *   ② 能力本身没丢，电商画布页仍直接调两条独立生图链路。
   * 「误删服务端能力」与「画布死代码复活」两种变异都会被抓到。
   */
  const ecommercePageSource = readFileSync(
    resolve(here, "../../pages/EcommerceCanvasPage.tsx"),
    "utf8"
  );

  it("画布不再持有智能产品图入口、弹窗与事件出图引擎", () => {
    expect(canvasSource).not.toContain('label: "智能产品图"');
    expect(canvasSource).not.toContain("SmartCommerceProductDialog");
    expect(canvasSource).not.toContain('window.addEventListener("smart-commerce-product-create"');
    expect(canvasSource).not.toContain("SmartCommerceProductCreateDetail");
    expect(canvasSource).not.toContain("SMART_COMMERCE_PROMPT_IMAGE_MODEL_ID");
    expect(canvasSource).not.toContain("createProductBackground");
  });

  it("电商画布页仍保留产品图 / 带货图文两条独立生图链路", () => {
    // 产品图模式：PicWish r-background（smart_background 计费）
    expect(ecommercePageSource).toContain("createProductBackground");
    // 带货图文模式：image_edit 逐张生成
    expect(ecommercePageSource).toContain("editImageWithPrompt");
    expect(ecommercePageSource).toContain("waitForImageGenerationTask");
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
