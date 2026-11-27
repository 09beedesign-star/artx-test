/**
 * MessageBoard — 侧边栏消息板，显示站内公告和消息提示
 * - 展示最近的活跃公告
 * - 未读时显示红点
 * - 点击打开大型消息弹窗
 */
import { useEffect, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Announcement {
  id: string;
  title: string;
  content: string;
  status: "active" | "archived";
  createdAt: string;
  createdByUsername: string;
}

interface MessageBoardProps {
  onOpenDialog?: (announcement: Announcement) => void;
}

export default function MessageBoard({ onOpenDialog }: MessageBoardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/community/announcements");
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.announcements)) {
        setAnnouncements(data.announcements);
        // 标记为已读（实际项目中应持久化）
        sessionStorage.setItem("artx:announcement-read-at", new Date().toISOString());
        setHasUnread(false);
      }
    } catch (err) {
      console.error("获取公告失败:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();

    // 定期检查新公告（每 30 秒）
    const interval = setInterval(fetchAnnouncements, 30_000);
    return () => clearInterval(interval);
  }, []);

  // 检查未读
  useEffect(() => {
    if (announcements.length === 0) return;

    const readAt = sessionStorage.getItem("artx:announcement-read-at");
    if (!readAt) {
      setHasUnread(true);
      return;
    }

    const hasNewAnnouncements = announcements.some(
      (a) => new Date(a.createdAt).getTime() > new Date(readAt).getTime()
    );
    setHasUnread(hasNewAnnouncements);
  }, [announcements]);

  const textPrimary = isDark ? "#f1f1f3" : "#262627";
  const textSecondary = isDark ? "#99999e" : "#777472";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.05)";
  const badgeBg = "#e53e3e"; // 红色通知点

  const handleMessageClick = (announcement: Announcement) => {
    if (onOpenDialog) {
      onOpenDialog(announcement);
    }
  };

  if (announcements.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-2 rounded-lg px-2.5 py-1.5 transition-all"
      style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(22,22,22,0.035)" }}
    >
      {/* Header with bell icon and unread badge */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 transition-all"
        style={{ color: textSecondary }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = hoverBg)}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      >
        <div className="relative flex-shrink-0">
          <Bell size={16} strokeWidth={1.5} />
          {hasUnread && (
            <div
              className="absolute right-0 top-0 h-2 w-2 rounded-full"
              style={{ background: badgeBg }}
              aria-label="有新消息"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div style={{ fontSize: 12.5, fontWeight: 520, color: textPrimary }}>站内消息</div>
          <div style={{ fontSize: 10.5, color: textSecondary }}>
            {announcements.length} 条消息
          </div>
        </div>
        <ChevronRight
          size={13}
          strokeWidth={1.6}
          style={{
            flexShrink: 0,
            opacity: 0.55,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {/* Expandable list */}
      {expanded && (
        <div className="mt-2 space-y-1 pl-1.5">
          {announcements.slice(0, 5).map((announcement) => (
            <button
              key={announcement.id}
              type="button"
              onClick={() => handleMessageClick(announcement)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-all"
              style={{ background: hoverBg }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = isDark
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(22,22,22,0.10)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = hoverBg)
              }
            >
              <div className="min-w-0 flex-1">
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 520,
                    color: textPrimary,
                    marginBottom: "2px",
                  }}
                  className="line-clamp-1"
                >
                  {announcement.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: textSecondary,
                    lineHeight: 1.4,
                  }}
                  className="line-clamp-2"
                >
                  {announcement.content}
                </div>
                <div style={{ fontSize: 9, color: textSecondary, marginTop: "4px" }}>
                  {new Date(announcement.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
            </button>
          ))}
          {announcements.length > 5 && (
            <div style={{ fontSize: 10.5, color: textSecondary, padding: "8px 8px", textAlign: "center" }}>
              还有 {announcements.length - 5} 条消息
            </div>
          )}
        </div>
      )}
    </div>
  );
}
