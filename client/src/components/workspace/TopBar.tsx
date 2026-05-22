/**
 * TopBar — Neo-Studio Dark Design System
 * Global top navigation: logo area, search, credits, user info
 */
import { Search, Bell, ChevronDown, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";

interface TopBarProps {
  credits?: number;
}

export default function TopBar({ credits = 75 }: TopBarProps) {
  return (
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{
        height: 52,
        background: "oklch(0.11 0.015 270)",
        borderBottom: "1px solid oklch(1 0 0 / 6%)",
        zIndex: 10,
      }}
    >
      {/* Search bar */}
      <div
        className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{ background: "oklch(1 0 0 / 5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
      >
        <Search size={13} style={{ color: "oklch(0.50 0.01 270)" }} />
        <input
          type="text"
          placeholder="搜索项目、素材或命令…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "oklch(0.75 0.01 270)", fontSize: 13 }}
          onFocus={() => {}}
        />
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: "oklch(1 0 0 / 8%)", color: "oklch(0.45 0.01 270)", fontFamily: "monospace" }}
        >
          ⌘K
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* New project button */}
      <button
        onClick={() => toast("新建项目", { description: "功能即将上线" })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
        style={{
          background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
          color: "white",
          fontSize: 13,
        }}
      >
        <Plus size={13} />
        新建项目
      </button>

      {/* Credits */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => toast("积分详情", { description: "功能即将上线" })}
      >
        <Sparkles size={13} style={{ color: "oklch(0.78 0.18 290)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "oklch(0.85 0.01 270)" }}>
          {credits}
        </span>
        <span className="text-[11px]" style={{ color: "oklch(0.50 0.01 270)" }}>积分</span>
      </div>

      {/* Bell */}
      <button
        onClick={() => toast("通知", { description: "暂无新通知" })}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors relative"
      >
        <Bell size={15} style={{ color: "oklch(0.60 0.01 270)" }} />
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ background: "oklch(0.58 0.22 290)" }}
        />
      </button>

      {/* User */}
      <button
        onClick={() => toast("用户设置", { description: "功能即将上线" })}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
          style={{
            background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
            color: "white",
          }}
        >
          U
        </div>
        <span className="text-[13px] font-medium" style={{ color: "oklch(0.80 0.01 270)" }}>
          用户名
        </span>
        <ChevronDown size={12} style={{ color: "oklch(0.45 0.01 270)" }} />
      </button>
    </header>
  );
}
