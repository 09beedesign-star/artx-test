import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_PANEL_SCROLL_THUMB,
  PANEL_SCROLL_MIN_THUMB_HEIGHT,
  PANEL_SCROLL_TRACK_INSET,
  computePanelScrollThumb,
  resolvePanelScrollTopFromThumb,
} from "./panel-scroll-thumb";

/**
 * 「提示词反推」面板缺少上下滑杆导致底部文字看不到（2026-09-20 用户实测）。
 *
 * 这个文件分两半：
 *   - 前半是**真断言**：几何纯函数直接算，不依赖 DOM。
 *   - 后半是源码断言：锁死 JSX 的接线（ref / 轨道 / 滑杆），
 *     因为 vitest 跑在 node 环境渲染不了组件，只能这么钉。
 */

/** 源码要剥掉注释 —— 否则注释里提到的字符串会让断言假阳性。 */
function stripSourceComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const rawSource = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
const source = stripSourceComments(rawSource);

/**
 * ⚠️ 剥注释这一步本身会出错（正则吃多了会把正文一起删掉），
 *    出错时所有 toContain 会集体变红、所有 not.toContain 会集体变绿 ——
 *    后者是静默的。所以先证明"剥完还剩正常体量的源码"。
 */
it("剥注释没有把源码吃掉", () => {
  expect(source.length).toBeGreaterThan(rawSource.length * 0.6);
  expect(source).toContain("reversePromptPanelOpen");
});

describe("面板滑杆几何（纯函数）", () => {
  it("内容没超出时 maxScroll 为 0，滑杆停在顶部", () => {
    const thumb = computePanelScrollThumb({
      clientHeight: 200,
      scrollHeight: 200,
      scrollTop: 0,
    });
    expect(thumb.maxScroll).toBe(0);
    expect(thumb.top).toBe(0);
    expect(thumb.height).toBe(PANEL_SCROLL_MIN_THUMB_HEIGHT);
  });

  it("内容超出时按比例给出滑杆高度", () => {
    const thumb = computePanelScrollThumb({
      clientHeight: 200,
      scrollHeight: 400,
      scrollTop: 0,
    });
    expect(thumb.maxScroll).toBe(200);
    // 轨道 = 200 - 16 = 184；比例 200/400 → 92
    expect(thumb.height).toBe(92);
    expect(thumb.top).toBe(0);
  });

  it("滚到底时滑杆贴在轨道底部", () => {
    const thumb = computePanelScrollThumb({
      clientHeight: 200,
      scrollHeight: 400,
      scrollTop: 200,
    });
    const trackHeight = 200 - PANEL_SCROLL_TRACK_INSET;
    expect(thumb.top).toBe(trackHeight - thumb.height);
  });

  /**
   * ⭐ 这条是本次问题的核心场景：面板 380 高、提示词几百字。
   *    滑杆必须**明显短于**轨道，用户一眼看出"还有很多没看到"。
   */
  it("超长内容下滑杆不会缩到抓不住", () => {
    const thumb = computePanelScrollThumb({
      clientHeight: 240,
      scrollHeight: 6000,
      scrollTop: 0,
    });
    expect(thumb.maxScroll).toBe(5760);
    expect(thumb.height).toBe(PANEL_SCROLL_MIN_THUMB_HEIGHT);
    expect(thumb.height).toBeLessThan(240 - PANEL_SCROLL_TRACK_INSET);
  });

  /**
   * ⚠️ scrollHeight 为 0（容器还没挂载完）时不能返回 NaN ——
   *    NaN 写进 style.top 会被浏览器静默忽略，滑杆卡在上一帧。
   */
  it("零尺寸容器不产生 NaN", () => {
    const thumb = computePanelScrollThumb({
      clientHeight: 0,
      scrollHeight: 0,
      scrollTop: 0,
    });
    expect(Number.isFinite(thumb.top)).toBe(true);
    expect(Number.isFinite(thumb.height)).toBe(true);
    expect(thumb).toEqual(EMPTY_PANEL_SCROLL_THUMB);
  });

  it("scrollTop 超界被夹回范围内", () => {
    const thumb = computePanelScrollThumb({
      clientHeight: 200,
      scrollHeight: 400,
      scrollTop: 99999,
    });
    const trackHeight = 200 - PANEL_SCROLL_TRACK_INSET;
    expect(thumb.top).toBe(trackHeight - thumb.height);
  });

  describe("拖动滑杆换算 scrollTop", () => {
    it("拖到轨道顶端 → scrollTop 归零", () => {
      expect(
        resolvePanelScrollTopFromThumb({
          trackHeight: 184,
          thumbHeight: 92,
          desiredThumbTop: -50,
          maxScroll: 200,
        })
      ).toBe(0);
    });

    it("拖到轨道底端 → scrollTop 到 maxScroll", () => {
      expect(
        resolvePanelScrollTopFromThumb({
          trackHeight: 184,
          thumbHeight: 92,
          desiredThumbTop: 9999,
          maxScroll: 200,
        })
      ).toBe(200);
    });

    it("拖到中点 → scrollTop 约在一半", () => {
      expect(
        resolvePanelScrollTopFromThumb({
          trackHeight: 184,
          thumbHeight: 92,
          desiredThumbTop: 46,
          maxScroll: 200,
        })
      ).toBe(100);
    });

    /**
     * ⚠️ 滑杆高度等于轨道高度时分母是 0，不夹下限就是 Infinity，
     *    一拖直接跳到底。
     */
    it("滑杆撑满轨道时不产生 Infinity", () => {
      const next = resolvePanelScrollTopFromThumb({
        trackHeight: 184,
        thumbHeight: 184,
        desiredThumbTop: 10,
        maxScroll: 0,
      });
      expect(Number.isFinite(next)).toBe(true);
      expect(next).toBe(0);
    });
  });
});

