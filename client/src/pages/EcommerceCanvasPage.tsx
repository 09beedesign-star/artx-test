/**
 * EcommerceCanvasPage — 电商画布（路由分发壳）
 *
 * 「AI 带货图文」+ 原「智能电商产品」的整合入口（左侧边栏「电商画布」）。
 *
 * 【子路由】父路由注册的是 /ecommerce-canvas/*?（可选通配，见 App.tsx），这里再分发：
 *   /ecommerce-canvas                  → 带货图文工作台（默认）
 *   /ecommerce-canvas/post             → 带货图文工作台
 *   /ecommerce-canvas/product          → 产品图工作台
 *   /ecommerce-canvas/templates        → 模板库总览（二级页）
 *   /ecommerce-canvas/templates/:id    → 模板详情（二级页）
 *   /ecommerce-canvas/history          → 生成记录（二级页）
 *   其它                                → 重定向回 /ecommerce-canvas/post
 *
 * ⚠️ 草稿（draft）state 提在本壳里，而不是放在工作台内部 ——
 *    否则用户点「查看全部」进模板库、挑完模板回工作台，
 *    刚才写的卖点、选的模型、传的图全没了。
 *
 * 能力来源：
 *  - 带货图文：复刻美图设计室 shoppable-carousel 的参数结构
 *    （上传 ≤5 张 / 平台·市场·语言·比例 / 卖点 AI 帮写 / 分镜模板 /
 *      社媒发布文案 / 张数），模板库见 data/ecommerce-canvas-templates.ts。
 *  - 产品图：与画布内 SmartCommerceProductDialog 对齐，
 *    背景模板直接复用 PicwishBackgroundSelector（同一条
 *    listPicWishBackgroundTemplates 链路，不另起数据源）。
 *
 * 计价：走 shared/ai-credit-policy 的 quoteAiUsage（模型每张积分 ×
 * 张数 × 分辨率系数，取整十），与全站口径一致，不在此页自定义价格。
 *
 * 模型：默认全站默认档 image2.5 medium（70 积分/张），banana 2.1 可手选。展示名一律来自 IMAGE_AI_MODELS
 * 的 label（ModelSelector 内部处理），页面不硬编码模型文案。
 *
 * ⚠️ 图片生成逻辑（2026-10-17 修复）：
 * - **产品图模式**：用户上传的商品图 + 选择的背景模板 → 调用 `createProductBackground`（智能产品的模板模式同源链路），真正做图生图
 * - **带货图文模式**：卖点 + 分镜模板 + 商品图作为源图 → 循环调用 `editImageWithPrompt`（image_edit）
 */
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Redirect, useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { createProductBackground, editImageWithPrompt, waitForImageGenerationTask } from "@/lib/ai";
import { IMAGE_AI_MODELS } from "@/lib/workspace-data";
import { getMemoryContextSurcharge, quoteAiUsage } from "@shared/ai-credit-policy";
import { DEFAULT_IMAGE_MODEL_ID } from "@shared/image-models";
import {
  broadcastUserMemoryChange,
  fetchUserMemory,
  saveUserMemory,
  setCurrentMemoryScope,
  USER_MEMORY_CHANGED_EVENT,
} from "@/lib/user-memory-client";
import { buildUserMemoryContext, ECOMMERCE_MEMORY_SCOPE, type UserMemoryDocument } from "@shared/user-memory";
import {
  ECOMMERCE_TEMPLATES,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_MARKETS,
  ECOMMERCE_LANGUAGES,
  type EcommerceTpl,
} from "@/data/ecommerce-canvas-templates";
import {
  ecommercePalette,
  pixelSize,
  splitFlow,
  type EcommerceDraft,
  type EcommerceMode,
} from "@/components/ecommerce/shared";
import { EcommerceWorkspace } from "@/components/ecommerce/EcommerceWorkspace";
import { EcommerceTemplateGallery } from "@/components/ecommerce/EcommerceTemplateGallery";
import { EcommerceTemplateDetail } from "@/components/ecommerce/EcommerceTemplateDetail";
import {
  EcommerceHistory,
  type EcommerceHistoryEntry,
} from "@/components/ecommerce/EcommerceHistory";
import { EcommerceResultLightbox } from "@/components/ecommerce/EcommerceResultLightbox";
import { EcommerceCanvasPresetPanel } from "@/components/ecommerce/EcommerceCanvasPresetPanel";
import {
  mergeEcommerceCanvasPreset,
  readActiveEcommerceCanvasPresetId,
  readEcommerceCanvasPresets,
} from "@/lib/ecommerce-canvas-presets";
import {
  addEcommerceHistoryEntry,
  deleteEcommerceHistoryEntry,
  clearEcommerceHistory,
  readEcommerceHistory,
} from "@/lib/image-gen-history";
import {
  persistEcommerceTask,
  markEcommerceTaskBackgroundStarted,
  markEcommerceTaskCompleted,
  markEcommerceTaskFailed,
  readPendingEcommerceTasks,
  consumeCompletedEcommerceTasks,
  cancelPendingEcommerceTaskRecovery,
} from "@/lib/ecommerce-task-persistence";
import {
  isInRecoveryWindow,
  hasPromptedThisSession,
  markPromptedThisSession,
  recoveryBatchSignature,
} from "@/lib/task-recovery-window";

