/**
 * Workspace — Project Canvas Page
 * Design: artx DESIGN.md token system
 * Layout: TopBar + InfiniteCanvas (full width, no side panel)
 * Note: No AppShell sidebar here — canvas has its own back button
 */
import { useState } from "react";
import TopBar from "@/components/workspace/TopBar";
import InfiniteCanvas from "@/components/canvas/InfiniteCanvas";
import { BG_GLOW, PROJECTS } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";
import { readWorkspaceProjectHistory } from "@/lib/project-history";

export default function Workspace({ projectId = "p1" }: { projectId?: string }) {
  const [activeProjectId] = useState(projectId);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const historyProject = readWorkspaceProjectHistory().find(project => project.id === activeProjectId);
  const currentProject = historyProject || PROJECTS.find(project => project.id === activeProjectId) || PROJECTS[0];
  const currentProjectMeta = currentProject as typeof currentProject & { createdAt?: string };
  const projectCreatedAt = currentProjectMeta.createdAt || currentProject.updatedAt;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: "#222222",
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
            opacity: 0,
            zIndex: 0,
          }}
        />
      )}

      {/* Top bar */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} projectTitle={currentProject.title} projectTime={projectCreatedAt} glass />
      </div>

      {/* Full-width canvas */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1, background: "#222222" }}>
        <InfiniteCanvas projectId={activeProjectId} />
      </div>
    </div>
  );
}
