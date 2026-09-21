import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 需求：中途跳出画布时，工作台和所有画布的内容要保持退出前的状态。
 *
 * 丢失有**两条独立的链**，两条都得堵，只堵一条都还会丢：
 *
 *   链一：`isRealCanvasProjectId` 是白名单式判据，只认 `canvas-` 前缀。
 *        而实际在用的 projectId 还有 `__blank-workspace__`（工作台默认值、
 *        技能页「去创作」直接跳的就是它）和兜底的 `p1`。
 *        它们不匹配白名单 → 被 `ensureTestCanvasStateReset` 当测试数据删掉。
 *
 *   链二（主因）：自动保存 effect 有 `didHydrateCanvasStateRef` 和
 *        `isRestoringRef` 两道闸门。最后一次改动若恰好落在闸门为真的窗口里
 *        （撤销/重做、图片 hydrate 回填、刚恢复完的两帧 rAF 内），
 *        就永远不会被写进存储，组件一卸载即蒸发，全程零报错。
 *
 * 📌 判据：**「靠 state 变化触发保存」的实现，必须配卸载时的兜底 flush。**
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * 从源码里把真实的「历史测试画布 id」清单抠出来。
 *
 * 刻意不在测试里另写一份清单 —— 那样测的是副本不是实现，
 * 有人改了源码里的 Set，测试照样绿。
 */
function readLegacyTestCanvasIds() {
  const start = source.indexOf("const LEGACY_TEST_CANVAS_PROJECT_IDS = new Set([");
  expect(start, "找不到 LEGACY_TEST_CANVAS_PROJECT_IDS").toBeGreaterThan(-1);
  const end = source.indexOf("]);", start);
  const literal = source.slice(start, end);
  return Array.from(literal.matchAll(/"([^"]+)"/g)).map(match => match[1]);
}

// 用源码里真实的清单还原判据，再对它做行为断言。
const legacyIds = readLegacyTestCanvasIds();
const isRealCanvasProjectId = (projectId: string) =>
  !new Set(legacyIds).has(projectId);

describe("链一：测试画布判据不能误删真实用户数据", () => {
  it("判据必须是排除法，而不是 canvas- 前缀白名单", () => {
    const start = source.indexOf("function isRealCanvasProjectId");
    const body = source.slice(start, start + 260);

    expect(body, "必须按「不在历史测试清单里」判定").toContain(
      "!LEGACY_TEST_CANVAS_PROJECT_IDS.has(projectId)"
    );
    // 反向断言：旧的前缀白名单必须消失。
    // 📌 正向匹配「是什么」会漏掉所有没登记的 id；
    //    排除「不是什么」才收得住。
    expect(body, "还残留着 canvas- 前缀白名单").not.toContain(
      'startsWith("canvas-")'
    );
  });

  it("工作台默认画布与兜底 id 必须被认作真实数据", () => {
    // 这三个就是原来被误删的。任何一个判成「非真实」，
    // 用户从工作台进画布、画了东西、退出来，内容就没了。
    expect(
      isRealCanvasProjectId("__blank-workspace__"),
      "工作台默认画布被误判成测试数据"
    ).toBe(true);
    expect(isRealCanvasProjectId("canvas-1757900000000-abc")).toBe(true);
    expect(isRealCanvasProjectId("my-project")).toBe(true);
  });

  it("正向锚点：历史测试 id 仍然要被清理掉", () => {
    // 反向断言必须配正向锚点，否则把判据改成「永远返回 true」也能全绿，
    // 那样 2026-06-20 那次一次性清理就等于被悄悄废掉了。
    expect(legacyIds.length, "历史测试 id 清单不能为空").toBeGreaterThan(0);
    expect(legacyIds).toContain("p1");
    for (const id of legacyIds) {
      expect(isRealCanvasProjectId(id), `${id} 应当仍被当作测试画布`).toBe(
        false
      );
    }
  });
});

describe("链二：离开画布时必须有兜底落盘", () => {
  it("存在卸载 / pagehide 时的 flush", () => {
    expect(source, "缺少离开画布时的最终落盘").toContain(
      "const flushCanvasState = "
    );
    // pagehide 覆盖「关标签页 / 刷新」。
    // ⚠️ 不能只用 beforeunload：移动端 Safari 上它不保证触发。
    expect(source).toContain('window.addEventListener("pagehide", flushCanvasState)');
    expect(source).toContain(
      'window.removeEventListener("pagehide", flushCanvasState)'
    );
  });

  it("flush 必须读 ref 的最新值，不能用闭包里的旧值", () => {
    const start = source.indexOf("const flushCanvasState = ");
    const body = source.slice(start, start + 900);

    // effect 依赖只有 projectId，只在卸载时跑一次。
    // 用闭包捕获的 nodes/edges 会是**首帧的旧值**，
    // 存进去等于把画布回退到刚进来的样子 —— 比不存更糟。
    expect(body, "flush 必须用 nodesRef.current").toContain("nodesRef.current");
    expect(body, "flush 必须用 edgesRef.current").toContain("edgesRef.current");
    expect(body, "flush 不能直接引用 state 里的 nodes").not.toMatch(
      /\bnodes,\s*$/m
    );
  });

  it("hydrate 未完成时禁止写入，避免空画布覆盖真实存档", () => {
    const start = source.indexOf("const flushCanvasState = ");
    const body = source.slice(start, start + 900);
    expect(body, "缺少 hydrate 闸门").toContain(
      "if (!didHydrateCanvasStateRef.current) return;"
    );
  });

  it("卸载回调里必须真的调用 flush，而不是只解绑监听", () => {
    const start = source.indexOf("const flushCanvasState = ");
    const cleanup = source.slice(start, start + 1400);
    const removeIndex = cleanup.indexOf(
      'window.removeEventListener("pagehide", flushCanvasState)'
    );
    expect(removeIndex).toBeGreaterThan(-1);
    // 解绑之后必须还有一次裸调用 —— 这才是覆盖「站内路由跳走」的那条路径。
    // 只解绑不调用的话，点「返回工作台」依然会丢最后一次改动。
    expect(
      cleanup.slice(removeIndex),
      "卸载时没有真正 flush，站内跳转仍会丢改动"
    ).toContain("flushCanvasState();");
  });
});
