import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

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
          "--width": "fit-content",
          "--max-width": "600px",
          "--normal-bg": "rgba(0,0,0,0.60)",
          "--normal-text": "rgba(255,255,255,0.52)",
          "--normal-border": "rgba(255,255,255,0.10)",
          fontSize: "6px",
          lineHeight: "1.2",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!w-fit !max-w-[600px] !min-w-0 !px-3 !py-2",
          title: "!text-[6px] !leading-[1.2] !text-[rgba(255,255,255,0.52)] !font-normal",
          description: "!text-[6px] !leading-[1.2] !text-[rgba(255,255,255,0.52)] !font-normal !whitespace-normal !break-words",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
