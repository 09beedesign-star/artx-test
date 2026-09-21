import { describe, expect, it, vi } from "vitest";

/**
 * 上下文超限时的「压缩」而非「截断」的回归测试。
 *
 * 【为什么有这个文件】
 * 用户要求：「上下文限制如果超过，根据大模型自主流程进行压缩」。
 * 原实现是 `messages.slice(-MAX_CONTEXT_MESSAGES)` —— 第 9 轮之前的内容
 * **凭空消失且毫无痕迹**：模型不知道自己忘了东西，用户也收不到提示。
 *
 * 📌 静默丢弃和压缩在日志里长得一模一样，区别只在「模型还记不记得」。
 * 所以这里的断言必须盯住「旧内容是否仍以某种形式存在于上下文里」，
 * 而不是只数返回了几条消息（只数条数的话，截断和压缩都能凑出同样的数字）。
 */

vi.mock("@/lib/ai", () => ({
  callLLM: vi.fn(),
  generateImages: vi.fn(),
}));

const {
  buildAssistantContext,
  summarizeOverflowMessages,
  MAX_CONTEXT_MESSAGES,
  MAX_SUMMARIZED_MESSAGES,
} = await import("./ai-intent");

const img = (name: string) => ({ src: `data:image/png;base64,${name}`, title: name });

/** 造一段超过窗口的对话：前面是会被压缩的旧内容，最后 N 条是窗口内的。 */
function buildLongConversation(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `第${i + 1}轮内容`,
  }));
}

describe("超出上下文窗口时压缩而不是丢弃", () => {
  it("窗口内的消息逐字保留，溢出的旧消息被压成摘要挂在最前", () => {
    const messages = buildLongConversation(MAX_CONTEXT_MESSAGES + 4);
    const context = buildAssistantContext(messages);

    // 摘要占一条，所以总数是窗口大小 + 1
    expect(context).toHaveLength(MAX_CONTEXT_MESSAGES + 1);
    expect(context[0].content).toContain("更早的内容摘要");

    // 最后一条必须是原封不动的最新消息（压缩不能动窗口内的内容）
    expect(context[context.length - 1].content).toBe(
      `第${MAX_CONTEXT_MESSAGES + 4}轮内容`
    );
  });

  it("被挤出窗口的旧内容仍然出现在摘要里 —— 这是压缩与截断的唯一分水岭", () => {
    const messages = buildLongConversation(MAX_CONTEXT_MESSAGES + 3);
    const context = buildAssistantContext(messages);
    const summary = context[0].content;

    // 第 1~3 轮已被挤出窗口，但必须还能在摘要里找到
    expect(summary).toContain("第1轮内容");
    expect(summary).toContain("第2轮内容");
    expect(summary).toContain("第3轮内容");
  });

  it("没有超限时不插摘要，避免平白多一条噪声消息", () => {
    const messages = buildLongConversation(3);
    const context = buildAssistantContext(messages);

    expect(context).toHaveLength(3);
    expect(context[0].content).toBe("第1轮内容");
    expect(context.some(m => m.content.includes("摘要"))).toBe(false);
  });

  it("刚好等于窗口上限时也不插摘要（边界不能差一条）", () => {
    const context = buildAssistantContext(
      buildLongConversation(MAX_CONTEXT_MESSAGES)
    );
    expect(context).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(context[0].content).toBe("第1轮内容");
  });

  it("摘要以 user 角色插入，避免上游把它当成模型自己说过的话", () => {
    const context = buildAssistantContext(
      buildLongConversation(MAX_CONTEXT_MESSAGES + 2)
    );
    expect(context[0].role).toBe("user");
  });
});

