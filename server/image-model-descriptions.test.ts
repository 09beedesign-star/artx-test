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

/** 取 useImageModelOptions() 函数体。锚真正的结尾，别用缩进或裸 `}`。 */
function readUseImageModelOptionsBody() {
  const source = readSource("client/src/components/canvas/InfiniteCanvas.tsx");
  const start = source.indexOf("function useImageModelOptions()");
  expect(start, "未找到 useImageModelOptions()").toBeGreaterThan(-1);
  const end = source.indexOf("return imageModelOptions;", start);
  expect(end, "未找到 useImageModelOptions 的 return").toBeGreaterThan(start);
  const body = source.slice(start, end);
  expect(body).toContain("entitlementByModel");
  return stripBlockComments(body);
}

const PRICE_PATTERN = /积分|性价比|成本|价格|免费|[0-9]\s*元/;

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

function collectDescriptions(source: string, constName: string, terminator: "];" | "};") {
  // 先剥注释：块里的解释性文字同样含中文引号内容，会被下面的正则捞进来。
  const block = stripBlockComments(readConstBlock(source, constName, terminator))
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const matches = [...block.matchAll(/description:\s*"([^"]+)"|"[^"]+":\s*"([^"]+)"/g)];
  const values = matches.map(match => match[1] ?? match[2]).filter(Boolean) as string[];
  expect(values.length, `${constName} 里没解析出任何文案`).toBeGreaterThanOrEqual(14);
  return values;
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
    const source = readSource("client/src/components/canvas/InfiniteCanvas.tsx");
    const fallbacks = source.match(/unavailableReason\s*\|\|\s*\w+\.description/g) || [];
    expect(fallbacks.length, "三个渲染出口都应保留该短路").toBeGreaterThanOrEqual(3);
  });
});

describe("模型能力描述文案口径", () => {
  const clientSource = readSource("client/src/lib/workspace-data.ts");
  const serverSource = readSource("server/image-generation.ts");

  const clientDescriptions = collectDescriptions(clientSource, "IMAGE_AI_MODELS", "];");
  const serverDescriptions = collectDescriptions(serverSource, "imageModelDescriptions", "};");

  it("前端清单：不含价格信息且不超过 20 字", () => {
    for (const description of clientDescriptions) {
      expect(description, `"${description}" 含价格信息`).not.toMatch(PRICE_PATTERN);
      expect(description.length, `"${description}" 超过 20 字`).toBeLessThanOrEqual(20);
    }
  });

  it("服务端目录：不含价格信息且不超过 20 字", () => {
    for (const description of serverDescriptions) {
      expect(description, `"${description}" 含价格信息`).not.toMatch(PRICE_PATTERN);
      expect(description.length, `"${description}" 超过 20 字`).toBeLessThanOrEqual(20);
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
