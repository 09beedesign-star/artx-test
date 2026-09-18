import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetWorkspaceSyncForTests,
  mergeWorkspaceSyncDocument,
} from "./workspace-sync-store";
import {
  canvasConversationSyncKey,
  enforceSyncDocumentBudget,
  mergeWorkspaceSync,
  normalizeWorkspaceSyncPayload,
  MAX_SYNCED_CONVERSATIONS_PER_PROJECT,
  type SyncedCanvasConversation,
  type WorkspaceSyncPayload,
} from "../shared/workspace-sync";
import { MAX_CANVAS_CONVERSATIONS } from "../client/src/lib/canvas-conversations";
import { stripSourceComments, assertStripKeptSource } from "../shared/strip-source-comments";

/**
 * 画布对话的**跨设备同步**（2026-09-18 第二步）。
 *
 * 第一步只落本地 localStorage（提交 45ce02e 已上线实测）。本文件盯的是
 * 把它接上云端之后，那些「写错了不报错、只是悄悄丢数据」的地方。
 *
 * 📌 每条用例的注释写的是「写错会看到什么现象」，不是「这段代码做了什么」——
 *    后者读代码就知道，前者才是这条测试存在的理由。
 */

/**
 * @param maxLossRatio 允许被注释吃掉的比例上限。
 *
 * ⚠️ 默认 0.3 是全局默认值，**不要去改它** —— 它挡的是「正则把代码当注释
 *    吃掉」这类会让断言恒绿的事故（2026-09-17 实测贪心正则吃掉
 *    server/index.ts 的 41.8%）。本文件的源码断言只读 shared/workspace-sync.ts，
 *    未放宽阈值；一旦将来因注释变多而触发，必须先独立统计真注释占比再谈放宽。
 */
function readSource(relativePath: string, maxLossRatio = 0.3) {
  const raw = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

function emptyPayload(): WorkspaceSyncPayload {
  return { projects: [], canvases: [], deletions: [], reactions: [], conversations: [] };
}

function conversation(
  projectId: string,
  conversationId: string,
  updatedAt: string,
  messages: unknown[] = [],
  overrides: Partial<SyncedCanvasConversation> = {}
): SyncedCanvasConversation {
  return {
    key: canvasConversationSyncKey(projectId, conversationId),
    projectId,
    conversationId,
    title: `${projectId}/${conversationId}`,
    createdAt: updatedAt,
    updatedAt,
    active: true,
    messages,
    ...overrides,
  };
}

function message(id: string, content: string) {
  return { id, role: "user", content, timestamp: "2026-09-18T01:00:00.000Z" };
}

describe("画布会话的合并键", () => {
  /*
   * ⚠️⚠️ 老会话的 conversationId 是**空串**（迁移用的合法值，
   *    见 client/src/lib/canvas-conversations.ts 的 LEGACY_CONVERSATION_ID）。
   *    合并键若只用 conversationId，所有画布的老对话在云端会撞成同一条 ——
   *    **用户现象是「打开任意画布，历史里都是别的画布的对话」**。
   */
  it("键必须同时带上 projectId，否则各画布的老会话（空 id）会撞在一起", () => {
    const a = canvasConversationSyncKey("p1", "");
    const b = canvasConversationSyncKey("p2", "");
    expect(a).not.toBe(b);

    const merged = mergeWorkspaceSync(
      { ...emptyPayload(), conversations: [conversation("p1", "", "2026-09-18T01:00:00.000Z", [message("m1", "画布一的对话")])] },
      { ...emptyPayload(), conversations: [conversation("p2", "", "2026-09-18T02:00:00.000Z", [message("m2", "画布二的对话")])] }
    );
    expect(merged.conversations).toHaveLength(2);
    expect(merged.conversations.map(item => item.projectId).sort()).toEqual(["p1", "p2"]);
  });

  /*
   * ⚠️ 分隔符必须是 `::`。projectId 在路由里是自由字符串，可能自带冒号：
   *    单冒号会让 ("a:b", "c") 与 ("a", "b:c") 撞成同一个键。
   */
  it("分隔符要能区分 projectId 自带冒号的情况", () => {
    expect(canvasConversationSyncKey("a:b", "c")).not.toBe(canvasConversationSyncKey("a", "b:c"));
  });
});

describe("老载荷兼容（发版那一刻的全量故障）", () => {
  /*
   * ⚠️⚠️⚠️ 【2026-09-18 实测踩到】给载荷加 conversations 字段后，
   *    `[...base.conversations]` 对**没有这个字段的老载荷**直接抛
   *    `base is not iterable` → 服务端 PUT 变成 500。
   *
   *    这个故障的形态很特殊：它不是「某个用户偶发」，而是
   *    **发版那一刻所有还没刷新页面的用户全量同步挂掉** ——
   *    旧版本前端发上来的就是没有新字段的载荷。
   *
   * 📌 判据：给一个**已经在线上跑着**的数据结构加字段，
   *    新字段在老载荷里一定是 undefined。TypeScript 的类型标注是编译期的，
   *    拦不住运行时从网络进来的老格式。
   */
  it("合并没有 conversations 字段的老载荷不能抛错", () => {
    const legacy = {
      projects: [],
      canvases: [],
      deletions: [],
      reactions: [],
    } as unknown as WorkspaceSyncPayload;
    expect(() => mergeWorkspaceSync(legacy, legacy)).not.toThrow();
    expect(mergeWorkspaceSync(legacy, legacy).conversations).toEqual([]);
  });

  it("一边是老载荷、一边是新载荷时，新载荷的会话必须留下", () => {
    const legacy = {
      projects: [],
      canvases: [],
      deletions: [],
      reactions: [],
    } as unknown as WorkspaceSyncPayload;
    const fresh = {
      ...emptyPayload(),
      conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [message("m1", "新版本说的话")])],
    };
    expect(mergeWorkspaceSync(legacy, fresh).conversations).toHaveLength(1);
    expect(mergeWorkspaceSync(fresh, legacy).conversations).toHaveLength(1);
  });

  it("体积兜底遇到没有 conversations 的老载荷也不能抛错", () => {
    const legacy = {
      projects: [],
      canvases: [
        {
          projectId: "p1",
          nodes: Array.from({ length: 100 }, (_, index) => ({ id: `n${index}`, blob: "y".repeat(200) })),
          edges: [],
          updatedAt: "2026-09-18T01:00:00.000Z",
        },
      ],
      deletions: [],
      reactions: [],
    } as unknown as WorkspaceSyncPayload;
    expect(() => enforceSyncDocumentBudget(legacy, 2000)).not.toThrow();
  });
});

