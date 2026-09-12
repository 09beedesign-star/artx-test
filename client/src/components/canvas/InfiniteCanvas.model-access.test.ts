import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const canvasPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "InfiniteCanvas.tsx");

describe("canvas model access", () => {
  it("filters visible model menus using the authenticated allowlist", async () => {
    const source = await readFile(canvasPath, "utf8");

    expect(source).toContain("filterAllowedAiModelOptions");
    expect(source).toContain("allowedAiModels");
    expect(source).toContain("resolveAllowedAiModelId");
    // auto 选项的可见性必须按「默认图片模型」判断，且该判断要跟随常量走。
    expect(source).toContain("allowedAiModels.includes(DEFAULT_IMAGE_AI_MODEL_ID)");
  });

  it("never hardcodes a retired relay image model id", async () => {
    /**
     * 2026-09-12 中转站图片模型下线前，这里写死的是 "og-image2-medium"。
     * 该 id 退役后 isSelectableModel 恒为 false，任何残留的硬编码都会导致
     * 受限账号的 auto 选项凭空消失（判断永远不成立）。
     *
     * 改成常量引用后，用一条「源码里不得再出现这些字面量」的锁把它钉死，
     * 避免以后有人复制粘贴旧代码把硬编码写回来。
     */
    const source = await readFile(canvasPath, "utf8");
    const retiredIds = [
      "og-image2-low",
      "og-image2-medium",
      "og-image2-high",
      "gemini-3.5-flash-preview",
      "jimeng-4.0",
      "mj-v7",
      "mj-v8.1",
    ];
    // 注释里写到这些 id 是允许的（用于解释历史演进），只禁止出现在代码字面量中。
    const codeOnly = source
      .split("\n")
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
      })
      .join("\n");
    for (const id of retiredIds) {
      expect(codeOnly.includes(`"${id}"`), `代码里仍硬编码了已退役的 ${id}`).toBe(false);
      expect(codeOnly.includes(`'${id}'`), `代码里仍硬编码了已退役的 ${id}`).toBe(false);
    }
  });
});
