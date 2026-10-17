/**
 * 长期记忆独立页面
 * - 四维度长期记忆输入：项目记忆、Skill、通用规则、常规记忆
 * - Skill 支持导入本地 .md 文档
 * - GSAP 点阵背景动效：激活输入框时开始播放，保存后停止
 * - 支持下载记忆文档：系统原生文件保存对话框，用户选择保存路径
 * - 与个人中心的能力完全一致，但 UI 呈现科技感（与平台风格保持一致）
 */
import { useEffect, useRef, useState } from "react";
import { Brain, Upload, Save, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import gsap from "gsap";
import {
  fetchUserMemory,
  fetchUserMemoryWithLimits,
  saveUserMemory,
  broadcastUserMemoryChange,
  USER_MEMORY_CHANGED_EVENT,
} from "@/lib/user-memory-client";
import {
  SKILL_DIMENSION_LIMIT,
  isSkillOversized,
  createEmptyUserMemoryDocument,
} from "@shared/user-memory";
import { MEMBERSHIP_PLANS, SUBSCRIPTION_PLAN_IDS } from "@shared/billing-config";
import type { UserMemoryDocument } from "@shared/user-memory";
import { buildMemoryMarkdown, saveMarkdownWithPicker, suggestMemoryFilename } from "@/lib/memory-export";

type MemoryDimension = "projectMemory" | "skill" | "generalRules" | "regularMemory";

interface DimensionConfig {
  key: MemoryDimension;
  label: string;
  placeholder: string;
  allowUpload?: boolean;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key: "projectMemory",
    label: "项目记忆",
    placeholder: "记录项目特定的背景、约定、架构决策...",
  },
  {
    key: "skill",
    label: "Skill",
    placeholder: "记录技能相关的规则、工作流、最佳实践...",
    allowUpload: true,
  },
  {
    key: "generalRules",
    label: "通用规则",
    placeholder: "记录通用的偏好、规范、约束条件...",
  },
  {
    key: "regularMemory",
    label: "常规记忆",
    placeholder: "记录其他需要长期记住的内容...",
  },
];

