/**
 * Workspace — Neo-Studio Dark Design System
 * Main workspace page: three-column layout (Sidebar + MainCanvas + RightPanel)
 * Philosophy: Deep blue-purple dark, purple→cyan gradient brand, creative studio atmosphere
 */
import { useState } from "react";
import TopBar from "@/components/workspace/TopBar";
import Sidebar from "@/components/workspace/Sidebar";
import MainCanvas from "@/components/workspace/MainCanvas";
import RightPanel from "@/components/workspace/RightPanel";
import { BG_GLOW } from "@/lib/workspace-data";

export default function Workspace() {
  const [activeProjectId, setActiveProjectId] = useState("p1");
  const [activeNav, setActiveNav] = useState("projects");

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "oklch(0.10 0.015 270)", position: "relative" }}
    >
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${BG_GLOW})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.22,
          zIndex: 0,
        }}
      />

      {/* Top bar */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={75} />
      </div>

      {/* Three-column workspace */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <Sidebar
          activeProjectId={activeProjectId}
          onProjectSelect={setActiveProjectId}
          activeNav={activeNav}
          onNavSelect={setActiveNav}
        />
        <MainCanvas projectId={activeProjectId} />
        <RightPanel />
      </div>
    </div>
  );
}
