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
    "console.warn(",
  ]);
}

function readOpenDbBody() {
  const start = source.indexOf("function openCanvasImageDb()");
  expect(start, "找不到 openCanvasImageDb").toBeGreaterThan(-1);
  const end = source.indexOf("\nasync function persistImageGenerationTaskImages", start);
  expect(end, "找不到 openCanvasImageDb 的结尾").toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * 切出 loadExternalImageWithProxyFallback —— 外部图片进画布的**源头收口**。
 *
 * 这是链四的靶心：它有 4 个返回点，只要有一个返回的 localSrc 是 http URL，
 * 那张图的真身就永远不会落盘（存储层只收 data URL）。
 */
function readExternalLoaderBody() {
  const start = source.indexOf(
    "async function loadExternalImageWithProxyFallback"
  );
  expect(start, "找不到 loadExternalImageWithProxyFallback").toBeGreaterThan(-1);
  const end = source.indexOf("\nasync function loadReadableImageForCanvas", start);
  expect(end, "找不到 loadExternalImageWithProxyFallback 的结尾").toBeGreaterThan(
    start
  );
  return stripWholeLineComments(source.slice(start, end), [
    "inlineLoadedImage",
    "getImageProxyUrl",
  ]);
}

/** 切出 persistCanvasNodeImagePayloads —— 链五（存储层兜底固化远程图）。 */
function readPersistBody() {
  const start = source.indexOf("async function persistCanvasNodeImagePayloads");
  expect(start, "找不到 persistCanvasNodeImagePayloads").toBeGreaterThan(-1);
  const end = source.indexOf(
    "\nasync function hydrateCanvasNodeImagePayloads",
    start
  );
  expect(end, "找不到 persistCanvasNodeImagePayloads 的结尾").toBeGreaterThan(start);
  return stripWholeLineComments(source.slice(start, end), [
    "canvasImagePayloadKey",
    "imageEntries",
  ]);
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

  it("判据必须是「当前没有离线自洽的 localSrc」", () => {
    /*
     * ⚠️⚠️【2026-09-23 契约升级】原断言写死成一句源码表达式
     *   `typeof data.localSrc === "string" && data.localSrc`，
     * 即「非空即算有数据」。那个契约已被推翻：一个 http 外链也是非空字符串，
     * 但它随时会失效（AI 临时链接 / 签名 URL / CDN 清理），
     * 外链一过期就变成「该图片已过期」，而 IDB 里可能存着固化好的 data URL 没人去取。
     *
     * 📌 判据：**断言要验语义，不要写死成某句源码表达式** ——
     *    否则实现一升级就假性变红，让人误以为是回归。
     *    这里验的语义是：判断依据必须落在 localSrc 的「可离线性」上，
     *    而不是回到 fullImageStoredInSession 那类「当初存哪了」的标记。
     */
    const body = readHydrateSelectorBody();
    expect(body, "回填判据必须读 data.localSrc").toContain("data.localSrc");
    expect(
      body,
      "回填判据必须按「是不是离线自洽的 data URL」来判，而不是「字段空不空」"
    ).toMatch(/localSrc[\s\S]{0,80}startsWith\(\s*"data:"\s*\)/);
    // 反向锚：不能退回成"只要非空就算有数据"
    expect(
      body,
      "退回了「非空即算有数据」，外链过期后图会丢"
    ).not.toContain('typeof data.localSrc === "string" && data.localSrc)');
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

  /**
   * 【2026-09-20 产品拍板】存储受限**永远不许打扰用户**。
   *
   * ⚠️ 这一条曾经是反过来的（"必须弹提示，不能静默吞掉"）。改口径的理由：
   *    原护栏真正在防的是**排障时无从下手**，不是"用户有权知道"。
   *    用 console.warn 一样能留痕，而且用户零感知。
   *    📌 判据：**可诊断性和不打扰是两件事，别拿"用户知情"去换"我能排障"。**
   *
   * ⚠️ 所以这里必须同时写正反两面：
   *    只写 not.toContain(toast) → 有人把 warn 也删了就成了真静默，测试照绿；
   *    只写 toContain(console.warn) → 有人 warn 和 toast 都留着，测试照绿。
   */
  it("存储受限不得弹任何界面提示", () => {
    const body = readSafeWriteBody();
    const catchIndex = body.lastIndexOf("} catch {");
    expect(catchIndex).toBeGreaterThan(-1);
    const tail = body.slice(catchIndex);
    expect(tail, "存储受限不许再弹 toast，用户明确要求永远不出现").not.toContain(
      "toast("
    );
  });

  it("但必须留下控制台痕迹，不能真的静默吞掉", () => {
    const body = readSafeWriteBody();
    const catchIndex = body.lastIndexOf("} catch {");
    const tail = body.slice(catchIndex);
    expect(tail, "localStorage 写失败必须 console.warn 留痕").toContain(
      "console.warn("
    );
    expect(tail, "痕迹里要带得出是配额问题，否则排障还是抓瞎").toContain(
      "localStorage 配额已满"
    );
  });

  it("留痕必须去重，否则控制台会被刷满", () => {
    // safeWriteCanvasState 每次 nodes 变化都会跑，不去重的话同一句话几千条，
    // 真正的报错会被淹没 —— 那等于又回到"排障无从下手"。
    const body = readSafeWriteBody();
    const catchIndex = body.lastIndexOf("} catch {");
    const tail = body.slice(catchIndex);
    expect(tail, "缺少去重守卫").toContain("if (!canvasStorageWarningShown) {");
    expect(tail, "缺少置位，去重会失效").toContain(
      "canvasStorageWarningShown = true;"
    );
  });

  it("提示不该再被 sessionSaved 挡住", () => {
    // 原来 toast 被 `if (!sessionSaved)` 包着 —— session 成功过就不记了，
    // 可 localStorage 才是跨标签页的唯一存档，它失败了必须留痕。
    const body = readSafeWriteBody();
    const catchIndex = body.lastIndexOf("} catch {");
    const tail = body.slice(catchIndex);
    expect(tail, "留痕不该再被 sessionSaved 挡住").not.toContain(
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

/**
 * 【2026-09-23 新增】链四 / 链五：外部 URL 图片的真身必须落盘。
 *
 * 用户现象与粘贴那条链**一模一样**，但根因完全不同，所以必须单独守：
 *   「刚加载进来的图，退出工作台再进来就没了。」
 *
 * 粘贴进来的图本来就是 data URL，存储层照单全收，那条链是好的（已实测）。
 * 外部 URL 加载进来的图不一样：
 *   · loadExternalImageWithProxyFallback 有 4 个返回点，
 *     代理不可用时的兜底分支直接把 http URL 当 localSrc 返回；
 *   · persistCanvasNodeImagePayloads 只收 `startsWith("data:")` 的，
 *     于是**真身从未落盘**；
 *   · 画布上还能看见图，纯粹因为那个 URL 当时还活着。
 *     外链一过期（AI 临时链接 / 签名 URL / CDN 清理）→「该图片已过期」，全程零报错。
 *
 * 📌 判据：**「用户看得见图」≠「图被保存了」。** 验持久化只能查存储层，
 *    不能以界面上还显示着为准。
 */
describe("链四：外部图片在进画布那一刻就要转成自洽格式", () => {
  it("所有返回点都不得把裸 http URL 当作 localSrc 返回", () => {
    const body = readExternalLoaderBody();
    // 正向：两个 loadImageForCanvas 的返回都必须过 inlineLoadedImage
    const inlineCount = body.split("inlineLoadedImage(image,").length - 1;
    expect(
      inlineCount,
      "外部图加载的返回点没有全部固化成 data URL，漏掉的那条链会丢图"
    ).toBe(2);
    /*
     * 反向锚：兜底分支不能退回成直接返回裸 URL。
     *
     * ⚠️ 不能简单写 not.toMatch(/localSrc:\s*src\s*\}/) —— 会**误伤合法代码**：
     *    函数开头有个 `if (src.startsWith("data:")) return { ..., localSrc: src }`，
     *    那里的 src 本来就是 data URL，返回它完全正确。
     *    09-23 实测踩了这一下，断言红了但实现是对的。
     * ✅ 正确做法是只盯 try/catch 兜底那两行的形态：`return { image, localSrc: X };`
     *    —— 它们必须经过 inlineLoadedImage，不能直接给裸变量。
     */
    expect(body, "兜底分支退回成直接返回裸 src，真身不会落盘").not.toContain(
      "return { image, localSrc: src };"
    );
    expect(
      body,
      "兜底分支退回成直接返回裸 proxyUrl，真身不会落盘"
    ).not.toContain("return { image, localSrc: proxyUrl };");
  });

  it("固化失败必须退回原 URL，不能让整张图变成空", () => {
    // ⚠️ 跨域图没带 CORS 头时 toDataURL 会抛 SecurityError，这是**正常情况**。
    //    那时必须退回原 URL 至少还能显示，绝不能返回空串把图直接弄没。
    const body = readExternalLoaderBody();
    expect(body, "inlineLoadedImage 缺少失败兜底").toContain("fallbackSrc");
  });
});

describe("链五：存储层必须兜底固化远程 URL", () => {
  it("远程 URL 的节点要被抓取并存进 IndexedDB", () => {
    const body = readPersistBody();
    expect(
      body,
      "存储层没有兜底抓取远程图，源头一旦漏掉（如跨域污染 canvas）就永久丢图"
    ).toContain("inlineRemoteImageForStorage");
    expect(body, "缺少对远程 URL 节点的筛选").toMatch(/https\?:/);

    /*
     * ⚠️⚠️⚠️ 只写 toContain("inlineRemoteImageForStorage") 是**抓不住架空的**：
     *    把守卫改成 `if (false) { ... }`，整段兜底变成死代码、一行都不会执行，
     *    但那个函数名仍然出现在源码里，toContain 照样绿。
     *    09-23 变异自证实测漏网（P-E）。
     *
     * 📌 判据：**验"某段逻辑存在"不能只验它的名字出现过，
     *    还要验它的入口条件是活的。** 死代码里的名字和活代码里的名字长得一样。
     * ✅ 这里锁住守卫必须是"真的有远程节点才跑"，而不是恒假/恒真的常量。
     */
    expect(
      body,
      "远程图兜底的入口守卫被架空成常量，整段成了死代码"
    ).toContain("if (remoteNodes.length > 0)");
    expect(body, "兜底入口被写成恒假").not.toMatch(/if\s*\(\s*false\s*\)/);
    expect(body, "兜底入口被写成恒真（会在无远程节点时空跑）").not.toMatch(
      /if\s*\(\s*true\s*\)/
    );
  });

  it("并发触发时同一张图不得重复下载", () => {
    /*
     * persist 会被多个时机并发触发（自动保存 / pagehide / 组件卸载）。
     * ⚠️ 去重标记必须**先记 key 再发请求**，等请求回来才记的话，
     *    同一张图会被同时抓好几次 —— 不报错，只是白白吃带宽。
     */
    const body = readPersistBody();
    expect(body, "缺少远程图抓取的并发去重").toContain(
      "canvasRemoteImageInlineAttempted"
    );
    const addIdx = body.indexOf("canvasRemoteImageInlineAttempted.add");
    const fetchIdx = body.indexOf("inlineRemoteImageForStorage(");
    expect(addIdx, "找不到去重标记的写入点").toBeGreaterThan(-1);
    expect(
      addIdx,
      "去重标记必须先于抓取写入，否则并发下同一张图会被重复下载"
    ).toBeLessThan(fetchIdx);
  });
});
