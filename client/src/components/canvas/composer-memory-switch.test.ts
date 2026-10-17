import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 画布输入框右上角「上下文记忆」开关的结构锁。
 *
 * 【为什么是源码断言而不是渲染测试】
 * InfiniteCanvas.tsx 有 4 万行、依赖整个画布运行时，渲染它的代价远超收益。
 * 这里锁的是几条**会静默失效**的结构约束，源码级断言足够且稳定。
 * ⚠️ 源码断言的风险是「改了写法测试就假绿」，所以每条都配了
 *    一个"反向断言"或具体的坑位说明。
 */
const source = readFileSync(
  path.resolve(import.meta.dirname, "./InfiniteCanvas.tsx"),
  "utf8"
);

describe("开关的存在与默认值", () => {
  it("输入框里有大脑图标和 Switch", () => {
    expect(source).toContain('data-testid="composer-memory-switch"');
    expect(source).toMatch(/<Brain\s/);
  });

  it("默认关闭", () => {
    /*
     * 用户原话：「默认用户点击激活这个按钮之后就会开启上下文」——
     * 点击后开启，不是一上来就开着。
     * ⚠️ 测默认值时断言初始化那行，不能去断言"传了 true 会开"（那是作弊解）。
     */
    expect(source).toContain("useState(false);\n  const [memoryContextBusy");
  });
});

describe("开关必须真的落到服务端", () => {
  it("切换时调用 saveUserMemory，而不是只改本地 state", () => {
    /*
     * ⚠️⚠️ 开关的唯一作用是让**服务端**注入上下文。
     *    只改前端 state 的话，服务端永远读不到，开关就是个装饰品 ——
     *    有动画、有 toast、实际没生效，且零报错。
     */
    const handler = source.slice(
      source.indexOf("const handleToggleMemoryContext"),
      source.indexOf("// 提示词框左下角「+上传」按钮")
    );
    expect(handler).toContain("saveUserMemory({ contextEnabled: next })");
  });

  it("不做乐观更新：先等服务端返回，再改本地状态", () => {
    /*
     * 📌「操作成功」≠「结果可用」。这个开关的"可用"就等于服务端那一位，
     *    乐观更新会让写失败的情况下前端照样亮起。
     */
    const handler = source.slice(
      source.indexOf("const handleToggleMemoryContext"),
      source.indexOf("// 提示词框左下角「+上传」按钮")
    );
    const savePos = handler.indexOf("saveUserMemory");
    const setPos = handler.indexOf("setMemoryContextEnabled(document.contextEnabled)");
    expect(savePos).toBeGreaterThan(-1);
    expect(setPos).toBeGreaterThan(savePos);
  });

  it("保存失败时有 toast，不静默吞掉", () => {
    const handler = source.slice(
      source.indexOf("const handleToggleMemoryContext"),
      source.indexOf("// 提示词框左下角「+上传」按钮")
    );
    expect(handler).toContain("没保存成功");
  });

  it("开启后弹 toast 提示用户记忆已生效", () => {
    // 用户明确要求「出现 toast 的提示」。
    const handler = source.slice(
      source.indexOf("const handleToggleMemoryContext"),
      source.indexOf("// 提示词框左下角「+上传」按钮")
    );
    // 用户 2026-10-17 指定文案，原样锁住。
    expect(handler).toContain('toast("您已开启上下文记忆，可以更好地帮助理解您的意图"');
  });
});

describe("会静默失效的三处结构约束", () => {
  it("开关不在 contextLabel 的条件分支里", () => {
    /*
     * ⚠️ contextLabel 是条件渲染的。把开关塞进那一块，
     *    没有 label 时整个入口会消失 ——
     *    📌「开」在 A 分支「关」在 B 分支，这类入口必然时有时无。
     */
    const switchPos = source.indexOf('data-testid="composer-memory-switch"');
    const labelBlockPos = source.indexOf("{contextLabel && (");
    expect(switchPos).toBeLessThan(labelBlockPos);
  });

  it("开关带 nodrag/nopan 并拦住 pointerdown", () => {
    /*
     * ⚠️ 这块浮在画布之上。不拦事件的话点击穿透到画布，
     *    表现是「点开关没反应，画布反而被拖了」。
     */
    const block = source.slice(
      source.indexOf("上下文记忆开关 —— 输入框右上角"),
      source.indexOf('data-testid="composer-memory-switch"')
    );
    expect(block).toContain("nodrag nopan");
    expect(block).toContain("onPointerDown={event => event.stopPropagation()}");
  });

  it("文本区补了顶部留白，避免被 absolute 的开关压住第一行", () => {
    /*
     * ⚠️ absolute 元素不占布局。不补留白时开关会盖在用户输入的
     *    第一行文字上 —— 文字看起来被挡掉一截，却仍然能点中，
     *    最容易被误判成渲染 bug。
     */
    const shell = source.slice(
      source.indexOf("ref={composerShellRef}"),
      source.indexOf("onMouseDown={event => {", source.indexOf("ref={composerShellRef}"))
    );
    expect(shell).toContain("paddingTop: 26");
  });
});

describe("跨页面同步", () => {
  it("订阅了全站变更事件，保证个人中心改了画布能跟上", () => {
    /*
     * ⚠️ 画布和个人中心是两个页面，各自只读一次接口的话，
     *    在一处改了另一处不刷新 ——「我明明开了，另一个页面还显示关」。
     */
    expect(source).toContain("window.addEventListener(USER_MEMORY_CHANGED_EVENT");
    // 卸载时必须摘掉监听，否则切画布会越积越多。
    expect(source).toContain("window.removeEventListener(USER_MEMORY_CHANGED_EVENT");
  });

  it("自己改完也广播出去", () => {
    expect(source).toContain("broadcastUserMemoryChange(document)");
  });
});
