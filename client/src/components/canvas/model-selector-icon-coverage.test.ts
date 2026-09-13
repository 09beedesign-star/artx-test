import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getModelBrandIconKind } from "./model-brand-icons";
import {
  AUTO_AI_MODEL,
  IMAGE_AI_MODEL_OPTIONS,
  TEXT_AI_MODELS,
  mergeImageAiModelOptions,
  type AiModelOption,
} from "../../lib/workspace-data";

/**
 * 2026-09-13 线上 bug：模型选择器的**触发按钮**上，部分模型选中后图标是一片空白，
 * 而同一个模型在下拉列表里图标正常。
 *
 * 根因是三层叠加的：
 *   1) getModelBrandIconKind 认不出品牌时返回 "none"；
 *   2) 渲染组件在 "none" 分支直接 return null —— 图标位什么都不画；
 *   3) 触发按钮那个调用点漏传了 icon prop，于是必然落到 (1)。
 *
 * 单修 (3) 只能救当前这一个调用点，下一个新增调用点照样会踩。
 * 所以这组测试同时锁住三层：组件不许返回 null、所有调用点必须传 icon、
 * 数据层不许把 icon 丢掉。
 */

const INFINITE_CANVAS_PATH = "client/src/components/canvas/InfiniteCanvas.tsx";
const CANVAS_NODES_PATH = "client/src/components/canvas/CanvasNodes.tsx";
const WORKSPACE_DATA_PATH = "client/src/lib/workspace-data.ts";

/**
 * 剥掉注释再做源码断言。
 *
 * 坑一：解释「为什么不能这样写」的注释本身含有被禁止的字面量，
 * not.toContain 会命中注释导致断言恒挂 —— 看起来像代码有问题，实际是锚点选错了。
 *
 * 坑二：**不能用通用的 /\/\*[\s\S]*?\*\//g 剥块注释**。
 * InfiniteCanvas.tsx 有 117 万字符，里面的正则字面量、字符串里都可能出现
 * `/*` 或 `*​/` 片段，通用写法会从一个假的起点一路吞到下一个 `*​/`，
 * 实测多删 5.7 万字符并吃掉了 2 个真实的 <AssistantModelIcon> 调用点 ——
 * 断言于是「通过」了，但守的是一份残缺源码。
 * 这里只剥「整行都是块注释」的形态，宁可漏剥也不能误删。
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

describe("模型选择器图标不得出现空白（2026-09-13 回归锁）", () => {
  it("剥注释不会误删真实代码（上面那条断言的前置保障）", () => {
    // 剥离一旦过度，下面「每个调用点都要传 icon」会因为样本残缺而假通过。
    // 这里正面比对剥离前后的调用点数量，把那种假通过挡在门外。
    const raw = readFileSync(INFINITE_CANVAS_PATH, "utf8");
    const stripped = stripComments(raw);
    const countIn = (text: string) => (text.match(/<AssistantModelIcon/g) || []).length;
    expect(countIn(stripped)).toBe(countIn(raw));
    // 同时确认剥离确实生效了，否则等于没剥。
    expect(stripped.length).toBeLessThan(raw.length);
    expect(stripped).not.toContain("绝不能因为认不出品牌就 return null");
  });

  it("AssistantModelIcon 的每一个调用点都必须传 icon", () => {
    const source = readStripped(INFINITE_CANVAS_PATH);
    const usages = source.match(/<AssistantModelIcon[^/>]*\/>/g) || [];

    // 先确认确实扫到了调用点，否则正则一旦失配这条断言会静默空转。
    expect(usages.length).toBeGreaterThanOrEqual(6);

    for (const usage of usages) {
      expect(usage, `调用点漏传 icon：${usage}`).toMatch(/\sicon=\{/);
      expect(usage, `调用点漏传 modelId：${usage}`).toMatch(/\smodelId=\{/);
    }
  });

  it("图标组件认不出品牌时必须降级，不得返回 null", () => {
    const infiniteCanvas = readStripped(INFINITE_CANVAS_PATH);
    const canvasNodes = readStripped(CANVAS_NODES_PATH);

    // 反向断言：这正是 bug 时期的写法，一旦有人改回来立刻挂。
    expect(infiniteCanvas).not.toMatch(/iconKind === "none"\s*\)\s*return null/);
    expect(infiniteCanvas).not.toMatch(/if \(iconKind === "none"\) return null/);
    expect(canvasNodes).not.toMatch(/if \(iconKind === "none"\) \{\s*return null/);

    // 正向断言：none 必须和 image 走同一条降级分支。
    expect(infiniteCanvas).toMatch(/iconKind === "image" \|\| iconKind === "none"/);
    expect(canvasNodes).toMatch(/iconKind === "image" \|\| iconKind === "none"/);
  });

  it("在售模型无论是否拿得到 icon，都能解析出可渲染的图标", () => {
    /**
     * 组件的渲染口径：
     *   auto            → 专属魔法棒
     *   image / none    → 通用图片线框图标
     *   其余             → 品牌图标
     * 也就是说只要不 return null，任何 kind 都有东西可画。
     * 这条用例覆盖「调用点传了 icon」和「调用点漏传 icon」两种输入。
     */
    const renderable = (model: AiModelOption, passIcon: boolean) => {
      if (model.id === AUTO_AI_MODEL.id) return true;
      const kind = getModelBrandIconKind(model.id, passIcon ? model.icon : undefined);
      // "none" 现在也是可渲染的（降级到线框图），唯一的不可渲染状态是根本没分支。
      return ["anthropic", "banana", "jimeng", "kling", "midjourney", "openai", "image", "none"]
        .includes(kind);
    };

    const allModels: AiModelOption[] = [...IMAGE_AI_MODEL_OPTIONS, ...TEXT_AI_MODELS];
    expect(allModels.length).toBeGreaterThan(10);

    for (const model of allModels) {
      expect(renderable(model, true), `${model.id} 传 icon 时无法渲染`).toBe(true);
      expect(renderable(model, false), `${model.id} 漏传 icon 时无法渲染`).toBe(true);
    }
  });

  it("auto 有自己的图标，不跟着品牌解析走", () => {
    const infiniteCanvas = readStripped(INFINITE_CANVAS_PATH);
    const canvasNodes = readStripped(CANVAS_NODES_PATH);

    // auto 的裸 id 不含任何品牌关键字且没有 icon 字段，
    // 若不在组件里单独开分支，它会和别的模型一样落到兜底图标，
    // 语义上「让系统替你挑」就丢失了。
    expect(infiniteCanvas).toMatch(/modelId === AUTO_AI_MODEL\.id/);
    expect(canvasNodes).toMatch(/model\.id === AUTO_AI_MODEL\.id/);
    expect(infiniteCanvas).toMatch(/data-model-brand-icon="auto"/);
    expect(canvasNodes).toMatch(/data-model-brand-icon="auto"/);
  });
});