// 2026-10-17 用户拍板：电商板块默认用 70 积分/张的全站默认档（image2.5 medium）。
// banana 2.1（vod-gg36）300 积分/张、按 70 收会亏本，只作可选项。
const DEFAULT_MODEL_ID = DEFAULT_IMAGE_MODEL_ID;
const ROOT = "/ecommerce-canvas";
const TEMPLATE_PREFIX = "templates/";

function createDefaultDraft(): EcommerceDraft {
  return {
    model: DEFAULT_MODEL_ID,
    uploads: [],
    platform: ECOMMERCE_PLATFORMS[0],
    market: ECOMMERCE_MARKETS[0],
    language: ECOMMERCE_LANGUAGES[0],
    postRatio: "3:4",
    sellingPoints: "",
    tplId: null,
    withCopy: true,
    postCount: 6,
    productRatio: "3:4",
    productTier: "1k",
    // 2026-10-17 用户拍板：产品图默认 1 张，用户主动调高才多张（与画布内产品图弹窗一致）。
    productCount: 1,
  };
}

/**
 * 从 wouter 的 location 里拆出子路径与 query。
 *
 * ⚠️ location 已经去掉了 router base（wouter 的 useLocation 返回相对路径），
 *    但**仍然可能带尾斜杠** —— 静态托管会把 /ecommerce-canvas 301 成
 *    /ecommerce-canvas/。所以先剥尾斜杠再分段，否则 sub 会拿到 "post/"。
 */
