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

/*
  ⚠️⚠️⚠️ 【2026-09-18 线上实测抓到的真 bug，这组断言是它的护栏】

  现场：线上打开画布后，localStorage 里躺着两条
  `artx:canvas-assistant-messages:<pid>:<随机id>`，而索引 key 压根不存在。

  根因见 canvas-conversations.ts 里 ensureConversationIndex 的注释：
  ensure 内部有随机 id 却不落盘，而本文件会调它两次。

  📌⭐⭐ 这里锁的是**调用方这一侧**的两个判据：
     ① 两个调用点都必须把 write 回调传进去（少传一个就复发）；
     ② 读写回调必须是模块级共享函数，不能内联 —— 内联 = 同一份逻辑两份副本。
*/
describe("⚠️ 会话索引初始化必须落盘", () => {
  it("ensureConversationIndex 的每个调用点都传了 write 回调", () => {
    const calls = source.split("ensureConversationIndex(").length - 1;
    expect(calls, "调用点数量变了就要重新审视这组断言").toBe(2);
    const withWrite =
      source.split("readWriteConversationIndex\n").length - 1;
    expect(
      withWrite,
      "每个 ensureConversationIndex 调用点都必须传 readWriteConversationIndex"
    ).toBe(2);
  });

  it("读写回调是模块级唯一出口，不是内联箭头函数", () => {
    expect(source).toContain("function readConversationIndexStorage(");
    expect(source).toContain("function readWriteConversationIndex(");
    expect(
      source,
      "调用点不得再内联 window.localStorage.getItem 作为 read 回调"
    ).not.toContain("ensureConversationIndex(projectId, key =>");
  });

  it("write 回调函数体真的写了 localStorage（不是空壳）", () => {
    const body = source.slice(
      source.indexOf("function readWriteConversationIndex("),
      source.indexOf("function readWriteConversationIndex(") + 320
    );
    expect(body).toContain("window.localStorage.setItem(key, value)");
  });

  it("索引落盘只经由 readWriteConversationIndex，没有第二个写出口", () => {
    const direct = source.split(
      "window.localStorage.setItem(\n          canvasConversationIndexKey"
    ).length - 1;
    expect(direct, "索引不得再有直接 setItem 的写出口").toBe(0);
    const viaHelper =
      source.split("readWriteConversationIndex(\n        canvasConversationIndexKey")
        .length - 1;
    expect(viaHelper, "persistConversationIndex + 索引同步 effect 共 2 处").toBe(2);
  });
});

