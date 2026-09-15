import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 需求：在对话框粘贴的图片，跳出画布再回来必须还在。
 *
 * 用户报的现象很有辨识度：**画板还在、其他内容都在，唯独粘贴的图没了。**
 * 说明节点结构存下来了，丢的只是图片二进制。三条独立的链，缺一条都还会丢：
 *
 *   链一：hydrate 的回填条件写成了 `fullImageStoredInSession === true`。
 *        这个标记只在 **sessionStorage 写成功** 的分支里才打得上。
 *        session 一写失败（base64 大图撑爆 5MB 是常事），
 *        localStorage 里就是「没标记、也没 localSrc」的节点 ——
 *        回填条件不成立，图躺在 IndexedDB 里没人捞。
 *
 *   链二：session 写失败时，localStorage 存的是**带完整 base64 的原始状态**。
 *        可 session 写不下的原因就是图太大，localStorage 配额同样约 5MB，
 *        于是几乎必然跟着抛异常 → **整份画布状态一个字都没落盘**。
 *
 *   链三：IndexedDB 那一路是 `void persistCanvasNodeImagePayloads(...)`，不 await。
 *        「粘贴完立刻点返回工作台」时事务可能还没落盘组件就卸载了。
 *        叠加 `openCanvasImageDb` 每次重新 open（异步），卸载那刻才开始建连接，
 *        根本来不及。
 *
 * 📌 贯穿三条链的判据：
 *    **读取侧的判断依据只能是「我缺不缺数据」，不能是「当初存在哪」。**
 *    存储位置是写入侧的实现细节，让读取侧依赖它，写入侧一降级读取侧就瞎。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * 剥掉「整行都是注释」的行，只留可执行代码。
 *
 * ⚠️⚠️ 为什么必须剥：本文件里「禁止出现某术语」的反向断言
 *    （如 not.toContain("fullImageStoredInSession === true")）
 *    会**命中实现文件里我自己写的修复说明注释** —— 注释里原文引用了旧代码，
 *    于是断言红了，但代码其实是对的。09-15 实测踩过一次。
 *
 * ⚠️⚠️ 为什么只剥整行：通用块注释正则 /\/\*[\s\S]*?\*\//g 在 117 万字符的
 *    InfiniteCanvas.tsx 上会**吃掉真实代码**（09-13 实测多删 5.7 万字符、
 *    吞掉 2 个真实调用点）。同理行注释也只剥「整行以 // 开头」的，
 *    不用 /\/\/.*$/ —— 那会切断字符串里的 https:// 。
 *
 * 📌 原则：**宁可漏剥，不可误删。** 漏剥只是断言更严，误删会让断言失去意义。
 */
function stripWholeLineComments(text: string, guards: string[]) {
  const stripped = text
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  // 前置保障一：剥离必须确实生效，否则断言等于没加防护。
  expect(stripped.length, "注释剥离没有生效").toBeLessThan(text.length);

  // 前置保障二：代码锚点在剥离前后出现次数必须相等 —— 证明没误删真实代码。
  for (const guard of guards) {
    const before = text.split(guard).length - 1;
    const after = stripped.split(guard).length - 1;
    expect(after, `注释剥离误删了真实代码：${guard}`).toBe(before);
  }
  return stripped;
}

/**
 * 切出 hydrateCanvasNodeImagePayloads 里挑选「待回填节点」的那段。
 *
 * ⚠️ 起锚必须落在函数定义本身，不能用函数体中间的某个表达式 ——
 *    09-15 踩过：起锚选晚了，关键定义被切在范围之外，
 *    断言因「没覆盖到」而挂，看起来像实现错了，其实是范围划错了。
 */
function readHydrateSelectorBody() {
  const start = source.indexOf("async function hydrateCanvasNodeImagePayloads");
  expect(start, "找不到 hydrateCanvasNodeImagePayloads").toBeGreaterThan(-1);
  const end = source.indexOf("if (missingAssetNodes.length === 0)", start);
  expect(end, "找不到 missingAssetNodes 的收尾").toBeGreaterThan(start);
  return stripWholeLineComments(source.slice(start, end), [
    "const missingAssetNodes = nodes.filter",
    'typeof data.localSrc === "string" && data.localSrc',
    "isPendingImageGenerationNode(node)",
  ]);
}

