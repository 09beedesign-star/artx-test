/**
 * Workspace — Project Canvas Page
 * Design: artx DESIGN.md token system
 * Layout: InfiniteCanvas 满屏（2026-11-10 去掉顶部 bar，内容区从最顶端开始）
 * Note: 2026-11-13 起套在 AppShell 里（常驻左侧边栏，默认展开、可收起）。
 *       ⚠️ 这里必须是 h-full 而不是 h-screen：外层 AppShell 已经是 h-screen，
 *       再写 h-screen 会在 <main> 内撑出整屏高度，底部控件被裁掉。
 *
 * ⚠️ 顶栏去掉之后，画布标题的改名入口只剩工作台画板卡的「重命名」。
 *    这不是能力丢失，而是收敛到唯一出口：同一块画板的名字本来就有两个入口，
 *    在那条顶栏里双击改名会绕开工作台的列表刷新，反而不一致。
 */
import { useState } from "react";
import InfiniteCanvas from "@/components/canvas/InfiniteCanvas";
import { BG_GLOW } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";
import { readWorkspaceProjectHistory, updateWorkspaceProjectHistory } from "@/lib/project-history";

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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  /*
    进入画布即登记到工作台列表。
    ⚠️ 这一步原先靠顶栏渲染时顺带触发；顶栏去掉后必须自己调，
       否则新画布不会出现在「最近」里，而且零报错。
  */
  const [activeProjectId] = useState(() => {
    ensureProjectMeta(projectId);
    return projectId;
  });

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: "#0a0a0b",
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

      {/* Full-width canvas */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1, background: "#0a0a0b" }}>
        <InfiniteCanvas projectId={activeProjectId} />
      </div>
    </div>
  );
}
