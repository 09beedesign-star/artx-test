import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 相对路径，不用 @shared 别名：vitest 不解析它，写别名会让整个套件
//    加载失败并显示「0 test」—— 不是失败，是压根没跑。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../shared/strip-source-comments";

/**
 * 「点赞 / 收藏跨设备同步」的接线防护。
 *
 * 【为什么单独一个文件】
 * 合并算法本身已经被 server/workspace-sync.merge.test.ts 测得很细了。
 * 但合并算法正确**不等于**跨设备能用 —— 中间还有三段接线，
 * 任何一段断了，用户的现象都是「说好的同步呢」，而且**零报错**：
 *
 *   1. 上行：本地点赞状态要被 collectLocalPayload 收集进载荷（含墓碑）
 *   2. 触发：点一下要真的调度一次同步
 *   3. 下行：合并结果要写回本地，并广播事件让三棵组件树重渲染
 *
 * 📌 这正是本项目最高频的事故模式：库写好了，某一段忘了接。
 */

/**
 * `workspace-sync.ts` 的剥离损耗上限。
 *
 * 【取证】默认 0.3 拦下它。用独立脚本 /tmp/artx-comment-ratio-2.mjs 逐行数过：
 * 这个文件里大段注释记录的是「为什么不能整体覆盖」「为什么必须写墓碑」
 * 这类判据，注释密度天然高。放宽只作用于本文件的读取调用，
 * **不动 assertStripKeptSource 的默认值**。
 */
const SYNC_LIB_MAX_LOSS_RATIO = 0.45;

function readSource(relative: string, maxLossRatio?: number): string {
  const raw = readFileSync(resolve(__dirname, relative), "utf-8");
  expect(raw.length).toBeGreaterThan(1000);
  const stripped = stripSourceComments(raw);
  expect(() => assertStripKeptSource(raw, stripped, maxLossRatio)).not.toThrow();
  return stripped;
}

/**
 * 从源码里切出一段区间再断言。
 *
 * ⚠️⚠️ 切不出来必须**抛错**，绝不能返回空串：
 * 空串会让区间内所有 not.toContain 恒绿 ——
 * 而「切片没切到」和「区间里确实没有这串字符」输出长得一模一样。
 */
function sliceBetween(source: string, startMarker: string, endMarker: string, minLength = 150) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`切片起点不存在：${startMarker}（实现可能已重命名）`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`切片终点不存在：${endMarker}`);
  const block = source.slice(start, end);
  if (block.length < minLength) throw new Error(`切片过短（${block.length} 字符），区间多半不对`);
  return block;
}

describe("点赞收藏跨设备：上行链路", () => {
  const source = readSource("./workspace-sync.ts", SYNC_LIB_MAX_LOSS_RATIO);

  it("collects reactions into the outgoing payload", () => {
    /*
     * 📌 漏掉这一行，本地点赞永远传不上云 ——
     *    用户在 A 机器点完，B 机器上什么都没有，而且前端一声不吭。
     */
    const block = sliceBetween(source, "function collectLocalPayload(", "function applyDocumentToLocal");
    expect(block).toContain("reactions: collectLocalReactions()");
  });

  it("uploads cancellation tombstones alongside active reactions", () => {
    /*
     * ⚠️⚠️ 只传「还赞着的」，取消动作就传不出去：
     *    云端另一台设备那条 active:true 会被原样保留，下行又合并回本地。
     *    **用户现象：我取消了，刷新一下又赞回来了。**
     */
    const block = sliceBetween(
      source,
      "function collectLocalReactions(",
      "function reactionsToLocalState"
    );
    expect(block).toContain("state.tombstones");
    expect(block).toContain("active: false");
    expect(block).toContain("active: true");
    // 时间戳必须是 ISO，合并算法用 parseSyncTimestamp 解析它
    expect(block).toContain("new Date(tomb.removedAt).toISOString()");
  });
});

describe("点赞收藏跨设备：下行链路", () => {
  const source = readSource("./workspace-sync.ts", SYNC_LIB_MAX_LOSS_RATIO);

  it("feeds the cloud reactions into the merge as the base side", () => {
    /*
     * ⚠️ 合并时漏传 reactions，base 侧就永远是空数组 ——
     *    表现为「另一台设备的点赞永远同步不过来」。
     */
    const block = sliceBetween(source, "function applyDocumentToLocal(", "writeLocalProjects(merged.projects)");
    expect(block).toContain("reactions: document.reactions");
  });

  it("writes the merged reactions back to local storage", () => {
    const block = sliceBetween(
      source,
      "writeLocalProjects(merged.projects)",
      "const deletedIds",
      80
    );
    expect(block).toContain("replaceInspirationReactions(");
    expect(block).toContain("reactionsToLocalState(merged.reactions)");
  });

  it("does not re-implement merging on the client side", () => {
    /*
     * 📌 合并算法的唯一事实源是 shared/workspace-sync.ts。
     *    客户端再写一套"谁新留谁"必然与服务端产生分歧，
     *    而分歧的表现是"偶尔丢一条点赞"，几乎无法复现定位。
     */
    const block = sliceBetween(
      source,
      "function reactionsToLocalState(",
      "function collectLocalPayload("
    );
    expect(block).not.toContain("mergeWorkspaceSync");
    // 只做形状翻译：墓碑归墓碑，激活项归激活项
    expect(block).toContain("next.tombstones.push");
    expect(block).toContain("if (!row.item) continue");
  });
});

describe("点赞收藏跨设备：触发链路", () => {
  const source = readSource("../hooks/useInspirationReactions.ts", SYNC_LIB_MAX_LOSS_RATIO);

  it("schedules a sync whenever a reaction is toggled", () => {
    /*
     * ⚠️ 不调度的话，点赞只会等到下一次 60 秒轮询或切标签页才上行。
     *    用户在 A 机器点完立刻去 B 机器看 —— 什么都没有。
     */
    expect(source).toContain("scheduleWorkspaceSync()");
    const block = sliceBetween(source, "const toggle = useCallback(", "const isActive", 120);
    expect(block).toContain("scheduleWorkspaceSync()");
  });

  it("keeps the local write first so logged-out users still work", () => {
    /*
     * 📌 未登录也必须能点赞（本地 anonymous 桶）。
     *    先写本地再调度同步，顺序反了就会出现"没登录点赞没反应"。
     */
    const block = sliceBetween(source, "const toggle = useCallback(", "const isActive", 120);
    const toggleIndex = block.indexOf("toggleInspirationReaction(");
    const syncIndex = block.indexOf("scheduleWorkspaceSync()");
    expect(toggleIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(toggleIndex);
  });
});
