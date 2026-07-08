import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import AppShell from "./components/layout/AppShell";
import HomePage from "./pages/HomePage";
import WorkspaceDashboard from "./pages/WorkspaceDashboard";
import CommunityPage from "./pages/CommunityPage";
import Workspace from "./pages/Workspace";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import LoginRegisterDialog from "./components/auth/LoginRegisterDialog";
// ── 新增路由页面（补充缺失交互，不替换已有路由）──
import InspirationPage from "./pages/InspirationPage";
import SkillsPage from "./pages/SkillsPage";
import AssetsPage from "./pages/AssetsPage";
import HelpPage from "./pages/HelpPage";
import LoadingLoopPage, { CanvasPageLoading, GeneralPageLoading } from "./pages/LoadingLoopPage";
import AdminPrototypePage from "./pages/AdminPrototypePage";
import BillingPage from "./pages/BillingPage";
import { useAuth } from "./contexts/AuthContext";

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const configuredAdminHost = (import.meta.env.VITE_ADMIN_HOST || "").toLowerCase();
const configuredAdminAccessToken = (import.meta.env.VITE_ADMIN_ACCESS_TOKEN || "").trim();
const routeLoadingDurationMs = 720;
const publicGuestPaths = ["/", "/inspiration", "/skills"];
const homeAuthPanelStorageKey = "artx:home-auth-panel";

function isAdminHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
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

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  useAdminHostRootRedirect();

  return (
    <Switch>
      {/* 首页 */}
      <Route path="/">
        <HomePage />
      </Route>

      {/* 工作台（项目列表） */}
      <Route path="/workspace">
        <RequireLogin>
          <AppShell>
            <WorkspaceDashboard />
          </AppShell>
        </RequireLogin>
      </Route>

      {/* 创作社区 */}
      <Route path="/community">
        <RequireLogin>
          <AppShell>
            <CommunityPage />
          </AppShell>
        </RequireLogin>
      </Route>

      {/* 设置 */}
      <Route path="/settings">
        <RequireLogin>
          <AppShell>
            <SettingsPage />
          </AppShell>
        </RequireLogin>
      </Route>

      {/* 个人主页 */}
      <Route path="/profile">
        <RequireLogin>
          <AppShell>
            <ProfilePage />
          </AppShell>
        </RequireLogin>
      </Route>

      {/* ── 补充缺失路由（原侧边栏点击无效的导航项）── */}

      {/* 灵感选题 */}
      <Route path="/inspiration">
        <AppShell>
          <InspirationPage />
        </AppShell>
      </Route>

      {/* 技能商店 */}
      <Route path="/skills">
        <AppShell>
          <SkillsPage />
        </AppShell>
      </Route>

      {/* 素材库 */}
      <Route path="/assets">
        <RequireLogin>
          <AppShell>
            <AssetsPage />
          </AppShell>
        </RequireLogin>
      </Route>

      {/* 帮助中心 */}
      <Route path="/help">
        <RequireLogin>
          <AppShell>
            <HelpPage />
          </AppShell>
        </RequireLogin>
      </Route>

      <Route path="/billing">
        <RequireLogin>
          <AppShell>
            <BillingPage />
          </AppShell>
        </RequireLogin>
      </Route>

      <Route path="/loading">
        <LoadingLoopPage />
      </Route>

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

      {/* 项目画布（无 AppShell 侧边栏，画布自带返回按钮） */}
      <Route path="/project/:id">
        {(params) => (
          <RequireLogin>
            <Workspace projectId={params.id} />
          </RequireLogin>
        )}
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function normalizeRoutePath(location: string) {
  return location.split(/[?#]/)[0] || "/";
}

function isPublicGuestPath(path: string) {
  return publicGuestPaths.includes(path);
}

function isProtectedGuestPath(path: string) {
  if (path === "/loading") return false;
  return !isPublicGuestPath(path);
}

function shouldShowRouteLoading(path: string) {
  return path !== "/loading";
}

function RouteLoadingGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const routePath = normalizeRoutePath(location);
  const previousPathRef = useRef(routePath);
  const [loadingPath, setLoadingPath] = useState<string | null>(() => (
    shouldShowRouteLoading(routePath) && (isAuthenticated || !isProtectedGuestPath(routePath)) ? routePath : null
  ));

  useEffect(() => {
    if (previousPathRef.current === routePath) return;
    previousPathRef.current = routePath;
    setLoadingPath(shouldShowRouteLoading(routePath) && (isAuthenticated || !isProtectedGuestPath(routePath)) ? routePath : null);
  }, [isAuthenticated, routePath]);

  useEffect(() => {
    if (!loadingPath) return;
    const timer = window.setTimeout(() => {
      setLoadingPath(null);
    }, routeLoadingDurationMs);
    return () => window.clearTimeout(timer);
  }, [loadingPath]);

  return (
    <>
      {children}
      {loadingPath && (
        <div className="fixed inset-0 z-[2147483000] bg-[#222222]" role="status" aria-live="polite">
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
      <ThemeProvider defaultTheme="dark" switchable>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <LoginRegisterDialog />
            <WouterRouter base={routerBase}>
              <RouteLoadingGate>
                <AppRoutes />
              </RouteLoadingGate>
            </WouterRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
