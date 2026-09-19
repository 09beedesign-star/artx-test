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
    ]) {
      expect(source).not.toContain(removedCommerceLabel);
    }

    /*
      ⚠️ "主流电商平台" 曾经在这份「已移除标签」清单里，2026-09-19 移出。

         它原本指的是**跨境电商 Agent 那一版**的板块标题（已删）。
         本次改版新增的平台分组标签恰好同名，于是这条断言开始
         把「合法的新分组标题」误判成「复活的旧 UI」。

         📌 这正是源码断言的典型翻车方式：断言锁的是**字符串**，
            而字符串不携带它所处的语义。同名不同义时它会误伤。
         ✅ 改为锁定新分组的**结构化身份**（分组 id + label 成对出现），
            旧版块标题则改用它独有的上下文来排除。
    */
    expect(source).not.toContain('SectionTitle aside="跨境">主流电商平台</SectionTitle>');
    expect(source).toContain('id: "hot"');
    expect(source).toContain('label: "热门电商平台"');
    expect(source).toContain('id: "major"');
    expect(source).toContain('label: "主流电商平台"');
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

  it("keeps output controls bounded to 1K, 2K, 4K, common ratios, and one through nine images", () => {
    expect(source).toContain('useState<SmartCommerceResolution>("1k")');
    expect(source).toContain("const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]");
    for (const ratio of ['ratio: "1:1"', 'ratio: "4:5"', 'ratio: "16:9"', 'ratio: "9:16"']) {
      expect(source).toContain(ratio);
    }
  });

  /*
    2026-09-18：默认分辨率 2k → 1k，并新增 1k 档。

    ⚠️ 只断言「默认值是 1k」是不够的，那只锁住了一个字符串。
       这块真正容易坏、坏了还不报错的是另外两件事：
         1. 三个档位都还在（把 2k/4k 删掉也能让"默认是1k"通过）
         2. 1k 缩放后每个画幅的短边都 ≤ 1088
            —— 超了会被服务端记成 2K 档，界面写 1K、报表是 2K，零报错。
       所以下面用剥注释版检查代码本身，并把短边条件真算一遍。
  */
  it("defaults to 1k while keeping 2k and 4k selectable", () => {
    // 用剥注释版：上面那段说明里原样写着 "2k"，不剥会让断言失去意义
    expect(codeOnly).toContain('useState<SmartCommerceResolution>("1k")');
    expect(codeOnly).toContain('(["1k", "2k", "4k"] as const)');
    expect(codeOnly).toContain('export type SmartCommerceResolution = "1k" | "2k" | "4k"');
    // 三档并列后必须改成 3 行栅格，否则第三个按钮会被挤出容器
    expect(codeOnly).toContain('className="grid grid-rows-3 gap-1.5"');
    expect(codeOnly).not.toContain('useState<"2k" | "4k">("2k")');
  });

  /*
    每个画幅 × 每个档位，输出的**短边**都必须落在用户选的那一档里。

    ⚠️ 落档按短边、不按长边（shared/ai-credit-policy.ts:resolveImageResolutionTier），
       而画幅表写的是长边基准，两者很容易对不上：
       3:4 原为 2160×2880，用户选 2K、短边 2160 > 2048，实际被记成 4K 档 ——
       界面和用量报表对不上，且**全程零报错**，只能靠这类守卫挡住。

    这里不硬编码期望尺寸，而是从源码抠出 RESOLUTION_PRESETS 现场算。
    硬编码的话「有人加了个新画幅」这个真实风险照样绿。
  */
  it("keeps every preset short side inside the tier the user picked", () => {
    const TIER_MAX_SHORT_SIDE = { "1k": 1088, "2k": 2048, "4k": 4096 } as const;
    // 与 getOutputSize 的系数保持一致：2k 用原值，1k ×0.5，4k ×1.5
    const TIER_SCALE = { "1k": 0.5, "2k": 1, "4k": 3840 / 2560 } as const;

    const presetBlock = codeOnly.slice(
      codeOnly.indexOf("const RESOLUTION_PRESETS = ["),
      codeOnly.indexOf("] as const;", codeOnly.indexOf("const RESOLUTION_PRESETS = ["))
    );
    const sizes = [...presetBlock.matchAll(/width:\s*(\d+),\s*height:\s*(\d+)/g)].map(
      match => ({ width: Number(match[1]), height: Number(match[2]) })
    );
    // 自检：抠不到就等于空转
    expect(sizes.length, "RESOLUTION_PRESETS 解析失败").toBeGreaterThanOrEqual(6);

    for (const tier of ["1k", "2k", "4k"] as const) {
      for (const size of sizes) {
        const scale = TIER_SCALE[tier];
        const shortSide = Math.round(Math.min(size.width, size.height) * scale);
        const max = TIER_MAX_SHORT_SIDE[tier];
        expect(
          shortSide,
          `${size.width}×${size.height} 选 ${tier.toUpperCase()} 时短边 ${shortSide} 超过 ${max}，会被记成更高一档`
        ).toBeLessThanOrEqual(max);
      }
    }
  });

  /*
    2026-09-18：3:4 从 2160×2880 改为 2048×2732，修短边越档。
    改尺寸必然动比例，所以要盯住「比例没被改坏」——
    否则修好了计费、却把画幅改成了另一个形状，用户拿到的图是错的。
  */
  it("keeps every preset visually faithful to its declared ratio", () => {
    const presetBlock = codeOnly.slice(
      codeOnly.indexOf("const RESOLUTION_PRESETS = ["),
      codeOnly.indexOf("] as const;", codeOnly.indexOf("const RESOLUTION_PRESETS = ["))
    );
    const entries = [...presetBlock.matchAll(
      /ratio:\s*"(\d+):(\d+)",\s*width:\s*(\d+),\s*height:\s*(\d+)/g
    )];
    expect(entries.length, "画幅条目解析失败").toBeGreaterThanOrEqual(6);

    for (const [, rw, rh, w, h] of entries) {
      const declared = Number(rw) / Number(rh);
      const actual = Number(w) / Number(h);
      const drift = Math.abs(actual / declared - 1);
      expect(
        drift,
        `${rw}:${rh} 声明比例 ${declared.toFixed(4)}，实际 ${w}×${h} = ${actual.toFixed(4)}，偏差 ${(drift * 100).toFixed(2)}%`
      ).toBeLessThan(0.005);
    }
  });

  it("places aspect ratio and resolution controls beneath the product upload column", () => {
    expect(source).toContain('lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]');
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_104px]');
    expect(source).toContain('className="grid grid-cols-3 gap-1.5"');
    // 2026-09-18：分辨率从 2 档增到 3 档（1k/2k/4k），栅格行数同步改为 3
    expect(source).toContain('className="grid grid-rows-3 gap-1.5"');
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
    /*
      2026-09-19 改版：展开方式从「文档流内展开 + max-h-[188px] 封顶」
      改为「绝对定位向上浮层 + 实测高度封顶」。

      ⚠️ 原断言锁的是 "max-h-[188px] overflow-y-auto"，那是旧实现的实现细节。
         旧方案即便封了顶，那 188px 仍是实打实加在面板上的高度，
         面板照样会上下跳 —— 这正是用户报的缺陷。
         所以这里改为锁「浮层的三个不可退化特征」。
    */
    /*
      ① 向上展开：bottom-full（不是 top-full）

      ⚠️⚠️ 这条最初写成 toContain("absolute bottom-full")，变异自证时发现它**恒绿**：
           footer 里的预设菜单也是 bottom-full，把电商列表改成 top-full 之后
           这个子串仍被预设菜单命中，测试照样通过。
           📌 判据：源码断言只要「同一个子串在文件里出现多处」，
              它就不再指向你以为的那一处。必须带上该处独有的上下文。
    */
    /*
      2026-09-19 二次改版：浮层从 left-0 right-0（跟触发器同宽 ≈425px）
      改为 right-0 + 固定宽度，否则四列标签每列只剩 ~100px，
      长平台名会被 truncate 成一排省略号。

      ⚠️ 所以这里不能再锁 left-0 right-0，但**仍必须带上独有上下文** ——
         footer 的预设菜单同样是 "absolute bottom-full right-0"，
         只写到 right-0 又会退化成那条恒绿断言。
         用浮层独有的 z-30 + 宽度类一起锁定。
    */
    expect(source).toContain("absolute bottom-full right-0 z-30");
    expect(source).not.toContain("absolute top-full");
    // ② 上边界不得越过标题栏分割线：高度实测而非常量
    expect(source).toContain("maxHeight: ecommerceMenuMaxHeight");
    expect(codeOnly).toContain("anchor.top - header.bottom");
    // ③ 超出部分内部滚动
    expect(source).toContain("overflow-y-auto rounded-md");
    /*
      ④ 浮层宽度必须挣脱触发器，否则四列放不下。
         上限 640 < 内容区可视宽度（面板 720 - 左右 padding 40 = 680），
         超了会被内容区的 overflow-x-hidden 裁掉且零报错。
    */
    expect(source).toContain("w-[min(640px,calc(100vw-96px))]");

    // 平台数据来自用户提供的参数表，抽样锁住热门+主流两端
    for (const platform of ["淘宝 / 天猫", "京东", "拼多多", "小红书", "Amazon", "Temu", "SHEIN", "Shopee", "Ozon", "TikTok Shop"]) {
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

  /*
    2026-09-19 需求：平台选择由纵向列表改为「一排四个」的标签网格，
    分热门 / 主流两组，每个标签左 icon、右上名称、右下分辨率。

    ⚠️ 这组断言**只锁结构性的、退化后不报错的东西**。
       字号、间距、圆角这类纯观感参数一律不锁 ——
       锁了只会让以后每次微调 UI 都要来改测试，
       而它们退化时设计师一眼就能看见，不需要测试兜底。
  */
  it("renders platforms as a four-per-row tag grid with brand icons", () => {
    /*
      ① 四列必须写死。
         ⚠️ auto-fit / auto-fill 会随容器宽度在 3/4/5 列间漂移，
            需求写的是「默认一排四个」，那就是个确定值。
    */
    expect(codeOnly).toContain("grid grid-cols-4");
    expect(codeOnly).not.toContain("auto-fit");
    expect(codeOnly).not.toContain("auto-fill");

    // ② 两个分组标题都要渲染出来，而不只是存在于数据里
    expect(codeOnly).toContain("{group.label}");
    expect(codeOnly).toContain("ECOMMERCE_PRESET_GROUPS.map(group =>");

    /*
      ③ 标签三件套：品牌 icon / 平台名 / 分辨率。
         ⚠️ 分辨率这条最容易悄悄退化 —— 早先的列表版把尺寸放在 title 属性里，
            hover 才看得到。需求明确要求它**常驻显示在名称下方**，
            所以必须断言它出现在 JSX 文本节点里。
    */
    expect(codeOnly).toContain("getEcommercePlatformBrand(preset.id)");
    expect(codeOnly).toContain("{preset.name}");
    /*
      ⚠️⚠️ 变异自证抓到的第二条恒绿：
           最初写的是 toContain("{preset.width}×{preset.height}")，
           把标签里的分辨率整行删掉后测试**依然全绿** ——
           因为「常用画幅」那一块也有一模一样的一行。

           📌 同一个坑今天踩第二次了（第一次是 "absolute bottom-full"）。
              源码断言的默认状态就是「指向全文件任意一处」，
              必须主动带上该处独有的上下文才能收敛到目标位置。
           ✅ 这里用「紧跟其后的白底标记」做锚 —— 那是电商标签独有的。
    */
    const resolutionLines =
      codeOnly.split("{preset.width}×{preset.height}").length - 1;
    /*
      恰好两处：常用画幅一处、电商标签一处。
      ⚠️ 必须用**计数**而不是 toContain —— 删掉电商标签那一处时，
         常用画幅那一处仍会让 toContain 通过（实测恒绿）。
    */
    expect(
      resolutionLines,
      "电商标签的分辨率行不见了（常用画幅那处会让 toContain 假绿）"
    ).toBe(2);
    // 白底标记与分辨率同处一行，是电商标签独有的
    expect(codeOnly).toContain('{preset.bg === "white" ? " · 白底" : ""}');

    /*
      ④ icon 前景色必须算出来，不能写死。
         亮黄底配白字对比度 1.3:1 —— 字还在 DOM 里，人眼看不见，零报错。
    */
    expect(codeOnly).toContain("getBrandForegroundColor(brand.color)");
    expect(codeOnly).toContain("background: brand.color");

    /*
      ⑤ min-w-0 不能省。
         flex 子项默认 min-width:auto，不加的话长名称会把标签撑破，
         四列对齐当场崩掉，truncate 也不生效 —— 同样零报错。
      ⚠️ 带上 flex-col 做上下文：min-w-0 在本文件出现多处，
         只写 min-w-0 会退化成恒绿断言。
    */
    expect(codeOnly).toContain("flex min-w-0 flex-col");

    // 自检：剥注释后代码还在，否则上面全是空转
    expect(codeOnly.length).toBeGreaterThan(source.length * 0.4);
  });

  /*
    2026-09-19 需求 A：面板外轮廓高度固定，任何下拉展开都不得改变它。

    ⚠️⚠️ 这一组断言的价值全在「固定 vs 自适应」的区别上。
         max-h-* 看起来也像在限高，但它只封上限、下限由内容决定 ——
         内容从 500px 涨到 700px 时面板照样跟着长，用户看到的就是上下跳。
         只有写死 h-* 才是真的固定。
  */
  it("locks the panel outline to a fixed height", () => {
    // 固定高度：h-[...]，且必须出现在面板根容器那一行
    expect(codeOnly).toContain("h-[min(720px,calc(100dvh-32px))]");
    // 旧的自适应高度写法不得复活
    expect(codeOnly).not.toContain("max-h-[calc(100dvh-32px)]");
    // header / footer 不参与压缩，否则内容一多它们会被挤扁，
    // 表现为标题栏变矮——同样属于「布局变化」
    expect(codeOnly).toContain("flex shrink-0 cursor-grab");
    expect(codeOnly).toContain("relative flex shrink-0 items-center justify-between");
    // 内容区独自吸收高度变化
    expect(codeOnly).toContain("min-h-0 flex-1 overflow-y-auto");
  });

  /*
    2026-09-19 需求 B：取消按钮左侧的「保存预设」+ 上拉预设菜单。
  */
  it("offers account-scoped parameter presets next to the cancel button", () => {
    // 入口文案与四条命令
    for (const label of ["保存预设", "我的预设", "更新", "回到初始态"]) {
      expect(source).toContain(label);
    }
    // 四个动作处理器都必须真实存在（只画 UI 不接逻辑是最容易漏的一步）
    for (const handler of [
      "handleSavePreset",
      "handleApplyPreset",
      "handleUpdatePreset",
      "handleDeletePreset",
      "handleCommitRename",
      "handleResetToDefault",
    ]) {
      expect(codeOnly).toContain(handler);
    }

    /*
      ⚠️ 预设必须绑定账号。用全局 key 的话，同一台电脑换账号登录
         会直接读到上一个人的预设，且不会报任何错。
         这里锁住「组件确实把 user.id 传给了存储层」。
    */
    expect(codeOnly).toContain("const accountId = user?.id ?? null");
    expect(codeOnly).toContain("readSmartCommercePresets(accountId)");
    expect(codeOnly).toContain("writeActiveSmartCommercePresetId(accountId");

    /*
      ⚠️ 「更新」不能顺带触发「套用」。
         若两者共用一个命中区，用户点更新时会先被旧参数覆盖当前面板，
         再把旧参数存回去 —— 结果与他的意图完全相反，而且零报错。
         这里锁住更新按钮自带独立 onClick。
    */
    expect(codeOnly).toContain("onClick={() => handleUpdatePreset(preset)}");
    expect(codeOnly).toContain("onClick={() => handleApplyPreset(preset)}");

    // 菜单同样向上展开，理由同电商平台列表（footer 在底部，向下会被裁掉）
    expect(codeOnly).toContain("absolute bottom-full right-0");
  });

  it("restores the factory defaults without deleting saved presets", () => {
    /*
      ⚠️ 「回到初始态」只清「下次自动套用」的指针，绝不能删预设。
         删除是不可逆的破坏性操作，混进一条看起来无害的命令里
         是最容易被用户骂的那种设计。
    */
    expect(codeOnly).toContain("applyPresetPayload(SMART_COMMERCE_DEFAULT_PAYLOAD)");
    const resetBody = codeOnly.slice(
      codeOnly.indexOf("const handleResetToDefault"),
      codeOnly.indexOf("const activePreset")
    );
    expect(resetBody.length).toBeGreaterThan(50); // 自检：切片没切空
    expect(resetBody).not.toContain("persistPresets");
    expect(resetBody).not.toContain("setPresets(");
  });

  it("keeps platform presets and manual ratio mutually exclusive", () => {
    // 两个画布来源同时生效 = 必然有一个是假的。手动选画幅即取消平台预设。
    expect(source).toContain("setSelectedEcommerce(null)");
    expect(source).toContain("!selectedEcommerce && selectedPreset.ratio === preset.ratio");
  });

  /*
    2026-09-19 需求 4：平台的白底硬规则 + 设计风格都要进提示词。

    ⚠️ 这条最初写成扫源码找 `selectedEcommerce.bg === "white"` 和「纯白背景」。
       后来规则构造被抽成 ecommerce-style-profiles.ts 的 buildEcommercePromptRules
       纯函数，那两个字符串在本文件里彻底消失，旧断言只会红得莫名其妙，
       而且它本来也只能证明「字符串存在」，证明不了规则真的进了提示词。
    ✅ 现在分两段守：
       · 规则内容与顺序 → ecommerce-style-profiles.test.ts 直接断言返回值
       · 组件是否真的消费了它 → 这里守住调用点和展开点
    这正是本项目反复踩的「透传 ≠ 被消费」：函数造好了规则却没人 spread 进去，
    不会报错，只是平台选择从此再也不影响出图。
  */
  it("feeds the platform rules built by buildEcommercePromptRules into the prompt", () => {
    expect(codeOnly).toContain("buildEcommercePromptRules(selectedEcommerce)");
    // 构造了还不够，必须在两种生成模式里都被展开进最终提示词数组
    const spreadCount = codeOnly.split("...ecommerceRules,").length - 1;
    expect(spreadCount, "ecommerceRules 没有被展开进提示词").toBe(2);
    // 规则内容不得在组件里被就地重写，否则真实事实源会分叉成两份
    expect(codeOnly).not.toContain('selectedEcommerce.bg === "white"');
  });

  it("surfaces the platform style tone and white-background conflicts in the UI", () => {
    expect(codeOnly).toContain("getEcommerceStyleProfile(selectedEcommerce.id)");
    expect(codeOnly).toContain("findWhiteBackgroundConflicts(customPrompt)");
    // 冲突只提示不改写：用户写的提示词不能被偷偷替换
    expect(codeOnly).not.toContain("setCustomPrompt(customPrompt.replace");
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
