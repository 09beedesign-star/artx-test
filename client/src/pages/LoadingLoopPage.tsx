import { useEffect, useMemo, useState } from "react";
import loadingLogo from "@/assets/loading/artx-loading-logo.svg";

const defaultLoadingCopy = "正在努力为您加载中，请稍后。";
const canvasLoadingCopy = "正在帮您加载画布，请稍后。";
const cycleLoadingModes = ["default", "canvas"] as const;

const loadingTips = [
  "Tip：把参考图拖进画布后，可以作为生成图片的视觉依据。",
  "Tip：选中图片节点后，可以用智能编辑对局部效果进行二次调整。",
  "Tip：画布会保留最近编辑状态，离开后回来可以继续创作。",
  "Tip：提示词越具体，生成结果越容易接近你的设计意图。",
  "Tip：可以先生成草图方向，再逐步细化局部细节。",
  "Tip：使用画板整理内容，可以让多张图片保持同一创作主题。",
  "Tip：生成前选择合适比例，可以减少后续裁切成本。",
  "Tip：同一张参考图可以用于人物、产品、风格和构图方向。",
  "Tip：右侧输入区可以组合文字、图片标签和注释标签。",
  "Tip：批量选择图片后，可以更快整理同一轮生成结果。",
  "Tip：智能产品图适合产品图、海报主视觉和电商场景搭建。",
  "Tip：上传产品图时，尽量选择主体边缘清晰的图片。",
  "Tip：使用背景参考图时，AI 会更容易理解光影和空间氛围。",
  "Tip：生成失败时，可以保留原提示词并直接再次生成。",
  "Tip：多平台封面适合把同一张图快速导出成不同尺寸。",
  "Tip：画板可用于组织一组图片节点，方便整体移动和导出。",
  "Tip：复杂需求可以拆成多次生成，先定风格，再定细节。",
  "Tip：提示词中写清材质、光线和镜头，会提升画面稳定性。",
  "Tip：如果想保留人物或产品比例，请在提示词中明确强约束。",
  "Tip：图片节点可以作为下一次生成的参考素材继续使用。",
  "Tip：选中画布中的对象后，可以通过常用快捷键提升操作效率。",
  "Tip：画布里的注释标签适合记录局部修改要求。",
  "Tip：生成封面时，先确认主体位置，再做批量尺寸导出。",
  "Tip：对同一主题多生成几张，可以更快找到可用方向。",
  "Tip：智能文案适合把简单想法扩展成更完整的视觉提示词。",
  "Tip：高清提升适合在最终导出前增强图片细节。",
  "Tip：去背景适合产品图、人物素材和海报合成前处理。",
  "Tip：橡皮工具适合清理画面中不需要的小物体。",
  "Tip：使用标签引用图片时，标签顺序会影响语义组织。",
  "Tip：输入框中的图片标签可以帮助 AI 理解要参考的对象。",
  "Tip：保持提示词单一主题，通常比一次塞入太多目标更稳定。",
  "Tip：如果结果偏离，可以保留图片再用智能编辑修正。",
  "Tip：创建画板后，可以把相关图片集中在同一个区域内。",
  "Tip：导出前检查透明背景需求，PNG 更适合保留 alpha 通道。",
  "Tip：JPG 适合普通预览和分享，PNG 适合继续设计编辑。",
  "Tip：PSD 导出适合需要在 Photoshop 中继续分层编辑的画板。",
  "Tip：使用社媒尺寸时，注意主体不要贴近画面边缘。",
  "Tip：提示词里写清品牌调性，可以减少反复试错。",
  "Tip：同一画布可以承载多个方向，用画板分组会更清晰。",
  "Tip：参考图越清晰，AI 越容易抓住关键形态。",
  "Tip：如果需要中国风、科技感或潮流风格，可以直接写在风格段落。",
  "Tip：用短句分段描述主体、场景、光线和风格，会更容易控制结果。",
  "Tip：生成产品图时，避免让提示词改变产品外形比例。",
  "Tip：批量下载前先确认选中的都是需要导出的图片节点。",
  "Tip：画布操作出现偏差时，刷新后会优先恢复最近保存状态。",
  "Tip：使用智能注释可以把局部问题直接转成可执行修改点。",
  "Tip：模型选择会影响画面风格和生成速度，可以按任务切换。",
  "Tip：给图片添加备注，有助于回顾每次生成的使用目的。",
  "Tip：加载完成后，可以从工作台继续打开最近的创作画布。",
  "Tip：把灵感推荐作为起点，再加入自己的产品信息，通常更快出图。",
];

