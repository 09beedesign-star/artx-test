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

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppRoutes() {
  return (
    <Switch>
      {/* 首页 */}
      <Route path="/">
        <AppShell>
          <HomePage />
        </AppShell>
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

      {/* 项目画布（无 AppShell 侧边栏，画布自带返回按钮） */}
      <Route path="/project/:id">
        {(params) => <Workspace projectId={params.id} />}
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