function readSafeWriteBody() {
  const start = source.indexOf("function safeWriteCanvasState(");
  expect(start, "找不到 safeWriteCanvasState").toBeGreaterThan(-1);
  const end = source.indexOf("\nfunction getCanvasStateCoverSource", start);
  expect(end, "找不到 safeWriteCanvasState 的结尾").toBeGreaterThan(start);
  return stripWholeLineComments(source.slice(start, end), [
    "const strippedState = {",
    "window.localStorage.setItem(key, JSON.stringify(strippedState))",
    'toast("画布自动保存受限"',
  ]);
}

function readOpenDbBody() {
  const start = source.indexOf("function openCanvasImageDb()");
  expect(start, "找不到 openCanvasImageDb").toBeGreaterThan(-1);
  const end = source.indexOf("\nasync function persistImageGenerationTaskImages", start);
  expect(end, "找不到 openCanvasImageDb 的结尾").toBeGreaterThan(start);
  return source.slice(start, end);
}

function readFlushBody() {
  const start = source.indexOf("const flushCanvasState = ");
  expect(start, "找不到 flushCanvasState").toBeGreaterThan(-1);
  return source.slice(start, start + 1600);
}

describe("链一：回填条件只能看「缺不缺」，不能看「存哪了」", () => {
  it("不得再用 fullImageStoredInSession 作为回填的前置条件", () => {
    const body = readHydrateSelectorBody();
    // 这就是原来的 bug：把「当初存在 session」当成「现在该去 IDB 捞」的前提。
    // session 写失败时标记根本不存在，于是永远捞不到。
    expect(
      body,
      "回填条件又退回成依赖 fullImageStoredInSession，session 写失败时会丢图"
    ).not.toContain("fullImageStoredInSession === true");
  });

  it("判据必须是「当前没有可用的 localSrc」", () => {
    const body = readHydrateSelectorBody();
    expect(
      body,
      "必须按「现在缺不缺 localSrc」来挑待回填节点"
    ).toContain('typeof data.localSrc === "string" && data.localSrc');
  });

  it("正在生成中的占位节点要排除，否则每次都白捞一轮", () => {
    // 反向断言必须配正向锚点：如果把判据放宽成「所有 asset 都去捞」，
    // 生成中的占位节点会被反复查询 IDB，虽然不出错但是纯浪费。
    const body = readHydrateSelectorBody();
    expect(body, "缺少对生成中占位节点的排除").toContain(
      "isPendingImageGenerationNode(node)"
    );
  });
});

describe("链二：降级路径不能比主路径更重", () => {
  it("localStorage 一律写剥离大图的轻量版", () => {
    const body = readSafeWriteBody();
    // 关键：strippedState 的构造不能挂在 sessionSaved 的三元分支里。
    expect(body, "缺少统一的剥离版状态").toContain("const strippedState = {");
    expect(body, "localStorage 必须写剥离版").toContain(
      "window.localStorage.setItem(key, JSON.stringify(strippedState))"
    );
  });

  it("不得再按 sessionSaved 决定写完整版还是剥离版", () => {
    const body = readSafeWriteBody();
    // 原来是 `const persistedState = sessionSaved ? 剥离版 : 完整版`，
    // 那个 `: 完整版` 分支就是链二的根因 —— session 撑爆了还塞同样大的东西。
    expect(
      body,
      "又退回成「session 失败就写完整 base64」，localStorage 会跟着爆"
    ).not.toContain("const persistedState = sessionSaved");
  });

  it("轻量版都写不进去时必须告知用户，不能静默吞掉", () => {
    const body = readSafeWriteBody();
    const catchIndex = body.lastIndexOf("} catch {");
    expect(catchIndex).toBeGreaterThan(-1);
    const tail = body.slice(catchIndex);
    expect(tail, "localStorage 写失败必须弹提示").toContain(
      'toast("画布自动保存受限"'
    );
    // 原来这个 toast 被 `if (!sessionSaved)` 包着 —— session 成功过就不提示了，
    // 可 localStorage 才是跨标签页的唯一存档，它失败了用户必须知道。
    expect(tail, "提示不该再被 sessionSaved 挡住").not.toContain(
      "if (!sessionSaved) {"
    );
  });
});

