/**
 * Workspace — Project Canvas Page
 * Design: artx DESIGN.md token system
 * Layout: TopBar + InfiniteCanvas (full width, no side panel)
 * Note: No AppShell sidebar here — canvas has its own back button
 */
import { useState } from "react";
import TopBar from "@/components/workspace/TopBar";
import InfiniteCanvas from "@/components/canvas/InfiniteCanvas";
import { BG_GLOW } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";
import { readWorkspaceProjectHistory } from "@/lib/project-history";

export default function Workspace({ projectId = "" }: { projectId?: string }) {
  const [activeProjectId] = useState(projectId);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isRealProject = activeProjectId.startsWith("canvas-");
  const canvasProjectId = isRealProject ? activeProjectId : "__blank-workspace__";
  const historyProject = isRealProject ? readWorkspaceProjectHistory().find(project => project.id === activeProjectId) : undefined;
  const currentProject = historyProject || {
    id: activeProjectId,
    title: "空白画布",
    updatedAt: "",
    createdAt: "",
  };
  const projectCreatedAt = currentProject.createdAt || currentProject.updatedAt;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)",
        position: "relative",
        transition: "background 0.25s ease",
      }}
    >
      {/* Ambient background glow — only in dark mode */}
      {isDark && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${BG_GLOW})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.15,
            zIndex: 0,
          }}
        />
      )}

      {/* Top bar */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} projectTitle={currentProject.title} projectTime={projectCreatedAt} />
      </div>

      {/* Full-width canvas */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <InfiniteCanvas projectId={canvasProjectId} />
      </div>
    </div>
  );
}