function getRandomTip() {
  return loadingTips[Math.floor(Math.random() * loadingTips.length)] || loadingTips[0];
}

function useLoadingTip(seed?: unknown) {
  return useMemo(() => getRandomTip(), [seed]);
}

export default function LoadingLoopPage() {
  const showCyclePreview = window.location.hash === "#cycle";
  const [cycleIndex, setCycleIndex] = useState(0);
  const [tipSeed, setTipSeed] = useState(0);
  const activeCycleMode = cycleLoadingModes[cycleIndex % cycleLoadingModes.length];
  const showCanvasOnly = window.location.hash === "#canvas" || (showCyclePreview && activeCycleMode === "canvas");
  const loadingTip = useLoadingTip(tipSeed);

  useEffect(() => {
    if (!showCyclePreview) return;
    const timer = window.setInterval(() => {
      setCycleIndex(index => index + 1);
      setTipSeed(seed => seed + 1);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [showCyclePreview]);

  return (
    <LoadingSurface canvas={showCanvasOnly}>
      {showCanvasOnly ? <CanvasLoadingSkeleton tip={loadingTip} /> : <GeneralLoadingContent tip={loadingTip} />}
    </LoadingSurface>
  );
}

export function GeneralPageLoading() {
  const loadingTip = useLoadingTip();

  return (
    <LoadingSurface>
      <GeneralLoadingContent tip={loadingTip} />
    </LoadingSurface>
  );
}

export function CanvasPageLoading() {
  const loadingTip = useLoadingTip();

  return (
    <LoadingSurface canvas>
      <CanvasLoadingSkeleton tip={loadingTip} />
    </LoadingSurface>
  );
}

function LoadingSurface({ canvas = false, children }: { canvas?: boolean; children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen overflow-y-auto text-white"
      style={{
        background: "#222222",
        padding: canvas ? 20 : "40px 24px",
      }}
    >
      <LoadingAnimationStyles />
      <section className={canvas ? "flex w-full flex-col" : "mx-auto flex w-full max-w-[1180px] flex-col gap-8"}>
        {children}
      </section>
    </main>
  );
}

function LoadingAnimationStyles() {
  return (
    <style>{`
      @keyframes artx-line-drift {
        0% { stroke-dashoffset: 160; opacity: 0.24; }
        48% { opacity: 0.72; }
        100% { stroke-dashoffset: -160; opacity: 0.24; }
      }

      @keyframes artx-logo-breathe {
        0%, 100% { transform: scale(0.985); opacity: 0.82; }
        50% { transform: scale(1.02); opacity: 1; }
      }

      @keyframes artx-logo-glow-breathe {
        0%, 100% { transform: scale(0.78); opacity: 0.16; filter: blur(16px); }
        50% { transform: scale(1.18); opacity: 0.46; filter: blur(22px); }
      }

      @keyframes artx-skeleton-sweep {
        0% { transform: translateX(-140%); opacity: 0; }
        18% { opacity: 0.42; }
        58% { opacity: 0.64; }
        100% { transform: translateX(140%); opacity: 0; }
      }

      .artx-loading-logo {
        filter: brightness(0) invert(1) drop-shadow(0 0 9px rgba(255,255,255,0.57));
        animation: artx-logo-breathe 2.4s ease-in-out infinite;
        transform-origin: center;
      }

      .artx-logo-glow {
        background: radial-gradient(circle, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.22) 34%, transparent 68%);
        animation: artx-logo-glow-breathe 2.8s ease-in-out infinite;
        transform-origin: center;
      }

      .artx-orbit-line {
        animation: artx-line-drift 2.8s ease-in-out infinite;
        stroke-dasharray: 42 118;
      }

      .artx-skeleton-block {
        position: relative;
        overflow: hidden;
        background: rgba(128, 128, 128, 0.10);
      }

      .artx-skeleton-block::after {
        content: "";
        position: absolute;
        inset: 0;
        width: 42%;
        background: linear-gradient(90deg, transparent, rgba(180,180,180,0.10), transparent);
        animation: artx-skeleton-sweep 2.6s ease-in-out infinite;
      }
    `}</style>
  );
}

function GeneralLoadingContent({ tip }: { tip: string }) {
  return (
    <>
      <section className="grid min-h-[calc(100vh-80px)] place-items-center">
        <article className="flex h-[420px] w-full max-w-[720px] flex-col p-5">
          <div className="flex flex-1 items-center justify-center">
            <LoadingLogoBlock copy={defaultLoadingCopy} />
          </div>
        </article>
      </section>
      <LoadingTip text={tip} />
    </>
  );
}

function LoadingTip({
  text,
  className = "fixed bottom-6 left-1/2 -translate-x-1/2",
}: {
  text: string;
  className?: string;
}) {
  return (
    <p
      className={`z-20 max-w-[min(720px,calc(100vw-40px))] text-center text-[10px] leading-[16px] text-white/59 ${className}`}
      aria-live="polite"
    >
      {text}
    </p>
  );
}

function LoadingLogoBlock({ delay = 0, copy }: { delay?: number; copy: string }) {
  const lines = copy
    .split(/[，,]/)
    .map(line => line.trim().replace(/[。.]$/, ""))
    .filter(Boolean)
    .slice(0, 2);

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid h-[116px] w-[116px] place-items-center">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 116 116" aria-hidden="true">
          <circle cx="58" cy="58" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <circle
            className="artx-orbit-line"
            cx="58"
            cy="58"
            r="48"
            fill="none"
            stroke="rgba(255,255,255,0.76)"
            strokeLinecap="round"
            strokeWidth="1.5"
            style={{ animationDelay: `${delay}s` }}
          />
        </svg>
        <span
          className="artx-logo-glow absolute h-[72px] w-[72px] rounded-full"
          style={{ animationDelay: `${delay}s` }}
        />
        <img
          src={loadingLogo}
          alt=""
          className="artx-loading-logo h-[46px] w-[46px] object-contain"
          draggable={false}
          style={{ animationDelay: `${delay}s` }}
        />
      </div>
      <p className="mt-3 max-w-[156px] text-center text-[8.4px] leading-[12.6px] text-white/69">
        {lines.map((line, index) => (
          <span key={line} className="block">
            {line}
            {index === lines.length - 1 && copy.trim().endsWith("。") ? "。" : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

function CanvasLoadingSkeleton({ tip }: { tip: string }) {
  return (
    <section className="h-[calc(100vh-40px)] w-full" style={{ background: "#222222" }}>
      <div
        className="grid h-full gap-4"
        style={{
          background: "#222222",
          gridTemplateColumns: "minmax(0, 1fr) clamp(280px, 32vw, 372px)",
        }}
      >
        <div className="artx-skeleton-block grid place-items-center rounded-md">
          <div className="relative z-10 flex flex-col items-center">
            <LoadingLogoBlock copy={canvasLoadingCopy} />
          </div>
          <LoadingTip
            text={tip}
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
          />
        </div>
        <aside className="artx-skeleton-block rounded-md" />
      </div>
    </section>
  );
}