describe("链三：IndexedDB 连接必须可复用，卸载时才来得及落盘", () => {
  it("连接被缓存，不是每次现开", () => {
    const body = readOpenDbBody();
    expect(body, "缺少连接缓存").toContain("if (canvasImageDbPromise) return canvasImageDbPromise");
  });

  it("连接失效时要置空，否则会一直拿到已关闭的句柄", () => {
    const body = readOpenDbBody();
    expect(body, "缺少 onclose 重置").toContain("db.onclose");
    expect(body, "缺少 onversionchange 重置").toContain("db.onversionchange");
  });

  it("事务回调里不得关闭共享连接", () => {
    // 这是「同一份数据多个出口」的典型：四个事务函数各有 oncomplete/onerror，
    // 共八处 db.close()，漏掉任何一处都会把别处正在进行的事务打断。
    // 只允许 onversionchange 里那一次合法关闭。
    const closeCalls = Array.from(source.matchAll(/^\s*db\.close\(\);/gm));
    expect(
      closeCalls.length,
      "事务回调里还残留着 db.close()，会打断共享连接"
    ).toBe(1);

    const onlyClose = closeCalls[0];
    const context = source.slice(
      Math.max(0, (onlyClose.index ?? 0) - 200),
      (onlyClose.index ?? 0) + 60
    );
    expect(
      context,
      "唯一允许的 db.close() 必须在 onversionchange 里"
    ).toContain("onversionchange");
  });

  it("卸载时必须再单独落一次图片，兜住未 await 的竞态", () => {
    const body = readFlushBody();
    expect(
      body,
      "flush 里缺少 IndexedDB 图片兜底，粘贴完立刻跳走会丢图"
    ).toContain("persistCanvasNodeImagePayloads(projectId, nodesRef.current)");
  });

  it("兜底必须用 ref 的最新值，不能用闭包旧值", () => {
    const body = readFlushBody();
    const callIndex = body.indexOf("persistCanvasNodeImagePayloads(");
    expect(callIndex).toBeGreaterThan(-1);
    const call = body.slice(callIndex, callIndex + 80);
    // 用 nodes 而不是 nodesRef.current 的话，存的是首帧旧值，
    // 刚粘贴的图根本不在里面 —— 等于没兜。
    expect(call, "兜底必须用 nodesRef.current").toContain("nodesRef.current");
  });
});