export default function LongTermMemoryPage() {
  const [memories, setMemories] = useState<Record<MemoryDimension, string>>({
    projectMemory: "",
    skill: "",
    generalRules: "",
    regularMemory: "",
  });
  const [savedMemories, setSavedMemories] = useState<Record<MemoryDimension, string>>({
    projectMemory: "",
    skill: "",
    generalRules: "",
    regularMemory: "",
  });
  const [activeDimension, setActiveDimension] = useState<MemoryDimension | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPlanId, setCurrentPlanId] = useState<string>("free");
  const [currentLimits, setCurrentLimits] = useState<{
    perDimension: number;
    total: number;
    skill: number;
  }>({ perDimension: 300, total: 1200, skill: SKILL_DIMENSION_LIMIT });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<(() => void) | null>(null);
  const dotsRef = useRef<Array<{ x: number; y: number; vx: number; vy: number }>>([]);

  // 初始化点阵动画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateSize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      // setTransform 而非 scale：resize 多次触发时 scale 会累乘，点阵越画越大
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };
    updateSize();
    window.addEventListener("resize", updateSize);

    // 初始化点阵（50 个点，随机分布）
    const dotCount = 50;
    dotsRef.current = Array.from({ length: dotCount }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // 点阵动画循环（仅在有激活输入框时播放）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!activeDimension) {
      // 停止动画
      if (animationRef.current) {
        gsap.ticker.remove(animationRef.current);
        animationRef.current = null;
      }
      // 清空画布
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      return;
    }

    // 开始动画
    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      // 更新点位置
      dotsRef.current.forEach(dot => {
        dot.x += dot.vx;
        dot.y += dot.vy;
        if (dot.x < 0 || dot.x > canvas.offsetWidth) dot.vx *= -1;
        if (dot.y < 0 || dot.y > canvas.offsetHeight) dot.vy *= -1;
      });

      // 绘制点
      ctx.fillStyle = "rgba(197, 237, 71, 0.6)"; // 品牌强调色
      dotsRef.current.forEach(dot => {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 绘制连线（距离 < 120px）
      ctx.strokeStyle = "rgba(197, 237, 71, 0.15)";
      ctx.lineWidth = 1;
      for (let i = 0; i < dotsRef.current.length; i++) {
        for (let j = i + 1; j < dotsRef.current.length; j++) {
          const dx = dotsRef.current[i].x - dotsRef.current[j].x;
          const dy = dotsRef.current[i].y - dotsRef.current[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(dotsRef.current[i].x, dotsRef.current[i].y);
            ctx.lineTo(dotsRef.current[j].x, dotsRef.current[j].y);
            ctx.stroke();
          }
        }
      }
    };

    gsap.ticker.add(animate);
    animationRef.current = animate;

    return () => {
      if (animationRef.current) {
        gsap.ticker.remove(animate);
        animationRef.current = null;
      }
    };
  }, [activeDimension]);

  // 加载记忆 + 档位容量
  useEffect(() => {
    fetchUserMemoryWithLimits()
      .then(data => {
        if (!data) {
          // 未登录或后端未返回 limits → 按 Free 处理，但仍读记忆。
          return fetchUserMemory();
        }
        setCurrentPlanId(data.planId);
        setCurrentLimits(data.limits);
        return Promise.resolve(data.document);
      })
      .then(doc => {
        if (!doc) return;
        const loaded: Record<MemoryDimension, string> = {
          projectMemory: doc.projectMemory || "",
          skill: doc.skill || "",
          generalRules: doc.generalRules || "",
          // 向后兼容：仅当四维度全空时才把旧 longTerm 迁入常规记忆
          regularMemory:
            doc.regularMemory ||
            (!doc.projectMemory && !doc.skill && !doc.generalRules ? doc.longTerm || "" : ""),
        };
        setMemories(loaded);
        setSavedMemories(loaded);
      })
      .catch(err => {
        console.error("加载长期记忆失败", err);
        toast.error("加载长期记忆失败");
      })
      .finally(() => setIsLoading(false));
  }, []);

  // 跨页面同步（只更新已保存快照，不覆盖正在编辑的草稿）
  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<UserMemoryDocument>).detail;
      setSavedMemories({
        projectMemory: detail.projectMemory || "",
        skill: detail.skill || "",
        generalRules: detail.generalRules || "",
        regularMemory: detail.regularMemory || detail.longTerm || "",
      });
    };
    window.addEventListener(USER_MEMORY_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(USER_MEMORY_CHANGED_EVENT, handleChange);
  }, []);

  const skillTooLargeMessage = (length: number) =>
    `Skill 过大（${length.toLocaleString()} 字，上限 ${SKILL_DIMENSION_LIMIT.toLocaleString()} 字），请精简之后再上传`;

  const handleSave = async () => {
    // ⚠️ 超限时拦下不存：服务端会静默截断尾部，Skill 被截半截比不存更糟。
    if (isSkillOversized(memories.skill)) {
      toast.error(skillTooLargeMessage(memories.skill.trim().length));
      return;
    }
    setIsSaving(true);
    try {
      const document = await saveUserMemory(memories);
      setSavedMemories(memories);
      broadcastUserMemoryChange(document);
      toast.success("长期记忆已保存");
      // 保存后停止动画
      setActiveDimension(null);
    } catch (err) {
      console.error("保存失败", err);
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadSkill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空选择，保证精简后重新选同一个文件也能触发 onChange。
    e.target.value = "";
    if (!file) return;
    if (!file.name.endsWith(".md")) {
      toast.error("仅支持 Markdown (.md) 格式的 Skill 文档");
      return;
    }
    try {
      const text = await file.text();
      const merged = memories.skill + (memories.skill ? "\n\n" : "") + text;
      if (isSkillOversized(merged)) {
        // 整份拒收，不导入半份：截断的 Skill 会丢掉后半段规则且用户察觉不到。
        const single = text.trim().length > SKILL_DIMENSION_LIMIT;
        toast.error(
          single
            ? skillTooLargeMessage(text.trim().length)
            : `导入后 Skill 合计 ${merged.trim().length.toLocaleString()} 字，超过上限 ${SKILL_DIMENSION_LIMIT.toLocaleString()} 字，请精简之后再上传`,
          { duration: 6000 }
        );
        return;
      }
      setMemories(prev => ({ ...prev, skill: prev.skill + (prev.skill ? "\n\n" : "") + text }));
      toast.success(`已导入 ${file.name}`);
    } catch (err) {
      console.error("导入失败", err);
      toast.error("导入失败");
    }
  };

  const handleDownloadMemory = async () => {
    try {
      // 导出当前编辑框里的内容（含未保存草稿），所见即所得
      const result = await saveMarkdownWithPicker(suggestMemoryFilename(), () =>
        buildMemoryMarkdown({ ...createEmptyUserMemoryDocument(), ...memories })
      );
      if (result.status === "saved") toast.success(`记忆文档已保存：${result.name}`);
      else if (result.status === "downloaded") toast.success("记忆文档已下载到浏览器默认下载目录");
    } catch (err) {
      console.error("下载记忆文档失败", err);
      toast.error("下载记忆文档失败");
    }
  };

  const hasUnsavedChanges = DIMENSIONS.some(
    dim => memories[dim.key] !== savedMemories[dim.key]
  );

  // 货架只展示 SUBSCRIPTION_PLAN_IDS（MEMBERSHIP_PLANS 是定价表不是货架）。
  const shelfPlans = SUBSCRIPTION_PLAN_IDS
    .map(id => MEMBERSHIP_PLANS.find(plan => plan.id === id))
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan?.memoryLimits));
  const currentPlan = MEMBERSHIP_PLANS.find(plan => plan.id === currentPlanId);
  const planDisplayName = currentPlan?.shortName || "Free";
  // 下一档 = 货架上第一个「每项容量更大」的套餐；已是顶配则不显示升级。
  const nextPlan = shelfPlans.find(plan => plan.memoryLimits!.perDimension > currentLimits.perDimension);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-subtle)]" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* 点阵背景画布 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* 主内容 */}
      <div className="relative z-10 flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* 标题 */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-[var(--color-surface-elevated)] flex items-center justify-center">
              <Brain className="w-6 h-6" style={{ color: "#C5ED47" }} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">长期记忆</h1>
              <p className="type-caption text-[var(--color-text-subtle)] mt-1">
                长期记忆始终生效，持续伴随账号。四维度输入框激活时播放智能动效。
              </p>
            </div>
          </div>

          {/* 当前套餐的长期记忆容量（数字现算自服务端 limits，不写死） */}
          <div
            className="mb-6 p-4 rounded-xl flex items-center justify-between gap-4"
            style={{ background: "var(--color-surface-elevated)", border: "1px solid rgba(197, 237, 71, 0.25)" }}
            data-testid="memory-plan-capacity"
          >
            <div className="type-body-sm min-w-0">
              <div className="font-medium">当前套餐：{planDisplayName}</div>
              <div className="type-caption text-[var(--color-text-subtle)] mt-1">
                项目记忆 / 通用规则 / 常规记忆每项 {currentLimits.perDimension.toLocaleString()} 字、合计 {currentLimits.total.toLocaleString()} 字；
                Skill 文档上限 {currentLimits.skill.toLocaleString()} 字（所有套餐一致）
              </div>
            </div>
            {nextPlan && (
              <a
                href="/billing?tab=subscription"
                className="shrink-0 type-caption px-3 py-1.5 rounded-lg font-medium"
                style={{ background: "#C5ED47", color: "#111" }}
                data-testid="memory-upgrade-link"
              >
                升级 {nextPlan.shortName} · 每项 {nextPlan.memoryLimits!.perDimension.toLocaleString()} 字
              </a>
            )}
          </div>

          {/* 四维度输入框 */}
          <div className="space-y-6">
            {DIMENSIONS.map(dim => {
              const currentLength = memories[dim.key].length;
              const isActive = activeDimension === dim.key;
              const oversized = dim.key === "skill" && isSkillOversized(memories.skill);
              const maxLength = dim.key === "skill" ? currentLimits.skill : currentLimits.perDimension;
              return (
                <div
                  key={dim.key}
                  className="p-6 rounded-xl transition-all duration-300"
                  style={{
                    background: isActive
                      ? "linear-gradient(135deg, rgba(197, 237, 71, 0.08), rgba(197, 237, 71, 0.02))"
                      : "var(--color-surface-elevated)",
                    boxShadow: isActive
                      ? "0 0 0 2px rgba(197, 237, 71, 0.3), 0 8px 24px rgba(0,0,0,0.3)"
                      : "0 2px 8px rgba(0,0,0,0.2)",
                  }}
                  data-testid={`memory-dimension-${dim.key}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-medium">{dim.label}</label>
                    {dim.allowUpload && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".md"
                          className="hidden"
                          onChange={handleUploadSkill}
                          data-testid="memory-upload-skill"
                        />
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-base)] hover:bg-[var(--color-surface-hover)] transition-colors">
                          <Upload className="w-4 h-4" />
                          <span className="type-caption">导入本地 Skill</span>
                        </div>
                      </label>
                    )}
                  </div>
                  <textarea
                    value={memories[dim.key]}
                    onChange={e => setMemories(prev => ({ ...prev, [dim.key]: e.target.value }))}
                    onFocus={() => setActiveDimension(dim.key)}
                    onBlur={() => {
                      // 延迟清空，避免保存按钮点击时动画立即停止
                      setTimeout(() => {
                        if (document.activeElement?.tagName !== "TEXTAREA") {
                          setActiveDimension(null);
                        }
                      }, 100);
                    }}
                    placeholder={dim.placeholder}
                    // Skill 不用原生 maxLength：粘贴超长文档会被静默截断，改为显式提醒。
                    maxLength={dim.key === "skill" ? undefined : maxLength}
                    rows={dim.key === "skill" ? 10 : 6}
                    className="w-full p-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] focus:border-[#C5ED47] focus:outline-none resize-none type-body-sm"
                    data-testid={`memory-input-${dim.key}`}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="type-caption"
                      style={{ color: oversized ? "#FF6B6B" : "var(--color-text-subtle)" }}
                      data-testid={`memory-count-${dim.key}`}
                    >
                      {currentLength.toLocaleString()} / {maxLength.toLocaleString()} 字
                      {oversized && " · Skill 过大，请精简之后再上传"}
                    </span>
                    {memories[dim.key] !== savedMemories[dim.key] && (
                      <span className="type-caption" style={{ color: "#C5ED47" }}>
                        有未保存的修改
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end items-center gap-4 mt-8">
            <button
              onClick={handleDownloadMemory}
              className="px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2"
              style={{
                background: "var(--color-surface-elevated)",
                color: "var(--color-text-base)",
              }}
              data-testid="memory-download"
            >
              <Download className="w-5 h-5" />
              下载记忆文档
            </button>
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: hasUnsavedChanges && !isSaving ? "#C5ED47" : "var(--color-surface-elevated)",
                color: hasUnsavedChanges && !isSaving ? "#000" : "var(--color-text-base)",
              }}
              data-testid="memory-save"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  保存长期记忆
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
