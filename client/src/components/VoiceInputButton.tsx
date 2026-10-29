/**
 * 统一语音输入按钮：挂在任一提示词输入框旁边即可。
 *
 *   <VoiceInputButton value={prompt} onChange={setPrompt} />
 *
 * 行为：点击开始 → 记下当前输入框内容作为前缀 → 识别文本实时追加在前缀后面
 *      → 再次点击或 60 秒到点自动停止。前端不展示任何扣费信息。
 * 构建期 VITE_VOICE_INPUT_ENABLED=false 时整个按钮不渲染（灰度开关）。
 */

import { useRef } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { isVoiceInputSupported, useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

export const VOICE_INPUT_ENABLED = import.meta.env.VITE_VOICE_INPUT_ENABLED !== "false";

/** 把识别文本接到原有内容后面；中文之间不加空格，英文单词之间补一个空格。纯函数。 */
export function joinVoiceText(prefix: string, spoken: string) {
  if (!spoken) return prefix;
  if (!prefix) return spoken;
  const needsSpace = /[A-Za-z0-9]$/.test(prefix) && /^[A-Za-z0-9]/.test(spoken);
  return `${prefix}${needsSpace ? " " : ""}${spoken}`;
}

type VoiceInputButtonProps = {
  value: string;
  onChange: (value: string) => void;
  /** 按钮尺寸（px），默认 32。 */
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  className?: string;
  /** 未录音时图标颜色，跟随宿主输入框的弱化文字色。 */
  color?: string;
  hoverColor?: string;
  /** 录音状态的强调色，默认品牌绿。 */
  activeColor?: string;
  title?: string;
};

export function VoiceInputButton({
  value,
  onChange,
  size = 32,
  iconSize = 16,
  disabled,
  className,
  color,
  hoverColor,
  activeColor = "#C5ED47",
  title = "语音输入",
}: VoiceInputButtonProps) {
  const prefixRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const voice = useVoiceInput({
    onText: (text) => onChange(joinVoiceText(prefixRef.current, text)),
    onError: (message) => toast.error(message),
  });

  if (!VOICE_INPUT_ENABLED || !isVoiceInputSupported()) return null;

  const recording = voice.status === "recording";
  const busy = voice.status === "connecting" || voice.status === "stopping";
  const remaining = Math.max(0, voice.maxSeconds - voice.elapsedSeconds);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (voice.status === "idle") prefixRef.current = valueRef.current;
    voice.toggle();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      disabled={disabled || voice.status === "stopping"}
      aria-label={recording ? "停止语音输入" : title}
      aria-pressed={recording}
      title={recording ? `点击结束（剩余 ${remaining} 秒）` : title}
      data-voice-input-button=""
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        width: size,
        height: size,
        color: recording ? "#111" : color,
        backgroundColor: recording ? activeColor : "transparent",
      }}
      onMouseEnter={(event) => {
        if (!recording && hoverColor) event.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(event) => {
        if (!recording) event.currentTarget.style.color = color || "";
      }}
    >
      {recording && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-ping rounded-full opacity-40"
          style={{ backgroundColor: activeColor }}
        />
      )}
      {busy ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : recording ? (
        <Square size={Math.max(10, iconSize - 4)} fill="currentColor" />
      ) : (
        <Mic size={iconSize} />
      )}
    </button>
  );
}

export default VoiceInputButton;
