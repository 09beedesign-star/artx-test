import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HANDOFF_IMAGE_TOKEN_PREFIX,
  HOME_HANDOFF_MAX_CHARS,
  HOME_PROMPT_HANDOFF_KEY,
  HOME_REFERENCE_MAX_COUNT,
  HOME_REFERENCE_SINGLE_BUDGET_BYTES,
  HOME_REFERENCE_TOTAL_BUDGET_BYTES,
  estimateDataUrlBytes,
  fitReferencesToBudget,
  parseHomePromptHandoff,
  clearHomePromptHandoff,
  peekHomePromptHandoff,
  readHandoffReferences,
  writeHomePromptHandoff,
  type HomePromptReference,
} from "./home-prompt-handoff";

/**
 * 首页 → 画布交接载荷的防护测试。
 *
 * 【这组测试真正要守住的事故】
 * 首页参考图走的是 sessionStorage（配额约 5MB），而图是 base64 dataURL ——
 * 体积比原图还大约 33%。画布侧单张上限是 10MB，如果照搬过来，
 * 用户传一张 6MB 的图就会让 setItem 抛 QuotaExceededError，
 * 结果是**整份载荷写入失败，连提示词都丢了**：点发送 → 跳进画布 → 空空如也 → 零报错。
 *
 * 所以这里锁两件事：预算闸门必须真的拦得住，写入失败必须降级保住提示词。
 */

function makeDataUrl(bytes: number) {
  // base64 每 4 个字符还原 3 字节，这里按 4 的倍数构造避免 padding 影响。
  const base64Length = Math.ceil((bytes * 4) / 3 / 4) * 4;
  return `data:image/png;base64,${"A".repeat(base64Length)}`;
}

function makeReference(id: string, bytes: number): HomePromptReference {
  return { id, title: id, src: makeDataUrl(bytes) };
}

