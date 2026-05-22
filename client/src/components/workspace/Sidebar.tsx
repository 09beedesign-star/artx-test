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
  Plus, Search, Sparkles, ChevronRight,
} from "lucide-react";
import { PROJECTS, NAV_ITEMS } from "@/lib/workspace-data";
import type { Project } from "@/lib/workspace-data";

interface SidebarProps {
  activeProjectId: string;
  onProjectSelect: (id: string) => void;
  activeNav: string;
  onNavSelect: (id: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Home, FolderOpen, Image, Palette, LayoutTemplate, History, Settings, HelpCircle, Zap,
};

export default function Sidebar({ activeProjectId, onProjectSelect, activeNav, onNavSelect }: SidebarProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  const handleNavClick = (id: string) => {
    if (id !== "projects" && id !== "home") {
      toast("功能即将上线", { description: "该功能正在开发中，敬请期待。" });
      return;
    }
    onNavSelect(id);
  };

  return (
    <aside
      className="flex flex-col h-full w-[220px] shrink-0"
      style={{ background: "oklch(0.12 0.016 270)", borderRight: "1px solid oklch(1 0 0 / 6%)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}
        >
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="font-bold text-[15px] tracking-tight text-white">Lovart AI</span>
      </div>

      {/* Search */}
      <div className="px-3 pb-3 shrink-0">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ background: "oklch(1 0 0 / 5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
        >
          <Search size={13} className="shrink-0" style={{ color: "oklch(0.55 0.01 270)" }} />
          <span style={{ color: "oklch(0.50 0.01 270)", fontSize: 13 }}>搜索项目…</span>
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "oklch(1 0 0 / 8%)", color: "oklch(0.50 0.01 270)", fontFamily: "monospace" }}
          >⌘K</span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="px-2 space-y-0.5 shrink-0">
        {NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon] || Home;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left group",
                isActive
                  ? "text-white"
                  : "text-[oklch(0.58_0.012_270)] hover:text-white"
              )}
              style={isActive ? {
                background: "oklch(1 0 0 / 8%)",
                borderLeft: "2.5px solid oklch(0.58 0.22 290)",
              } : {
                borderLeft: "2.5px solid transparent",
              }}
            >
              <Icon size={15} className="shrink-0" />
              <span className="flex-1 font-medium text-[13px]">{item.label}</span>
              {item.badge && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: "oklch(0.58 0.22 290 / 0.25)", color: "oklch(0.78 0.18 290)" }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-3 shrink-0" style={{ height: 1, background: "oklch(1 0 0 / 6%)" }} />

      {/* Recent Projects */}
      <div className="flex-1 overflow-hidden flex flex-col px-2">
        <button
          onClick={() => setProjectsExpanded(!projectsExpanded)}
          className="flex items-center gap-1.5 px-2 py-1.5 w-full text-left mb-1 rounded-md hover:bg-white/5 transition-colors"
        >
          <ChevronDown
            size={13}
            className="transition-transform duration-200"
            style={{
              color: "oklch(0.50 0.01 270)",
              transform: projectsExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.45 0.01 270)" }}>
            最近项目
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); toast("新建项目", { description: "功能即将上线" }); }}
            className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <Plus size={12} style={{ color: "oklch(0.50 0.01 270)" }} />
          </button>
        </button>

        {projectsExpanded && (
          <div className="flex-1 overflow-y-auto space-y-0.5">
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

      {/* Bottom actions */}
      <div className="px-2 pb-3 space-y-0.5 shrink-0" style={{ borderTop: "1px solid oklch(1 0 0 / 6%)", paddingTop: 12 }}>
        {/* Upgrade CTA */}
        <button
          onClick={() => toast("升级计划", { description: "功能即将上线" })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 group"
          style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.15), oklch(0.72 0.18 200 / 0.15))", border: "1px solid oklch(0.58 0.22 290 / 0.3)" }}
        >
          <Zap size={14} style={{ color: "oklch(0.78 0.18 290)" }} />
          <span className="text-[13px] font-medium" style={{ color: "oklch(0.78 0.18 290)" }}>升级到 Pro</span>
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}
          >
            U
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-white truncate">用户名</div>
            <div className="text-[11px]" style={{ color: "oklch(0.50 0.01 270)" }}>免费版 · 75 积分</div>
          </div>
          <ChevronRight size={12} style={{ color: "oklch(0.45 0.01 270)" }} />
        </div>
      </div>
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
        isActive ? "text-white" : "text-[oklch(0.55_0.01_270)] hover:text-white hover:bg-white/5"
      )}
      style={{
        animationDelay: `${delay}ms`,
        background: isActive ? "oklch(1 0 0 / 7%)" : undefined,
        borderLeft: isActive ? "2px solid oklch(0.58 0.22 290)" : "2px solid transparent",
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: isActive ? "oklch(0.58 0.22 290)" : "oklch(0.35 0.01 270)" }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate">{project.title}</div>
        <div className="text-[10px] truncate" style={{ color: "oklch(0.42 0.01 270)" }}>{project.updatedAt}</div>
      </div>
    </button>
  );
}
