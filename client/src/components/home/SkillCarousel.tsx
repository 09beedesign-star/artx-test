import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { skillStoreItems, skillCategoryMeta, type SkillStoreCategory, type PendingSkillLoad } from "@/lib/skill-store";

interface SkillCarouselProps {
  onSkillSelect: (skill: PendingSkillLoad) => void;
  isDark: boolean;
}

// 随机选择 8 个已同步的 Skill
const getRandomSkills = () => {
  const syncedSkills = skillStoreItems.filter(skill => skill.status === "已同步");
  const shuffled = [...syncedSkills].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 8);
};

export function SkillCarousel({ onSkillSelect, isDark }: SkillCarouselProps) {
  const [displaySkills] = useState(getRandomSkills);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isScrollPaused, setIsScrollPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const scrollSpeed = 0.5; // 每帧滚动像素

  // 自动滚动逻辑 - hover 时暂停，结束后恢复
  useEffect(() => {
    if (!scrollRef.current) return;

    const scroll = () => {
      if (scrollRef.current && !isScrollPaused) {
        scrollRef.current.scrollLeft += scrollSpeed;
        
        // 无缝循环：当滚动超过第一组内容宽度时，平滑重置到起点
        // 由于我们渲染了两份完全相同的内容，当滚动完第一份时，
        // 可以无缝切换回起点（因为第二份的开头和第一份的开头内容一样）
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        const singleSetWidth = (scrollWidth - clientWidth) / 2;
        
        if (scrollLeft >= singleSetWidth) {
          // 无缝重置：立即跳回起点，但由于内容重复，视觉上无缝
          scrollRef.current.scrollLeft = scrollLeft - singleSetWidth;
        }
      }
      animationRef.current = requestAnimationFrame(scroll);
    };

    animationRef.current = requestAnimationFrame(scroll);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isScrollPaused]); // 添加 isScrollPaused 依赖，根据 hover 状态控制

  const handleSkillClick = (skill: typeof skillStoreItems[number]) => {
    onSkillSelect({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      categoryLabel: skillCategoryMeta[skill.category].label,
      subcategory: skill.subcategory,
      summary: skill.summary,
      capability: skill.capability,
      capabilityPrompt: skill.capabilityPrompt,
      sourceRepo: skill.sourceRepo,
      sourceUrl: skill.sourceUrl,
      tags: skill.tags,
      canvasSizes: skill.canvasSizes,
      loadedAt: new Date().toISOString(),
    });
  };

  // 根据分类生成不同的渐变背景色（作为缩略图）
  const getGradientForCategory = (category: SkillStoreCategory) => {
    switch (category) {
      case "brand_system":
        return "linear-gradient(135deg, oklch(0.68 0.18 210) 0%, oklch(0.48 0.18 210) 100%)";
      case "logo_identity":
        return "linear-gradient(135deg, oklch(0.70 0.19 300) 0%, oklch(0.50 0.19 300) 100%)";
      case "landing_page":
        return "linear-gradient(135deg, oklch(0.70 0.16 155) 0%, oklch(0.50 0.16 155) 100%)";
      case "commerce_poster":
        return "linear-gradient(135deg, oklch(0.73 0.18 55) 0%, oklch(0.53 0.18 55) 100%)";
      default:
        return "linear-gradient(135deg, oklch(0.68 0.20 292) 0%, oklch(0.48 0.20 292) 100%)";
    }
  };

  return (
    <div className="relative w-full overflow-hidden" style={{ marginBottom: "236px" }}>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide"
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* 渲染两遍以实现无限循环 */}
        {[...displaySkills, ...displaySkills].map((skill, index) => {
          const isHovered = hoveredId === `${skill.id}-${index}`;
          
          return (
            <div
              key={`${skill.id}-${index}`}
              className="shrink-0 rounded-xl overflow-hidden"
              style={{
                width: "200px",
                height: "120px",
              }}
            >
              <button
                type="button"
                onClick={() => handleSkillClick(skill)}
                onMouseEnter={() => {
                  setHoveredId(`${skill.id}-${index}`);
                  setIsScrollPaused(true);
                }}
                onMouseLeave={() => {
                  setHoveredId(null);
                  setIsScrollPaused(false);
                }}
                className="group relative w-full h-full overflow-hidden rounded-xl transition-all duration-300"
                style={{
                  transform: isHovered ? "scale(1.05)" : "scale(1)",
                  boxShadow: isHovered
                    ? isDark
                      ? "0 8px 24px oklch(0 0 0 / 0.4)"
                      : "0 8px 24px oklch(0 0 0 / 0.15)"
                    : "0 2px 8px oklch(0 0 0 / 0.08)",
                }}
              >
                {/* 真实缩略图 */}
                <img
                  src={`/skill-thumbs/${skill.id}.webp`}
                  alt={skill.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    // 如果图片加载失败，显示渐变色背景
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
                
                {/* 渐变色背景作为 fallback */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: getGradientForCategory(skill.category),
                    zIndex: -1,
                  }}
                />
                
                {/* 半透明遮罩层，hover 时变暗 */}
                <div
                  className="absolute inset-0 transition-opacity duration-300"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    opacity: isHovered ? 1 : 0.6,
                  }}
                />
                
                {/* 底部文字容器 */}
                <div
                  className="absolute bottom-0 left-0 right-0 p-3"
                  style={{
                    background: "linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 100%)",
                  }}
                >
                  <div className="flex flex-col items-start gap-1 text-left">
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: "#ffffff",
                      }}
                    >
                      {skill.name}
                    </span>
                    {isHovered && (
                      <span
                        className="line-clamp-2 text-[10px]"
                        style={{ color: "rgba(255, 255, 255, 0.85)" }}
                      >
                        {skill.summary}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
      
      {/* 左侧虚化遮罩 */}
      <div
        className="absolute left-0 top-0 bottom-0 pointer-events-none z-10"
        style={{
          width: "60px",
          background: isDark
            ? "linear-gradient(to right, #222222 0%, rgba(34, 34, 34, 0.8) 40%, transparent 100%)"
            : "linear-gradient(to right, #ffffff 0%, rgba(255, 255, 255, 0.8) 40%, transparent 100%)",
        }}
      />
      
      {/* 右侧虚化遮罩 */}
      <div
        className="absolute right-0 top-0 bottom-0 pointer-events-none z-10"
        style={{
          width: "60px",
          background: isDark
            ? "linear-gradient(to left, #222222 0%, rgba(34, 34, 34, 0.8) 40%, transparent 100%)"
            : "linear-gradient(to left, #ffffff 0%, rgba(255, 255, 255, 0.8) 40%, transparent 100%)",
        }}
      />
    </div>
  );
}
