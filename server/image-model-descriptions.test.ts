import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 模型选择器第二行文案的防护测试（2026-09-13）。
 *
 * ## 这次修的到底是什么
 *
 * 用户看到的现象是「下拉里每个模型下面写着 `70 积分/张`」，
 * 但真正的缺陷**不是文案写错了**，而是：
 *
 *   前端 workspace-data.ts 与后端 image-generation.ts 里
 *   14 个模型的能力描述一直都写好了（"指令理解准，改图听话" 等），
 *   却被 useImageModelOptions() 里的一行赋值**永久遮住，一个字都没显示过**。
 *
 * 三个渲染出口（InfiniteCanvas.tsx :873 / :16241 / :22682）读的都是
 * `unavailableReason || description` —— 短路取前者。而 hook 里写的是
 * 无条件 `unavailableReason: entitlement.message`，标准模型的 message
 * 恰好是 `${creditsPerImage} 积分/张`（server/admin-store.ts:1570）。
 *
 * 于是「所有模型都不可用」这件事在数据上成立了，只是恰好 disabled 是 false，
 * UI 看不出异常 —— 只有描述被顶掉。**典型的「同一份数据的多个出口」事故**。
 *
 * ## 为什么用源码正则而不是渲染测试
 *
 * InfiniteCanvas.tsx 三万多行、依赖大量浏览器 API，挂载它的成本远高于收益；
 * 而这里要守的恰好是「某个字段有没有被无条件赋值」这种结构性约束，
 * 正则锚住赋值语句本身即可，且不会因为样式调整而误报。
 */

const repoRoot = resolve(__dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

/** 剥掉整行块注释，避免断言命中解释性文字而不是真实代码。 */
function stripBlockComments(source: string) {
  const stripped = source.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "");
  // 剥完必须还剩实质代码，否则下面的断言是在空字符串上空转。
  expect(stripped.trim().length, "剥注释后没有剩下实质代码").toBeGreaterThan(100);
  return stripped;
}

/**
 * 模型选择器的实现文件。
 *
 * ⚠️ 2026-09-15：useImageModelOptions / ModelSelector / AssistantModelIcon
 * 从 InfiniteCanvas.tsx 迁到这里（画布与首页共用一份）。
 * 本文件的断言锚的是「这些实现的源码文本」，代码搬家后必须跟着搬锚点 ——
 * 不能删断言也不能改松，否则 2026-09-13「描述被计费文案遮盖」的回归锁就失效了。
 */
const MODEL_SELECTOR_PATH = "client/src/components/canvas/ModelSelector.tsx";

/** 取 useImageModelOptions() 函数体。锚真正的结尾，别用缩进或裸 `}`。 */
function readUseImageModelOptionsBody() {
  const source = readSource(MODEL_SELECTOR_PATH);
  const start = source.indexOf("function useImageModelOptions()");
  expect(start, "未找到 useImageModelOptions()").toBeGreaterThan(-1);
  const end = source.indexOf("return imageModelOptions;", start);
  expect(end, "未找到 useImageModelOptions 的 return").toBeGreaterThan(start);
  const body = source.slice(start, end);
  expect(body).toContain("entitlementByModel");
  return stripBlockComments(body);
}

/**
 * 禁止出现的是**具体单价**，不是价格这个话题本身。
 *
 * 2026-09-13 口径修正：用户要求保留"高性价比"这类定性判断，
 * 因此 `性价比` 从禁用词里移出（改由下面 AFFORDABLE_MODEL_IDS 那条限定贴在哪些档位），
 * 但 `积分 / 元 / 价格 / 免费 / 成本` 仍然禁 —— 那些一旦调价就会静默失效，
 * 而"70 积分/张"正是这次事故里遮住能力描述的那串文字。
 */
const PRICE_PATTERN = /积分|成本|价格|免费|[0-9]\s*元/;

/**
 * 允许出现"性价比"的模型。
 *
 * ⚠️ 判断依据是**性能/价格比**，不是单价高低：
 *   - medium 两系 70 积分，是全站默认档、套餐额度换算基准，质量够日常成稿；
 *   - vod-jimeng 120 积分，非 og25 系里最低价且效果扎实。
 * low 档 40 积分虽是全站最低，但出图是草稿级 —— 贴"高性价比"会把用户
 * 引到质量不达标的档位上，属于误导，所以刻意排除。
 * 单价见 shared/ai-credit-policy.ts:163-201。
 */
const AFFORDABLE_MODEL_IDS = [
  "vod-og25-sunburst-medium",
  "vod-og25-flare-medium",
  "vod-jimeng",
];

/**
 * 取某个常量的定义块。
 *
 * ⚠️ 结尾终止符必须按类型区分：前端 IMAGE_AI_MODELS 是**数组**（以 `\n];` 收尾），
 * 后端 imageModelDescriptions 是**对象**（以 `\n};` 收尾）。
 * 一开始两边都锚 `\n};`，数组那侧直接取到 -1 —— 断言报「未找到结尾」而不是静默过，
 * 算是运气好；若数组后面恰好还有别的对象，就会静默切出一大段错误区间。
 */
