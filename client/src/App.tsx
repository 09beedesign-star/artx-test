import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
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
import LoadingLoopPage from "./pages/LoadingLoopPage";
import AdminPrototypePage from "./pages/AdminPrototypePage";
import { useAuth } from "./contexts/AuthContext";

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const configuredAdminHost = (import.meta.env.VITE_ADMIN_HOST || "").toLowerCase();

function isAdminHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (configuredAdminHost && host === configuredAdminHost) return true;
  return host.startsWith("admin.");
}

function AppRoutes() {
  const { isAuthenticated, openLoginModal, user } = useAuth();

  return (
    <Switch>
      {/* 首页 */}
      <Route path="/">
        <HomePage />
      </Route>

      {/* 工作台（项目列表） */}
      <Route path="/workspace">
        <AppShell>
          <WorkspaceDashboard />
        </AppShell>
      </Route>

      {/* 创作社区 */}
      <Route path="/community">
        <AppShell>
          <CommunityPage />
        </AppShell>
      </Route>

      {/* 设置 */}
      <Route path="/settings">
        <AppShell>
          <SettingsPage />
        </AppShell>
      </Route>

      {/* 个人主页 */}
      <Route path="/profile">
        <AppShell>
          <ProfilePage />
        </AppShell>
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
        <AppShell>
          <AssetsPage />
        </AppShell>
      </Route>

      {/* 帮助中心 */}
      <Route path="/help">
        <AppShell>
          <HelpPage />
        </AppShell>
      </Route>

      <Route path="/loading">
        <LoadingLoopPage />
      </Route>

      <Route path="/admin-prototype">
        {!isAdminHost() ? (
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
        {(params) => <Workspace projectId={params.id} />}
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminHostRequired() {
  const targetHost = configuredAdminHost || "admin.yourdomain.com";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-slate-100">
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
      </section>
    </main>
  );
}

function AdminForbidden({ username }: { username: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-slate-100">
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
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-slate-100">
      <section className="w-full max-w-[460px] rounded-md border border-white/10 bg-white/[0.035] p-6 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-md bg-cyan-300 text-slate-950">
          <span className="text-lg font-semibold">A</span>
        </div>
        <h1 className="text-xl font-semibold">需要登录后访问管理后台</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          管理后台包含支付、积分额度、用户反馈和风控信息，需要先确认当前账号身份。
        </p>
        <button
          type="button"
          onClick={onLogin}
          className="mt-5 h-10 rounded-md bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200"
        >
          登录并进入后台
        </button>
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
              <AppRoutes />
            </WouterRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