describe("参考图预算闸门", () => {
  it("估算字节数与真实体积同量级（闸门的前提）", () => {
    // 如果 estimateDataUrlBytes 估错一个数量级，下面所有闸门都形同虚设。
    // 这里正向锚住换算关系，而不是只测它「返回了个数字」。
    const oneMb = makeDataUrl(1024 * 1024);
    const estimated = estimateDataUrlBytes(oneMb);
    expect(estimated).toBeGreaterThan(1024 * 1024 * 0.95);
    expect(estimated).toBeLessThan(1024 * 1024 * 1.05);

    // padding 要被扣掉，否则每张图都会被高估。
    expect(estimateDataUrlBytes("data:image/png;base64,QQ==")).toBe(1);
    expect(estimateDataUrlBytes("data:image/png;base64,QUE=")).toBe(2);
  });

  it("单张超限的图片被丢弃，且丢弃数量必须被报出来", () => {
    const tooBig = makeReference("big", HOME_REFERENCE_SINGLE_BUDGET_BYTES + 200 * 1024);
    const ok = makeReference("ok", 100 * 1024);

    const { accepted, droppedCount } = fitReferencesToBudget([tooBig, ok]);

    expect(accepted.map(reference => reference.id)).toEqual(["ok"]);
    // ⚠️ droppedCount 不是装饰字段：调用方靠它弹 toast。
    // 静默丢图会让用户以为参考图已经带过去了，到画布才发现没有。
    expect(droppedCount).toBe(1);
  });

  it("总预算卡得住：多张合法单图叠加超限时后面的被丢", () => {
    // 刻意不用正好 1MB：makeDataUrl 会把 base64 长度向上取整到 4 的倍数，
    // 3 张 1MB 会比 3MB 预算多出几个字节，测试就变成在验构造精度而不是验闸门。
    // 900KB × 3 = 2.64MB（过），× 4 = 3.52MB（超），边界留足。
    const chunk = 900 * 1024;
    const references = [
      makeReference("a", chunk),
      makeReference("b", chunk),
      makeReference("c", chunk),
      makeReference("d", chunk),
    ];

    const { accepted, droppedCount } = fitReferencesToBudget(references);

    // 每张 1MB 都在单张上限（2MB）之内，单张闸门一张都拦不住 ——
    // 必须靠总预算（3MB）拦住第 4 张。少了总预算这条，
    // 4MB 的载荷会直接把 sessionStorage 顶爆。
    expect(accepted.length).toBe(3);
    expect(droppedCount).toBe(1);

    const totalBytes = accepted.reduce(
      (sum, reference) => sum + estimateDataUrlBytes(reference.src),
      0
    );
    expect(totalBytes).toBeLessThanOrEqual(HOME_REFERENCE_TOTAL_BUDGET_BYTES);
  });

  it("数量上限独立生效：一堆小图也不能无限加", () => {
    // 体积全都极小，总预算这条闸门完全不会触发，
    // 只有数量闸门能拦住 —— 这条用例专门证明它不是摆设。
    const tiny = Array.from({ length: HOME_REFERENCE_MAX_COUNT + 3 }, (_, index) =>
      makeReference(`tiny-${index}`, 1024)
    );

    const { accepted, droppedCount } = fitReferencesToBudget(tiny);

    expect(accepted.length).toBe(HOME_REFERENCE_MAX_COUNT);
    expect(droppedCount).toBe(3);
  });

  it("预算配置本身必须比 sessionStorage 配额保守", () => {
    /**
     * 这条是「配置漂移」的锁。
     * 如果哪天有人觉得 3MB 太小、改成 8MB，上面所有行为断言依然会通过
     *（它们只验相对关系），但线上会直接回到 QuotaExceededError。
     * 所以必须对绝对值本身设上界。
     */
    expect(HOME_REFERENCE_TOTAL_BUDGET_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(HOME_REFERENCE_SINGLE_BUDGET_BYTES).toBeLessThanOrEqual(
      HOME_REFERENCE_TOTAL_BUDGET_BYTES
    );
  });
});

describe("交接载荷读写", () => {
  const storage = new Map<string, string>();
  /**
   * 模拟浏览器的写入拒绝。
   *  - `none`：正常；
   *  - `reject-inline`：只拒「带内联 dataURL」的载荷 —— 模拟配额只剩几百字节，
   *    外置成 token 的小载荷能过。这一档专门用来证明「第二次尝试」不是摆设；
   *  - `reject-all`：全部拒绝 —— 模拟隐私模式 / 配额被同源其它 key 吃满。
   */
  let quotaMode: "none" | "reject-inline" | "reject-all" = "none";

  beforeEach(() => {
    storage.clear();
    quotaMode = "none";
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (quotaMode === "reject-all") throw new Error("QuotaExceededError");
          if (quotaMode === "reject-inline" && value.includes("data:image")) {
            throw new Error("QuotaExceededError");
          }
          storage.set(key, value);
        },
        removeItem: (key: string) => storage.delete(key),
      },
    });
    // memoryHandoff 是模块级单例，不清会串到下一个用例。
    clearHomePromptHandoff();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("正常写入时参考图原样带上", () => {
    const result = writeHomePromptHandoff({
      projectId: "p1",
      prompt: "画只猫",
      model: "auto",
      shouldAutoRun: true,
      references: [makeReference("r1", 1024)],
    });

    expect(result.ok).toBe(true);
    expect(result.droppedReferences).toBe(false);
    expect(result.memoryOnly).toBeFalsy();

    const parsed = parseHomePromptHandoff(storage.get(HOME_PROMPT_HANDOFF_KEY) ?? null);
    expect(parsed?.prompt).toBe("画只猫");
    expect(readHandoffReferences(parsed).length).toBe(1);
  });

  /*
   * ────────────────────────────────────────────────────────────────
   * 2026-11-10 三次事故：「导入未完成，浏览器存储不可用，请清理站点数据后重试」
   *
   * 前两次修的是「单位算错」，这一次是**把 sessionStorage 当成了唯一通路**。
   * 一键同款的图约几百 KB，低于字符水位 → 走内联写入；用户的站点数据一旦
   * 把配额吃满，这一写就抛，于是降级丢图、再抛就报「存储不可用」。
   *
   * 可交接本来就是同一标签页内的一次性软跳转 —— 内存通道（`externalImageStore`
   * 就在同一进程里）完全够用。把**可选的持久化层**设成功能成立的必要条件，
   * 等于给功能装了个随机断路器，还让用户去「清理站点数据」背锅。
   * ────────────────────────────────────────────────────────────────
   */
  it("⚠️ sessionStorage 全写不进时走内存槽：图和字都必须在，且不能判失败", () => {
    quotaMode = "reject-all";
    const reference = makeReference("r1", 1024);

    const result = writeHomePromptHandoff({
      projectId: "p1",
      prompt: "画只猫",
      model: "vod-gem",
      shouldAutoRun: true,
      references: [reference],
    });

    // 关键：ok 必须是 true —— 否则调用方会弹「导入失败」。
    expect(result.ok).toBe(true);
    expect(result.memoryOnly).toBe(true);
    // 图一张都不能丢。旧实现这里 droppedReferences 是 true。
    expect(result.droppedReferences).toBe(false);
    expect(storage.has(HOME_PROMPT_HANDOFF_KEY)).toBe(false);

    const payload = peekHomePromptHandoff();
    expect(payload?.prompt).toBe("画只猫");
    expect(payload?.model).toBe("vod-gem");
    expect(readHandoffReferences(payload)[0]?.src).toBe(reference.src);
  });

  it("配额只剩几百字节时，第二次尝试会强制外置图片，而不是直接判失败", () => {
    quotaMode = "reject-inline";
    const reference = makeReference("r1", 300 * 1024);

    const result = writeHomePromptHandoff({
      projectId: "p1",
      prompt: "画只猫",
      references: [reference],
    });

    expect(result.ok).toBe(true);
    /*
     * ⚠️ 这条是「第二次尝试真的被用上」的判据。
     * 少了它，实现退化成「一失败就直接投内存槽」也能全绿 ——
     * 那就白丢掉了「载荷能跨刷新存活」这个能力。
     */
    expect(result.memoryOnly).toBeFalsy();

    const raw = storage.get(HOME_PROMPT_HANDOFF_KEY) ?? "";
    expect(raw).not.toContain("data:image");
    expect(raw.length).toBeLessThan(2000);
    expect(readHandoffReferences(parseHomePromptHandoff(raw))[0]?.src).toBe(reference.src);
  });

  it("sessionStorage 里残留别的项目的载荷时，不能挡住内存槽里那一份", () => {
    /*
     * 真实形态：上一次的载荷没被消费干净（画布还没挂载用户就跳走了），
     * 它躺在会话存储里；这一次存储已满，图只能进内存槽。
     *
     * 如果读取只看 sessionStorage、或者拿到了再让调用方判断，
     * 内存那份就永远读不到 —— 图进不来，而且**连 toast 都没有**
     * （调用方以为「这次没有载荷」）。
     */
    writeHomePromptHandoff({ projectId: "other", prompt: "旧的" });
    expect(storage.has(HOME_PROMPT_HANDOFF_KEY)).toBe(true);

    quotaMode = "reject-all";
    const reference = makeReference("r1", 1024);
    writeHomePromptHandoff({
      projectId: "p1",
      prompt: "画只猫",
      references: [reference],
    });

    // 不带目标 id 时拿到的是会话存储里那份 —— 这是「谁先写谁占槽」的既有语义。
    expect(peekHomePromptHandoff()?.projectId).toBe("other");
    // 带上目标 id 必须穿过遮挡，拿到内存里那份。
    const payload = peekHomePromptHandoff("p1");
    expect(payload?.projectId).toBe("p1");
    expect(readHandoffReferences(payload)[0]?.src).toBe(reference.src);
  });

  it("消费后两条通道一起清，不会二次导入", () => {
    quotaMode = "reject-all";
    writeHomePromptHandoff({
      projectId: "p1",
      prompt: "x",
      references: [makeReference("r1", 1024)],
    });
    expect(peekHomePromptHandoff()).not.toBeNull();

    clearHomePromptHandoff();

    expect(peekHomePromptHandoff()).toBeNull();
    expect(storage.has(HOME_PROMPT_HANDOFF_KEY)).toBe(false);
  });

  it("内存载荷会过期，不会在几分钟后突然把上次的图带进来", () => {
    quotaMode = "reject-all";
    writeHomePromptHandoff({ projectId: "p1", prompt: "x" });
    expect(peekHomePromptHandoff()?.prompt).toBe("x");

    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;
    try {
      expect(peekHomePromptHandoff()).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("存储 key 必须收口成常量，不得在调用方写裸字符串", () => {
    expect(HOME_PROMPT_HANDOFF_KEY).toBe("artx:pending-home-prompt");
  });

  /*
   * ────────────────────────────────────────────────────────────────
   * 2026-11-10 二次事故：「图片体积超出浏览器限制，请手动添加」
   *
   * 点「一键同款」被这条提示拦住。根因不是图太大，而是**闸门算错了单位**：
   * 上面那两条字节预算按「dataURL 解码后的字节」算，而 sessionStorage
   * 的配额按 UTF-16 字符数计（每字符 2 字节），dataURL 还带 base64 的 4/3 膨胀。
   * 两者差 8/3 倍 —— 一张 1.2MB 的图（远低于 2MB 单张上限）真写进去要占 3.2MB，
   * 一张 1.9MB 的图要占 5.07MB，**比 5MB 配额本身还大**。
   * 也就是说旧闸门放行的每一张「接近上限」的图，setItem 都必然抛。
   * ────────────────────────────────────────────────────────────────
   */
  it("⚠️ 超过字符水位的图被挪进内存通道，而不是判「写不进去」把用户拦住", () => {
    // 1.2MB 解码字节：旧逻辑判 1.2MB < 2MB 单张上限 → 放行 → 真写时炸。
    const big = makeReference("big", 1.2 * 1024 * 1024);
    const result = writeHomePromptHandoff({
      projectId: "p1",
      prompt: "画只猫",
      model: "auto",
      references: [big],
    });

    expect(result.ok).toBe(true);
    // 关键：不是「降级丢图」，图必须还在。
    expect(result.droppedReferences).toBe(false);

    const raw = storage.get(HOME_PROMPT_HANDOFF_KEY) ?? "";
    // 载荷本身要小到安稳落进配额，而不是「刚刚好塞进去」。
    expect(raw.length).toBeLessThan(HOME_HANDOFF_MAX_CHARS);

    const parsed = parseHomePromptHandoff(raw);
    // 提示词一个字节都不能少 —— 它才是用户的真实意图。
    expect(parsed?.prompt).toBe("画只猫");
    expect(parsed?.references?.[0]?.src?.startsWith(HANDOFF_IMAGE_TOKEN_PREFIX)).toBe(true);

    /*
     * ⚠️ 最关键的一步：读回来必须还原成**完整原图**。
     * 写入方外置了、读取方没还原，就是「写得进去、读出来零张图」——
     * 比直接报错更难查：连 toast 都不会有。
     */
    const resolved = readHandoffReferences(parsed);
    expect(resolved.length).toBe(1);
    expect(resolved[0].src).toBe(big.src);
  });

  it("同一份载荷被重复写入时不丢图（先清后救 = 静默丢图）", () => {
    /*
     * 外置图存在模块级 Map 里，写入前要清掉上一批（否则纯内存泄漏）。
     * 但如果「先 clear 再处理」——而这次 payload 的 src 已经是 token，
     * 处理时无脑跳过 —— 上一次刚存进去的图就被清没了，
     * 结果是「写入 ok、读出来零张图」，连 toast 都没有。
     * 📌 凡是「清理 + 复用」写在一起的代码，都要问一句：清掉的东西这一次还要不要。
     */
    const big = makeReference("big", 1.2 * 1024 * 1024);
    writeHomePromptHandoff({ projectId: "p1", prompt: "x", references: [big] });

    const first = parseHomePromptHandoff(storage.get(HOME_PROMPT_HANDOFF_KEY) ?? null);
    expect(readHandoffReferences(first)[0]?.src).toBe(big.src);

    // 第二次拿着「已经是 token」的载荷再写一遍。
    writeHomePromptHandoff(first as never);

    const second = parseHomePromptHandoff(storage.get(HOME_PROMPT_HANDOFF_KEY) ?? null);
    expect(readHandoffReferences(second)[0]?.src).toBe(big.src);
  });

  it("小图仍然内联，不无谓地占用内存通道", () => {
    // 外置是有代价的（硬刷新就丢），能内联就别外置。
    const small = makeReference("small", 64 * 1024);
    writeHomePromptHandoff({ projectId: "p1", prompt: "x", references: [small] });

    const parsed = parseHomePromptHandoff(storage.get(HOME_PROMPT_HANDOFF_KEY) ?? null);
    expect(parsed?.references?.[0]?.src).toBe(small.src);
    expect(readHandoffReferences(parsed)[0]?.src).toBe(small.src);
  });

  it("内存通道里取不到的 token 必须被跳过，不能当 URL 交给画布", () => {
    /*
     * 硬刷新 / 换标签页后内存 Map 就没了。此时若把 `artx-handoff:xxx`
     * 原样交出去，画布会把它当相对地址发一次请求，
     * 报出来的错和真正原因（图在跳转中丢了）毫无关系。
     */
    const parsed = parseHomePromptHandoff(
      JSON.stringify({
        prompt: "x",
        references: [
          { id: "gone", title: "gone", src: `${HANDOFF_IMAGE_TOKEN_PREFIX}不存在的id` },
        ],
      })
    );
    expect(readHandoffReferences(parsed)).toEqual([]);
  });

  it("字符水位本身必须真的装得进 UTF-16 配额（否则闸门自己就是那个会炸的值）", () => {
    // 5MB ÷ 2 字节/字符 = 2.6M 字符是理论天花板，必须留足余量给同源其它 key。
    expect(HOME_HANDOFF_MAX_CHARS).toBeLessThan(2 * 1024 * 1024);
    // 反向锚点：也不能小到把正常参考图（几百 KB）也赶去内存通道。
    expect(HOME_HANDOFF_MAX_CHARS).toBeGreaterThan(200_000);
  });
});

describe("载荷解析的防御", () => {
  it("坏 JSON 返回 null 而不是抛错", () => {
    // payload 来自 sessionStorage，可能被手动改过、也可能是旧版本写的。
    // 这里一旦抛错，画布的整个 effect 会挂掉。
    expect(parseHomePromptHandoff("{不是 json")).toBeNull();
    expect(parseHomePromptHandoff(null)).toBeNull();
    expect(parseHomePromptHandoff("\"字符串不是对象\"")).toBeNull();
  });

  it("非法参考图条目被过滤掉，不会流进渲染层", () => {
    const parsed = parseHomePromptHandoff(
      JSON.stringify({
        prompt: "x",
        references: [
          { id: "ok", title: "ok", src: "data:image/png;base64,QQ==" },
          { id: "缺 src", title: "bad" },
          { id: "空 src", title: "bad", src: "   " },
          null,
          "不是对象",
        ],
      })
    );

    const references = readHandoffReferences(parsed);
    expect(references.map(reference => reference.id)).toEqual(["ok"]);
  });

  it("references 不是数组时返回空数组", () => {
    const parsed = parseHomePromptHandoff(
      JSON.stringify({ prompt: "x", references: "oops" })
    );
    expect(readHandoffReferences(parsed)).toEqual([]);
    expect(readHandoffReferences(null)).toEqual([]);
  });
});
