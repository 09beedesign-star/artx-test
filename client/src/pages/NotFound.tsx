import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const panelBg = isDark ? "oklch(0.13 0.012 270 / 0.92)" : "oklch(1 0 0 / 0.86)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "var(--hairline)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.69 0.010 270)" : "oklch(0.65 0.010 255)";

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6"
      style={{ background: bg, transition: "background 0.25s ease" }}
    >
      <div
        className="w-full max-w-xl text-center overflow-hidden"
        style={{
          background: panelBg,
          border: `1px solid ${border}`,
          borderRadius: "var(--radius-xl-design)",
          boxShadow: isDark
            ? "0 28px 80px rgba(0,0,0,0.45)"
            : "0 24px 64px rgba(31,29,61,0.10)",
          backdropFilter: "blur(20px)",
          padding: "var(--space-xxl)",
        }}
      >
        <div className="flex justify-center mb-6">
          <div
            className="relative w-16 h-16 rounded-[var(--radius-pill)] flex items-center justify-center"
            style={{
              background: isDark ? "oklch(0.62 0.22 290 / 0.16)" : "var(--block-lilac)",
              color: isDark ? "oklch(0.72 0.22 290)" : "var(--block-navy)",
            }}
          >
            <div
              className="absolute inset-0 rounded-[var(--radius-pill)] animate-pulse"
              style={{ background: "oklch(0.72 0.22 290 / 0.12)" }}
            />
            <AlertCircle className="relative h-8 w-8" />
          </div>
        </div>

        <p className="type-caption mb-3" style={{ color: "var(--accent-magenta)" }}>
          PAGE NOT FOUND
        </p>
        <h1 className="type-display-lg mb-3" style={{ color: text }}>
          404
        </h1>
        <h2 className="type-headline mb-4" style={{ color: text }}>
          页面不存在
        </h2>
        <p className="type-body-sm mx-auto mb-8" style={{ color: sub, maxWidth: 420 }}>
          你访问的页面可能已被移动、删除，或暂时无法打开。返回首页后可以继续浏览 artx 工作区。
        </p>

        <div className="flex justify-center">
          <Button
            onClick={() => setLocation("/")}
            className="type-caption h-11 px-5 rounded-[var(--radius-pill)] border-0 transition-all duration-200 hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, oklch(0.55 0.22 290), oklch(0.50 0.20 260))",
              color: "white",
              boxShadow: "0 10px 28px oklch(0.55 0.22 290 / 0.30)",
            }}
          >
            <Home className="w-4 h-4 mr-2" />
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
