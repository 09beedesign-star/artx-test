import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOME_PROMPT_HANDOFF_KEY,
  HOME_REFERENCE_MAX_COUNT,
  HOME_REFERENCE_SINGLE_BUDGET_BYTES,
  HOME_REFERENCE_TOTAL_BUDGET_BYTES,
  estimateDataUrlBytes,
  fitReferencesToBudget,
  parseHomePromptHandoff,
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
  let failNextWrite = false;

  beforeEach(() => {
    storage.clear();
    failNextWrite = false;
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          // 模拟 QuotaExceededError：只对「带 references 的那次」抛，
          // 降级重试（不带图）必须能成功，否则测不出降级行为。
          if (failNextWrite && value.includes("\"references\"")) {
            throw new Error("QuotaExceededError");
          }
          storage.set(key, value);
        },
        removeItem: (key: string) => storage.delete(key),
      },
    });
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

    const parsed = parseHomePromptHandoff(storage.get(HOME_PROMPT_HANDOFF_KEY) ?? null);
    expect(parsed?.prompt).toBe("画只猫");
    expect(readHandoffReferences(parsed).length).toBe(1);
  });

  it("⚠️ 写入超配额时降级保住提示词，而不是整份丢掉", () => {
    failNextWrite = true;

    const result = writeHomePromptHandoff({
      projectId: "p1",
      prompt: "画只猫",
      model: "vod-gem",
      shouldAutoRun: true,
      references: [makeReference("r1", 1024)],
    });

    // 图没了，但字还在 —— 这正是降级的意义。
    expect(result.ok).toBe(true);
    expect(result.droppedReferences).toBe(true);

    const parsed = parseHomePromptHandoff(storage.get(HOME_PROMPT_HANDOFF_KEY) ?? null);
    expect(parsed?.prompt).toBe("画只猫");
    // ⚠️ 模型也必须一起保住：降级只该丢图，不该顺手把用户选的模型也丢了。
    expect(parsed?.model).toBe("vod-gem");
    expect(readHandoffReferences(parsed)).toEqual([]);
  });

  it("存储 key 必须收口成常量，不得在调用方写裸字符串", () => {
    expect(HOME_PROMPT_HANDOFF_KEY).toBe("artx:pending-home-prompt");
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