function parseRoute(location: string) {
  const [rawPath, rawSearch = ""] = location.split("?");
  const clean = rawPath.replace(/\/+$/, "");
  const sub = clean.replace(new RegExp(`^${ROOT}(/|$)`), "").replace(/^\//, "");
  return { sub, params: new URLSearchParams(rawSearch) };
}

export default function EcommerceCanvasPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const [location, navigate] = useLocation();
  const palette = useMemo(() => ecommercePalette(isDark), [isDark]);

  const { sub, params } = useMemo(() => parseRoute(location), [location]);
  // 2026-10-18 用户要求：Tab 切换不跳路由，本地状态切换。
  // URL 仅用于首次加载决定初始模式（sub === "post" 才是带货图文，其余默认产品图）。
  const [mode, setMode] = useState<EcommerceMode>(() => (sub === "post" ? "post" : "product"));
  // ⚠️ 站内其它入口（模板库「使用」→ /post、生成记录「打开」→ /:mode）仍靠 URL 指定模式，
  //    组件不会重挂载，useState 初值只跑一次 → 必须同步，否则点了「使用模板」停在产品图。
  useEffect(() => {
    if (sub === "post" || sub === "product") setMode(sub);
  }, [sub]);
  /**
   * Tab 切换：只改本地状态 + replaceState 改地址栏（不进历史栈、不触发路由跳转/重载），
   * 保证刷新后仍停在当前 Tab。
   */
  const switchMode = useCallback((next: EcommerceMode) => {
    setMode(next);
    if (typeof window !== "undefined") {
      const url = `${window.location.pathname.replace(/\/ecommerce-canvas(\/.*)?$/, "")}${ROOT}/${next}${window.location.search}`;
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  // 页面加载时间,用于2分钟恢复窗口判断
  const pageLoadTimeRef = useRef(Date.now());

  const [draft, setDraft] = useState<EcommerceDraft>(createDefaultDraft);
  /*
   * 生成状态与结果按模式各存一份（2026-10-18）：原先页面级共用一个 generating/results，
   * 带货图文生成中切到产品图，产品图也显示「正在生成」，结果也会串到另一个模式。
   * 生成时记住 startedMode，结束只写回发起它的那个模式。
   */
  const [generatingByMode, setGeneratingByMode] = useState<Record<EcommerceMode, boolean>>({ product: false, post: false });
  const [resultsByMode, setResultsByMode] = useState<Record<EcommerceMode, string[]>>({ product: [], post: [] });
  const generating = generatingByMode[mode];
  const results = resultsByMode[mode];
  const setModeGenerating = useCallback((target: EcommerceMode, value: boolean) => {
    setGeneratingByMode(prev => ({ ...prev, [target]: value }));
  }, []);
  const setModeResults = useCallback((target: EcommerceMode, value: string[]) => {
    setResultsByMode(prev => ({ ...prev, [target]: value }));
    // 有了新结果（哪怕是清空）就不再是「中断」态。
    setInterruptedByMode(prev => (prev[target] ? { ...prev, [target]: false } : prev));
  }, []);
  /**
   * 「图片生成中断」态（2026-10-18）：用户在恢复提示里点了「取消」后，
   * 结果区要显式写出中断，而不是安静地回到空白。重新生成 / 清空结果即消失。
   */
  const [interruptedByMode, setInterruptedByMode] = useState<Record<EcommerceMode, boolean>>({ product: false, post: false });
  const interrupted = interruptedByMode[mode];
  const [history, setHistory] = useState<EcommerceHistoryEntry[]>(() => readEcommerceHistory(accountId));
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  /**
   * 生成记录持久化在 localStorage（image-gen-history），刷新不丢；账号切换重读。
   * 过期清理在 EcommerceHistory 里按服务端下发的 retentionDays 做。
   */
  useEffect(() => {
    setHistory(readEcommerceHistory(accountId));
  }, [accountId]);

  /**
   * 任务断点恢复（2026-10-18）：用户刷新页面或关闭后重新进入,
   * 在 2 分钟内提示恢复未完成的任务。
   */
  useEffect(() => {
    if (!accountId) return;
    
    // ⚠️ 任务按账号存、不分模式 → scope 也不能带 mode，否则切换产品图/带货图文会重复弹窗。
    const scope = "ecommerce-canvas";
    const pendingTasks = readPendingEcommerceTasks(accountId);
    const completedTasks = consumeCompletedEcommerceTasks(accountId);
    const signature = recoveryBatchSignature(pendingTasks.map(t => t.generationId));
    
    // 后台已经跑完的结果直接回填（已扣费、无需再问）。
    // ⚠️ consume 已经把它们标为已消费，这里不回填就永远丢了 —— 不能再加「无 pending 才回填」的条件。
    if (completedTasks.length > 0) {
      completedTasks.forEach(task => {
        if (task.images && task.images.length > 0) {
          setModeResults(task.mode, task.images);
          const entry: EcommerceHistoryEntry = {
            id: task.generationId,
            mode: task.mode,
            model: task.model,
            count: task.count,
            credits: 0, // 恢复的任务不显示积分(已在首次生成时扣除)
            templateName: "",
            backgroundName: "",
            prompt: task.prompt,
            images: task.images,
            createdAt: Date.now(),
          };
          setHistory(addEcommerceHistoryEntry(accountId, entry));
        }
      });
      toast.success(`已恢复 ${completedTasks.length} 个任务的结果`);
    }
    
    // 有未完成任务 + 在恢复窗口内 + 本次会话未提示过这批 → 弹提示
    if (
      pendingTasks.length > 0 &&
      isInRecoveryWindow(pageLoadTimeRef.current) &&
      !hasPromptedThisSession(scope, signature)
    ) {
      markPromptedThisSession(scope, signature);
      
      // 继续 / 取消 / 划走 / 自动关闭 只能生效一次（sonner 关闭时还会再触发 onDismiss）。
      let settled = false;
      const settle = () => {
        if (settled) return false;
        settled = true;
        return true;
      };
      const handleContinue = async () => {
        if (!settle()) return;
        const modes = Array.from(new Set(pendingTasks.map(t => t.mode)));
        modes.forEach(m => setModeGenerating(m, true));
        try {
          for (const task of pendingTasks) {
            if (task.mode === "product" && task.backgroundTaskInput) {
              // 产品模式：恢复单个任务
              try {
                const result = await waitForImageGenerationTask(task.generationId);
                const urls = (result.images || []).map(img => img.src).filter(Boolean);
                markEcommerceTaskCompleted(accountId, task.generationId, urls);
                setModeResults(task.mode, urls);
                const entry: EcommerceHistoryEntry = {
                  id: task.generationId,
                  mode: task.mode,
                  model: task.model,
                  count: task.count,
                  credits: 0,
                  templateName: "",
                  backgroundName: "",
                  prompt: task.prompt,
                  images: urls,
                  createdAt: Date.now(),
                };
                setHistory(addEcommerceHistoryEntry(accountId, entry));
              } catch (error) {
                markEcommerceTaskFailed(
                  accountId,
                  task.generationId,
                  error instanceof Error ? error.message : "恢复失败"
                );
              }
            } else if (task.mode === "post") {
              // 带货图文模式：每张图独立任务,需要轮询所有子任务
              const imageTaskIds = Array.from({ length: task.count }, (_, i) => `${task.generationId}-img${i}`);
              const collected: string[] = [];
              for (const imageTaskId of imageTaskIds) {
                try {
                  const result = await waitForImageGenerationTask(imageTaskId);
                  const src = result.images[0]?.src;
                  if (src) collected.push(src);
                } catch (error) {
                  console.warn(`恢复图片 ${imageTaskId} 失败:`, error);
                }
              }
              if (collected.length > 0) {
                markEcommerceTaskCompleted(accountId, task.generationId, collected);
                setModeResults(task.mode, collected);
                const entry: EcommerceHistoryEntry = {
                  id: task.generationId,
                  mode: task.mode,
                  model: task.model,
                  count: collected.length,
                  credits: 0,
                  templateName: "",
                  backgroundName: "",
                  prompt: task.prompt,
                  images: collected,
                  createdAt: Date.now(),
                };
                setHistory(addEcommerceHistoryEntry(accountId, entry));
              } else {
                markEcommerceTaskFailed(accountId, task.generationId, "所有图片均恢复失败");
              }
            }
          }
          toast.success(`已恢复 ${pendingTasks.length} 个任务`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "恢复失败");
        } finally {
          modes.forEach(m => setModeGenerating(m, false));
        }
      };
      
      const handleCancel = () => {
        if (!settle()) return;
        cancelPendingEcommerceTaskRecovery(accountId);
        const modes = Array.from(new Set(pendingTasks.map(t => t.mode)));
        setInterruptedByMode(prev => {
          const next = { ...prev };
          modes.forEach(m => {
            next[m] = true;
          });
          return next;
        });
        toast.info("已取消恢复，图片生成中断");
      };
      
      toast(
        `您上次有 ${pendingTasks.length} 个任务未完成，是否继续？`,
        {
          duration: 15000,
          action: {
            label: "继续",
            onClick: handleContinue,
          },
          cancel: {
            label: "取消",
            onClick: handleCancel,
        },
        // ⚠️ 用户不点、只是划走或15秒后自动关闭 → 当作「继续」处理，保证已完成的结果不丢。
        onAutoClose: () => void handleContinue(),
        onDismiss: () => void handleContinue(),
      }
    );
    }
  }, [accountId, setModeGenerating, setModeResults]);

  const updateDraft = useCallback(
    (patch: Partial<EcommerceDraft> | ((d: EcommerceDraft) => EcommerceDraft)) => {
      setDraft(prev => (typeof patch === "function" ? patch(prev) : { ...prev, ...patch }));
    },
    [],
  );

  /**
   * 进入电商画布时自动套用上次激活的参数预设（与智能产品同口径）。
   *
   * ⚠️ 依赖带 accountId：会话内换账号要重读，否则 B 账号看到 A 账号的预设。
   * ⚠️ 走 mergeEcommerceCanvasPreset 唯一合并口：用户已手选的分辨率/画幅比不被覆盖。
   */
  useEffect(() => {
    const activeId = readActiveEcommerceCanvasPresetId(accountId);
    if (!activeId) return;
    const active = readEcommerceCanvasPresets(accountId).find(item => item.id === activeId);
    if (!active) return;
    setDraft(prev => mergeEcommerceCanvasPreset(prev, active.payload));
  }, [accountId]);

  /*
    从模板库 / 详情页带 ?tpl=<id> 回来时，把模板写进草稿。
    ⚠️ updateDraft 在同值时返回原对象（上面那个三元），
       所以这里不会陷入「effect 改 state → state 变 → effect 再跑」的死循环。
  */
  const tplParam = params.get("tpl");
  useEffect(() => {
    if (!tplParam) return;
    const id = Number(tplParam);
    if (!Number.isFinite(id)) return;
    if (!ECOMMERCE_TEMPLATES.some(item => item.id === id)) return;
    updateDraft(prev => (prev.tplId === id ? prev : { ...prev, tplId: id }));
  }, [tplParam, updateDraft]);

  /*
    【2026-10-17】电商画布记忆：与长期记忆、画布对话记忆彼此独立。
    用专属作用域 ECOMMERCE_MEMORY_SCOPE="ecommerce"。
  */
  const [memoryDoc, setMemoryDoc] = useState<UserMemoryDocument | null>(null);
  // 电商画布专属开关（默认关），真值在服务端 ecommerceMemoryEnabled。
  const ecommerceMemoryEnabled = memoryDoc?.ecommerceMemoryEnabled === true;
  useEffect(() => {
    let cancelled = false;
    fetchUserMemory()
      .then(doc => {
        if (!cancelled) setMemoryDoc(doc);
      })
      .catch(() => {
        // 读失败只影响提示条和报价展示，不阻塞出图。
      });
    const onChange = (event: Event) => {
      const doc = (event as CustomEvent<UserMemoryDocument>).detail;
      if (doc) setMemoryDoc(doc);
    };
    window.addEventListener(USER_MEMORY_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(USER_MEMORY_CHANGED_EVENT, onChange);
    };
  }, []);
  const memoryContext = useMemo(
    () =>
      memoryDoc
        ? buildUserMemoryContext({
            document: memoryDoc,
            conversationId: ECOMMERCE_MEMORY_SCOPE,
            includeRecentPrompts: ecommerceMemoryEnabled,
          })
        : "",
    [memoryDoc, ecommerceMemoryEnabled],
  );
  /*
    电商出图请求统一带上电商作用域（fetchAiJson 收口附加）。
    ⚠️ 关着也要带 scope + memoryEnabled:false：服务端据此只注入长期记忆。
  */
  useEffect(() => {
    setCurrentMemoryScope({
      memoryScopeId: ECOMMERCE_MEMORY_SCOPE,
      memoryEnabled: ecommerceMemoryEnabled,
    });
    return () => setCurrentMemoryScope(null);
  }, [ecommerceMemoryEnabled]);
  /** 提示条是否展示：电商记忆开着，或者长期记忆实际会被注入。 */
  const memoryActive = Boolean(ecommerceMemoryEnabled || memoryContext);
  const [memoryBusy, setMemoryBusy] = useState(false);
  /**
   * 切换电商画布专属记忆。先写服务端、成功后才改本地（不做乐观更新）。
   */
  const handleToggleEcommerceMemory = useCallback(
    async (next: boolean) => {
      if (memoryBusy) return;
      setMemoryBusy(true);
      try {
        const document = await saveUserMemory({ ecommerceMemoryEnabled: next });
        setMemoryDoc(document);
        broadcastUserMemoryChange(document);
        toast(
          next ? "您已开启电商画布记忆，可以更好地帮助理解您的意图" : "已关闭电商画布记忆",
          {
            description: next
              ? "电商画布的出图要求优先，与长期记忆不冲突的部分一起参考；与画布对话记忆互相独立。"
              : "此后电商出图只参考左侧边栏「长期记忆」中的内容。",
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "开关保存失败";
        toast("电商画布记忆开关没保存成功", { description: message });
      } finally {
        setMemoryBusy(false);
      }
    },
    [memoryBusy],
  );

  const count = mode === "post" ? draft.postCount : draft.productCount;
  /**
   * 计价能力（2026-10-17 修复）：
   * - 产品图模式：createProductBackground（smart_background），480/请求（flat）
   * - 带货图文模式：editImageWithPrompt × N 次（image_edit），180/次 × 张数
   */
  const billingCapability = mode === "product" ? "smart_background" : "image_edit";
  const quote = useMemo(() => {
    const single = quoteAiUsage({
      capability: billingCapability,
      model: draft.model,
      outputCount: count,
      userMemoryContext: memoryContext,
    });
    // 产品图：一次请求出 N 张，服务端只扣一次 → 直接用。
    // 带货图文：image_edit 一次 1 张、调用 N 次，服务端扣 N 次 → 乘以张数。
    return mode === "product"
      ? single
      : { ...single, chargedCredits: single.chargedCredits * count };
  }, [billingCapability, draft.model, count, mode, memoryContext]);
  /**
   * 单张价（含分辨率系数）。按钮上的总价 = 单张价 × 张数再取整十，
   * 只在按钮上写一个总数会让用户误读成「一张 1200 积分」，
   * 所以这里单独算一份单张价，UI 上把算式摊开写。
   * ⚠️ smart_background 是 per_request（480/次），这里除以 count 得到的「均摊单价」
   * 只是为了 UI 公式展示（让用户理解总价怎么来的），不代表实际按张计费。
   */
  const unitCredits = useMemo(() => {
    if (mode === "product") {
      // smart_background 按请求计（resolutionTier 会影响单价），UI 均摊到张数给用户看算式。
      // 均摊可能出现 480/7 这类小数 → 保留 1 位，避免 UI 出现 68.57142857。
      const perImage = quoteAiUsage({
        capability: "smart_background",
        model: draft.model,
        outputCount: count,
        resolutionTier: draft.productTier,
      }).chargedCredits / count;
      return Math.round(perImage * 10) / 10;
    }
    // 带货图文：image_edit 基础 180/次，真的按张计（循环 N 次调用）。
    return quoteAiUsage({ capability: "image_edit", model: draft.model, outputCount: 1 }).chargedCredits;
  }, [draft.model, mode, draft.productTier, count]);
  const modelLabel = useMemo(
    () => IMAGE_AI_MODELS.find(item => item.id === draft.model)?.label || draft.model,
    [draft.model],
  );

  /**
   * 产品主体保护规则——与智能产品 SmartCommerceProductDialog.handleCreate 的
   * productProtectionRules 逐字一致。无论走哪条链路，上传的商品都不能被重绘、
   * 换色或替换成别的东西，这是电商图的底线。
   */
  const PRODUCT_PROTECTION_RULES = [
    "强约束：必须以上传的产品图作为唯一商品主体，保留原产品的品类、外形、颜色、材质、比例和可见细节，不能替换成其他商品。",
    "保持上传产品图的商品主体完整清晰，不改变产品颜色、材质、文字、标识、比例和外形。",
    "风格只能影响背景、道具和环境氛围，不能卡通化、重绘或重新解释产品主体。",
  ];

  function buildPrompt() {
    if (mode === "product") {
      // 与智能产品「模板模式」prompt 结构一致
      return [
        "创建真实、干净、有商业质感的产品背景。",
        draft.bgTemplate ? `电商背景模板：${draft.bgTemplate.name}` : "使用默认随机电商背景模板。",
        /*
          ⚠️ 2026-10-18：产品图模式不再拼「商品卖点」。
          卖点输入框在本模式已隐藏，但 draft 两个模式共用——带货图文里填的卖点
          会被悄悄带进来；而「默认随机」（无 sceneType）时 prompt 真的会发给上游，
          等于用户看不见的内容在影响出图。
        */
        ...PRODUCT_PROTECTION_RULES,
        "只生成与选定风格匹配的商业化背景、真实光影、空间和氛围。",
      ]
        .filter(Boolean)
        .join("\n");
    }
    const tpl = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId);
    return [
      ...PRODUCT_PROTECTION_RULES,
      `为 ${draft.platform}（${draft.market}市场）生成一套 ${draft.postCount} 张的社媒带货图文，文案语言：${draft.language}。`,
      tpl ? `分镜模板：${tpl.name}（拍摄节奏：${tpl.flow}）。` : "",
      `商品卖点与要求：${draft.sellingPoints.trim() || "由 AI 根据常见卖点合理发挥"}`,
      // 「社媒发布文案」开关已删（2026-10-18）：出图接口不返回文字，写进提示词只会干扰画面。
    ]
      .filter(Boolean)
      .join("\n");
  }

  const handleGenerate = useCallback(async () => {
    if (mode === "post" && draft.tplId === null) {
      toast.error("请先在右侧选择一个分镜模板");
      return;
    }
    if (draft.uploads.length === 0) {
      toast.error("请先上传商品图");
      return;
    }
    const startedMode = mode;
    setModeGenerating(startedMode, true);
    setModeResults(startedMode, []);
    const startedCount = count;
    const startedCredits = quote.chargedCredits;
    const startedPrompt = buildPrompt();
    const startedTemplateName = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId)?.name || "";
    const startedBackgroundName = draft.bgTemplate?.name || "";
    const generationId = `ec-${startedMode}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    try {
      let urls: string[];
      if (startedMode === "product") {
        /*
         * 🔧 产品图模式（2026-10-18）：走异步任务（smart_background），可断点恢复。
         * createProductBackground + generationId → 走 runImageGenerationTask（等同智能产品的模板模式）。
         * 一次调用带 count，per_request 计费（480/次）。
         * 参数与 InfiniteCanvas smart-commerce-product-create 逐项一致，计费也一致。
         */
        const productSize = draft.productTier !== "1k" ? pixelSize(draft.productRatio, draft.productTier) : null;
        
        // 先持久化任务（含 backgroundTaskInput，以便断点恢复）
        const backgroundTaskInput = {
          taskId: generationId,
          capability: "smart_background" as const,
          operation: "create-background" as const,
          imageSrc: draft.uploads[0],
          prompt: startedPrompt,
          style: draft.bgTemplate?.name || "默认电商背景模板",
          sceneType: draft.bgTemplate?.id,
          ratio: draft.productRatio,
          resolution: draft.productTier as "1k" | "2k" | "4k",
          count: startedCount,
          customWidth: productSize?.targetWidth,
          customHeight: productSize?.targetHeight,
          model: draft.model,
        };
        
        persistEcommerceTask(accountId, {
          generationId,
          mode: "product",
          prompt: startedPrompt,
          model: draft.model,
          count: startedCount,
          sourceImageSrc: draft.uploads[0],
          backgroundTaskInput,
        });
        
        markEcommerceTaskBackgroundStarted(accountId, generationId);
        
        let response: Awaited<ReturnType<typeof createProductBackground>>;
        try {
          response = await createProductBackground({
            generationId, // 传 generationId 走异步路径
            imageSrc: draft.uploads[0],
            prompt: startedPrompt,
            style: draft.bgTemplate?.name || "默认电商背景模板",
            sceneType: draft.bgTemplate?.id,
            ratio: draft.productRatio,
            resolution: draft.productTier as "1k" | "2k" | "4k",
            count: startedCount,
            customWidth: productSize?.targetWidth,
            customHeight: productSize?.targetHeight,
            model: draft.model,
          });
        } catch (error) {
          // ⚠️ 不标失败会让它一直留在 pending，下次进来又弹「是否继续」去捞一个注定失败的任务。
          markEcommerceTaskFailed(
            accountId,
            generationId,
            error instanceof Error ? error.message : "生成失败",
          );
          throw error;
        }
        urls = (response.images || []).map(image => image.src).filter(Boolean);
        markEcommerceTaskCompleted(accountId, generationId, urls);
      } else {
        /*
         * 🔧 带货图文模式（2026-10-18）：走异步任务（image_edit），可断点恢复。
         * editImageWithPrompt 逐张传 generationId → 走 runImageGenerationTask。
         * 每张 180 积分，真的按张计。逐张容错：失败的跳过，至少拿到 1 张就算成功。
         */
        const tpl = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId);
        const shots = tpl ? splitFlow(tpl.flow) : [];
        const postSize = pixelSize(draft.postRatio, "1k");
        const extraRefs = draft.uploads.slice(1).map((src, i) => ({
          src,
          title: `same product, another angle ${i + 2}`,
        }));
        
        // 先持久化任务（post 模式每张图有独立 taskId，批次用 generationId 关联）
        persistEcommerceTask(accountId, {
          generationId,
          mode: "post",
          prompt: startedPrompt,
          model: draft.model,
          count: startedCount,
          sourceImageSrc: draft.uploads[0],
          // post 模式没有统一的 backgroundTaskInput，因为每张图参数不同
        });
        
        markEcommerceTaskBackgroundStarted(accountId, generationId);
        
        // 并行生成所有图片以提升速度
        const promises = Array.from({ length: startedCount }, (_, index) => {
          const shot = shots.length
            ? shots[Math.min(shots.length - 1, Math.floor((index * shots.length) / startedCount))]
            : "";
          const imageTaskId = `${generationId}-img${index}`;
          
          return editImageWithPrompt({
            generationId: imageTaskId, // 每张图传独立的 taskId
            imageSrc: draft.uploads[0],
            model: draft.model,
            prompt: [
              startedPrompt,
              `这是第 ${index + 1} / ${startedCount} 张${shot ? `，本张分镜：${shot}` : ""}。请在保持上述要求不变的前提下，更换构图角度、道具搭配与光影氛围，与其他张形成明显差异。`,
            ].join("\n"),
            preserveSourceSize: false,
            targetWidth: postSize.targetWidth,
            targetHeight: postSize.targetHeight,
            referencedAssets: extraRefs,
          }).then(
            result => ({ status: "fulfilled" as const, value: result }),
            error => ({ status: "rejected" as const, reason: error })
          );
        });

        const results = await Promise.all(promises);
        
        // 收集所有成功生成的图片
        const collected: string[] = [];
        const errors: unknown[] = [];
        
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const src = result.value.images[0]?.src;
            if (src) collected.push(src);
          } else {
            errors.push(result.reason);
          }
        });
        
        if (collected.length === 0) {
          const lastError = errors[errors.length - 1];
          markEcommerceTaskFailed(accountId, generationId, lastError instanceof Error ? lastError.message : "图片模型未返回可用图片");
          throw lastError instanceof Error ? lastError : new Error("图片模型未返回可用图片");
        }
        urls = collected;
        markEcommerceTaskCompleted(accountId, generationId, urls);
      }
      if (urls.length === 0) throw new Error("生成结果为空，请重试");
      setModeResults(startedMode, urls);
      const newEntry: EcommerceHistoryEntry = {
        id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        mode: startedMode,
        model: draft.model,
        count: startedCount,
        credits: startedCredits,
        templateName: startedTemplateName,
        backgroundName: startedBackgroundName,
        prompt: startedPrompt,
        images: urls,
        createdAt: Date.now(),
      };
      setHistory(addEcommerceHistoryEntry(accountId, newEntry));
      toast.success(`生成完成：${urls.length} 张`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败，请重试");
    } finally {
      setModeGenerating(startedMode, false);
    }
  }, [count, draft.bgTemplate, draft.model, draft.postRatio, draft.productRatio, draft.productTier, draft.tplId, draft.uploads, mode, quote.chargedCredits, setModeGenerating, setModeResults, accountId]);

  /** 选中模板后回到带货图文工作台（并把模板带进 URL，便于分享/刷新） */
  const goWorkspaceWithTemplate = useCallback(
    (template: EcommerceTpl) => {
      updateDraft({ tplId: template.id });
      navigate(`${ROOT}/post?tpl=${template.id}`);
    },
    [navigate, updateDraft],
  );

  const isTemplatesIndex = sub === "templates";
  const templateId = sub.startsWith(TEMPLATE_PREFIX)
    ? Number(sub.slice(TEMPLATE_PREFIX.length))
    : null;
  const isTemplateDetail = templateId !== null && Number.isFinite(templateId);
  const template = isTemplateDetail
    ? ECOMMERCE_TEMPLATES.find(item => item.id === templateId) || null
    : null;

  return (
    <>
      {isTemplatesIndex ? (
        <EcommerceTemplateGallery
          palette={palette}
          selectedId={draft.tplId}
          onPick={goWorkspaceWithTemplate}
          onOpenDetail={id => navigate(`${ROOT}/templates/${id}`)}
        />
      ) : isTemplateDetail ? (
        <EcommerceTemplateDetail
          template={template}
          palette={palette}
          onUse={goWorkspaceWithTemplate}
        />
      ) : sub === "history" ? (
        <EcommerceHistory
          palette={palette}
          entries={history}
          onOpen={entry => {
            setModeResults(entry.mode, entry.images);
            navigate(`${ROOT}/${entry.mode}`);
          }}
          onRemove={id => setHistory(deleteEcommerceHistoryEntry(accountId, id))}
          onClear={() => {
            clearEcommerceHistory(accountId);
            setHistory([]);
          }}
          scope="ecommerce-canvas"
          accountId={accountId}
        />
      ) : sub === "" || sub === "post" || sub === "product" ? (
        <EcommerceWorkspace
          isDark={isDark}
          mode={mode}
          onSwitchMode={switchMode}
          palette={palette}
          draft={draft}
          updateDraft={updateDraft}
           generating={generating}
           interrupted={interrupted}
           results={results}
          quoteCredits={quote.chargedCredits}
          unitCredits={unitCredits}
          modelLabel={modelLabel}
          memoryActive={memoryActive}
          memorySurcharge={getMemoryContextSurcharge(billingCapability, memoryContext)}
          ecommerceMemoryEnabled={ecommerceMemoryEnabled}
          onToggleEcommerceMemory={handleToggleEcommerceMemory}
          onGenerate={() => void handleGenerate()}
          onClearResults={() => setModeResults(mode, [])}
          onOpenTemplateDetail={id => navigate(`${ROOT}/templates/${id}`)}
          onPreviewResult={index => setPreviewIndex(index)}
          presetSlot={
            <EcommerceCanvasPresetPanel
              palette={palette}
              draft={draft}
              updateDraft={updateDraft}
              accountId={accountId}
            />
          }
        />
      ) : (
        <Redirect to={`${ROOT}/product`} replace />
      )}

      {previewIndex !== null ? (
        <EcommerceResultLightbox
          images={results}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}
    </>
  );
}
