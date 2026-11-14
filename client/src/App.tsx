import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import AppShell from "./components/layout/AppShell";
import OnboardingProvider from "./components/onboarding/OnboardingProvider";
import HomePage from "./pages/HomePage";
import LoginRegisterDialog from "./components/auth/LoginRegisterDialog";
// ── 新增路由页面（补充缺失交互，不替换已有路由）──
import LoadingLoopPage, { CanvasPageLoading, GeneralPageLoading } from "./pages/LoadingLoopPage";
import { useAuth } from "./contexts/AuthContext";
import CreditGrantNotification from "./components/billing/CreditGrantNotification";
import BillingDialogProvider from "./components/billing/BillingDialogProvider";
import InsufficientCreditsDialog from "./components/billing/InsufficientCreditsDialog";
import { startWorkspaceAutoSync } from "./lib/workspace-sync";
import { addEcommerceHistoryEntry, smartCommerceEntryFromTask } from "./lib/image-gen-history";
import { startCreationHistoryRecorder } from "./lib/creation-history-recorder";

/*
 * 路由级代码拆分（2026-10-29）。
 * 首屏只需要首页；画布（InfiniteCanvas 单文件 1.5MB 源码）、电商、后台等页面
 * 改为按需加载，避免香港线路晚高峰丢包时首屏 JS 下载过慢导致「站点打不开」。
 * 首页 / NotFound / LoadingLoopPage 保持同步导入：它们是首屏或 loading 兜底本身。
 */
const WorkspaceDashboard = lazy(() => import("./pages/WorkspaceDashboard"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const CreationHistoryPage = lazy(() => import("./pages/CreationHistoryPage"));
const Workspace = lazy(() => import("./pages/Workspace"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const InspirationPage = lazy(() => import("./pages/InspirationPage"));
const SkillsPage = lazy(() => import("./pages/SkillsPage"));
const CrossBorderCommercePage = lazy(() => import("./pages/CrossBorderCommercePage"));
const EcommerceCanvasPage = lazy(() => import("./pages/EcommerceCanvasPage"));
const LongTermMemoryPage = lazy(() => import("./pages/LongTermMemoryPage"));
const AssetsPage = lazy(() => import("./pages/AssetsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const AdminPrototypePage = lazy(() => import("./pages/AdminPrototypePage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const CreditsGuidePage = lazy(() => import("./pages/CreditsGuidePage"));

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const configuredAdminHost = (import.meta.env.VITE_ADMIN_HOST || "").toLowerCase();
const configuredAdminAccessToken = (import.meta.env.VITE_ADMIN_ACCESS_TOKEN || "").trim();
const grayAdminRouteHosts = new Set(["backstage.artxsd.com"]);
const routeLoadingDurationMs = 720;
// 积分规则属于公开说明内容，未登录用户在决定付费前就应该能看到，
// 因此放进 publicGuestPaths 且不套 RequireLogin。
const publicGuestPaths = ["/", "/inspiration", "/skills", "/cross-border-commerce", "/credits-guide"];
const homeAuthPanelStorageKey = "artx:home-auth-panel";

function isAdminHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (grayAdminRouteHosts.has(host)) return true;
  if (configuredAdminHost && host === configuredAdminHost) return true;
  return host.startsWith("admin.");
}

function isDedicatedAdminHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (configuredAdminHost && host === configuredAdminHost) return true;
  return host.startsWith("admin.");
}

function hasAdminTestAccess() {
  if (typeof window === "undefined" || !configuredAdminAccessToken) return false;
  const token = new URLSearchParams(window.location.search).get("admin_token") || "";
  return token === configuredAdminAccessToken;
}

function getAdminEntryPath() {
  const query = configuredAdminAccessToken ? `?admin_token=${encodeURIComponent(configuredAdminAccessToken)}` : "";
  return `${routerBase}/admin-prototype${query}`;
}

function useAdminHostRootRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDedicatedAdminHost()) return;
    if (window.location.pathname !== `${routerBase}/` && window.location.pathname !== routerBase) return;

    window.location.replace(getAdminEntryPath());
  }, []);
}

/**
 * ShellRoutes — 带 AppShell 的路由集合
 *
 * AppShell 在这里只渲染 **一次**，路由切换时侧边栏完全不重建。
 * 内容区通过 key 变化触发 CSS fade-in，实现轻量页面过渡。
 * 无侧边栏的路由（首页/画布/管理后台）保持独立，不进这里。
 */
