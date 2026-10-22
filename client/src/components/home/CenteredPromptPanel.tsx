import { useRef, useState, useEffect } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { ModelSelector } from "@/components/canvas/ModelSelector";
import { SkillSelector } from "@/components/canvas/SkillSelector";
import { SkillCarousel } from "@/components/home/SkillCarousel";
import type { AiModelOption } from "@/lib/workspace-data";
import type { HomePromptReference } from "@/lib/home-prompt-handoff";
import type { PendingSkillLoad } from "@/lib/skill-store";

interface CenteredPromptPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  imageModelId: string;
  imageModelOptions: AiModelOption[];
  onImageModelChange: (modelId: string) => void;
  references: HomePromptReference[];
  onReferenceFiles: (files: File[]) => void;
  onRemoveReference: (id: string) => void;
  activeSkill: PendingSkillLoad | null;
  onSkillChange: (skill: PendingSkillLoad | null) => void;
  isDark: boolean;
  textPrimary: string;
  textMuted: string;
  bgMain: string;
  borderColor: string;
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

// 打字机示例文案
const TYPING_EXAMPLES = [
  "描述你想要生成的图片，例如：帮我生成一张赛博朋克风格插画",
  "生成一张电商主图，白色背景，突出产品质感",
  "设计一款社交媒体配图，简约现代风格",
  "创建品牌 3D 白膜图，干净的工作室光照",
];

// 粒子颜色库（彩虹色系，初始透明度 5%）
const PARTICLE_COLORS = [
  "rgba(147, 51, 234, 0.05)",  // 紫色
  "rgba(59, 130, 246, 0.05)",  // 蓝色
  "rgba(16, 185, 129, 0.05)",  // 绿色
  "rgba(245, 158, 11, 0.05)",  // 橙色
  "rgba(239, 68, 68, 0.05)",   // 红色
];

// 粒子接口
interface Particle {
  id: number;
  x: number;  // 起始 x 位置（百分比，50% = 中心）
  y: number;  // 起始 y 位置（百分比，50% = 中心）
  size: number;  // 粒子大小（px）
  color: string;  // 粒子颜色
  duration: number;  // 动画时长（固定 3 秒）
  delay: number;  // 动画延迟（秒）
  flyX: number;  // 飞出 x 方向距离（px）
  flyY: number;  // 飞出 y 方向距离（px）
  speed: number;  // 飞行速度（px/s，5-60）
}

/**
 * 居中的提示词输入面板（新版首页布局）
 */