describe("行为级验证：复刻三个函数的契约，跑真实丢图场景", () => {
  const SESSION_QUOTA = 5 * 1024 * 1024;

  function makeStorage(quota = Infinity) {
    const map = new Map<string, string>();
    let used = 0;
    return {
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        const prev = map.has(k) ? (map.get(k) as string).length : 0;
        const next = used - prev + v.length;
        if (next > quota) {
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        used = next;
        map.set(k, v);
      },
      removeItem: (k: string) => {
        if (map.has(k)) used -= (map.get(k) as string).length;
        map.delete(k);
      },
    };
  }

  type TestNode = {
    id: string;
    type: string;
    data: Record<string, unknown>;
  };

  const strip = (nodes: TestNode[]) =>
    nodes.map(node => {
      if (node.type !== "asset") return node;
      const src =
        typeof node.data.localSrc === "string" ? node.data.localSrc : "";
      if (!src.startsWith("data:")) return node;
      return {
        ...node,
        data: {
          ...node.data,
          localSrc: undefined,
          fullImageStoredInSession: true,
        },
      };
    });

  // 修复后的写入：localStorage 一律剥离版
  function write(
    session: ReturnType<typeof makeStorage>,
    local: ReturnType<typeof makeStorage>,
    idb: Map<string, string>,
    projectId: string,
    nodes: TestNode[],
    { skipIdb = false } = {}
  ) {
    if (!skipIdb) {
      for (const node of nodes) {
        const src = node.data.localSrc;
        if (typeof src === "string" && src.startsWith("data:"))
          idb.set(`${projectId}:${node.id}`, src);
      }
    }
    let sessionSaved = false;
    try {
      session.setItem(`s:${projectId}`, JSON.stringify({ nodes }));
      sessionSaved = true;
    } catch {
      /* 配额不足，走轻量版 */
    }
    try {
      local.setItem(`l:${projectId}`, JSON.stringify({ nodes: strip(nodes) }));
      if (!sessionSaved) session.removeItem(`s:${projectId}`);
    } catch {
      /* 轻量版也写不下，测试里不关心 toast */
    }
  }

  // 修复后的回填：只看缺不缺
  function hydrate(
    idb: Map<string, string>,
    projectId: string,
    nodes: TestNode[]
  ) {
    return nodes.map(node => {
      if (node.type !== "asset") return node;
      const src = node.data.localSrc;
      if (typeof src === "string" && src) return node;
      const restored = idb.get(`${projectId}:${node.id}`);
      return restored
        ? { ...node, data: { ...node.data, localSrc: restored } }
        : node;
    });
  }

  const dataUrl = (size: number) =>
    `data:image/png;base64,${"A".repeat(size)}`;
  const projectId = "canvas-1757900000000-abc";

  const buildNodes = (sizes: number[]): TestNode[] => [
    { id: "frame-1", type: "canvasFrame", data: { title: "画板" } },
    ...sizes.map((size, index) => ({
      id: `clipboard-image-${index}`,
      type: "asset",
      data: { localSrc: dataUrl(size), title: `粘贴图片 ${index + 1}` },
    })),
  ];

  const countImages = (nodes: TestNode[]) =>
    nodes.filter(
      node => node.type === "asset" && typeof node.data.localSrc === "string"
    ).length;

  it("大图撑爆 sessionStorage 后，重开标签页图片仍在", () => {
    const session = makeStorage(SESSION_QUOTA);
    const local = makeStorage();
    const idb = new Map<string, string>();
    const nodes = buildNodes([4 * 1024 * 1024, 4 * 1024 * 1024]);

    write(session, local, idb, projectId, nodes);

    // 重开标签页：sessionStorage 清空，只剩 localStorage 的剥离版
    const raw = local.getItem(`l:${projectId}`) as string;
    const restored = hydrate(idb, projectId, JSON.parse(raw).nodes);

    expect(countImages(restored), "重开后图片丢失").toBe(2);
    expect(restored.length, "画板节点也要在").toBe(3);
  });

  it("session 与 local 都吃紧时，结构与图片都不丢", () => {
    const session = makeStorage(SESSION_QUOTA);
    const local = makeStorage(5 * 1024 * 1024);
    const idb = new Map<string, string>();
    const nodes = buildNodes([4 * 1024 * 1024, 4 * 1024 * 1024]);

    write(session, local, idb, projectId, nodes);

    const raw = local.getItem(`l:${projectId}`);
    expect(raw, "剥离版必须能写进 localStorage").toBeTruthy();
    const restored = hydrate(idb, projectId, JSON.parse(raw as string).nodes);
    expect(countImages(restored), "极限配额下图片丢失").toBe(2);
  });

  it("粘贴完立刻跳走：卸载兜底补发后图片仍在", () => {
    const session = makeStorage(SESSION_QUOTA);
    const local = makeStorage();
    const idb = new Map<string, string>();
    const nodes = buildNodes([300 * 1024]);

    // 模拟自动保存时 IDB 事务没来得及落盘
    write(session, local, idb, projectId, nodes, { skipIdb: true });
    expect(idb.size, "前提：IDB 此时应当是空的").toBe(0);

    // 卸载兜底再发一次
    for (const node of nodes) {
      const src = node.data.localSrc;
      if (typeof src === "string" && src.startsWith("data:"))
        idb.set(`${projectId}:${node.id}`, src);
    }

    const raw = local.getItem(`l:${projectId}`) as string;
    const restored = hydrate(idb, projectId, JSON.parse(raw).nodes);
    expect(countImages(restored), "卸载兜底没能救回图片").toBe(1);
  });

  it("变异自证：回填条件退回看 fullImageStoredInSession 就会丢图", () => {
    const session = makeStorage(SESSION_QUOTA);
    const local = makeStorage();
    const idb = new Map<string, string>();
    // 小图，session 写得下 → 但我们模拟「session 已失效」的重开场景
    const nodes = buildNodes([200 * 1024]);
    write(session, local, idb, projectId, nodes);

    // 故意把标记抹掉，模拟 session 写失败那条分支留下的节点形态
    const raw = JSON.parse(local.getItem(`l:${projectId}`) as string);
    const withoutFlag = (raw.nodes as TestNode[]).map(node => {
      const { fullImageStoredInSession: _drop, ...rest } = node.data;
      return { ...node, data: rest };
    });

    // 旧逻辑：要求 fullImageStoredInSession === true 才回填
    const oldHydrate = (nodesIn: TestNode[]) =>
      nodesIn.map(node => {
        if (
          node.type === "asset" &&
          node.data.fullImageStoredInSession === true &&
          typeof node.data.localSrc !== "string"
        ) {
          const restored = idb.get(`${projectId}:${node.id}`);
          if (restored)
            return { ...node, data: { ...node.data, localSrc: restored } };
        }
        return node;
      });

    expect(countImages(oldHydrate(withoutFlag)), "旧逻辑本就应该丢图").toBe(0);
    expect(
      countImages(hydrate(idb, projectId, withoutFlag)),
      "新逻辑必须救回来"
    ).toBe(1);
  });
});