function ShellRoutes() {
  const [location] = useLocation();
  // 只取第一段路径作为 key，避免 /ecommerce-canvas/post ↔ /product 也触发淡入
  const contentKey = (() => {
    const seg = location.split(/[?#]/)[0];
    const parts = seg.split("/").filter(Boolean);
    return parts[0] || "home";
  })();

  return (
    <AppShell>
      {/*
        key 随一级路径变化 → 内容区重新挂载并触发 CSS fade-in。
        侧边栏在 AppShell 内部，不受 key 影响，完全稳定。
      */}
      <div key={contentKey} className="artx-page-fade h-full">
        <Suspense fallback={<GeneralPageLoading />}>
          <Switch>
            {/* 工作台（项目列表） */}
            <Route path="/workspace">
              <RequireLogin>
                <WorkspaceDashboard />
              </RequireLogin>
            </Route>

            {/* 创作社区 */}
            <Route path="/community">
              <RequireLogin>
                <CommunityPage />
              </RequireLogin>
            </Route>

            {/* 创作历史（纯本地） */}
            <Route path="/creation-history">
              <RequireLogin>
                <CreationHistoryPage />
              </RequireLogin>
            </Route>

            {/* 设置 */}
            <Route path="/settings">
              <RequireLogin>
                <SettingsPage />
              </RequireLogin>
            </Route>

            {/* 个人主页 */}
            <Route path="/profile">
              <RequireLogin>
                <ProfilePage />
              </RequireLogin>
            </Route>

            {/* 创作模板（灵感推荐） */}
            <Route path="/inspiration">
              <InspirationPage />
            </Route>

            {/* 技能商店 */}
            <Route path="/skills">
              <SkillsPage />
            </Route>

            <Route path="/cross-border-commerce">
              <CrossBorderCommercePage />
            </Route>

            {/*
              电商画布：带货图文 + 智能电商产品图整合入口。
              /*? 三种形态都能匹配（裸路径/尾斜杠/子路径），不会误吞 /ecommerce-canvasx。
              ⚠️ 2026-10-24 安全修复：必须要求登录（积分扣费漏洞）。
            */}
            <Route path="/ecommerce-canvas/*?">
              <RequireLogin>
                <EcommerceCanvasPage />
              </RequireLogin>
            </Route>

            {/* 长期记忆 */}
            <Route path="/memory">
              <RequireLogin>
                <LongTermMemoryPage />
              </RequireLogin>
            </Route>

            {/* 素材库 */}
            <Route path="/assets">
              <RequireLogin>
                <AssetsPage />
              </RequireLogin>
            </Route>

            {/* 帮助中心 */}
            <Route path="/help">
              <RequireLogin>
                <HelpPage />
              </RequireLogin>
            </Route>

            {/* 充值与订阅 */}
            <Route path="/billing">
              <RequireLogin>
                <BillingPage />
              </RequireLogin>
            </Route>

            {/* 积分规则说明：不套 RequireLogin，付费前就该能看 */}
            <Route path="/credits-guide">
              <CreditsGuidePage />
            </Route>

            {/* 兜底：未知路径跳首页 */}
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </Suspense>
      </div>
    </AppShell>
  );
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  useAdminHostRootRedirect();

  /*
   * 跨设备云端同步的生命周期。
   *
   * ⚠️ 依赖必须带上 user?.id，不能只写 isAuthenticated ——
   *    同一个浏览器换账号登录时 isAuthenticated 一直是 true，
   *    effect 不会重跑，新账号就会继续用旧账号的同步循环，
   *    把 A 的画布推进 B 的云端文档里。
   * ⚠️ 未登录时**不启动**：没有云端身份，同步无从谈起。
   */
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    return startWorkspaceAutoSync();
  }, [isAuthenticated, user?.id]);

  /*
   * 智能产品历史记录全局监听。
   */
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const entry = smartCommerceEntryFromTask(detail);
      if (entry) addEcommerceHistoryEntry(user.id, entry, "smart-commerce");
    };
    window.addEventListener("image-generator-submit", listener);
    return () => window.removeEventListener("image-generator-submit", listener);
  }, [isAuthenticated, user?.id]);

  /*
   * 创作历史（纯本地：IndexedDB + 用户选的本地文件夹，不进云端）。
   */
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    return startCreationHistoryRecorder(user.id);
  }, [isAuthenticated, user?.id]);

  return (
    <Suspense fallback={<RouteChunkFallback />}>
    <Switch>
      {/* 首页 — 无侧边栏 */}
      <Route path="/">
        <HomePage />
      </Route>

      {/*
        项目画布 — 2026-11-13 起常驻左侧边栏（默认展开、可收起）。
        ⚠️ 这里刻意**不**走 ShellRoutes：那边内容区套了 `.artx-page-fade`，
           它的 transform 动画会给内部 `position:fixed` 元素造一个新的包含块，
           画布里一堆 fixed 浮层会整体错位且零报错。
        ⚠️ 侧边栏是**并排挤占**而不是浮在画布上 —— 画布容器宽度随之收缩，
           空态三张上传卡、顶部工具条都以画布容器为参照居中，永远不会被侧栏压住。
      */}
      <Route path="/project/:id">
        {(params) => (
          // 游客也能进画布：灵感「一键同款」要先把图带进画布，登录门禁只卡在「生成」
          // （CanvasAssistantPanel.handleSubmit / requestAiAuth）。别再套 RequireLogin。
          <AppShell>
            <Workspace projectId={params.id} />
          </AppShell>
        )}
      </Route>

      {/* Loading 页 — 无侧边栏 */}
      <Route path="/loading">
        <LoadingLoopPage />
      </Route>

      {/* 管理后台 — 无侧边栏 */}
      <Route path="/admin-prototype">
        {!isAdminHost() && !hasAdminTestAccess() ? (
          <AdminHostRequired />
        ) : isAuthenticated && user?.isAdmin ? (
          <AdminPrototypePage />
        ) : isAuthenticated ? (
          <AdminForbidden username={user?.username || "当前账号"} />
        ) : (
          <AdminAccessRequired />
        )}
      </Route>

      {/* 404 */}
      <Route path="/404" component={NotFound} />

      {/*
        所有带侧边栏的路由统一交给 ShellRoutes 处理。
        AppShell 在 ShellRoutes 内只渲染一次，路由切换时侧边栏完全不重建。
        必须放在所有无侧边栏路由之后，避免提前拦截。
      */}
      <Route>
        <ShellRoutes />
      </Route>
    </Switch>
    </Suspense>
  );
}

