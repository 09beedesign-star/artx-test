import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const NEGATIVE_TOAST_PATTERN =
  /失败|错误|异常|无法|不可用|失效|无效|超时|过期|未读取到|不能|连接中断|请稍后重试|failed|failure|error|unable|unavailable|invalid|expired|timeout|cannot|can't|disconnected/i;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateToastOverflow = () => {
      document.querySelectorAll<HTMLElement>("[data-sonner-toast]").forEach((toast) => {
        const content = toast.querySelector<HTMLElement>("[data-content]");
        if (!content) return;

        const title = toast.querySelector<HTMLElement>("[data-title]");
        const description = toast.querySelector<HTMLElement>("[data-description]");
        const text = [title?.innerText, description?.innerText]
          .filter(Boolean)
          .join(" ");
        const type = toast.getAttribute("data-type") || "";
        const isNegative = type === "error" || NEGATIVE_TOAST_PATTERN.test(text);
        const computed = window.getComputedStyle(content);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) {
          context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
        }
        const textWidth = context?.measureText(text).width || content.scrollWidth;
        const isOverflowing =
          textWidth > content.clientWidth + 1 ||
          content.scrollHeight > content.clientHeight + 1;
        toast.dataset.artxOverflow = isOverflowing ? "true" : "false";
        toast.dataset.artxExpanded = "false";
        toast.dataset.artxNegative = isNegative ? "true" : "false";
        toast.querySelectorAll("[data-artx-toast-expand]").forEach((button) => {
          button.remove();
        });
      });
    };

    const observer = new MutationObserver(updateToastOverflow);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const interval = window.setInterval(updateToastOverflow, 300);
    updateToastOverflow();

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      offset={{ bottom: 32 }}
      mobileOffset={{ bottom: 32 }}
      visibleToasts={1}
      gap={0}
      className="toaster group"
      style={
        {
          "--width": "min(360px, calc(100vw - 32px))",
          "--normal-bg": "rgba(0,0,0,0.60)",
          "--normal-text": "rgba(255,255,255,0.92)",
          "--normal-border": "rgba(255,255,255,0.10)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