describe("提示词反推面板接上了滑杆", () => {
  /**
   * 只截反推面板那一块 —— 不切块的话，断言会被旁边文字提取面板
   * 已有的那套滑杆"顺手满足"，等于什么都没验。
   */
  const panelStart = source.indexOf("{reversePromptPanelOpen && (");
  const panelEnd = source.indexOf("<AssetInlineNote", panelStart);
  const panelBlock = source.slice(panelStart, panelEnd);

  it("切得出反推面板代码块", () => {
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    expect(panelBlock).toContain("提示词反推");
    expect(panelBlock.length).toBeGreaterThan(1000);
  });

  it("正文区挂上了滚动 ref", () => {
    expect(panelBlock).toContain("ref={reversePromptScrollRef}");
  });

  it("原生滚动条被藏掉，改用自绘滑杆", () => {
    expect(panelBlock).toContain(
      'className="smart-copy-editor-scroll nodrag nopan nowheel absolute inset-0"'
    );
    expect(panelBlock).toContain('scrollbarWidth: "none"');
  });

  /**
   * ⭐⭐⭐ 2026-09-20 线上实测踩到的真坑，单测在 node 环境测不出布局，
   *     只能用源码断言钉死。
   *
   * 滚动容器的父层 `relative min-h-0 flex-1` 高度是 flex 算出来的，
   * 但它 display:block 且没有显式 height —— 子元素写 `height:"100%"`
   * 解析不出百分比基准，退化成 auto 被内容撑开，
   * 于是 scrollHeight === clientHeight，**永远不会滚**。
   * 滑杆恒定停在 0.42 淡色态，文字照样被切掉，且零报错。
   *
   * 必须用 absolute inset-0 强制贴满父盒。
   */
  it("滚动容器用 absolute inset-0 而不是 height:100%（否则永远不会滚）", () => {
    const scrollStart = panelBlock.indexOf("ref={reversePromptScrollRef}");
    const scrollEnd = panelBlock.indexOf("onMouseDown", scrollStart);
    const scrollBlock = panelBlock.slice(scrollStart, scrollEnd);
    expect(scrollStart).toBeGreaterThan(-1);
    expect(scrollEnd).toBeGreaterThan(scrollStart);
    expect(scrollBlock).toContain("absolute inset-0");
    expect(scrollBlock).not.toContain('height: "100%"');
  });

  /**
   * ⚠️ overscroll-behavior:contain 少了的话，滚到底继续滚会把滚动
   *    传给画布，表现为"一到底部画布就开始平移"。
   */
  it("滚到底不会把滚动传给画布", () => {
    expect(panelBlock).toContain('overscrollBehavior: "contain"');
  });

  it("有轨道和可拖动的滑杆", () => {
    expect(panelBlock).toContain("ref={reversePromptScrollTrackRef}");
    expect(panelBlock).toContain(
      "onPointerDown={handleReversePromptScrollThumbPointerDown}"
    );
    expect(panelBlock).toContain('aria-label="拖动查看完整提示词"');
  });

  /**
   * ⭐⭐ 最关键：滑杆在"内容没超出"时必须**变淡而不是消失**。
   *     消失了用户就无从知道这个区域可滚 —— 正是本次要修的问题本身。
   *     不能只写 toContain("0.42")：整串表达式才是定界，
   *     变异成 `? 1 : 0` 时光看数字前缀是发现不了的。
   */
  it("内容没超出时滑杆变淡而不是消失", () => {
    expect(panelBlock).toContain(
      "opacity: reversePromptScrollThumb.maxScroll > 0 ? 1 : 0.42,"
    );
    expect(panelBlock).not.toContain(
      "reversePromptScrollThumb.maxScroll > 0 ? 1 : 0,"
    );
  });

  /**
   * ⚠️ relative + min-h-0 缺一不可：
   *    - 没 relative，轨道的 absolute 会跑到更外层的定位祖先上；
   *    - 没 min-h-0，flex 子项被内容撑高、overflow 失效，面板被撑破。
   *    两者都不报错。
   */
  it("滚动容器外层有定位与 min-h-0", () => {
    expect(panelBlock).toContain('<div className="relative min-h-0 flex-1">');
  });

  /**
   * ⭐⭐ 反推是异步的：面板先以一行"正在分析"打开，几秒后才灌进几百字。
   *     同步 effect 的依赖漏了正文，滑杆会停在"不需要滚动"的状态，
   *     内容已溢出但滑杆是灰的，零报错。
   */
  it("正文异步回来后会重算滑杆", () => {
    const effectStart = source.indexOf("if (!reversePromptPanelOpen) return;");
    expect(effectStart).toBeGreaterThan(-1);
    const depsEnd = source.indexOf("handleReversePromptScrollThumbPointerDown", effectStart);
    const effectBlock = source.slice(effectStart, depsEnd);
    expect(effectBlock).toContain("reversePrompt,");
    expect(effectBlock).toContain("reversePromptCopies,");
    expect(effectBlock).toContain("isReversePrompting,");
    expect(effectBlock).toContain("syncReversePromptScrollThumb");
  });

  /**
   * ⚠️ 标题栏 / 底部工具栏不钉 flex:0 0 auto 的话，
   *    正文变长时会去压缩它们 —— 标题被挤扁、关闭按钮漂移。
   */
  it("标题栏与底部工具栏不会被正文压缩", () => {
    const flexPinned = panelBlock.match(/flex: "0 0 auto",/g) || [];
    expect(flexPinned.length).toBe(2);
  });
});

describe("几何算式只有一个出口", () => {
  /**
   * ⭐⭐⭐ 两个面板共用同一份公式。谁要是又内联抄一份回去，
   *     就是「同一份逻辑两个出口」—— 本项目已经在这个模式上栽过十几次。
   */
  it("两个面板都调用纯函数，没人再内联抄公式", () => {
    const calls = source.match(/computePanelScrollThumb\(/g) || [];
    expect(calls.length).toBe(2);
    const resolves = source.match(/resolvePanelScrollTopFromThumb\(\{/g) || [];
    expect(resolves.length).toBe(2);
  });

  it("旧的内联公式已经删干净", () => {
    expect(source).not.toContain(
      "const trackHeight = Math.max(1, container.clientHeight - 16);"
    );
    expect(source).not.toContain(
      "container.scrollTop = (nextTop / maxTop) * extractedTextScrollThumb.maxScroll;"
    );
  });
});