/** 懒加载分包下载期间的占位：画布页用画布骨架，其余用通用 loading。 */
function RouteChunkFallback() {
  const { theme } = useTheme();
  const [location] = useLocation();
  const isCanvas = normalizeRoutePath(location).startsWith("/project/");
  return (
    <div className={`fixed inset-0 ${theme === "dark" ? "bg-[#222222]" : "bg-white"}`} role="status" aria-live="polite">
      {isCanvas ? <CanvasPageLoading /> : <GeneralPageLoading />}
    </div>
  );
}

function normalizeRoutePath(location: string) {
  return location.split(/[?#]/)[0] || "/";
}

function isPublicGuestPath(path: string) {
  // 画布对游客开放（生成时才弹登录），见 /project/:id 路由注释。
  if (path.startsWith("/project/")) return true;
  return publicGuestPaths.includes(path);
}

function isProtectedGuestPath(path: string) {
  if (path === "/loading") return false;
  return !isPublicGuestPath(path);
}

function shouldShowRouteLoading(path: string) {
  return path !== "/loading";
}

/**
 * 判断是否为同页内 Tab 切换（路由变了但不应显示全屏 loading）。
 * 例：/ecommerce-canvas/post ↔ /ecommerce-canvas/product 属电商画布内模式切换。
 */
function isSamePageTransition(from: string, to: string): boolean {
  // ⚠️ 裸 /ecommerce-canvas 也是工作台（默认产品图），从它切 Tab 同样不能闪 loading。
  const ecommercePostOrProduct = /^\/ecommerce-canvas(\/(post|product))?\/?$/;
  if (ecommercePostOrProduct.test(from) && ecommercePostOrProduct.test(to)) return true;
  // 未来可扩展其他同页 Tab 切换判断
  return false;
}

function RouteLoadingGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [location] = useLocation();
  const routePath = normalizeRoutePath(location);
  const previousPathRef = useRef(routePath);
  const [loadingPath, setLoadingPath] = useState<string | null>(() => (
    shouldShowRouteLoading(routePath) && (isAuthenticated || !isProtectedGuestPath(routePath)) ? routePath : null
  ));

  useEffect(() => {
    if (previousPathRef.current === routePath) return;
    const prev = previousPathRef.current;
    previousPathRef.current = routePath;
    // 同页 Tab 切换不显示全屏 loading
    if (isSamePageTransition(prev, routePath)) return;
    setLoadingPath(shouldShowRouteLoading(routePath) && (isAuthenticated || !isProtectedGuestPath(routePath)) ? routePath : null);
  }, [isAuthenticated, routePath]);

  useEffect(() => {
    if (!loadingPath) return;
    const timer = window.setTimeout(() => {
      setLoadingPath(null);
    }, routeLoadingDurationMs);
    return () => window.clearTimeout(timer);
  }, [loadingPath]);

  const overlayBg = isDark ? "bg-[#222222]" : "bg-white";

  return (
    <>
      {children}
      {loadingPath && (
        <div className={`fixed inset-0 z-[2147483000] ${overlayBg}`} role="status" aria-live="polite">
          {loadingPath.startsWith("/project/") ? <CanvasPageLoading /> : <GeneralPageLoading />}
        </div>
      )}
    </>
  );
}

function RequireLogin({ children }: { children: ReactNode }) {
  const { isAuthenticated, closeLoginModal } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated) return;
    closeLoginModal();
    sessionStorage.setItem(homeAuthPanelStorageKey, "login");
    navigate("/");
  }, [closeLoginModal, isAuthenticated, navigate]);

  if (isAuthenticated) return <>{children}</>;

  return null;
}

