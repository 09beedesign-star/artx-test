/**
 * Workspace — Project Canvas Page
 * Design: Neo-Studio Dark
 * Layout: TopBar + LeftPanel (layers) + InfiniteCanvas
 * Note: No AppShell sidebar here — canvas has its own back button
 */
import { useState } from "react";
import TopBar from "@/components/workspace/TopBar";
import InfiniteCanvas from "@/components/canvas/InfiniteCanvas";
import RightPanel from "@/components/workspace/RightPanel";
import { BG_GLOW } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

export default function Workspace({ projectId = "p1" }: { projectId?: string }) {
  const [activeProjectId] = useState(projectId);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: isDark ? "oklch(0.09 0.012 270)" : "oklch(0.94 0.006 270)",
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
        <TopBar credits={75} />
      </div>

      {/* Two-column workspace: LeftPanel (layers) + Canvas */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <RightPanel />
        <InfiniteCanvas projectId={activeProjectId} />
      </div>
    </div>
  );
}
