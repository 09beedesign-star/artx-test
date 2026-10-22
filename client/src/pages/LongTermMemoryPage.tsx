/**
 * 长期记忆独立页面
 * - 四维度长期记忆输入：项目记忆、Skill、通用规则、常规记忆
 * - Skill 支持导入本地 .md 文档
 * - 点阵背景常驻显示，模块与输入框纯色底。选中态白色边框高亮，未选中灰色线条和文字。
 * - 支持下载记忆文档：系统原生文件保存对话框，用户选择保存路径
 * - 与个人中心的能力完全一致，但 UI 呈现科技感（与平台风格保持一致）
 */
import { useEffect, useState } from "react";
import { Brain, Upload, Save, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
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
import { useTheme } from "@/contexts/ThemeContext";

type MemoryDimension = "projectMemory" | "skill" | "generalRules" | "regularMemory";

/*
  2026-10-18 用户需求：
  · 页面常驻点阵背景；模块与输入框一律纯色底，点阵不得透进来。
  · 线条只有选中态是白色高亮，其余一律灰线；未选中模块内所有文字灰色。
  ⚠️ 色值必须显式给出：本页原先用的 --color-surface-* / --color-border-* 全项目
     **没有定义**，背景与边框一直是静默失效的（点阵会透进输入框就是这个原因）。
     与 ProfilePage 同一口径：useTheme + 亮/暗两套色值。
  ⚠️ 模块与输入框背景必须不透明，禁止 rgba 半透明/渐变，否则点阵透出。
*/
function getMemoryPalette(isDark: boolean) {
  return isDark
    ? {
        pageBg: "#222222",
        dot: "rgba(255, 255, 255, 0.14)",
        card: "#2A2A2A",
        field: "#303030",
        lineIdle: "rgba(255, 255, 255, 0.12)",
        lineActive: "rgba(255, 255, 255, 0.92)",
        textIdle: "rgba(255, 255, 255, 0.45)",
        textActive: "rgba(255, 255, 255, 0.92)",
        brandGreenIcon: "#C5ED47", // 品牌绿色图标（黑夜模式）
      }
    : {
        pageBg: "#FFFFFF",
        dot: "rgba(20, 20, 36, 0.16)",
        card: "#FFFFFF",
        field: "#F7F7F9",
        lineIdle: "rgba(20, 20, 36, 0.12)",
        // 亮色主题下「白色高亮线」在白底上看不见，改用高对比深色线承担同样的「选中」语义
        lineActive: "rgba(20, 20, 36, 0.85)",
        textIdle: "rgba(20, 20, 36, 0.45)",
        textActive: "rgba(20, 20, 36, 0.9)",
        brandGreenIcon: "#5C7A1A", // 品牌绿色图标（白天模式加深以提升对比度）
      };
}

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
  const { resolvedTheme } = useTheme();
  const c = getMemoryPalette(resolvedTheme === "dark");
  const LINE_IDLE = c.lineIdle;
  const LINE_ACTIVE = c.lineActive;
  const TEXT_IDLE = c.textIdle;
  const TEXT_ACTIVE = c.textActive;
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
        <Loader2 className="w-8 h-8 animate-spin " />
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden"
      style={{
        background: c.pageBg,
        backgroundImage: `radial-gradient(${c.dot} 1px, transparent 1px)`,
        backgroundSize: "18px 18px",
      }}
      data-testid="memory-page-dot-grid"
    >
      {/* 主内容 */}
      <div className="relative z-10 flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* 标题 */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full  flex items-center justify-center">
              <Brain className="w-6 h-6" style={{ color: c.brandGreenIcon }} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">长期记忆</h1>
              <p className="type-caption  mt-1">
                长期记忆始终生效，持续伴随账号。选中的输入框白色高亮。
              </p>
            </div>
          </div>

          {/* 当前套餐的长期记忆容量（数字现算自服务端 limits，不写死） */}
          <div
            className="mb-6 p-4 rounded-xl flex items-center justify-between gap-4"
            style={{ background: c.card, border: `1px solid ${LINE_IDLE}`, color: TEXT_ACTIVE }}
            data-testid="memory-plan-capacity"
          >
            <div className="type-body-sm min-w-0">
              <div className="font-medium">当前套餐：{planDisplayName}</div>
              <div className="type-caption  mt-1">
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

          {/* 四维度输入框：只有 textarea 有边框，标题与 label 不用卡片包裹 */}
          <div className="space-y-6">
            {DIMENSIONS.map(dim => {
              const currentLength = memories[dim.key].length;
              const isActive = activeDimension === dim.key;
              const oversized = dim.key === "skill" && isSkillOversized(memories.skill);
              const maxLength = dim.key === "skill" ? currentLimits.skill : currentLimits.perDimension;
              const borderColor = isActive ? "rgba(197,237,71,0.42)" : LINE_IDLE;
              const glowColor = isActive
                ? "0 0 0 3px rgba(197,237,71,0.14)"
                : "none";
              return (
                <div
                  key={dim.key}
                  className="transition-all duration-200"
                  data-testid={`memory-dimension-${dim.key}`}
                  data-active={isActive ? "true" : "false"}
                >
                  <div className="flex items-center justify-between mb-2">
                    <label
                      className="font-medium"
                      style={{ color: isActive ? TEXT_ACTIVE : TEXT_IDLE }}
                    >
                      {dim.label}
                    </label>
                    {dim.allowUpload && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".md"
                          className="hidden"
                          onChange={handleUploadSkill}
                          data-testid="memory-upload-skill"
                        />
                        <div
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                          style={{
                            background: c.field,
                            border: `1px solid ${borderColor}`,
                            color: isActive ? TEXT_ACTIVE : TEXT_IDLE,
                          }}
                        >
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
                      setTimeout(() => {
                        if (document.activeElement?.tagName !== "TEXTAREA") {
                          setActiveDimension(null);
                        }
                      }, 100);
                    }}
                    placeholder={dim.placeholder}
                    maxLength={dim.key === "skill" ? undefined : maxLength}
                    rows={dim.key === "skill" ? 10 : 6}
                    className="w-full p-3 rounded-lg focus:outline-none resize-none type-body-sm transition-all duration-200"
                    style={{
                      background: c.field,
                      border: `1px solid ${borderColor}`,
                      boxShadow: `${glowColor}`,
                      color: isActive ? TEXT_ACTIVE : TEXT_IDLE,
                    }}
                    data-testid={`memory-input-${dim.key}`}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="type-caption"
                      style={{ color: oversized ? "#FF6B6B" : TEXT_IDLE }}
                      data-testid={`memory-count-${dim.key}`}
                    >
                      {currentLength.toLocaleString()} / {maxLength.toLocaleString()} 字
                      {oversized && " · Skill 过大，请精简之后再上传"}
                    </span>
                    {memories[dim.key] !== savedMemories[dim.key] && (
                      <span
                        className="type-caption"
                        style={{ color: isActive ? "rgba(197,237,71,0.92)" : TEXT_IDLE }}
                      >
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
                background: c.card,
                border: `1px solid ${LINE_IDLE}`,
                color: TEXT_ACTIVE,
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
                background: hasUnsavedChanges && !isSaving ? "#C5ED47" : c.card,
                border: `1px solid ${hasUnsavedChanges && !isSaving ? "#C5ED47" : LINE_IDLE}`,
                color: hasUnsavedChanges && !isSaving ? "#000" : TEXT_IDLE,
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
