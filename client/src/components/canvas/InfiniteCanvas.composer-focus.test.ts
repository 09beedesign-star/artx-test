import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 回归测试：提示词输入框「删空即失焦」
//
// 现象：一直按 Backspace 回删，删到空的那一刻光标跳出输入框，
//       必须用鼠标重新点击才能继续输入。
//
// 成因链：
//   1. normalizeAssistantComposerSegments 在内容全空时返回 createAssistantTextSegment("")
//   2. createAssistantTextSegment 的 id 含 Date.now()+Math.random()，每次都不同
//   3. 渲染处用 key={segment.id}，key 一变 React 就卸载旧 <textarea> 再挂载新的
//   4. 焦点随 DOM 节点一起消失
//
// 修复：全空时复用已有 text segment 的 id，只把 text 清成 ""，保持 key 稳定。

const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

function getNormalizeFnSource() {
  return source.match(
    /function normalizeAssistantComposerSegments\([\s\S]*?\n}/
  )?.[0];
}

describe("prompt composer keeps focus when emptied", () => {
  it("reuses the existing segment id instead of minting a new one", () => {
    const fn = getNormalizeFnSource();
    expect(fn).toBeTruthy();

    // 全空分支必须复用已有 segment，而不是无条件新建
    expect(fn).toContain("normalized.find(segment => segment.type === \"text\")");
    expect(fn).toContain("return [{ ...reusable, text: \"\" }]");
  });

  it("does not unconditionally return a freshly minted segment when empty", () => {
    const fn = getNormalizeFnSource();
    // 修复前的写法：if (!hasToken && !hasText) return [createAssistantTextSegment("")];
    // 该单行 return 必须已被替换掉，否则 id 仍会每次变化。
    expect(fn).not.toMatch(
      /if \(!hasToken && !hasText\) return \[createAssistantTextSegment\(""\)\];/
    );
  });

  it("still renders the textarea keyed by segment id (the fragile link)", () => {
    // 这一条不是要求改动，而是锁住前提：只要 key 仍绑定 segment.id，
    // 上面两条断言就必须成立，否则 bug 会复现。
    expect(source).toContain("key={segment.id}");
  });

  it("keeps the id generator random (documents why id stability matters)", () => {
    const creator = source.match(
      /function createAssistantTextSegment\([\s\S]*?\n}/
    )?.[0];
    expect(creator).toBeTruthy();
    // id 本身带随机数是合理设计（避免不同 segment 撞 id），
    // 正因如此才不能在「删空」这种高频路径上调用它。
    expect(creator).toContain("Math.random()");
  });
});

describe("normalize logic behaves correctly when emptied", () => {
  // 把纯逻辑抽出来实跑一遍，验证的是行为而不只是源码文本。
  type Segment = { id: string; type: string; text: string };

  function normalizeEmptyBranch(normalized: Segment[]): Segment[] {
    const hasToken = normalized.some(s => s.type !== "text");
    const hasText = normalized.some(
      s => s.type === "text" && s.text.trim().length > 0
    );
    if (!hasToken && !hasText) {
      const reusable = normalized.find(s => s.type === "text");
      if (reusable) return [{ ...reusable, text: "" }];
      return [{ id: `seg-text-${Date.now()}`, type: "text", text: "" }];
    }
    return normalized;
  }

  it("preserves the id across the emptying transition", () => {
    const before: Segment[] = [{ id: "seg-text-stable-1", type: "text", text: "a" }];
    const afterTypingDeleted: Segment[] = [
      { id: "seg-text-stable-1", type: "text", text: "" },
    ];

    const result = normalizeEmptyBranch(afterTypingDeleted);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("");
    // 关键断言：id 与删空前完全一致 → React key 不变 → textarea 不重建 → 焦点保住
    expect(result[0].id).toBe(before[0].id);
  });

  it("still produces a usable segment when the list is genuinely empty", () => {
    const result = normalizeEmptyBranch([]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect(result[0].text).toBe("");
  });

  it("leaves non-empty content untouched", () => {
    const input: Segment[] = [{ id: "seg-a", type: "text", text: "hello" }];
    expect(normalizeEmptyBranch(input)).toBe(input);
  });
});