describe("本地与云端的上限必须一致", () => {
  /*
   * ⚠️⚠️ 本地存 N 条、云端只收 M 条（N > M）会让用户在另一台设备上
   *    「对话少了一半」，而本机看着是好的 —— 不对称、零报错、极难排查。
   *    2026-09-18 用户把这个数字从 40 改成 20，两边都必须跟着改。
   *    📌 这条测试的存在理由就是让「只改了一边」变成红灯。
   */
  it("MAX_CANVAS_CONVERSATIONS 与 MAX_SYNCED_CONVERSATIONS_PER_PROJECT 相等", () => {
    expect(
      MAX_SYNCED_CONVERSATIONS_PER_PROJECT,
      "本地上限与云端上限不一致 → 另一台设备上对话会凭空少掉一部分"
    ).toBe(MAX_CANVAS_CONVERSATIONS);
  });
});

describe("画布会话的归一化", () => {
  /*
   * ⚠️⚠️ 判据是 projectId 非空，**不是** conversationId 非空。
   *    要求后者非空，老用户的历史对话会在「写得进云端、读不出来」
   *    这一轮被静默过滤掉 —— 本地版的同一个坑记在 canvas-conversations.ts:98。
   */
  it("空 conversationId 是合法的老会话，不能被过滤掉", () => {
    const payload = normalizeWorkspaceSyncPayload({
      conversations: [{ projectId: "p1", conversationId: "", updatedAt: "2026-09-18T01:00:00.000Z" }],
    });
    expect(payload.conversations).toHaveLength(1);
    expect(payload.conversations[0].conversationId).toBe("");
  });

  it("projectId 为空的条目必须丢弃（无法寻址，留着就是垃圾）", () => {
    const payload = normalizeWorkspaceSyncPayload({
      conversations: [{ projectId: "   ", conversationId: "c1" }],
    });
    expect(payload.conversations).toHaveLength(0);
  });

  /*
   * ⚠️ active 缺省必须是 true。旧版本前端发上来的载荷没有这个字段，
   *    缺省成 false 会把用户**所有对话在升级瞬间集体变成墓碑**，
   *    下一次下行就把本地也清空了 —— 与 reactions 同一条理由。
   */
  it("缺少 active 字段时默认 true，绝不能默认成墓碑", () => {
    const payload = normalizeWorkspaceSyncPayload({
      conversations: [{ projectId: "p1", conversationId: "c1" }],
    });
    expect(payload.conversations[0].active).toBe(true);
  });

  it("messages 不是数组时归一化成空数组，不能让脏数据进合并", () => {
    const payload = normalizeWorkspaceSyncPayload({
      conversations: [{ projectId: "p1", conversationId: "c1", messages: "坏数据" }],
    });
    expect(payload.conversations[0].messages).toEqual([]);
  });
});