function readConstBlock(source: string, constName: string, terminator: "];" | "};") {
  const start = source.indexOf(constName);
  expect(start, `未找到 ${constName}`).toBeGreaterThan(-1);
  const end = source.indexOf(`\n${terminator}`, start);
  expect(end, `未找到 ${constName} 的结尾`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function readCleanBlock(source: string, constName: string, terminator: "];" | "};") {
  // 先剥注释：块里的解释性文字同样含中文引号内容，会被下面的正则捞进来。
  return stripBlockComments(readConstBlock(source, constName, terminator))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function collectDescriptions(source: string, constName: string, terminator: "];" | "};") {
  const block = readCleanBlock(source, constName, terminator);
  const matches = [...block.matchAll(/description:\s*"([^"]+)"|"[^"]+":\s*"([^"]+)"/g)];
  const values = matches.map(match => match[1] ?? match[2]).filter(Boolean) as string[];
  expect(values.length, `${constName} 里没解析出任何文案`).toBeGreaterThanOrEqual(14);
  return values;
}

/**
 * 解析成 id → 文案 的映射，用于断言「某条文案贴在哪个模型上」。
 * 两份表结构不同：前端是对象数组（`{ id: "x", ..., description: "y" }`），
 * 后端是字面量字典（`"x": "y"`），所以各用各的正则，不强行合并。
 */
function collectDescriptionsById(
  source: string,
  constName: string,
  terminator: "];" | "};",
  shape: "array" | "record"
) {
  const block = readCleanBlock(source, constName, terminator);
  const pattern =
    shape === "array"
      ? /id:\s*"([^"]+)"[^}]*?description:\s*"([^"]+)"/g
      : /"([^"]+)":\s*"([^"]+)"/g;
  const entries = new Map<string, string>();
  for (const match of block.matchAll(pattern)) {
    entries.set(match[1], match[2]);
  }
  expect(entries.size, `${constName} 里没解析出 id→文案 映射`).toBeGreaterThanOrEqual(14);
  return entries;
}

describe("模型选择器描述不被计费文案遮盖", () => {
  it("unavailableReason 只在模型真正不可用时才赋值", () => {
    const body = readUseImageModelOptionsBody();

    // ⭐ 核心断言：赋值必须带条件（三元或 && ），绝不能是裸的 entitlement.message。
    expect(body).toMatch(/unavailableReason:\s*blocked\s*\?\s*entitlement\.message\s*:\s*undefined/);

    // ⭐ 反向断言：守住「将来有人改回无条件赋值」。
    // 逐个点名的正向断言只能守住今天这一种写法，守不住明天的新写法。
    expect(
      body,
      "unavailableReason 不得无条件赋值 —— 那会让 `unavailableReason || description` 永远取到它"
    ).not.toMatch(/unavailableReason:\s*entitlement\.message\s*,/);
  });

  it("description 不再被拼上权益分组名", () => {
    const body = readUseImageModelOptionsBody();

    // entitlement.label 是 "标准模型" / "Pro / Studio 专属"，属于权益分组，
    // 不是模型能力；拼进去会让每一行尾巴都挂一个重复后缀并超出 20 字上限。
    expect(body, "description 不应再拼接 entitlement.label").not.toMatch(
      /description:\s*\[[\s\S]*?entitlement\.label/
    );
    expect(body).not.toContain('.join(" · ")');
  });

  it("渲染出口仍保留 unavailableReason 优先于 description 的短路", () => {
    /*
     * 这条是**正向**断言：短路本身没错，是刻意保留的 ——
     * 模型真不可用时，「升级 Pro 或 Studio 后可用」比能力描述更该显示。
     * 缺陷在于上游无条件赋值，不在这里。
     * 锁住它是为了防止有人「顺手」把短路删掉，导致不可用原因再也不显示。
     */
    /**
     * ⚠️ 必须同时扫两个文件。
     *
     * 三个出口里有一个（模型选择器下拉那个）随组件迁到了 ModelSelector.tsx，
     * 只扫 InfiniteCanvas.tsx 会从 3 掉到 2。
     * 那时候把阈值从 3 改成 2 是最省事也最错误的做法 ——
     * 等于默认新文件里的出口不需要守。出口在哪个文件不重要，一个都不能漏才重要。
     */
    const sources = [
      "client/src/components/canvas/InfiniteCanvas.tsx",
      MODEL_SELECTOR_PATH,
    ].map(readSource);
    const fallbacks = sources.flatMap(
      source => source.match(/unavailableReason\s*\|\|\s*\w+\.description/g) || []
    );
    expect(fallbacks.length, "三个渲染出口都应保留该短路").toBeGreaterThanOrEqual(3);
  });
});

describe("模型能力描述文案口径", () => {
  const clientSource = readSource("client/src/lib/workspace-data.ts");
  const serverSource = readSource("server/image-generation.ts");

  const clientDescriptions = collectDescriptions(clientSource, "IMAGE_AI_MODELS", "];");
  const serverDescriptions = collectDescriptions(serverSource, "imageModelDescriptions", "};");

  it("前端清单：不含具体单价且不超过 20 字", () => {
    for (const description of clientDescriptions) {
      expect(description, `"${description}" 含价格信息`).not.toMatch(PRICE_PATTERN);
      expect(description.length, `"${description}" 超过 20 字`).toBeLessThanOrEqual(20);
    }
  });

  it("服务端目录：不含具体单价且不超过 20 字", () => {
    for (const description of serverDescriptions) {
      expect(description, `"${description}" 含价格信息`).not.toMatch(PRICE_PATTERN);
      expect(description.length, `"${description}" 超过 20 字`).toBeLessThanOrEqual(20);
    }
  });

  it("「性价比」只贴在性能/价格比突出的档位上", () => {
    /*
     * ⚠️ 这条守的是「贴错位置」，不是「不许提」。
     * 用户明确要求保留"高性价比"，但同时强调不能只看价格、要考虑性能。
     * 最容易犯的错是把它贴到 low 档（40 积分，全站最低价）——
     * 那是草稿档，用户照着"高性价比"选过去会拿到不能用的成品。
     *
     * 反向断言在这里尤其必要：正向逐个点名只能守住今天这三个，
     * 将来新增一个便宜模型时，只有反向断言能拦住随手贴标签。
     */
    for (const [source, constName, terminator, shape] of [
      [clientSource, "IMAGE_AI_MODELS", "];", "array"],
      [serverSource, "imageModelDescriptions", "};", "record"],
    ] as const) {
      const byId = collectDescriptionsById(source, constName, terminator, shape);
      for (const [id, description] of byId) {
        if (!description.includes("性价比")) continue;
        expect(
          AFFORDABLE_MODEL_IDS,
          `${constName} 里 ${id} 的文案 "${description}" 贴了性价比，` +
            "但它不在允许清单内 —— 性价比要看性能/价格比，不是单纯便宜"
        ).toContain(id);
      }
      // 正向：允许清单里的档位确实贴上了，防止有人把这三条悄悄改掉后
      // 上面那条反向断言变成空转（没有任何文案含"性价比" → 循环体一次都不进）。
      const tagged = [...byId].filter(([, text]) => text.includes("性价比"));
      expect(tagged.length, `${constName} 应有 ${AFFORDABLE_MODEL_IDS.length} 条性价比文案`).toBe(
        AFFORDABLE_MODEL_IDS.length
      );
    }
  });

  it("低价草稿档不得被描述成性价比之选", () => {
    /*
     * 单独点名 low 档：它是最容易被误贴的一档（单价 40，全站最低）。
     * 与上一条的区别是那条守"清单外不许贴"，这条守"这两个具体 id 永远不许贴"，
     * 即使将来有人往 AFFORDABLE_MODEL_IDS 里加它也会被拦下。
     */
    const lowTierIds = ["vod-og25-sunburst-low", "vod-og25-flare-low"];
    expect(AFFORDABLE_MODEL_IDS).not.toContain(lowTierIds[0]);
    expect(AFFORDABLE_MODEL_IDS).not.toContain(lowTierIds[1]);
    for (const [source, constName, terminator, shape] of [
      [clientSource, "IMAGE_AI_MODELS", "];", "array"],
      [serverSource, "imageModelDescriptions", "};", "record"],
    ] as const) {
      const byId = collectDescriptionsById(source, constName, terminator, shape);
      for (const id of lowTierIds) {
        const description = byId.get(id);
        expect(description, `${constName} 缺少 ${id} 的文案`).toBeTruthy();
        expect(description, `${id} 是草稿档，不能描述成性价比之选`).not.toMatch(/性价比|划算|超值/);
      }
    }
  });

  it("不再使用脱离上下文就无意义的相对说法", () => {
    /*
     * "另一画风" 这类文案在下拉里单独看没有任何信息量 ——
     * 用户读到它并不知道该不该切过去。sunburst / flare 价格完全相同
     * （tencent-vod-aigc.ts:352），差异纯粹在画风，必须把画风说清楚。
     *
     * ⚠️ 只能查**解析出来的文案值**，不能整文件 toContain ——
     * 第一版就是整文件查，结果命中了源码里「不要写另一画风」的说明注释，
     * 断言失败但代码其实是对的。源码扫描型断言必须先切区块再剥注释。
     */
    for (const description of [...clientDescriptions, ...serverDescriptions]) {
      expect(description, `"${description}" 是脱离上下文的相对说法`).not.toMatch(
        /另一|同上|类似|其他画风/
      );
    }
  });

  it("前后端两份文案表逐条一致", () => {
    /*
     * 两张表分别维护：前端有本地兜底清单，服务端漏了 UI 也看不出来，
     * 只有直接消费 /api/ai/models 的第三方会拿到不一致的文案。
     * image-model-catalog.test.ts 已有同类断言，这里再锁一次纯文本层面，
     * 保证「改了一边忘了另一边」在不启动服务的情况下就能被抓到。
     */
    for (const description of clientDescriptions) {
      expect(serverDescriptions, `服务端缺少文案 "${description}"`).toContain(description);
    }
  });
});