function AdminHostRequired() {
  const targetHost = configuredAdminHost || "admin.yourdomain.com";
  const allowTestToken = Boolean(configuredAdminAccessToken);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#222222] px-6 text-slate-100">
      <section className="w-full max-w-[520px] rounded-md border border-white/10 bg-white/[0.035] p-6 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-md bg-slate-200 text-slate-950">
          <span className="text-lg font-semibold">ADM</span>
        </div>
        <h1 className="text-xl font-semibold">请使用管理后台独立子域名</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          管理后台不会在主站暴露入口，也不允许从普通站点域名进入。请通过独立后台域名访问。
        </p>
        <div className="mt-5 rounded-md border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-cyan-100">
          https://{targetHost}/admin-prototype
        </div>
        {allowTestToken && (
          <p className="mt-4 text-xs leading-5 text-slate-500">
            测试环境可使用后台测试令牌进入；该入口不会展示在主站导航中。
          </p>
        )}
      </section>
    </main>
  );
}

function AdminForbidden({ username }: { username: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#222222] px-6 text-slate-100">
      <section className="w-full max-w-[520px] rounded-md border border-amber-300/20 bg-amber-300/[0.045] p-6 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-md bg-amber-200 text-slate-950">
          <span className="text-lg font-semibold">!</span>
        </div>
        <h1 className="text-xl font-semibold">当前账号没有管理后台权限</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {username} 已登录，但没有 `admin:access` 权限。正式后台需要由超级管理员分配角色后才能访问。
        </p>
      </section>
    </main>
  );
}

function AdminAccessRequired() {
  const { login } = useAuth();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const handleAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = adminId.trim();
    setMessage("");
    if (!username || !password.trim()) {
      setMessage("请输入管理员 ID 和密码。");
      return;
    }
    setBusy(true);
    const result = await login(username, password);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "登录失败，请重新输入。");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#222222] px-6 py-8 text-slate-100">
      <section className="w-full max-w-[520px] rounded-md border border-white/10 bg-white/[0.035] p-6 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-md bg-cyan-300 text-slate-950">
          <span className="text-lg font-semibold">A</span>
        </div>
        <h1 className="text-xl font-semibold">需要登录后访问管理后台</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          管理后台包含支付、积分、用户反馈和风控信息，需要先确认当前账号身份。
        </p>

        <form className="mt-5 rounded-md border border-cyan-300/15 bg-cyan-300/[0.045] p-4 text-left" onSubmit={handleAdminLogin}>
          <div className="text-sm font-semibold text-cyan-50">管理员 ID + 密码登录</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">管理端只接受已授权管理员账号，不开放邮箱验证码注册或找回入口。</p>
          <div className="mt-3 grid gap-3">
            <input
              value={adminId}
              onChange={(event) => setAdminId(event.target.value)}
              autoComplete="username"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="输入管理员 ID"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="输入管理密码"
            />
          </div>
          {message && (
            <p className="mt-3 text-xs leading-5 text-amber-100">{message}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 h-10 w-full rounded-md bg-cyan-300 px-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
          >
            {busy ? "登录中" : "进入管理后台"}
          </button>
        </form>
      </section>
    </main>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={false}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <LoginRegisterDialog />
            <CreditGrantNotification />
            <WouterRouter base={routerBase}>
              {/*
                RouteLoadingGate 已移除 —— 侧边栏路由间切换改为内容区 CSS fade-in。
                RouteLoadingGate 只对画布路由有实际意义（分包体积大），
                但画布是无侧边栏的独立路由，已在 AppRoutes 单独处理，
                保留它反而会在侧边栏路由切换时制造 720ms 全屏遮罩。
              */}
              <BillingDialogProvider>
                <OnboardingProvider>
                  <AppRoutes />
                </OnboardingProvider>
                <InsufficientCreditsDialog />
              </BillingDialogProvider>
            </WouterRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