describe("服务端目录不得把本地 icon 覆盖掉", () => {
  it("下发条目缺 icon 时回退到本地目录的 icon", () => {
    /**
     * mergeImageAiModelOptions 里服务端条目**优先于**本地目录。
     * 若它缺 icon 又不做兜底，本地写好的 icon 会被整条覆盖 ——
     * 这是同一个「图标空白」bug 的数据侧出口，比调用点漏传更难发现，
     * 因为本地开发时后端目录常常拿不到，问题只在线上出现。
     */
    const mjLocal = IMAGE_AI_MODEL_OPTIONS.find(model => model.id === "vod-mj");
    expect(mjLocal?.icon).toBeTruthy();

    const merged = mergeImageAiModelOptions([
      // 故意不带 icon，模拟服务端目录字段缺失
      { id: "vod-mj", label: "mj v8.2", color: "oklch(0.78 0.15 40)" },
      { id: "vod-gem", label: "banana 3.1", color: "oklch(0.72 0.18 200)" },
    ]);

    const mj = merged.find(model => model.id === "vod-mj");
    const gem = merged.find(model => model.id === "vod-gem");
    expect(mj?.icon, "vod-mj 的 icon 被服务端空值覆盖了").toBe(mjLocal?.icon);
    expect(getModelBrandIconKind(mj!.id, mj!.icon)).toBe("midjourney");
    expect(getModelBrandIconKind(gem!.id, gem!.icon)).toBe("banana");
  });

  it("服务端显式给出 icon 时以服务端为准", () => {
    // 兜底只能在缺失时生效，不能反过来压住服务端的正确下发，
    // 否则新模型上线就必须同时改前端硬编码表才能有图标。
    const merged = mergeImageAiModelOptions([
      { id: "vod-si", label: "si 5.0 pro", color: "oklch(0.82 0.18 95)", icon: "openai" },
    ]);
    const si = merged.find(model => model.id === "vod-si");
    expect(si?.icon).toBe("openai");
  });

  it("兜底逻辑真的写在源码里，而不是恰好没触发", () => {
    const source = readStripped(WORKSPACE_DATA_PATH);
    // 光靠上面的行为断言不够：如果哪天有人把整个 merged.set 换掉，
    // 行为断言可能因为别的原因仍然通过。这里锚住实现本身。
    expect(source).toMatch(/icon:\s*option\.icon \|\|/);
  });
});
