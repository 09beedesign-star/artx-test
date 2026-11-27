/**
 * MessageDialog — 大型弹窗显示完整的站内消息
 * - 全屏/大型模态对话框
 * - 显示消息完整内容
 * - 支持关闭和导航
 */
import { X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface Announcement {
  id: string;
  title: string;
  content: string;
  status: "active" | "archived";
  createdAt: string;
  createdByUsername: string;
}

interface MessageDialogProps {
  open: boolean;
  announcement: Announcement | null;
  onOpenChange: (open: boolean) => void;
}

export default function MessageDialog({ open, announcement, onOpenChange }: MessageDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (!open || !announcement) {
    return null;
  }

  const textPrimary = isDark ? "#f1f1f3" : "#262627";
  const textSecondary = isDark ? "#99999e" : "#777472";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 10001, background: "rgba(0,0,0,0.20)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        data-artx-dialog-surface
        className="w-[min(680px,calc(100vw-32px))] max-h-[calc(100vh-48px)] overflow-y-auto rounded-[var(--radius-xl-design)] p-6 shadow-2xl"
        style={{
          background: isDark ? "rgba(22,22,30,0.98)" : "rgba(255,255,255,0.98)",
          border: `1px solid ${border}`,
          backdropFilter: "blur(18px)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-dialog-title"
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              id="message-dialog-title"
              className="text-[24px] font-bold"
              style={{ color: textPrimary, wordBreak: "break-word" }}
            >
              {announcement.title}
            </h2>
            <div
              className="mt-2 flex gap-4 text-[12px]"
              style={{ color: textSecondary }}
            >
              <span>发布时间：{new Date(announcement.createdAt).toLocaleString("zh-CN")}</span>
              <span>发布人：{announcement.createdByUsername}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-80"
            style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: textPrimary }}
            aria-label="关闭消息弹窗"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Divider */}
        <div
          className="mb-6"
          style={{ height: "1px", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)" }}
        />

        {/* Content */}
        <div
          className="prose prose-sm"
          style={{
            color: textSecondary,
            fontSize: "14px",
            lineHeight: "1.8",
            "--tw-prose-body": textSecondary,
          } as any}
        >
          {/* 支持简单 markdown：换行符、加粗、链接等 */}
          {announcement.content.split("\n").map((line, idx) => (
            <p key={idx} style={{ marginBottom: "12px", color: textSecondary }}>
              {line || "\u00A0"}{/* 空行用不可见空格占位 */}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div
          className="mt-8 border-t pt-4 flex justify-end gap-3"
          style={{ borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md-design)] px-4 transition-opacity hover:opacity-80"
            style={{
              background: "#161616",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 560,
            }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
