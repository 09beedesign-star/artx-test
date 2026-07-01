import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateToastOverflow = () => {
      document.querySelectorAll<HTMLElement>("[data-sonner-toast]").forEach((toast) => {
        const content = toast.querySelector<HTMLElement>("[data-content]");
        if (!content) return;

        const isOverflowing = content.scrollWidth > content.clientWidth + 1 || content.scrollHeight > content.clientHeight + 1;
        toast.dataset.artxOverflow = isOverflowing ? "true" : "false";

        if (!isOverflowing || toast.querySelector("[data-artx-toast-expand]")) return;

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.artxToastExpand = "true";
        button.setAttribute("aria-label", "展开提示");
        button.title = "展开提示";
        button.textContent = "展开";
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const expanded = toast.dataset.artxExpanded === "true";
          toast.dataset.artxExpanded = expanded ? "false" : "true";
          button.textContent = expanded ? "展开" : "收起";
          button.setAttribute("aria-label", expanded ? "展开提示" : "收起提示");
          button.title = expanded ? "展开提示" : "收起提示";
        });
        toast.appendChild(button);
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
          "--width": "300px",
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
