import { useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { PRIVACY_POLICY, USER_AGREEMENT, type PolicyDocument } from "@shared/policy-documents";

/**
 * /agreement（用户协议）与 /privacy（隐私政策）独立页面。
 * 正文来自 shared/policy-documents.ts（逐字移植自 sparkx.zone），排版走 ArtX 自己的风格。
 * 刻意不套 RequireLogin / AppShell：登录弹窗里的链接以新标签页打开，未登录也必须能看。
 */
export default function PolicyPage({ kind }: { kind: "agreement" | "privacy" }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const doc: PolicyDocument = kind === "agreement" ? USER_AGREEMENT : PRIVACY_POLICY;

  useEffect(() => {
    const previous = document.title;
    document.title = doc.title;
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

  // 隐私政策开头的目录行（「一、定义；」）以分号结尾，不当标题渲染。
  const isHeading = (line: string) => /^[一二三四五六七八九十]+、/.test(line) && !/[；;]$/.test(line);
  const isMeta = (line: string) => /^(制定时间|生效时间)：/.test(line);

  return (
    <div className={`min-h-screen overflow-y-auto ${isDark ? "bg-[#1a1a1a] text-white/85" : "bg-[#f7f7f5] text-black/80"}`}>
      <div className="mx-auto max-w-[860px] px-6 py-12 sm:py-16">
        <a href="/" className="text-[13px] font-medium text-[#936CFF] hover:opacity-80">← 返回 ArtX Studio</a>
        <article
          className={`mt-6 rounded-[20px] border p-8 sm:p-12 ${
            isDark ? "border-[#454545] bg-[#222222]" : "border-black/10 bg-white"
          }`}
        >
          <h1 className={`text-[28px] font-bold leading-tight ${isDark ? "text-white" : "text-black/90"}`}>{doc.title}</h1>
          <div className="mt-6 space-y-3 text-[14px] leading-[1.9]">
            {doc.lines.map((line, index) =>
              isHeading(line) ? (
                <h2 key={index} className={`pt-5 text-[17px] font-semibold ${isDark ? "text-white" : "text-black/90"}`}>{line}</h2>
              ) : isMeta(line) ? (
                <p key={index} className={isDark ? "text-white/55" : "text-black/50"}>{line}</p>
              ) : (
                <p key={index}>{line}</p>
              ),
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