describe("摘要保留追改所需的锚点", () => {
  it("保留生图用的完整提示词 —— 后续「再暗一点」要在这一版上改", () => {
    const summary = summarizeOverflowMessages([
      {
        role: "assistant",
        content: "已生成图片",
        contextImagePrompt: "An orange tabby cat wearing a straw hat",
        contextImages: [img("cat")],
      },
    ]);

    expect(summary).toContain("An orange tabby cat wearing a straw hat");
  });

  it("保留每轮的出图张数 —— 用户说「回到第二版」时要对得上号", () => {
    const summary = summarizeOverflowMessages([
      {
        role: "assistant",
        content: "已生成图片",
        contextImages: [img("a"), img("b"), img("c")],
      },
    ]);

    expect(summary).toContain("出图 3 张");
  });

  it("绝不把 base64 图塞进摘要文本，否则请求体会被瞬间撑爆", () => {
    const summary = summarizeOverflowMessages([
      {
        role: "assistant",
        content: "已生成图片",
        contextImages: [img("verylongbase64payload")],
      },
    ]);

    expect(summary).not.toContain("data:image/png;base64");
  });

  it("保留发言角色，否则分不清哪句是用户提的要求", () => {
    const summary = summarizeOverflowMessages([
      { role: "user", content: "画一只橘猫" },
      { role: "assistant", content: "已生成图片" },
    ]);

    expect(summary).toContain("我：画一只橘猫");
    expect(summary).toContain("你：已生成图片");
  });

  it("单条超长内容被截断，防止一条长文把摘要本身撑爆", () => {
    const long = "字".repeat(500);
    const summary = summarizeOverflowMessages([{ role: "user", content: long }]);

    expect(summary).toContain("…");
    expect(summary.length).toBeLessThan(200);
  });

  it("空输入返回空串，调用方据此决定不插摘要", () => {
    expect(summarizeOverflowMessages([])).toBe("");
  });
});

describe("压缩本身也有上界", () => {
  /**
   * 📌 「压缩」如果没有上界，它只是把溢出推迟发生，不是解决溢出。
   * 聊到几百轮时，摘要自己会长成新的上下文炸弹。
   */
  it("被压缩的旧消息超过上限时，只摘要最近的一段并说明略去了多少条", () => {
    const overflow = Array.from(
      { length: MAX_SUMMARIZED_MESSAGES + 15 },
      (_, i) => ({ role: "user" as const, content: `旧${i + 1}` })
    );
    const summary = summarizeOverflowMessages(overflow);

    expect(summary).toContain("另有更早的 15 条已略去");
    // 最老的那条已不在摘要里，但最近的那条必须在
    expect(summary).not.toContain("旧1：");
    expect(summary).toContain(`旧${MAX_SUMMARIZED_MESSAGES + 15}`);
  });

  it("摘要行数不随对话无限增长", () => {
    const overflow = Array.from({ length: 500 }, (_, i) => ({
      role: "user" as const,
      content: `旧${i + 1}`,
    }));
    const lines = summarizeOverflowMessages(overflow).split("\n");

    // 表头 1 行 + 最多 MAX_SUMMARIZED_MESSAGES 行
    expect(lines.length).toBe(MAX_SUMMARIZED_MESSAGES + 1);
  });
});

describe("每个对话的记忆彼此独立", () => {
  /**
   * 用户要求「每个对话之间的记忆不会彼此影响，完全独立」。
   * buildAssistantContext 是纯函数、只吃传入的数组，
   * 隔离由调用方按 projectId 分桶的 storage key 保证（InfiniteCanvas.tsx）。
   * 这里守住纯函数这一侧：不得读任何模块级共享状态。
   */
  it("两次独立调用互不污染", () => {
    const a = buildAssistantContext(buildLongConversation(MAX_CONTEXT_MESSAGES + 2));
    const b = buildAssistantContext([{ role: "user", content: "全新对话" }]);

    expect(b).toHaveLength(1);
    expect(b[0].content).toBe("全新对话");
    // A 的摘要不能泄漏到 B
    expect(JSON.stringify(b)).not.toContain("摘要");
    // 再算一次 A，结果必须与第一次完全一致（无累积状态）
    const aAgain = buildAssistantContext(
      buildLongConversation(MAX_CONTEXT_MESSAGES + 2)
    );
    expect(aAgain).toEqual(a);
  });

  it("不修改传入的原始消息数组", () => {
    const messages = buildLongConversation(MAX_CONTEXT_MESSAGES + 5);
    const snapshot = JSON.parse(JSON.stringify(messages));

    buildAssistantContext(messages);

    expect(messages).toEqual(snapshot);
  });
});