export function CenteredPromptPanel({
  prompt,
  onPromptChange,
  onSend,
  imageModelId,
  imageModelOptions,
  onImageModelChange,
  references,
  onReferenceFiles,
  onRemoveReference,
  activeSkill,
  onSkillChange,
  isDark,
  textPrimary,
  textMuted,
  bgMain,
  borderColor,
  suggestions,
  onSuggestionClick,
}: CenteredPromptPanelProps) {
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 打字机效果状态
  const [typingText, setTypingText] = useState("");
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [isFocused, setIsFocused] = useState(false);

  // 粒子系统状态
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(0);

  // 生成随机粒子
  const generateParticle = (): Particle => {
    const id = particleIdRef.current++;
    
    // 粒子从输入框中心位置开始（50%, 50%）
    const x = 50;
    const y = 50;
    
    // 随机速度：5-60 px/s
    const speed = 5 + Math.random() * 55;
    
    // 固定动画时长 3 秒
    const duration = 3;
    
    // 根据速度计算总飞行距离：distance = speed * time
    const distance = speed * duration;
    
    // 随机选择飞出方向（360° 任意角度）
    const angle = Math.random() * Math.PI * 2;
    
    // 计算 x 和 y 方向的飞行距离
    const flyX = Math.cos(angle) * distance;
    const flyY = Math.sin(angle) * distance;
    
    // 粒子尺寸：5%-80% 区间，最大 20px
    const sizePercent = 0.05 + Math.random() * 0.75;
    const size = Math.round(20 * sizePercent); // 1px-20px
    
    // 随机颜色（已是 5% 透明度）
    const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    
    // 延迟：0-0.5 秒随机（缩短延迟，让粒子更连续）
    const delay = Math.random() * 0.5;
    
    return { id, x, y, size, color, duration, delay, flyX, flyY, speed };
  };

  // 粒子生成循环
  useEffect(() => {
    const interval = setInterval(() => {
      // 每 200ms 生成 2-3 个新粒子（增加频率，让效果更连续）
      const count = 2 + Math.floor(Math.random() * 2);
      const newParticles = Array.from({ length: count }, generateParticle);
      
      setParticles((prev) => {
        // 移除已完成动画的粒子（超过 4 秒的）
        const now = Date.now();
        const active = prev.filter((p) => {
          const age = (now - (p.id * 100)) / 1000;
          return age < 4; // 保留 4 秒内的粒子（3秒动画 + 1秒缓冲）
        });
        
        return [...active, ...newParticles].slice(-40); // 最多保留 40 个粒子
      });
    }, 200);
    
    return () => clearInterval(interval);
  }, []);


  // 打字机动画效果
  useEffect(() => {
    // 如果用户已经输入内容或聚焦，停止打字动画
    if (prompt || isFocused) {
      setIsTyping(false);
      setTypingText("");
      return;
    }

    setIsTyping(true);
    const currentExample = TYPING_EXAMPLES[currentExampleIndex];
    let charIndex = 0;

    // 打字效果
    const typingInterval = setInterval(() => {
      if (charIndex <= currentExample.length) {
        setTypingText(currentExample.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typingInterval);
        
        // 显示完整文本 2 秒后，切换到下一个示例
        setTimeout(() => {
          setCurrentExampleIndex((prev) => (prev + 1) % TYPING_EXAMPLES.length);
          setTypingText("");
        }, 2000);
      }
    }, 50); // 每个字符 50ms

    return () => clearInterval(typingInterval);
  }, [currentExampleIndex, prompt, isFocused]);

  // 处理聚焦
  const handleFocus = () => {
    setIsFocused(true);
    setIsTyping(false);
    setTypingText("");
  };

  // 处理失焦
  const handleBlur = () => {
    if (!prompt) {
      setIsFocused(false);
      // 延迟 500ms 后重新开始打字动画
      setTimeout(() => {
        if (!prompt) {
          setIsTyping(true);
        }
      }, 500);
    }
  };

  return (
    <div className="flex w-full max-w-[800px] flex-col items-center" style={{ paddingTop: "140px" }}>
      {/* 主标题和副标题 */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="relative mb-3 flex justify-center">
          <h1 
            className="text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: textPrimary }}
          >
            欢迎来到 ArtXStudio
          </h1>
          {/* Beta 标签 - 绝对定位在标题右侧 12px，不影响标题居中 */}
          <span
            className="absolute rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{
              top: "0",
              left: "calc(50% + 225px)",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            Beta
          </span>
        </div>
        <p 
          className="text-base sm:text-lg"
          style={{ color: textMuted }}
        >
          一句话，生成品牌、电商、社媒全场景设计素材
        </p>
      </div>

      {/* 彩虹暗流外围光晕容器 */}
      <div
        style={{
          position: "relative",
          width: "100%",
          marginBottom: "24px",
        }}
      >
        {/* 彩虹背景层 - 在输入框外围，颜色范围缩小 30% */}
        <div
          className="rainbow-flow"
          style={{
            position: "absolute",
            top: "-24px",
            left: "-24px",
            right: "-24px",
            bottom: "-24px",
            background: isDark 
              ? "linear-gradient(135deg, rgba(147, 51, 234, 0.196), rgba(59, 130, 246, 0.196), rgba(16, 185, 129, 0.196), rgba(245, 158, 11, 0.196), rgba(239, 68, 68, 0.196), rgba(147, 51, 234, 0.196))"
              : "linear-gradient(135deg, rgba(147, 51, 234, 0.14), rgba(59, 130, 246, 0.14), rgba(16, 185, 129, 0.14), rgba(245, 158, 11, 0.14), rgba(239, 68, 68, 0.14), rgba(147, 51, 234, 0.14))",
            backgroundSize: "300% 300%",
            animation: "rainbow-flow 12s ease infinite",
            borderRadius: "40px",
            zIndex: 0,
            pointerEvents: "none",
            filter: "blur(32px)",
          }}
        />

        {/* 彩虹粒子气泡层 - 从输入框中心向四周飞出 */}
        <div
          className="pointer-events-none absolute"
          style={{
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            zIndex: 1,
            borderRadius: "16px",
            overflow: "visible",
          }}
        >
          {particles.map((particle) => (
            <div
              key={particle.id}
              style={{
                position: "absolute",
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                borderRadius: "50%",
                backgroundColor: particle.color,
                animation: `particle-fly-out ${particle.duration}s ease-out forwards`,
                animationDelay: `${particle.delay}s`,
                // CSS 变量用于动画
                ["--fly-x" as string]: `${particle.flyX}px`,
                ["--fly-y" as string]: `${particle.flyY}px`,
              }}
            />
          ))}
        </div>
        
        {/* 提示词输入框 */}
        <div
          className="mb-6 flex w-full flex-col justify-between rounded-[16px] border p-5"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)",
            backgroundColor: isDark ? "#2a2a2a" : "#ffffff",
            minHeight: "200px",
            boxShadow: isDark 
              ? "0 4px 24px rgba(0,0,0,0.15)" 
              : "0 4px 24px rgba(0,0,0,0.04)",
            position: "relative",
            zIndex: 2,
            overflow: "visible",
          }}
        >
          
          {/* 打字机效果层 - 只在没有用户输入且未聚焦时显示 */}
          {!prompt && !isFocused && isTyping && (
            <div
              className="pointer-events-none absolute left-5 top-5 min-h-[120px] w-[calc(100%-40px)] text-[15px] leading-[24px]"
              style={{
                color: textMuted,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                zIndex: 1,
              }}
            >
              {typingText}
              <span
                className="inline-block w-[2px] h-[20px] ml-[2px] animate-blink"
                style={{
                  backgroundColor: textMuted,
                  verticalAlign: "middle",
                }}
              />
            </div>
          )}
          
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="min-h-[120px] w-full resize-none bg-transparent text-[15px] leading-[24px] outline-none"
            placeholder={isFocused || prompt ? "" : ""}
            style={{
              color: textPrimary,
              position: "relative",
              zIndex: 1,
            }}
          />
        
        {references.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {references.map((reference) => (
              <div
                key={reference.id}
                className="group relative h-14 w-14 overflow-hidden rounded-md border"
                style={{ borderColor: isDark ? "#454545" : borderColor }}
                title={reference.title}
              >
                <img
                  src={reference.src}
                  alt={reference.title}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveReference(reference.id)}
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`移除参考图 ${reference.title}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Skill 标签卡片 - 在输入框内部，参考图下方 */}
        {activeSkill && (
          <div className="mb-3 flex flex-wrap gap-2">
            <div
              className="group relative flex items-center gap-2 rounded-md border px-3 py-1.5"
              style={{
                borderColor: isDark
                  ? "oklch(0.62 0.22 290 / 45%)"
                  : "oklch(0.62 0.22 290 / 35%)",
                backgroundColor: isDark
                  ? "oklch(0.58 0.22 290 / 0.18)"
                  : "oklch(0.58 0.22 290 / 0.12)",
              }}
            >
              <span
                className="text-xs font-medium"
                style={{
                  color: isDark
                    ? "oklch(0.82 0.16 290)"
                    : "oklch(0.46 0.18 290)",
                }}
              >
                {activeSkill.name}
              </span>
              <button
                type="button"
                onClick={() => onSkillChange(null)}
                className="flex h-4 w-4 items-center justify-center rounded-sm transition-opacity hover:opacity-70"
                aria-label="移除 Skill"
                style={{
                  color: isDark
                    ? "oklch(0.82 0.16 290)"
                    : "oklch(0.46 0.18 290)",
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="flex h-10 items-center justify-between">
          <div className="flex items-center gap-4" style={{ color: textMuted }}>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                if (files.length > 0) onReferenceFiles(files);
              }}
            />
            <button
              type="button"
              onClick={() => referenceInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors"
              style={{ color: textMuted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = textMuted)}
            >
              <ImagePlus size={16} />
              添加参考图
            </button>
            <span
              className="h-5 w-px"
              style={{ backgroundColor: isDark ? "#454545" : borderColor }}
            />
            <ModelSelector
              model={imageModelId}
              onChange={onImageModelChange}
              isDark={isDark}
              models={imageModelOptions}
              placement="up"
              surface={{
                background: "transparent",
                border: "transparent",
                text: textMuted,
                hoverBackground: "transparent",
                hoverText: textPrimary,
                openBorder: "transparent",
              }}
              triggerClassName="flex h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors"
            />
            <span
              className="h-5 w-px"
              style={{ backgroundColor: isDark ? "#454545" : borderColor }}
            />
            <SkillSelector
              activeSkill={activeSkill}
              onChange={onSkillChange}
              isDark={isDark}
              compact={false}
            />
          </div>
          <button
            type="button"
            onClick={onSend}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#936CFF] text-white shadow-[0_8px_22px_rgba(147,108,255,0.28)] transition-all hover:bg-[#A384FF] active:scale-95"
            aria-label="生成图片"
          >
            <Send size={18} />
          </button>
        </div>
        </div>
      </div>

      {/* 快速提示词标签 */}
      <div className="flex flex-wrap items-center justify-center gap-3" style={{ position: "relative", zIndex: 10, marginTop: "-24px" }}>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestionClick(suggestion)}
            className="rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: isDark ? "rgba(0, 0, 0, 0.1)" : "#ffffff",
              color: isDark ? "#ffffff" : "#000000",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.8)" : "1px solid #e5e5e5",
              boxShadow: isDark ? "0 2px 8px rgba(255, 255, 255, 0.08)" : "0 2px 8px rgba(0, 0, 0, 0.08)",
            }}
            onMouseEnter={(e) => {
              if (isDark) {
                e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.8)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 255, 255, 0.15)";
              } else {
                e.currentTarget.style.backgroundColor = "#000000";
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.borderColor = "#000000";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
              }
            }}
            onMouseLeave={(e) => {
              if (isDark) {
                e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.8)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(255, 255, 255, 0.08)";
              } else {
                e.currentTarget.style.backgroundColor = "#ffffff";
                e.currentTarget.style.color = "#000000";
                e.currentTarget.style.borderColor = "#e5e5e5";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.08)";
              }
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Skill 推荐横向轮播 - 宽度与提示词输入框等宽 */}
      <div className="w-full" style={{ maxWidth: "800px", marginTop: "24px" }}>
        <SkillCarousel
          onSkillSelect={onSkillChange}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
