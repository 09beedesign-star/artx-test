/**
 * ProjectHeader — Neo-Studio Dark Design System
 * Project title bar above the main canvas: project name, status, actions
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  MoreHorizontal, Share2, Download, Star, Clock,
  ChevronRight, Sparkles,
} from "lucide-react";
import { PROJECTS } from "@/lib/workspace-data";

interface ProjectHeaderProps {
  projectId: string;
}

export default function ProjectHeader({ projectId }: ProjectHeaderProps) {
  const project = PROJECTS.find((p) => p.id === projectId) || {
    id: projectId,
    title: "空白画布",
    updatedAt: "刚刚",
  };
  const [starred, setStarred] = useState(false);

  return (
    <div
      className="flex items-center gap-3 px-4 shrink-0"
      style={{
        height: 48,
        borderBottom: "1px solid oklch(1 0 0 / 6%)",
        background: "oklch(0.11 0.015 270 / 0.8)",
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px]">
        <span style={{ color: "oklch(0.45 0.01 270)" }}>我的项目</span>
        <ChevronRight size={11} style={{ color: "oklch(0.35 0.01 270)" }} />
        <span className="font-semibold" style={{ color: "oklch(0.85 0.01 270)" }}>{project.title}</span>
        {project.subtitle && (
          <>
            <ChevronRight size={11} style={{ color: "oklch(0.35 0.01 270)" }} />
            <span style={{ color: "oklch(0.52 0.01 270)" }}>{project.subtitle}</span>
          </>
        )}
      </div>

      {/* Status badge */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-full"
        style={{ background: "oklch(0.72 0.18 200 / 0.12)", border: "1px solid oklch(0.72 0.18 200 / 0.25)" }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
        <span className="text-[10px] font-medium" style={{ color: "oklch(0.72 0.18 200)" }}>进行中</span>
      </div>

      <div className="flex-1" />

      {/* Last updated */}
      <div className="flex items-center gap-1 text-[11px]" style={{ color: "oklch(0.42 0.01 270)" }}>
        <Clock size={11} />
        <span>更新于 {project.updatedAt}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setStarred(!starred)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
        >
          <Star
            size={14}
            style={{
              color: starred ? "oklch(0.78 0.18 60)" : "oklch(0.45 0.01 270)",
              fill: starred ? "oklch(0.78 0.18 60)" : "none",
            }}
          />
        </button>
        <button
          onClick={() => toast("分享项目", { description: "功能即将上线" })}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
        >
          <Share2 size={14} style={{ color: "oklch(0.45 0.01 270)" }} />
        </button>
        <button
          onClick={() => toast("导出资产", { description: "功能即将上线" })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 hover:bg-white/5"
          style={{ border: "1px solid oklch(1 0 0 / 10%)", color: "oklch(0.70 0.01 270)" }}
        >
          <Download size={12} />
          导出
        </button>
        <button
          onClick={() => toast("更多操作", { description: "功能即将上线" })}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
        >
          <MoreHorizontal size={14} style={{ color: "oklch(0.45 0.01 270)" }} />
        </button>
      </div>
    </div>
  );
}