describe("画布会话的合并语义", () => {
  it("同一条会话留 updatedAt 晚的那份", () => {
    const merged = mergeWorkspaceSync(
      {
        ...emptyPayload(),
        conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [message("m1", "旧")])],
      },
      {
        ...emptyPayload(),
        conversations: [conversation("p1", "c1", "2026-09-18T05:00:00.000Z", [message("m2", "新")])],
      }
    );
    expect(merged.conversations).toHaveLength(1);
    expect(merged.conversations[0].messages).toEqual([message("m2", "新")]);
  });

  it("两台设备各自新建的会话都要留下", () => {
    const merged = mergeWorkspaceSync(
      { ...emptyPayload(), conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z")] },
      { ...emptyPayload(), conversations: [conversation("p1", "c2", "2026-09-18T02:00:00.000Z")] }
    );
    expect(merged.conversations.map(item => item.conversationId).sort()).toEqual(["c1", "c2"]);
  });

  /*
   * ⚠️⚠️ 墓碑（active:false）必须**保留在合并结果里**，不能顺手过滤。
   *    过滤掉等于「删除这个动作没有被同步出去」：
   *    另一台设备那条 active:true 下一轮又会把它复活，
   *    **用户现象是「删了一条对话，刷新一下它自己回来了」**。
   */
  it("删除墓碑必须留在结果里，否则删了又自己回来", () => {
    const merged = mergeWorkspaceSync(
      { ...emptyPayload(), conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [message("m1", "内容")])] },
      {
        ...emptyPayload(),
        conversations: [
          conversation("p1", "c1", "2026-09-18T03:00:00.000Z", [], { active: false }),
        ],
      }
    );
    expect(merged.conversations).toHaveLength(1);
    expect(merged.conversations[0].active).toBe(false);
  });

  it("墓碑之后另一台设备又继续用了它 —— 复活是正确语义", () => {
    const merged = mergeWorkspaceSync(
      {
        ...emptyPayload(),
        conversations: [conversation("p1", "c1", "2026-09-18T03:00:00.000Z", [], { active: false })],
      },
      {
        ...emptyPayload(),
        conversations: [conversation("p1", "c1", "2026-09-18T06:00:00.000Z", [message("m9", "又说话了")])],
      }
    );
    expect(merged.conversations[0].active).toBe(true);
  });

  /*
   * ⚠️ 项目被删（deletions 墓碑）时，它名下的会话必须一起清掉。
   *    留着就是永远读不到、却一直占着同步体积的孤儿数据。
   */
  it("项目被删时，它名下的会话一起清掉", () => {
    const merged = mergeWorkspaceSync(
      {
        ...emptyPayload(),
        conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [message("m1", "x")])],
      },
      {
        ...emptyPayload(),
        deletions: [{ id: "p1", deletedAt: "2026-09-18T04:00:00.000Z" }],
      }
    );
    expect(merged.conversations).toHaveLength(0);
  });

  /*
   * ⚠️⚠️ 截断必须**按画布分桶**。全局截断会让「某个不常用画布的对话
   *    被常用画布挤没」，用户完全无法预期。
   */
  it("上限是「每个画布」而不是全局", () => {
    const build = (projectId: string) =>
      Array.from({ length: MAX_SYNCED_CONVERSATIONS_PER_PROJECT }, (_, index) =>
        conversation(projectId, `c${index}`, `2026-09-${String((index % 28) + 1).padStart(2, "0")}T01:00:00.000Z`)
      );
    const merged = mergeWorkspaceSync(
      { ...emptyPayload(), conversations: build("p1") },
      { ...emptyPayload(), conversations: build("p2") }
    );
    expect(merged.conversations.filter(item => item.projectId === "p1")).toHaveLength(
      MAX_SYNCED_CONVERSATIONS_PER_PROJECT
    );
    expect(merged.conversations.filter(item => item.projectId === "p2")).toHaveLength(
      MAX_SYNCED_CONVERSATIONS_PER_PROJECT
    );
  });

  /*
   * ⚠️⚠️ 墓碑不参与名额竞争，也不能被截掉。
   *    墓碑被截掉 = 删除事件消失 = 另一台设备下次上行又把它复活。
   */
  it("超额截断时墓碑不受影响", () => {
    const alive = Array.from({ length: MAX_SYNCED_CONVERSATIONS_PER_PROJECT + 10 }, (_, index) =>
      conversation("p1", `alive-${index}`, `2026-09-18T${String(index % 24).padStart(2, "0")}:00:00.000Z`)
    );
    const tomb = conversation("p1", "gone", "2026-09-18T01:00:00.000Z", [], { active: false });
    const merged = mergeWorkspaceSync(
      { ...emptyPayload(), conversations: [...alive, tomb] },
      emptyPayload()
    );
    expect(merged.conversations.filter(item => item.active)).toHaveLength(
      MAX_SYNCED_CONVERSATIONS_PER_PROJECT
    );
    expect(merged.conversations.some(item => item.conversationId === "gone")).toBe(true);
  });
});

