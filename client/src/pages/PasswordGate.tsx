import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

const CORRECT_PASSWORD = "bkeel";
const STORAGE_KEY = "tapnow_access_granted";

export function usePasswordGate() {
  const [granted, setGranted] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const grant = () => {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setGranted(true);
  };

  return { granted, grant };
}

export default function PasswordGate({ onGranted }: { onGranted: () => void }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    setTimeout(() => inputRef.current?.focus(), 300);
    return () => cancelAnimationFrame(t);
  }, []);

  const handleSubmit = () => {
    if (value === CORRECT_PASSWORD) {
      setError(false);
      onGranted();
    } else {
      setError(true);
      setShake(true);
      setValue("");
      setTimeout(() => setShake(false), 500);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const bg = isDark ? "#0d0d14" : "#F5F5F5";
  const cardBg = isDark ? "rgba(22,22,32,0.92)" : "rgba(255,255,255,0.92)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.88)";
  const subtext = isDark ? "rgba(255,255,255,0.38)" : "rgba(20,20,36,0.38)";
  const inputBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const inputBorder = error
    ? "oklch(0.60 0.22 25)"
    : isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}
    >
      {/* Subtle radial glow */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: isDark
          ? "radial-gradient(ellipse 60% 40% at 50% 45%, oklch(0.28 0.08 290 / 0.18) 0%, transparent 70%)"
          : "radial-gradient(ellipse 60% 40% at 50% 45%, oklch(0.82 0.06 290 / 0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div
        style={{
          width: 380,
          background: cardBg,
          border: `1px solid ${border}`,
          borderRadius: 20,
          backdropFilter: "blur(24px)",
          boxShadow: isDark
            ? "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)"
            : "0 24px 80px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "36px 32px 32px",
          transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
          transition: "transform 0.45s cubic-bezier(0.23,1,0.32,1), opacity 0.4s ease",
          animation: shake ? "shake 0.45s cubic-bezier(0.36,0.07,0.19,0.97)" : "none",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, transform: "scale(0.7)", transformOrigin: "left center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: text, letterSpacing: "-0.01em" }}>
            artx
          </span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: text, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          输入访问密码
        </h2>
        <p style={{ fontSize: 13, color: subtext, margin: "0 0 24px", lineHeight: 1.5 }}>
          此内容仅对受邀用户开放，请输入密码继续
        </p>

        {/* Password input */}
        <div style={{ marginBottom: 12 }}>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={e => { setValue(e.target.value); setError(false); }}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="请输入密码"
            style={{
              width: "100%",
              padding: "11px 14px",
              background: inputBg,
              border: `1.5px solid ${inputBorder}`,
              borderRadius: 10,
              fontSize: 14,
              color: text,
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s ease",
              fontFamily: "inherit",
            }}
          />
          {error && (
            <p style={{ fontSize: 12, color: "oklch(0.60 0.22 25)", margin: "6px 0 0 2px" }}>
              密码错误，请重试
            </p>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          style={{
            width: "100%",
            padding: "11px 0",
            background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.68 0.18 220))",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: "white",
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: "opacity 0.15s ease, transform 0.15s ease",
            fontFamily: "inherit",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          onMouseDown={e => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          进入体验
        </button>
      </div>

      <style>{`
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-6px); }
          40%, 60% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
