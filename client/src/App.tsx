import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppShell from "./components/layout/AppShell";
import HomePage from "./pages/HomePage";
import WorkspaceDashboard from "./pages/WorkspaceDashboard";
import CommunityPage from "./pages/CommunityPage";
import Workspace from "./pages/Workspace";
import PasswordGate, { usePasswordGate } from "./pages/PasswordGate";

function Router() {
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

      {/* 项目画布（无 AppShell 侧边栏，画布自带返回按钮） */}
      <Route path="/project/:id">
        {(params) => <Workspace projectId={params.id} />}
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppWithGate() {
  const { granted, grant } = usePasswordGate();

  return (
    <>
      {!granted && <PasswordGate onGranted={grant} />}
      {granted && <Router />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <AppWithGate />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
