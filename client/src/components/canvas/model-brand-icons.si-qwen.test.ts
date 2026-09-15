import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getModelBrandIconKind, MODEL_BRAND_ICON_URLS } from "./model-brand-icons";

/**
 * 2026-09-13：为 vod-si / vod-qwen 补品牌图标。
 *
 * 用户的要求是「icon 风格和**交互态样式**与其他模型保持一致」，
 * 所以这组用例分三层守：
 *   1) 解析层 —— 两个新 kind 能被解析出来，且 si 的正则不许退回裸匹配；
 *   2) 资源层 —— svg 必须真实存在、且是 mask 渲染能用的单色实心形态；
 *   3) 渲染层 —— 新图标必须走和其他品牌**完全相同**的 ModelBrandIconMask，
 *      不允许为它们单开尺寸/颜色/状态分支，否则交互态必然不一致。
 */

const ICON_DIR = "client/src/assets/model-icons";
const BRAND_ICONS_PATH = "client/src/components/canvas/model-brand-icons.tsx";

function stripBlockComments(source: string) {
  // 只剥「整行都是注释」的形态。解释 si 正则风险的那段长注释里
  // 含有 "vision"、"/si/" 这些字面量，不剥会让下面的反向断言命中注释。
  return source
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^\s*\*.*$/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("si / qwen 品牌图标（2026-09-13 新增）", () => {
  it("两个模型的裸 id 和带 icon 两种入参都能解析出品牌", () => {
    // 调用点漏传 icon 是本项目出过的真实线上 bug，两条路径都要覆盖。
    expect(getModelBrandIconKind("vod-si")).toBe("si");
    expect(getModelBrandIconKind("vod-si", "si")).toBe("si");
    expect(getModelBrandIconKind("vod-qwen")).toBe("qwen");
    expect(getModelBrandIconKind("vod-qwen", "qwen")).toBe("qwen");
    // VOD 侧还存在 si-5.0-lite 这个版本串，同样要认得出。
    expect(getModelBrandIconKind("si-5.0-lite")).toBe("si");
    expect(getModelBrandIconKind("anything", "通义千问")).toBe("qwen");
  });

  it("⚠️ si 的匹配必须锚定分隔符，不得误伤含 si 子串的模型", () => {
    /**
     * 这条是整组用例里最重要的一条。
     *
     * "si" 只有两个字母，裸写 /si/ 会把 vision / fusion / design / basic
     * 全判成 SI 品牌。这类故障**不报错**，只是图标画错，几乎不可能被发现。
     * 当前模型清单恰好没有含 si 子串的 id，属于巧合，不能依赖。
     */
    const mustNotBeSi = [
      "vision-pro",
      "fusion-xl",
      "basic-draft",
      "design-v2",
      "silicon-flow",
      "sigma-image",
      "sina-model",
      "og25-sunburst-medium",
    ];
    for (const id of mustNotBeSi) {
      expect(getModelBrandIconKind(id), `${id} 被误判成 si 品牌`).not.toBe("si");
    }

    // 源码层反向断言：防止有人「简化」成裸正则。
    // 上面的行为断言挡得住当前样本，但换成裸正则后这些样本仍会全过
    // （因为它们都不在 IMAGE_MODEL_PRIORITY_IDS 里），所以必须加这一层。
    const source = stripBlockComments(readFileSync(BRAND_ICONS_PATH, "utf8"));
    expect(source).not.toMatch(/\/si\|/);
    expect(source).not.toMatch(/\|si\//);
    expect(source).not.toMatch(/\/\^?si\$?\/\.test/);
    expect(source, "si 分支必须带分隔符锚定").toMatch(/\[\\s\\-_\/\]\)si\(/);
  });

  it("两个 svg 资源真实存在，且是 mask 能渲染的单色实心形态", () => {
    for (const name of ["si", "qwen"]) {
      const file = `${ICON_DIR}/${name}.svg`;
      expect(existsSync(file), `${file} 不存在`).toBe(true);
      const svg = readFileSync(file, "utf8");

      // mask 渲染只认 alpha 形状，颜色会被完全丢弃。
      // 但必须是**实心填充**：只有 stroke 没有 fill 的线框图在
      // `contain` 缩放到 14px 后会细到几乎看不见。
      expect(svg, `${name}.svg 缺少 fill 实心路径`).toMatch(/fill="#0{6}"|fill="black"|fill="#000"/i);
      expect(svg).toMatch(/viewBox="0 0 24 24"/);
      // 不能有 fill="none" 的顶层绘制元素残留（那会是一块空白 mask）。
      expect(svg).not.toMatch(/<path[^>]*fill="none"/);
    }
  });

  it("新图标走的是和其他品牌完全相同的渲染组件，不得单开样式分支", () => {
    /**
     * 交互态一致性的实现保障。
     *
     * 图标本身在任何状态下都是 14px + backgroundColor:#FFFFFF，
     * hover / selected / disabled 全部作用在**外层按钮容器**上，
     * 图标不参与状态变化。因此「与其他模型保持一致」等价于
     * 「必须复用 ModelBrandIconMask 且不传自定义 size / style」。
     *
     * 一旦有人为 si/qwen 单独写 <span style={{...}}> 或传不同 size，
     * 它们在 hover 高亮、选中态、禁用置灰下就会和别的模型不一样。
     */
    const source = stripBlockComments(readFileSync(BRAND_ICONS_PATH, "utf8"));

    // 两个新 kind 只能出现在类型联合、URL 表和正则分支里，
    // 不允许出现任何针对它们的条件渲染。
    expect(source).not.toMatch(/kind\s*===\s*"si"/);
    expect(source).not.toMatch(/kind\s*===\s*"qwen"/);

    // URL 表必须是 Record<Exclude<Kind,"image"|"none">, string> 的完整映射，
    // 类型层面已经强制了，这里再锚一次实际条目，防止被改成可选。
    expect(MODEL_BRAND_ICON_URLS.si).toEqual(expect.stringContaining("si.svg"));
    expect(MODEL_BRAND_ICON_URLS.qwen).toEqual(expect.stringContaining("qwen.svg"));

    // 渲染组件仍然只有一条统一出口。
    const maskBlock = source.slice(source.indexOf("export function ModelBrandIconMask"));
    expect(maskBlock).toMatch(/const iconUrl = MODEL_BRAND_ICON_URLS\[kind\]/);
    expect(maskBlock).toMatch(/backgroundColor: "#FFFFFF"/);
    expect(maskBlock).toMatch(/size = 14/);
  });

  it("⚠️⚠️ 三张 icon 表必须同口径（变异 M5/M6 的漏网补丁）", () => {
    /**
     * 同一个模型的 icon 值散落在**三个地方**，任何一处改回旧值，
     * 上面所有行为断言都照样全绿 —— 因为它们测的是解析函数，
     * 而解析函数拿到的是这三张表喂进来的值。
     *
     *   ① server/image-generation.ts  imageModelIcons   ← 线上下发，优先级最高
     *   ② client/src/lib/workspace-data.ts IMAGE_AI_MODELS ← 本地兜底
     *   ③ model-brand-icons.tsx MODEL_BRAND_ICON_URLS    ← 最终资源
     *
     * ① 改回 "image" 的后果最隐蔽：本地开发（拿不到后端目录）图标正常，
     * 一上线就被下发值覆盖成通用线框图。这正是本项目最高频的
     * 「同一份数据多个出口，只改一部分」事故模式。
     */
    const expected: Record<string, string> = { "vod-si": "si", "vod-qwen": "qwen" };

    const serverSource = readFileSync("server/image-generation.ts", "utf8");
    const serverBlock = serverSource.slice(
      serverSource.indexOf("const imageModelIcons"),
      serverSource.indexOf("function isImageGenerationModelId")
    );
    expect(serverBlock.length).toBeGreaterThan(100); // 锚点失效保护

    const clientSource = readFileSync("client/src/lib/workspace-data.ts", "utf8");
    const clientBlock = clientSource.slice(
      clientSource.indexOf("export const IMAGE_AI_MODELS"),
      clientSource.indexOf("// 文本 / 多模态理解模型清单")
    );
    expect(clientBlock.length).toBeGreaterThan(100);

    for (const [id, icon] of Object.entries(expected)) {
      expect(serverBlock, `服务端 imageModelIcons 里 ${id} 不是 "${icon}"`).toMatch(
        new RegExp(`"${id}":\\s*"${icon}"`)
      );
      expect(clientBlock, `workspace-data 里 ${id} 不是 "${icon}"`).toMatch(
        new RegExp(`id: "${id}"[^}]*icon: "${icon}"`)
      );
      // 两张表喂进来的值都必须解析到同一个品牌，且不是降级的 image/none。
      const kind = getModelBrandIconKind(id, icon);
      expect(kind).toBe(icon);
      expect(MODEL_BRAND_ICON_URLS[kind as "si" | "qwen"]).toBeTruthy();
    }
  });

  it("两个调用点对新图标和旧图标的渲染口径完全一致", () => {
    // 新增品牌后，两个上层包装组件不需要任何改动 ——
    // 如果有人在这里加了针对 si/qwen 的分支，交互态就会分叉。
    //
    // ⚠️ 2026-09-15：AssistantModelIcon 从 InfiniteCanvas.tsx 迁到 ModelSelector.tsx
    //（供画布与首页共用），这条断言随之挂了。它锚的是「渲染这个图标的那份源码」，
    // 代码搬家后必须**跟着搬锚点**，而不是把断言删掉或改松 ——
    // 后者等于默默放弃 si/qwen 不得单开分支这条约束。
    const modelSelector = readFileSync("client/src/components/canvas/ModelSelector.tsx", "utf8");
    const canvasNodes = readFileSync("client/src/components/canvas/CanvasNodes.tsx", "utf8");
    for (const [name, src] of [["ModelSelector", modelSelector], ["CanvasNodes", canvasNodes]] as const) {
      expect(src, `${name} 不应为 si 单开分支`).not.toMatch(/iconKind === "si"/);
      expect(src, `${name} 不应为 qwen 单开分支`).not.toMatch(/iconKind === "qwen"/);
      // 品牌图标统一 14px，和 auto 的魔法棒、通用线框图一致。
      expect(src).toMatch(/<ModelBrandIconMask kind=\{iconKind\} size=\{14\} \/>/);
    }
  });
});
