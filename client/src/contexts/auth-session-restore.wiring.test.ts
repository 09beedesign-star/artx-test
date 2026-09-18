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
 * 「刷新受保护页面不掉登录」的接线防护。
 *
 * 【修的是什么 bug】
 * 在 /profile 直接刷新（或从地址栏进入），会被瞬间弹回首页并弹出登录框，
 * 哪怕本地会话完全有效。
 *
 * 【根因】
 * ⚠️⚠️⚠️ **「数据是同步可得的」和「组件首帧就拿得到」是两回事，中间隔着一次 effect。**
 * `readStoredSession()` 读 localStorage 本身是同步的，但它原来放在 useEffect 里，
 * 而 effect 在首次渲染**之后**才执行 → 刷新时必然存在一帧 `isAuthenticated === false`
 * → `RequireLogin` 的 effect 正好在那一帧 `navigate("/")` 把人踢走。
 *
 * 📌 凡是「守卫 + 异步恢复态」的组合，守卫看到的第一帧永远是未登录。
 *    这类 bug 表现为「刷新就掉登录」，**且零报错**。
 *
 * 【为什么只能守接线，不能守纯函数】
 * `readStoredSession` 单独测永远是对的 —— 它确实能读出会话。
 * 出问题的是**它在哪一个生命周期阶段被调用**，这件事没有任何纯函数测试能覆盖。
 */

const AUTH_CONTEXT_PATH = resolve(__dirname, "./AuthContext.tsx");
const APP_PATH = resolve(__dirname, "../App.tsx");

function readCode(path: string, maxLossRatio = 0.3): string {
  const raw = readFileSync(path, "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

/**
 * 从源码里切出一段区间再断言。
 *
 * ⚠️⚠️ 必须**抛错**而不是返回空串：空串会让区间内所有 `not.toContain` 恒绿
 * （静默失守），而且「切片没切到」和「区间里确实没有这串」输出一模一样。
 */
function sliceBetween(
  source: string,
  startMarker: string,
  endMarker: string,
  minLength = 120
): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`切片起点不存在：${startMarker}（实现可能已重命名）`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`切片终点不存在：${endMarker}`);
  const block = source.slice(start, end);
  if (block.length < minLength) {
    throw new Error(`切片过短（${block.length} 字符），区间多半不对`);
  }
  return block;
}

describe("会话恢复：首帧就必须是已登录态", () => {
  it("initialSession 用惰性初始值在首次渲染前同步读出", () => {
    const code = readCode(AUTH_CONTEXT_PATH);
    expect(code).toContain("const [initialSession] = useState(readStoredSession);");
  });

  it("惰性初始值传的是函数引用而不是调用结果", () => {
    const code = readCode(AUTH_CONTEXT_PATH);
    // ⚠️ `useState(readStoredSession())` 会在**每次渲染**都读一遍 localStorage，
    //    而不是只读一次。首帧行为看起来一样，所以不会被功能测试发现。
    expect(code).not.toContain("useState(readStoredSession())");
  });

  it("isAuthenticated 的初值由 initialSession 推导，不是写死的 false", () => {
    const code = readCode(AUTH_CONTEXT_PATH);
    const initBlock = sliceBetween(
      code,
      "export function AuthProvider",
      "const [loginModalOpen"
    );
    expect(initBlock).toContain("useState(() => Boolean(initialSession))");
    // ⚠️⚠️ 这是本次 bug 的原始写法。一旦复活，刷新就会重新掉登录。
    expect(initBlock).not.toContain("useState(false)");
  });

  it("user 的初值同样来自 initialSession，不是 null", () => {
    const code = readCode(AUTH_CONTEXT_PATH);
    const initBlock = sliceBetween(
      code,
      "export function AuthProvider",
      "const [loginModalOpen"
    );
    expect(initBlock).toContain("useState<AuthUser | null>(() => initialSession?.user ?? null)");
    // 反向：初值不能退回写死的 null —— 那样首帧 user 为空，
    // 依赖 user 的页面（个人中心）会闪一帧空数据。
    expect(initBlock).not.toContain("useState<AuthUser | null>(null)");
  });

  it("effect 里不再调用 readStoredSession —— 恢复态的唯一来源是初始值", () => {
    const code = readCode(AUTH_CONTEXT_PATH);
    const effectBlock = sliceBetween(
      code,
      "const stored = initialSession;",
      "}, [initialSession]);"
    );
    // ⚠️ 只要 effect 里还有一次 readStoredSession()，就说明有人把恢复逻辑
    //    又挪回 effect 了 —— 首帧未登录的窗口会重新打开。
    expect(effectBlock).not.toContain("readStoredSession(");
    expect(effectBlock).toContain("fetchAuth(\"me\"");
  });

  it("服务端校验失败时仍会清掉本地会话（安全性没被这次修复降级）", () => {
    const code = readCode(AUTH_CONTEXT_PATH);
    const effectBlock = sliceBetween(
      code,
      "const stored = initialSession;",
      "}, [initialSession]);"
    );
    expect(effectBlock).toContain("localStorage.removeItem(AUTH_STORAGE_KEY)");
    expect(effectBlock).toContain("setIsAuthenticated(false)");
  });
});

describe("守卫本身必须还在：修的是首帧时序，不是把门拆了", () => {
  it("RequireLogin 未登录时仍然跳回首页", () => {
    const app = readCode(APP_PATH);
    const guard = sliceBetween(
      app,
      "function RequireLogin(",
      "function AdminHostRequired("
    );
    expect(guard).toContain("if (isAuthenticated) return;");
    expect(guard).toContain("navigate(\"/\")");
  });

  it("/profile 依然是受保护路由，没有被降级成公开页", () => {
    const app = readCode(APP_PATH);
    expect(app).toContain("path=\"/profile\"");
    // ⚠️ 「刷新掉登录」的另一种错误修法是把页面从守卫里摘出去或塞进白名单，
    //    那等于把未登录用户也放进个人中心。
    expect(app).not.toContain("\"/profile\", \"/settings\"");
    const publicPaths = sliceBetween(
      app,
      "const publicGuestPaths",
      "\n",
      40
    );
    expect(publicPaths).not.toContain("/profile");
  });
});
