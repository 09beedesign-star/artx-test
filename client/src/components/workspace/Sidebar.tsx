/**
 * Sidebar — Neo-Studio Dark Design System
 * Left navigation panel: 220px fixed, brand logo, nav items, project list, bottom actions
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Home, FolderOpen, Image, Palette, LayoutTemplate,
  History, Settings, HelpCircle, Zap, ChevronDown,
  Plus, Sparkles, ChevronRight, Gift,
} from "lucide-react";
import { PROJECTS, NAV_ITEMS } from "@/lib/workspace-data";
import type { Project } from "@/lib/workspace-data";
import { useAuth } from "@/contexts/AuthContext";
import InviteDialog from "./InviteDialog";

interface SidebarProps {
  activeProjectId: string;
  onProjectSelect: (id: string) => void;
  activeNav: string;
  onNavSelect: (id: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Home, FolderOpen, Image, Palette, LayoutTemplate, History, Settings, HelpCircle, Zap, Gift,
};

export default function Sidebar({ activeProjectId, onProjectSelect, activeNav, onNavSelect }: SidebarProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { user } = useAuth();
  const displayName = user?.username || "用户名";
  const avatarLetter = displayName.trim().slice(0, 1).toUpperCase() || "U";

  const handleNavClick = (id: string) => {
    if (id === "invite") {
      setInviteOpen(true);
      return;
    }
    if (id !== "projects" && id !== "home" && id !== "templates" && id !== "community") {
      toast("功能即将上线", { description: "该功能正在开发中,敬请期待。" });
      return;
    }
    onNavSelect(id);
  };

  return (
    <aside
      className="flex flex-col h-full w-[220px] shrink-0"
      style={{ background: "#222222", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* 顶部导航区 - 三段式第一段 */}
      <div className="shrink-0 px-2 pt-3 pb-2 space-y-1">
        <button
          onClick={() => handleNavClick("home")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-pill)] text-sm transition-all duration-200 text-left group hover:scale-[1.02] active:scale-98"
          style={{
            background: activeNav === "home" ? "#161616" : "transparent",
            color: activeNav === "home" ? "white" : "#bbbbbb",
            boxShadow: activeNav === "home" ? "0px 2px 8px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <Plus size={15} className="shrink-0" />
          <span className="flex-1 font-medium text-[13px]">新创作</span>
        </button>
        <button
          onClick={() => handleNavClick("templates")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-pill)] text-sm transition-all duration-200 text-left group hover:scale-[1.02] active:scale-98"
          style={{
            background: activeNav === "templates" ? "rgba(255,255,255,0.08)" : "transparent",
            color: activeNav === "templates" ? "white" : "#bbbbbb",
          }}
        >
          <LayoutTemplate size={15} className="shrink-0" />
          <span className="flex-1 font-medium text-[13px]">创作模板</span>
        </button>
        <button
          onClick={() => handleNavClick("community")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-pill)] text-sm transition-all duration-200 text-left group hover:scale-[1.02] active:scale-98"
          style={{
            background: activeNav === "community" ? "rgba(255,255,255,0.08)" : "transparent",
            color: activeNav === "community" ? "white" : "#bbbbbb",
          }}
        >
          <Sparkles size={15} className="shrink-0" />
          <span className="flex-1 font-medium text-[13px]">画布社区</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 shrink-0" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* 中部项目列表区 - 三段式第二段(可滚动) */}
      <div className="flex-1 overflow-hidden flex flex-col px-2 min-h-0">
        <div
          role="button"
          onClick={() => setProjectsExpanded(!projectsExpanded)}
          className="flex items-center gap-1.5 px-2 py-1.5 w-full text-left mb-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer shrink-0"
        >
          <ChevronDown
            size={13}
            className="transition-transform duration-200"
            style={{
              color: "#aaaaaa",
              transform: projectsExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#aaaaaa" }}>
            最近项目
          </span>
          <div
            role="button"
            onClick={(e) => { e.stopPropagation(); toast("新建项目", { description: "功能即将上线" }); }}
            className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Plus size={12} style={{ color: "#aaaaaa" }} />
          </div>
        </div>

        {projectsExpanded && (
          <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
            {PROJECTS.map((project, i) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                onSelect={onProjectSelect}
                delay={i * 40}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部固定区 - 三段式第三段 */}
      <div className="px-2 pb-3 space-y-1 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
        {/* 最近 */}
        <button
          onClick={() => handleNavClick("history")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 group hover:bg-white/5"
          style={{ color: "#bbbbbb" }}
        >
          <History size={14} className="shrink-0" />
          <span className="text-[13px] font-medium">最近</span>
        </button>

        {/* 订阅 */}
        <button
          onClick={() => toast("升级计划", { description: "功能即将上线" })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 group"
          style={{ background: "linear-gradient(135deg, rgba(22,22,22,0.15), #aaaaaa)", border: "1px solid rgba(22,22,22,0.3)" }}
        >
          <Zap size={14} style={{ color: "#161616" }} />
          <span className="text-[13px] font-medium" style={{ color: "#161616" }}>升级到 Pro</span>
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #161616, #333333)", color: "white" }}
          >
            {avatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-white truncate">{displayName}</div>
            <div className="text-[11px]" style={{ color: "#aaaaaa" }}>免费版 · 0 积分</div>
          </div>
          <ChevronRight size={12} style={{ color: "#aaaaaa" }} />
        </div>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </aside>
  );
}

function ProjectItem({ project, isActive, onSelect, delay }: {
  project: Project;
  isActive: boolean;
  onSelect: (id: string) => void;
  delay: number;
}) {
  return (
    <button
      onClick={() => onSelect(project.id)}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all duration-150 animate-fade-up group",
        isActive ? "text-white" : "text-[#bbbbbb] hover:text-white hover:bg-white/5"
      )}
      style={{
        animationDelay: `${delay}ms`,
        background: isActive ? "rgba(255,255,255,0.07)" : undefined,
        borderLeft: isActive ? "2px solid #aaaaaa" : "2px solid transparent",
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: isActive ? "#aaaaaa" : "#555555" }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate">{project.title}</div>
        <div className="text-[10px] truncate" style={{ color: "#aaaaaa" }}>{project.updatedAt}</div>
      </div>
    </button>
  );
}
