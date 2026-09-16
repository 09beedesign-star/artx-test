import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 剥掉注释后的源码。
 *
 * ⚠️ 反向断言（not.toContain）必须用这一份。
 *    本项目反复踩过「注释污染」：解释「这块为什么被删」的注释里原样写着
 *    被删掉的旧文案，不剥注释的话反向断言会命中我自己写的说明文字，
 *    变成一个永远失败的假警报 —— 这次改需求 3 时又踩了一遍。
 */
function stripComments(text: string) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("SmartCommerceProductDialog", () => {
  const source = readFileSync(
    resolve(__dirname, "SmartCommerceProductDialog.tsx"),
    "utf8"
  );
  const codeOnly = stripComments(source);

  it("keeps only the basic product upload, template, count, and resolution workflow", () => {
    for (const label of [
      "产品图片",
      "上传产品图片",
      "背景生成方式",
      "电商背景模板库",
      "常用画幅",
      "分辨率",
      "生成数量",
      "生成产品图",
    ]) {
      expect(source).toContain(label);
    }
    // 历史上被移除的那版提示词 UI 不得复活（措辞/结构都不同于本次新增的提示词模式）
    expect(source).not.toContain('SectionTitle aside="用于生成背景">提示词</SectionTitle>');
    expect(source).not.toContain('placeholder="例如：干净的高级灰摄影棚背景');

    for (const removedCommerceLabel of [
      "选择平台",
      "国家 / 地区",
      "商品品类",
      "图片用途",
      "爆款风格模板",
      "风险检查",
      "审计记录",
      "可编辑文案建议",
      "相关导出尺寸",
      "主流电商平台",
    ]) {
      expect(source).not.toContain(removedCommerceLabel);
    }
  });

  it("does not load or compose cross-border commerce rules before dispatching", () => {
    expect(source).not.toContain("@/lib/cross-border-commerce");
    expect(source).not.toContain("fetchCommerceMarkets");
    expect(source).not.toContain("checkCommerceRisk");
    expect(source).not.toContain("composeCommerceContext");
    expect(source).not.toContain("CommerceSelection");
    expect(source).toContain('new CustomEvent<SmartCommerceProductCreateDetail>');
    expect(source).toContain('"smart-commerce-product-create"');
  });

  it("sends only PicWish r-background compatible fields to the canvas", () => {
    expect(source).toContain("imageSrc");
    expect(source).toContain("prompt");
    expect(source).toContain("ratio");
    expect(source).toContain("resolution");
    expect(source).toContain("count");
    expect(source).toContain("customWidth");
    expect(source).toContain("customHeight");
    expect(source).not.toContain("platformId");
    expect(source).not.toContain("marketId");
    expect(source).not.toContain("categoryId");
    expect(source).not.toContain("placementId");
    expect(source).not.toContain("templateId");
    expect(source).not.toContain("skillId");
    expect(source).not.toContain("backgroundReferenceSrc");
  });

  it("keeps output controls bounded to 2K, 4K, common ratios, and one through nine images", () => {
    expect(source).toContain('useState<"2k" | "4k">("2k")');
    expect(source).toContain("const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]");
    for (const ratio of ['ratio: "1:1"', 'ratio: "4:5"', 'ratio: "16:9"', 'ratio: "9:16"']) {
      expect(source).toContain(ratio);
    }
  });

  it("places aspect ratio and resolution controls beneath the product upload column", () => {
    expect(source).toContain('lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]');
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_104px]');
    expect(source).toContain('className="grid grid-cols-3 gap-1.5"');
    expect(source).toContain('className="grid grid-rows-2 gap-1.5"');
    expect(source).toContain('<SectionTitle>常用画幅</SectionTitle>');
    expect(source).toContain('overflow-hidden rounded-md px-1.5');
    expect(source).toContain('truncate whitespace-nowrap text-[8px]');
    expect(source).not.toContain('SectionTitle aside={`${outputSize.width}×${outputSize.height}`}>常用画幅');
  });

  it("uses the right-column top area for the background generation mode switcher", () => {
    // 右栏顶部原先直接放「电商背景模板选择」，现在改放「背景生成方式」切换器，
    // 模板选择器降级为该切换器 template 分支下的内容。
    // 断言的意图不变：背景相关配置必须位于右栏顶部。
    const rightColumnPosition = source.indexOf('<section className="min-w-0">', source.indexOf("常用画幅"));
    // 锚定 JSX 里的 role="tablist"，不要用裸文案 "背景生成方式" ——
    // 它在文件顶部的类型注释里也出现过，indexOf 会先命中注释，断言就失去意义。
    const modePosition = source.indexOf('aria-label="背景生成方式"');
    expect(modePosition).toBeGreaterThan(rightColumnPosition);
    // 模板入口仍然存在，只是被收进 template 分支
    expect(source).toContain("电商背景模板库");
    expect(source).not.toContain("<SectionTitle>背景风格</SectionTitle>");
    expect(source).not.toContain("<SectionTitle>PicWish 背景模板</SectionTitle>");
  });

  it("uses the selected template or PicWish random background without local background style cards", () => {
    expect(source).toContain("创建真实、干净、有商业质感的产品背景。");
    expect(source).toContain("使用 PicWish 默认随机电商背景模板。");
    expect(source).toContain("电商背景模板：${selectedPicwishTemplate.name}");
    expect(source).toContain("风格只能影响背景");
    expect(source).not.toContain("PRODUCT_BACKGROUND_STYLES");
    expect(source).not.toContain("selectedStyle");
  });

  /*
    2026-09-16 需求 2：「左侧留白 / 右侧留白」改为「产品居左 / 产品居右」，
    并要求功能与文案对应。

    ⚠️ 光断言 label 文本改了是不够的 —— 那只测了文案。
       真正要锁的是「英文 prompt 描述的位置和中文标签说的是同一侧」，
       否则会出现标签写"产品居左"、提示词却在讲"右边留白"的错位。
  */
  it("names the composition by where the product sits, not where the空白 is", () => {
    for (const label of ["居中主视觉", "产品居左", "产品居右", "底部陈列", "斜向布局"]) {
      expect(source).toContain(`label: "${label}"`);
    }
    // 旧文案不得残留
    expect(source).not.toContain('label: "左侧留白"');
    expect(source).not.toContain('label: "右侧留白"');

    // 文案与提示词必须同侧：截出 left / right 两条定义分别检查
    const leftEntry = source.slice(
      source.indexOf('{ id: "left"'),
      source.indexOf('{ id: "right"')
    );
    const rightEntry = source.slice(
      source.indexOf('{ id: "right"'),
      source.indexOf('{ id: "bottom"')
    );
    expect(leftEntry).toContain("产品居左");
    expect(leftEntry).toContain("product itself on the left side");
    expect(rightEntry).toContain("产品居右");
    expect(rightEntry).toContain("product itself on the right side");

    expect(source).toContain("产品构图要求：${selectedComposition.prompt}");
    expect(source).toContain("composition: selectedComposition.id");
  });

  /*
    2026-09-16 需求 3：「产品占画面比例」整项取消，原位替换为电商平台画布预设。
  */
  it("drops the frame-occupancy control entirely", () => {
    // 用剥注释版：解释这项为何下线的注释里必然会提到旧名字
    expect(codeOnly).not.toContain("PRODUCT_SCALES");
    expect(codeOnly).not.toContain("selectedProductScale");
    expect(codeOnly).not.toContain("产品占画面比例");
    // 自检：剥注释不能把代码也剥没了，否则上面三条等于空转
    expect(codeOnly).toContain("PRODUCT_COMPOSITIONS");
    expect(codeOnly.length).toBeGreaterThan(source.length * 0.5);
  });

  it("replaces it with a collapsible ecommerce canvas preset list", () => {
    expect(source).toContain("电商平台尺寸");
    // 收起/展开：默认收起，否则 25 个平台会把板块布局撑变形
    expect(source).toContain("useState(false)");
    expect(source).toContain("setEcommerceExpanded(value => !value)");
    expect(source).toContain("aria-expanded={ecommerceExpanded}");
    // 展开态必须封顶滚动，不能顶高面板
    expect(source).toContain("max-h-[188px] overflow-y-auto");

    // 平台数据来自用户提供的参数表，抽样锁住国内+海外两端
    for (const platform of ["淘宝 / 天猫", "京东", "拼多多", "小红书", "Amazon", "Temu", "SHEIN", "Shopee", "Ozon"]) {
      expect(source).toContain(`name: "${platform}"`);
    }

    /*
      ⚠️ 平台预设必须真的驱动输出尺寸，不能只是个好看的列表。
         这是「透传 ≠ 被消费」的老坑：选了 Amazon 却仍然出 2048 方图，
         界面看起来完全正常，没有任何报错。
    */
    expect(source).toContain("const outputSize = selectedEcommerce");
    expect(source).toContain("width: selectedEcommerce.width");
    expect(source).toContain("customWidth: outputSize.width");
  });

  it("keeps platform presets and manual ratio mutually exclusive", () => {
    // 两个画布来源同时生效 = 必然有一个是假的。手动选画幅即取消平台预设。
    expect(source).toContain("setSelectedEcommerce(null)");
    expect(source).toContain("!selectedEcommerce && selectedPreset.ratio === preset.ratio");
  });

  it("carries the platform's white-background rule into the prompt", () => {
    // Amazon / 京东等平台强制纯白底，是审核硬规则。
    // 不写进提示词的话会出一张"好看但不能用"的场景图。
    expect(source).toContain('selectedEcommerce.bg === "white"');
    expect(source).toContain("纯白背景");
  });

  /*
    2026-09-16 需求 1：生成后面板自动关闭。

    ⚠️⚠️ 这条最初写成在**未剥注释**的源码上找 "onClose()"，做变异自证时发现
         它是**恒绿**的 —— 把真正的 onClose() 调用删掉后测试照样通过，
         因为上面解释「为什么不在同一帧关闭」的注释里原样写着 `onClose()`。
         一个恒绿的检测器等于没有检测器。改用剥注释版后变异能被抓到。
  */
  it("closes the floating panel after dispatching the generation", () => {
    const start = codeOnly.indexOf("const handleCreate = () => {");
    const end = codeOnly.indexOf("const uploadSlot =");
    expect(start, "handleCreate 锚点失效").toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const createFn = codeOnly.slice(start, end);
    // 范围自检：太短说明截错了，断言会变成空转
    expect(createFn.length).toBeGreaterThan(800);

    expect(createFn, "生成后没有关闭面板").toContain("onClose();");
    // 必须排在事件派发之后，否则等于取消了这次生成
    expect(createFn.indexOf("window.dispatchEvent")).toBeLessThan(
      createFn.indexOf("onClose();")
    );
  });

  it("lets users replace or delete submitted product images", () => {
    expect(source).toContain("setImageSrc(\"\")");
    expect(source).toContain("setFileName(\"\")");
    expect(source).toContain("替换");
    expect(source).toContain("删除");
    expect(source).toContain("<Trash2 size={11} />");
  });
});
