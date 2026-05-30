/**
 * InspirationPage — 灵感选题
 * 分类与首页提示词标签保持一致。
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import TopBar from "@/components/workspace/TopBar";
import { ArrowRight, Layers, Sparkles } from "lucide-react";
import { BG_GLOW, BRAND_KIT, POSTER_1, POSTER_2, SOCIAL_AD } from "@/lib/workspace-data";

const INSPIRATION_TOPICS = [
  "产品海报",
  "品牌视觉",
  "社媒配图",
  "电商主图",
  "活动长图",
  "Logo 灵感",
  "包装设计",
  "落地页视觉",
];

const TOPIC_CARDS: Record<string, Array<{ title: string; desc: string; cover: string; count: string }>> = {
  产品海报: [
    { title: "运动产品性能海报", desc: "速度感、材质特写、强对比主视觉", cover: POSTER_2, count: "28 个选题" },
    { title: "新品发布主 KV", desc: "适合首发、预热、倒计时传播", cover: POSTER_1, count: "16 个选题" },
    { title: "科技单品视觉实验", desc: "硬朗光线、近景结构、参数卖点", cover: SOCIAL_AD, count: "21 个选题" },
  ],
  品牌视觉: [
    { title: "咖啡品牌视觉系统", desc: "Logo、色彩、字体、应用延展", cover: BRAND_KIT, count: "32 个选题" },
    { title: "新消费品牌情绪板", desc: "人群、调性、材质与包装方向", cover: POSTER_1, count: "24 个选题" },
    { title: "科技品牌识别规范", desc: "图形语言、组件和品牌资产", cover: SOCIAL_AD, count: "18 个选题" },
  ],
  社媒配图: [
    { title: "小红书种草封面", desc: "标题层级、场景图、笔记封面", cover: SOCIAL_AD, count: "40 个选题" },
    { title: "Instagram 视觉矩阵", desc: "九宫格、故事图、短帖素材", cover: POSTER_1, count: "25 个选题" },
    { title: "节日营销贴片", desc: "热点节点、促销信息、互动内容", cover: BRAND_KIT, count: "19 个选题" },
  ],
  电商主图: [
    { title: "平台首图套系", desc: "白底、场景、卖点、规格组合", cover: POSTER_2, count: "34 个选题" },
    { title: "详情页视觉段落", desc: "功能解释、材质说明、对比图", cover: SOCIAL_AD, count: "27 个选题" },
    { title: "直播间商品卡", desc: "价格利益点、强识别商品焦点", cover: POSTER_1, count: "15 个选题" },
  ],
  活动长图: [
    { title: "品牌活动邀请函", desc: "时间地点、主题视觉、流程信息", cover: POSTER_1, count: "22 个选题" },
    { title: "发布会长图叙事", desc: "议程、嘉宾、产品亮点串联", cover: SOCIAL_AD, count: "17 个选题" },
    { title: "促销活动信息流", desc: "利益点、玩法、阶梯权益", cover: BRAND_KIT, count: "20 个选题" },
  ],
  "Logo 灵感": [
    { title: "几何符号生成", desc: "图形提炼、比例、正负形探索", cover: BRAND_KIT, count: "36 个选题" },
    { title: "字标方向提案", desc: "字体气质、笔画特征和组合", cover: POSTER_1, count: "18 个选题" },
    { title: "品牌标志应用", desc: "黑白稿、图标化、社媒头像", cover: SOCIAL_AD, count: "23 个选题" },
  ],
  包装设计: [
    { title: "食品包装系列", desc: "口味区分、货架识别、插画元素", cover: BRAND_KIT, count: "29 个选题" },
    { title: "美妆包装视觉", desc: "材质、瓶身、礼盒和陈列图", cover: POSTER_1, count: "21 个选题" },
    { title: "潮玩包装系统", desc: "角色设定、开窗结构、收藏感", cover: POSTER_2, count: "14 个选题" },
  ],
  落地页视觉: [
    { title: "SaaS 产品首屏", desc: "产品界面、价值主张、转化按钮", cover: SOCIAL_AD, count: "26 个选题" },
    { title: "活动报名页", desc: "主视觉、讲师阵容、报名模块", cover: POSTER_1, count: "16 个选题" },
    { title: "品牌官网视觉", desc: "首屏、优势模块、案例展示", cover: BRAND_KIT, count: "24 个选题" },
  ],
};

function getTopicFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  return topic && INSPIRATION_TOPICS.includes(topic) ? topic : INSPIRATION_TOPICS[0];
}

export default function InspirationPage() {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const initialTopic = useMemo(() => getTopicFromSearch(globalThis.location?.search || ""), [location]);
  const [activeTopic, setActiveTopic] = useState(initialTopic);

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const border = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const tabBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(1 0 0 / 0.72)";
  const activeTabBg = isDark ? "oklch(0.62 0.22 290 / 0.18)" : "oklch(0.62 0.18 290 / 0.10)";

  const selectTopic = (topic: string) => {
    setActiveTopic(topic);
    navigate(`/inspiration?topic=${encodeURIComponent(topic)}`);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.10, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={75} />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <main className="mx-auto px-8 py-10" style={{ maxWidth: 1180 }}>
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} style={{ color: "oklch(0.72 0.22 290)" }} />
                <span className="type-caption" style={{ color: "oklch(0.72 0.22 290)" }}>灵感选题</span>
              </div>
              <h1 className="type-display-sm" style={{ color: text, letterSpacing: "0" }}>按创作目标选择专题</h1>
            </div>
          </div>

          <div
            className="flex items-center gap-2 overflow-x-auto overflow-y-hidden mb-6"
            style={{ scrollbarWidth: "none", whiteSpace: "nowrap" }}
          >
            {INSPIRATION_TOPICS.map(topic => {
              const active = topic === activeTopic;
              return (
                <button
                  key={topic}
                  onClick={() => selectTopic(topic)}
                  className="shrink-0 px-3.5 py-2 rounded-[var(--radius-pill)] type-caption transition-all active:scale-95"
                  style={{
                    background: active ? activeTabBg : tabBg,
                    border: `1px solid ${active ? "oklch(0.62 0.22 290 / 0.36)" : border}`,
                    color: active ? "oklch(0.78 0.18 290)" : sub,
                  }}
                >
                  {topic}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {TOPIC_CARDS[activeTopic].map(card => (
              <button
                key={card.title}
                onClick={() => navigate("/project/p1")}
                className="group overflow-hidden rounded-[var(--radius-lg-design)] text-left transition-all hover:scale-[1.015] active:scale-[0.99]"
                style={{ background: cardBg, border: `1px solid ${border}`, boxShadow: "0 12px 36px oklch(0 0 0 / 0.16)" }}
              >
                <div className="relative overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
                  <img src={card.cover} alt={card.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)]" style={{ background: "oklch(0 0 0 / 0.42)", color: "white", backdropFilter: "blur(10px)", fontSize: 11 }}>
                    <Layers size={12} />
                    {activeTopic}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="type-body-sm truncate" style={{ color: text, fontWeight: 650 }}>{card.title}</p>
                      <p className="type-caption mt-1 leading-5" style={{ color: sub, textTransform: "none", letterSpacing: "0" }}>{card.desc}</p>
                    </div>
                    <ArrowRight size={16} className="mt-0.5 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: sub }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