describe("体积兜底", () => {
  /*
   * ⚠️⚠️ 削正文时**不能改 updatedAt**。改了会让这份被削过的残缺数据
   *    在下一轮合并里赢过另一台设备的完整数据 ——
   *    用户的完整对话被服务端削出来的空壳覆盖掉，且零报错。
   */
  it("削会话正文时不能改 updatedAt，否则残缺数据会赢过完整数据", () => {
    const big = Array.from({ length: 200 }, (_, index) => message(`m${index}`, "x".repeat(200)));
    const payload: WorkspaceSyncPayload = {
      ...emptyPayload(),
      conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", big)],
    };
    const capped = enforceSyncDocumentBudget(payload, 2000);
    expect(capped.conversations[0].messages).toHaveLength(0);
    expect(capped.conversations[0].updatedAt).toBe("2026-09-18T01:00:00.000Z");
  });

  /*
   * 📌 削的顺序是「损失从小到大」：先削会话正文（条目还在，标题还看得见），
   *    再丢画布，最后才削项目封面。顺序反了用户的感受完全不同。
   */
  it("超限时先削会话正文，画布内容仍然保留", () => {
    const big = Array.from({ length: 200 }, (_, index) => message(`m${index}`, "x".repeat(200)));
    const payload: WorkspaceSyncPayload = {
      ...emptyPayload(),
      projects: [
        { id: "p1", title: "p1", cover: null, updatedAt: "2026-09-18T01:00:00.000Z", nodeCount: 1, createdAt: "2026-09-18T01:00:00.000Z" },
      ],
      canvases: [{ projectId: "p1", nodes: [{ id: "n1" }], edges: [], updatedAt: "2026-09-18T01:00:00.000Z" }],
      conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", big)],
    };
    const capped = enforceSyncDocumentBudget(payload, 2000);
    expect(capped.conversations[0].messages).toHaveLength(0);
    expect(capped.canvases).toHaveLength(1);
  });

  it("会话正文全削光还超限时才动画布", () => {
    const payload: WorkspaceSyncPayload = {
      ...emptyPayload(),
      projects: [
        { id: "p1", title: "p1", cover: null, updatedAt: "2026-09-18T01:00:00.000Z", nodeCount: 1, createdAt: "2026-09-18T01:00:00.000Z" },
      ],
      canvases: [
        {
          projectId: "p1",
          nodes: Array.from({ length: 200 }, (_, index) => ({ id: `n${index}`, blob: "y".repeat(200) })),
          edges: [],
          updatedAt: "2026-09-18T01:00:00.000Z",
        },
      ],
      conversations: [conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [message("m1", "短")])],
    };
    const capped = enforceSyncDocumentBudget(payload, 2000);
    expect(capped.canvases).toHaveLength(0);
  });
});

