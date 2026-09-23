import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRepaintConfirmedMessage,
  buildRepaintConfirmPatch,
  isRepaintSnapshotLive,
  IN_PLACE_REPAINT_CONFIRM_EVENT,
  REPAINT_CONFIRM_BUTTON_LABEL,
} from "./in-place-repaint-confirm";

/**
 * 「确认修改」按钮的回归锁（2026-09-23）。
 *
 * 需求原文（用户）：
 *   「悬浮提示词输入框内，当对图片进行调整之后，再在撤销重绘的按钮旁边加上一个
 *     确认按钮，意思就是确认修改的效果。然后在右边的对话窗口内，同时会出现
 *     确认图片修改成功的消息气泡。」
 *
 * 前半部分是**真行为断言**（纯函数），后半部分是源码接线断言。
 * ⚠️ 源码断言必须配合变异自证 —— 光跑绿说明不了任何问题。
 */

const source = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");

function countOf(needle: string): number {
  let count = 0;
  let cursor = 0;
  for (;;) {
    const hit = source.indexOf(needle, cursor);
    if (hit === -1) return count;
    count += 1;
    cursor = hit + needle.length;
  }
}

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`起始锚点失效，找不到：${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`终止锚点失效，找不到：${endMarker}`);
  return source.slice(start, end);
}

describe("快照有效性：撤销与确认共用的唯一判据", () => {
  it("没有快照 → 两个按钮都不出现", () => {
    expect(isRepaintSnapshotLive({ localSrc: "a.png" })).toBe(false);
    expect(isRepaintSnapshotLive({})).toBe(false);
    expect(isRepaintSnapshotLive(null)).toBe(false);
    expect(isRepaintSnapshotLive(undefined)).toBe(false);
  });

  it("快照有效（当前像素 === 重绘后像素）→ 出现", () => {
    expect(
      isRepaintSnapshotLive({
        localSrc: "new.png?v=2",
        inPlaceRepaintUndo: {
          localSrc: "old.png",
          repaintedLocalSrc: "new.png?v=2",
        },
      })
    ).toBe(true);
  });

  it("⚠️⚠️ 重绘前没有 localSrc（内置素材图节点）也必须能确认/撤销", () => {
    /*
     * 判据若写成「重绘前的 localSrc 是字符串」，这种节点永远拿不到按钮，
     * 用户既不能撤销也不能确认，且零报错。
     */
    expect(
      isRepaintSnapshotLive({
        localSrc: "repainted.png",
        inPlaceRepaintUndo: { localSrc: undefined, repaintedLocalSrc: "repainted.png" },
      })
    ).toBe(true);
  });

  it("⚠️⚠️ 快照过期（重绘后又换了图）→ 必须双双消失", () => {
    expect(
      isRepaintSnapshotLive({
        localSrc: "user-later-uploaded.png",
        inPlaceRepaintUndo: {
          localSrc: "old.png",
          repaintedLocalSrc: "repainted.png",
        },
      })
    ).toBe(false);
  });

  it("快照字段类型不对时不能崩，也不能放行", () => {
    expect(isRepaintSnapshotLive({ inPlaceRepaintUndo: "oops" })).toBe(false);
    expect(isRepaintSnapshotLive({ inPlaceRepaintUndo: 42 })).toBe(false);
    expect(
      isRepaintSnapshotLive({
        localSrc: "a.png",
        inPlaceRepaintUndo: { repaintedLocalSrc: 7 },
      })
    ).toBe(false);
  });
});

describe("确认补丁：只清元数据，绝不改像素", () => {
  it("补丁清掉快照 —— 确认后两个按钮一起收起", () => {
    const patch = buildRepaintConfirmPatch();
    expect(patch.inPlaceRepaintUndo).toBeUndefined();
    expect("inPlaceRepaintUndo" in patch).toBe(true);
  });

  it("⚠️⚠️ 补丁里不能出现 localSrc —— 重写会换缓存键导致图片闪白", () => {
    expect(Object.keys(buildRepaintConfirmPatch())).toEqual([
      "inPlaceRepaintUndo",
    ]);
  });

  it("补丁落到节点上之后，快照判据必须翻成 false（确认即收起）", () => {
    const before = {
      localSrc: "new.png",
      inPlaceRepaintUndo: { localSrc: "old.png", repaintedLocalSrc: "new.png" },
    };
    expect(isRepaintSnapshotLive(before)).toBe(true);
    const after = { ...before, ...buildRepaintConfirmPatch() };
    expect(isRepaintSnapshotLive(after)).toBe(false);
    // 像素没被动过 —— 这是「确认不改图」的真断言
    expect(after.localSrc).toBe("new.png");
  });
});

describe("对话气泡文案", () => {
  it("带标题时把标题写进气泡，并明确说「修改成功」", () => {
    const text = buildRepaintConfirmedMessage("主视觉-01");
    expect(text).toContain("主视觉-01");
    expect(text).toContain("修改成功");
  });

  it("标题为空/全空白时有兜底称呼，不能出现空引号", () => {
    expect(buildRepaintConfirmedMessage("")).toContain("这张图片");
    expect(buildRepaintConfirmedMessage("   ")).toContain("这张图片");
    expect(buildRepaintConfirmedMessage("  x  ")).toContain("「x」");
  });
});

describe("接线：按钮 → 事件 → 执行点 → 气泡", () => {
  it.each([
    'aria-label="撤销局部重绘"',
    "const canUndoInPlaceRepaint = isRepaintSnapshotLive(",
    "IN_PLACE_REPAINT_CONFIRM_EVENT, handler",
  ])("锚点 %s 必须存在", marker => {
    expect(countOf(marker), "锚点失效，后续断言会恒绿").toBeGreaterThan(0);
  });

  it("⚠️⚠️ 两个按钮必须在同一个条件下渲染（同一个出口）", () => {
    /*
     * 这是真正的回归断言：复刻「撤销没了但确认还亮着」这个现象。
     * 做法是断言整个按钮组只有一处条件判断 —— 各写一个 `{cond && <button/>}`
     * 会让 canUndoInPlaceRepaint 在 JSX 里出现两次。
     */
    expect(
      countOf("{canUndoInPlaceRepaint && !isAiProcessingImage && ("),
      "按钮组被拆成了多个独立条件 —— 将来改一处就会出现「撤销消失但确认还亮着」"
    ).toBe(1);
    const group = sliceBetween(
      "{canUndoInPlaceRepaint && !isAiProcessingImage && (",
      "{isCameraViewAdjusting && !isAiProcessingImage && ("
    );
    expect(group, "撤销按钮不在这一组里了").toContain('aria-label="撤销局部重绘"');
    expect(group, "确认按钮不在这一组里了").toContain(
      "REPAINT_CONFIRM_BUTTON_ARIA"
    );
    expect(group, "确认按钮没派发确认事件").toContain(
      "new CustomEvent(IN_PLACE_REPAINT_CONFIRM_EVENT, {"
    );
    expect(group, "没把节点 id 传出去，父级不知道确认哪一张").toContain(
      "detail: { nodeId }"
    );
    expect(
      (group.match(/event\.stopPropagation\(\)/g) || []).length,
      "两个按钮都必须阻止冒泡，否则点按钮会顺带选中/拖动节点"
    ).toBeGreaterThanOrEqual(4);
  });

  it("确认执行点：清快照 + 发气泡，且绝不写 localSrc", () => {
    const body = sliceBetween(
      "   * 「确认局部重绘」的唯一执行点（2026-09-23）。",
      'window.addEventListener(IN_PLACE_REPAINT_CONFIRM_EVENT, handler);'
    );
    expect(body.length, "执行点切片为空或锚点失效").toBeGreaterThan(600);
    expect(body.length, "切片过宽，可能把别的监听器圈进来了").toBeLessThan(6000);
    expect(body, "没有走共用判据 —— 按钮消失后事件仍可能被重放执行").toContain(
      "isRepaintSnapshotLive(data)"
    );
    expect(body, "没有清掉快照，确认之后按钮还亮着").toContain(
      "buildRepaintConfirmPatch()"
    );
    expect(body, "没有往右侧对话面板发气泡 —— 需求的后半句落空").toContain(
      'new CustomEvent("canvas-assistant-external-message", {'
    );
    expect(body, "气泡角色必须是 assistant（系统确认，不是用户说的话）").toContain(
      'role: "assistant"'
    );
    expect(body, "气泡文案没走唯一事实源").toContain(
      "buildRepaintConfirmedMessage("
    );
    expect(
      body,
      "⚠️ 确认改写了 localSrc —— 会换缓存键导致图片闪白，确认不该动像素"
    ).not.toContain("localSrc:");
    expect(
      body,
      "确认压了历史栈 —— 它不改像素，压一格会让 Ctrl+Z 多按一次才有反应"
    ).not.toContain("pushHistory(");
  });

  it("监听器必须解绑", () => {
    expect(
      source.indexOf(
        "window.removeEventListener(IN_PLACE_REPAINT_CONFIRM_EVENT, handler)"
      )
    ).toBeGreaterThan(
      source.indexOf(
        "window.addEventListener(IN_PLACE_REPAINT_CONFIRM_EVENT, handler)"
      )
    );
  });

  it("⚠️ 判据必须收口，源码里不许再内联一份 repaintedLocalSrc 比较", () => {
    /*
     * 收窄到 AssetNode 的判据段落 —— 全文搜会误伤回包出口和撤销执行点，
     * 它们合法地读这个字段。假红会逼人去改无关代码，同样危险。
     */
    const flag = sliceBetween(
      "  const canUndoInPlaceRepaint = ",
      "  const isEditing ="
    );
    expect(flag, "判据没走纯函数").toContain("isRepaintSnapshotLive(");
    expect(
      flag,
      "判据又内联了一份比较 —— 两个按钮的失效边界会和纯函数各走各的"
    ).not.toContain('=== "string" &&');
  });

  it("回包成功的 toast 必须同时提到两个按钮", () => {
    const toastLine = sliceBetween(
      'toast(image ? "局部重绘已完成" : "局部重绘失败"',
      "        return;"
    );
    expect(toastLine, "提示没告诉用户可以确认").toContain(
      REPAINT_CONFIRM_BUTTON_LABEL
    );
    expect(toastLine, "提示里丢了撤销入口").toContain("撤销重绘");
  });

  it("事件名只在纯函数模块里定义，不许在 tsx 里写字面量", () => {
    expect(IN_PLACE_REPAINT_CONFIRM_EVENT).toBe(
      "in-place-repaint-confirm-request"
    );
    expect(
      countOf('"in-place-repaint-confirm-request"'),
      "tsx 里又硬编码了一遍事件名 —— 改名时必然漏一处，且零报错"
    ).toBe(0);
  });
});
