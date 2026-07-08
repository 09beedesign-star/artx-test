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
import { readWorkspaceProjectHistory, updateWorkspaceProjectHistory } from "@/lib/project-history";
import { toast } from "sonner";

function formatProjectTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ensureProjectMeta(projectId: string) {
  const historyProject = readWorkspaceProjectHistory().find(project => project.id === projectId);
  if (historyProject) return historyProject;
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const title = projectId === "__blank-workspace__" ? "新建画布" : `画布 ${projectId.slice(0, 8)}`;
  updateWorkspaceProjectHistory(projectId, {
    title,
    cover: null,
    updatedAt: timestamp,
    createdAt: timestamp,
    nodeCount: 0,
  });
  return readWorkspaceProjectHistory().find(project => project.id === projectId) || {
    id: projectId,
    title,
    cover: null,
    updatedAt: timestamp,
    createdAt: timestamp,
    nodeCount: 0,
  };
}

export default function Workspace({ projectId = "__blank-workspace__" }: { projectId?: string }) {
  const [activeProjectId] = useState(projectId);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [currentProject, setCurrentProject] = useState(() => ensureProjectMeta(activeProjectId));
  const projectCreatedAt = currentProject.createdAt || currentProject.updatedAt;

  const handleProjectTitleChange = (title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === currentProject.title) return;
    const updatedAt = formatProjectTimestamp();
    updateWorkspaceProjectHistory(activeProjectId, { title: nextTitle, updatedAt });
    setCurrentProject(project => ({ ...project, title: nextTitle, updatedAt }));
    toast("画布名称已更新");
  };

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
        <TopBar
          credits={0}
          projectTitle={currentProject.title}
          projectTime={projectCreatedAt}
          onProjectTitleChange={handleProjectTitleChange}
          glass
        />
      </div>

      {/* Full-width canvas */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1, background: "#222222" }}>
        <InfiniteCanvas projectId={activeProjectId} />
      </div>
    </div>
  );
}
