import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../../shared/strip-source-comments";

/*
  锁住画布对话面板「新建对话 / 历史对话」两个入口的几条判据。

  ⚠️ 所有断言都跑在 stripSourceComments 之后：注释里同样写着
     "新建对话" / "历史对话" 这些字样，不剥注释的话反向断言会恒绿。
*/
const SOURCE_PATH = path.resolve(__dirname, "InfiniteCanvas.tsx");
const rawSource = readFileSync(SOURCE_PATH, "utf8");
const source = stripSourceComments(rawSource);

describe("源码可用性自检", () => {
  it("剥注释后仍保留绝大部分代码（证明断言看得到源码）", () => {
    const ratio = source.length / rawSource.length;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1);
  });
});

/**
 * 抽出 actionButtons 数组体。
 *
 * ⚠️ 锚点必须全文唯一，否则可能抠到别的数组。
 */
function extractActionButtons() {
  const anchor = "const actionButtons = [";
  const hits = source.split(anchor).length - 1;
  expect(hits, `锚点必须唯一命中，实际 ${hits} 次：${anchor}`).toBe(1);
  const start = source.indexOf(anchor);
  const end = source.indexOf("\n  ];", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("actionButtons 顺序", () => {
  const block = extractActionButtons();

  it("包含新建对话与历史对话两个入口", () => {
    expect(block).toContain('label: "新建对话"');
    expect(block).toContain('label: "历史对话"');
  });

  it("⚠️⚠️ 两个新入口必须排在折叠按钮之前，否则收起态露出的不是折叠按钮", () => {
    const createIndex = block.indexOf('label: "新建对话"');
    const historyIndex = block.indexOf('label: "历史对话"');
    const collapseIndex = block.indexOf('collapsed ? "展开对话框" : "收起对话框"');
    expect(createIndex).toBeGreaterThan(-1);
    expect(historyIndex).toBeGreaterThan(-1);
    expect(collapseIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeLessThan(collapseIndex);
    expect(historyIndex).toBeLessThan(collapseIndex);
  });

  it("新建在历史之前（与 Lovart / Miora 布局一致）", () => {
    expect(block.indexOf('label: "新建对话"')).toBeLessThan(
      block.indexOf('label: "历史对话"')
    );
  });

  it("两个新图标尺寸与旁边保持一致（16）", () => {
    expect(block).toContain("<SquarePen size={16} />");
    expect(block).toContain("<History size={16} />");
  });

  it("收起态仍然只保留最后一个按钮", () => {
    expect(source).toContain("actionButtons.slice(-1)");
  });
});

describe("存储 key 的唯一出口", () => {
  it("⚠️ 老的 canvasAssistantMessagesStorageKey 必须已被移除（避免第二个写入出口）", () => {
    expect(source).not.toContain("canvasAssistantMessagesStorageKey");
  });

  /*
    ⚠️ 这里数的是**函数名**而不是 `canvasConversationMessagesKey(projectId`。
       四个调用点里有一个因为参数换行，`(projectId` 并不在同一行，
       按后者去数只能数到 3 —— 那是断言写法的问题，不是代码少了一个出口。
       📌 排查时先核对「它到底数到了什么」，别急着把阈值往下调。
       实测四处：初始化 / 删除清理 / 载入 effect / 写入 effect。
  */
  it("消息读写一律走 canvasConversationMessagesKey（四个出口）", () => {
    const hits = source.split("canvasConversationMessagesKey(").length - 1;
    expect(hits).toBe(4);
  });

  it("⚠️ sessionStorage 降级 key 也必须按会话分桶", () => {
    expect(source).toContain(
      "canvasAssistantMessagesSessionKey(projectId, activeConversationId)"
    );
  });

  /*
    ⚠️⚠️ 上面那条只证明「调用时传了第二个参数」，**不证明函数真的用了它**。
       实测变异：把函数体改成忽略 conversationId、直接返回不带后缀的 key，
       上面那条依然全绿 —— 调用点原封不动，断言自然命中。
       这正是「传参 ≠ 被消费」的典型：降级路径平时不走，出问题时极难复现。
    ✅ 所以必须切进函数体，断言它确实按 conversationId 分了桶。
  */
  it("⚠️⚠️ 降级 key 的函数体必须真的消费 conversationId（不只是收下参数）", () => {
    const anchor = "function canvasAssistantMessagesSessionKey(";
    const hits = source.split(anchor).length - 1;
    expect(hits, `锚点必须唯一命中，实际 ${hits} 次`).toBe(1);
    const start = source.indexOf(anchor);
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).toContain("conversationId ? `${base}:${conversationId}` : base");
  });
});

describe("effect 依赖", () => {
  /*
    ⚠️ 这里用**计数**而不是 toContain。带 activeConversationId 的写入 effect
       有两个（消息落盘 + 索引落盘），只用 toContain 的话，把其中一个改回
       `[messages, projectId]` 另一个仍能让断言命中 —— 漏掉一半。
  */
  it("⚠️⚠️ 消息载入 effect 的依赖必须带 activeConversationId", () => {
    const hits = source.split("}, [projectId, activeConversationId]);").length - 1;
    expect(hits).toBe(1);
  });

  it("⚠️⚠️ 消息落盘与索引落盘两个 effect 的依赖都必须带 activeConversationId", () => {
    const hits =
      source.split("}, [messages, projectId, activeConversationId]);").length - 1;
    expect(hits).toBe(2);
  });

  it("⚠️ 不能残留只带 projectId 的消息 effect（会造成两条对话互相覆盖）", () => {
    expect(source).not.toContain("}, [messages, projectId]);");
  });
});

describe("历史浮层交互", () => {
  /*
    ⚠️⚠️ 全文有两处 `addEventListener("pointerdown", handlePointerDown, true)`
       （另一处属于别的组件）。直接对全文断言 → 改坏我这处时另一处仍能命中，
       断言恒绿、测不出任何东西。✅ 必须先把作用域切到本 effect 内部再断言。
  */
  it("用捕获阶段 pointerdown 关闭浮层（限定在会话浮层的 effect 内）", () => {
    const anchor = "if (!conversationMenuOpen) return;";
    const hits = source.split(anchor).length - 1;
    expect(hits, `锚点必须唯一命中，实际 ${hits} 次`).toBe(1);
    const start = source.indexOf(anchor);
    const block = source.slice(start, start + 700);
    expect(block).toContain(
      'document.addEventListener("pointerdown", handlePointerDown, true)'
    );
    expect(block).toContain("conversationMenuRef.current.contains");
  });

  it("⚠️ 删除按钮必须 stopPropagation，否则删完会跳进已删对话", () => {
    const deleteBlock = source.slice(
      source.indexOf('aria-label="删除对话"'),
      source.indexOf('aria-label="删除对话"') + 400
    );
    expect(deleteBlock).toContain("event.stopPropagation()");
    expect(deleteBlock).toContain("handleDeleteConversation");
  });

  it("删除会话时连带清理它的消息 key（避免永久泄漏）", () => {
    const handler = source.slice(
      source.indexOf("const handleDeleteConversation"),
      source.indexOf("const actionButtons")
    );
    expect(handler).toContain("localStorage.removeItem");
    expect(handler).toContain("sessionStorage.removeItem");
  });
});