/*
  ⚠️⚠️⚠️ 【2026-09-18 线上实测抓到的第二个真 bug，这组断言是它的护栏】

  现象：在历史浮层里点另一条会话，切过去之后那条会话的索引元数据
  变成了**上一条会话的**标题和条数。交叉核对的铁证：

    id=cmu70jux  indexCount=3  realCount=1  realUserFirst=(无用户消息)  ← MISMATCH
    id=cmu70r1g  indexCount=3  realCount=3  realUserFirst=这是一条…      ← 正常

  更严重的是消息落盘 effect 也会把**旧会话的 messages** 写进新会话的 key，
  两条对话直接互相污染。

  根因：切换 activeConversationId 时，「载入消息」「消息落盘」「索引同步」
  三个 effect 在**同一轮**全部触发，而后两个拿到的 messages 还是旧会话的
  —— setMessages 要到下一轮渲染才生效。

  📌⭐⭐⭐ 判据：**effect 依赖里同时出现「数据」和「数据归属的身份」时，
     这两者天然不同步**（身份先变，数据后变）。
     绝不能靠 effect 的声明顺序去弥补 —— 必须显式记录「当前这份数据属于谁」，
     写入前核对一致，不一致就跳过本轮。
*/
describe("⚠️ 切换会话时禁止用旧 messages 写新会话", () => {
  /*
    ⚠️⚠️ 这条断言最初写的是 `toContain("messagesConversationRef")`，
       变异自证里「删掉 ref 声明」竟然 SURVIVED ——
       因为另外三处**用法**里这个词还在，光搜标识符名恒绿。
    📌⭐⭐ 判据：**要断言「某个东西被声明了」，锚点必须含声明语法本身
       （const / useRef），不能只搜标识符** —— 标识符在用法里到处都是。
  */
  it("存在「messages 归属哪条会话」的 ref 声明", () => {
    expect(
      source,
      "必须显式声明 messagesConversationRef，不能靠 effect 顺序"
    ).toContain("const messagesConversationRef = useRef<string>(");
  });

  it("消息落盘 effect 在归属不一致时提前 return", () => {
    const start = source.indexOf("const serialized = JSON.stringify(");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start - 600, start + 200);
    expect(
      block,
      "落盘前必须核对 messagesConversationRef 与 activeConversationId"
    ).toContain("messagesConversationRef.current !== activeConversationId");
  });

  it("索引同步 effect 在归属不一致时提前 return", () => {
    const start = source.indexOf("touchConversation(prev, activeConversationId, messages)");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start - 700, start);
    expect(
      block,
      "索引同步前必须核对归属，否则元数据会被上一条会话污染"
    ).toContain("messagesConversationRef.current !== activeConversationId");
  });

  it("载入 effect 负责把归属标记更新为当前会话", () => {
    const start = source.indexOf("const stored = deserializeCanvasAssistantMessages(");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 2600);
    expect(
      block,
      "载入新会话消息的同时必须把归属标记指向该会话"
    ).toContain("messagesConversationRef.current = activeConversationId");
  });

  /*
    ⚠️⚠️⚠️ 上面那条断言是「第二次线上串会话」被放过去的直接原因 ——
       它只要求「ref 在载入 effect 里被更新」，**没约束在哪个时刻更新**。
       我上一版把它写在 setMessages 之前，断言照样绿，线上照样串。

       真实时序（React 按 effect 声明顺序执行，setMessages 异步生效）：
         载入 effect：ref = 新id；setMessages(新内容) → 本轮 messages 仍是旧的
         落盘 effect：ref 已 = 新id → 守卫判「相符」→ 放行 → 写入旧 messages ❌

    📌⭐⭐⭐ 判据：**守卫型 ref 的断言必须锚定「它和被守护的数据在同一次
       提交里变化」，而不是「它被赋值过」。** 赋值位置就是语义本身。
  */
  it("⚠️⚠️⚠️ 归属标记必须写在 setMessages 的 updater 内部，不能提前赋值", () => {
    const start = source.indexOf("const stored = deserializeCanvasAssistantMessages(");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 2600);

    const setIdx = block.indexOf("setMessages(() => {");
    expect(
      setIdx,
      "载入 effect 必须用 setMessages(() => {...}) 形式，好把 ref 赋值包进 updater"
    ).toBeGreaterThan(0);

    const refIdx = block.indexOf("messagesConversationRef.current = activeConversationId");
    expect(refIdx).toBeGreaterThan(0);
    expect(
      refIdx,
      "ref 赋值必须在 setMessages 的 updater 内部（即位置在 setMessages 之后），" +
        "否则守卫在切换那一轮恒真，等于没有守卫"
    ).toBeGreaterThan(setIdx);
  });

  it("⚠️ 载入 effect 里不得在 setMessages 之前出现裸的归属赋值", () => {
    const start = source.indexOf("const stored = deserializeCanvasAssistantMessages(");
    const block = source.slice(start, start + 2600);
    const setIdx = block.indexOf("setMessages(() => {");
    const before = block.slice(0, setIdx);
    expect(
      before,
      "setMessages 之前出现归属赋值 = 守卫被自己架空（2026-09-18 线上事故）"
    ).not.toContain("messagesConversationRef.current = activeConversationId");
  });
});