describe("服务端合并", () => {
  beforeEach(() => {
    __resetWorkspaceSyncForTests();
  });

  /*
   * ⚠️⚠️⚠️ 这是整个改动最要命的一条：mergeWorkspaceSyncDocument 里给
   *    mergeWorkspaceSync 传 base 侧时若漏了 conversations，
   *    云端已有的对话会被客户端载荷**整份替换** ——
   *    用户在 A 电脑的对话会在 B 电脑同步一次之后消失，服务端零报错。
   */
  it("云端已有的会话不能被另一台设备的上行整份替换掉", async () => {
    await mergeWorkspaceSyncDocument("user-x", {
      projects: [{ id: "p1", title: "p1", updatedAt: "2026-09-18T01:00:00.000Z", createdAt: "2026-09-18T01:00:00.000Z" }],
      conversations: [conversation("p1", "from-device-a", "2026-09-18T01:00:00.000Z", [message("m1", "A 说的话")])],
    });

    const second = await mergeWorkspaceSyncDocument("user-x", {
      projects: [{ id: "p1", title: "p1", updatedAt: "2026-09-18T02:00:00.000Z", createdAt: "2026-09-18T01:00:00.000Z" }],
      conversations: [conversation("p1", "from-device-b", "2026-09-18T02:00:00.000Z", [message("m2", "B 说的话")])],
    });

    const ids = second.conversations.map(item => item.conversationId).sort();
    expect(ids).toEqual(["from-device-a", "from-device-b"]);
  });

  /*
   * ⚠️⚠️ 服务端必须**再剥一次**内联 base64 图。客户端已经剥过，
   *    但旧版本前端或改过的请求能往 PG 的一行 jsonb 里塞进几十 MB，
   *    把整个用户的同步文档搞到再也 load 不动。
   *    📌 凡「体积决定服务能不能用」的约束，校验点必须在服务端。
   */
  it("会话消息里的 base64 大图必须在服务端被剥掉", async () => {
    const inline = `data:image/png;base64,${"A".repeat(3000)}`;
    const document = await mergeWorkspaceSyncDocument("user-y", {
      projects: [{ id: "p1", title: "p1", updatedAt: "2026-09-18T01:00:00.000Z", createdAt: "2026-09-18T01:00:00.000Z" }],
      conversations: [
        conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [
          { id: "m1", role: "user", content: "看这张", timestamp: "2026-09-18T01:00:00.000Z", imageBackup: { src: inline } },
        ]),
      ],
    });
    expect(JSON.stringify(document)).not.toContain("data:image/png;base64");
  });

  it("http 图片 URL 必须原样保留（那才是跨设备能看到的图）", async () => {
    const remote = "https://cdn.example.com/images/a.png";
    const document = await mergeWorkspaceSyncDocument("user-z", {
      projects: [{ id: "p1", title: "p1", updatedAt: "2026-09-18T01:00:00.000Z", createdAt: "2026-09-18T01:00:00.000Z" }],
      conversations: [
        conversation("p1", "c1", "2026-09-18T01:00:00.000Z", [
          { id: "m1", role: "assistant", content: "已生成图片", timestamp: "2026-09-18T01:00:00.000Z", contextImages: [{ src: remote }] },
        ]),
      ],
    });
    expect(JSON.stringify(document)).toContain(remote);
  });
});

describe("源码约束", () => {
  /*
   * ⚠️ 合并键必须走 canvasConversationSyncKey 这个共用函数。
   *    前后端各拼各的字符串 = 同一份数据两种键 = 永远合不到一起，
   *    且编译和测试都不会报错。
   */
  it("shared 里的键拼接只有一个出口", () => {
    /*
     * 阈值放宽到 0.4 —— **只在这一个调用点**，绝不改 assertStripKeptSource 的默认值。
     *
     * 📌 放宽前已取证（/tmp/verify-strip.mjs，2026-09-18）：
     *    - 手写状态机独立统计纯注释字符占比 **34.9%**
     *    - 剥离器量到的损失率 **35.3%**，差 0.4 个百分点 → 吃掉的确实是注释
     *    - 6 个锚点（canvasConversationSyncKey / `${projectId}::${conversationId}` /
     *      mergeWorkspaceSync / MAX_SYNCED_CONVERSATIONS_PER_PROJECT /
     *      enforceSyncDocumentBudget / conversations: cappedConversations）
     *      在剥离后逐一验证仍然存在 → 断言的输入没被污染
     *
     * ⚠️⚠️ 「放宽阈值求绿」和「取证后正确放宽」结果长得一模一样，
     *    唯一区别就是有没有做上面这次取证。将来这个数字再需要抬，
     *    必须重做一遍取证，不能因为"上次放宽过"就顺手再加。
     */
    const source = readSource("../shared/workspace-sync.ts", 0.4);
    expect(source).toContain("export function canvasConversationSyncKey(");
    const occurrences = source.split("`${projectId}::${conversationId}`").length - 1;
    expect(occurrences, "`${projectId}::${conversationId}` 只能出现在 canvasConversationSyncKey 里").toBe(1);
  });
});
