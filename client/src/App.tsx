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
  const { isAuthenticated, openLoginModal, user } = useAuth();
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
          <AdminAccessRequired onLogin={openLoginModal} />
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

function AdminAccessRequired({ onLogin }: { onLogin: () => void }) {
  const { forgotPassword, resetPassword, sendEmailCode, loginWithEmailCode } = useAuth();
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleSendEmailCode = async () => {
    const normalizedEmail = email.trim();
    setEmailMessage("");
    if (!normalizedEmail) {
      setEmailMessage("请输入邮箱地址。");
      return;
    }
    setEmailBusy(true);
    const result = await sendEmailCode(normalizedEmail);
    setEmailBusy(false);
    setEmailMessage(result.ok ? "验证码已发送，请查看邮箱后输入验证码。" : result.error || "验证码发送失败。");
  };

  const handleEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const code = emailCode.trim();
    setEmailMessage("");
    if (!normalizedEmail || !code) {
      setEmailMessage("请输入邮箱和验证码。");
      return;
    }
    setEmailBusy(true);
    const result = await loginWithEmailCode(normalizedEmail, code);
    setEmailBusy(false);
    if (!result.ok) {
      setEmailMessage(result.error || "邮箱验证失败。");
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleResetPassword();
  };

  const handleSendResetCode = async () => {
    const username = resetUsername.trim();
    setResetMessage("");
    if (!username) {
      setResetMessage("请输入用于注册的邮箱。");
      return;
    }
    setResetBusy(true);
    const result = await forgotPassword(username);
    setResetBusy(false);
    setResetMessage(result.ok ? result.message || "验证码已发送，请查看邮箱。" : result.error || "验证码发送失败。");
  };

  const handleResetPassword = async () => {
    const username = resetUsername.trim();
    const code = resetCode.trim();
    setResetMessage("");
    if (!username || !code || !resetNewPassword || !resetConfirmPassword) {
      setResetMessage("请填写邮箱、验证码、新密码和确认密码。");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetMessage("两次输入的新密码不一致。");
      return;
    }
    if (resetNewPassword.length < 8) {
      setResetMessage("新密码至少需要 8 位。");
      return;
    }
    setResetBusy(true);
    const result = await resetPassword(username, code, resetNewPassword);
    setResetBusy(false);
    if (!result.ok) {
      setResetMessage(result.error || "密码重置失败。");
      return;
    }
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetMessage("密码已重置，请使用新密码登录。");
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

        <form className="mt-5 rounded-md border border-cyan-300/15 bg-cyan-300/[0.045] p-4 text-left" onSubmit={handleEmailLogin}>
          <div className="text-sm font-semibold text-cyan-50">邮箱验证码注册 / 登录</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">支持自定义邮箱和 Gmail。首次验证成功会自动创建账号。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="name@gmail.com 或自定义邮箱"
            />
            <button
              type="button"
              onClick={() => void handleSendEmailCode()}
              disabled={emailBusy}
              className="h-10 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/18 disabled:opacity-60"
            >
              {emailBusy ? "请稍候" : "获取验证码"}
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              inputMode="numeric"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="6 位验证码"
            />
            <button
              type="submit"
              disabled={emailBusy}
              className="h-10 rounded-md bg-cyan-300 px-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
            >
              验证并进入
            </button>
          </div>
          {emailMessage && (
            <p className="mt-2 text-xs leading-5 text-amber-100">{emailMessage}</p>
          )}
        </form>

        <button
          type="button"
          onClick={onLogin}
          className="mt-4 h-10 rounded-md border border-white/12 bg-white/5 px-5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
        >
          使用账号密码登录
        </button>
        <form className="mt-5 border-t border-white/10 pt-5 text-left" onSubmit={handleForgotPassword}>
          <label className="text-xs font-medium text-slate-400" htmlFor="admin-reset-username">
            邮箱验证找回密码
          </label>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              id="admin-reset-username"
              value={resetUsername}
              onChange={(event) => setResetUsername(event.target.value)}
              autoComplete="email"
              inputMode="email"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="输入注册邮箱"
            />
            <button
              type="button"
              disabled={resetBusy}
              onClick={() => void handleSendResetCode()}
              className="h-10 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/18 disabled:opacity-60"
            >
              {resetBusy ? "发送中" : "发送验证码"}
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={resetCode}
              onChange={(event) => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              inputMode="numeric"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="6 位验证码"
            />
            <input
              type="password"
              value={resetNewPassword}
              onChange={(event) => setResetNewPassword(event.target.value)}
              autoComplete="new-password"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="新密码，至少 8 位"
            />
            <input
              type="password"
              value={resetConfirmPassword}
              onChange={(event) => setResetConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="h-10 rounded-md border border-white/12 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
              placeholder="再次输入新密码"
            />
            <button
              type="submit"
              disabled={resetBusy}
              className="h-10 rounded-md bg-cyan-300 px-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
            >
              {resetBusy ? "重置中" : "重置密码"}
            </button>
          </div>
          {resetMessage && (
            <p className="mt-2 text-xs leading-5 text-amber-100">{resetMessage}</p>
          )}
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
