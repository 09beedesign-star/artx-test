/**
 * 3D 生成面板（2026-xx-xx）。
 *
 * 从图片节点右键「生成 3D 模型」触发，以参考图 + 文字提示词驱动后端
 * /api/threed/generate 路由，轮询完成后回调交出 modelUrl。
 *
 * UI 模式：portal 到 body 的浮层面板，与 AssetPropertiesDialog 风格一致。
 * portal 到 body，避免被画布层叠上下文裁掉。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Box, Loader2, AlertCircle } from "lucide-react";
import {
  THREED_GEN_MODEL_IDS,
  DEFAULT_THREED_GEN_MODEL_ID,
  type ThreeDGenModelId,
} from "@shared/model3d";
import {
  startThreeDGenerationTask,
  waitForThreeDGenerationTask,
  isAiAbortError,
} from "@/lib/ai";

export interface ThreeDGeneratorPanelProps {
  /** 参考图片的 URL（来自图片节点 localSrc） */
  referenceImageUrl: string;
  isDark: boolean;
  onClose: () => void;
  /** 生成完成后回调，传出 GLB URL */
  onGenerated: (modelUrl: string, model: string, prompt: string) => void;
}

const MODEL_LABELS: Record<ThreeDGenModelId, string> = {
  "hunyuan3d-2.5": "混元 3D 2.5",
  "tripo3d-v2.5": "Tripo3D v2.5",
  "meshy-4": "Meshy v4",
  "stability3d-fast": "Stability3D Fast",
};

function generateTaskId() {
  return `threed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ThreeDGeneratorPanel({
  referenceImageUrl,
  isDark,
  onClose,
  onGenerated,
}: ThreeDGeneratorPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ThreeDGenModelId>(DEFAULT_THREED_GEN_MODEL_ID);
  const [status, setStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "generating") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  // 组件卸载时中止轮询
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (status === "generating") return;
    setStatus("generating");
    setErrorMsg("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const taskId = generateTaskId();
      // 1. 提交任务（后端立即返回 pending task）
      await startThreeDGenerationTask({
        taskId,
        prompt: prompt.trim() || "高质量 3D 模型",
        model,
        referenceImageUrl,
      });

      // 2. 轮询直到 completed / failed
      const completed = await waitForThreeDGenerationTask(taskId, ac.signal);

      if (!completed.modelUrl) {
        throw new Error("3D 生成完成但未返回模型文件地址");
      }
      setStatus("done");
      onGenerated(completed.modelUrl, model, prompt.trim() || "高质量 3D 模型");
      onClose();
    } catch (err) {
      if (isAiAbortError(err)) {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "3D 生成失败，请稍后重试");
    }
  }, [status, prompt, model, referenceImageUrl, onGenerated, onClose]);

  function handleAbort() {
    abortRef.current?.abort();
    setStatus("idle");
  }

  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "#eeeeee" : "#262627";
  const sub = isDark ? "rgba(255,255,255,0.46)" : "rgba(0,0,0,0.44)";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const inputBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,14,0.60)", backdropFilter: "blur(6px)" }}
      onMouseDown={status === "generating" ? undefined : onClose}
    >
      <section
        data-artx-threed-generator=""
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-2">
            <Box size={16} style={{ color: "#7c5cff" }} />
            <h2 className="text-sm font-semibold">生成 3D 模型</h2>
          </div>
          {status !== "generating" && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-full p-1.5"
              style={{ color: sub }}
            >
              <X size={16} />
            </button>
          )}
        </header>

        <div className="flex flex-col gap-4 px-5 py-5">
          {/* 参考图预览 */}
          {referenceImageUrl && (
            <div className="flex justify-center">
              <img
                src={referenceImageUrl}
                alt="参考图片"
                className="max-h-[140px] max-w-full rounded-lg object-contain"
                style={{ border: `1px solid ${border}` }}
              />
            </div>
          )}

          {/* 提示词输入 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: sub }}>
              提示词（可选）
            </label>
            <textarea
              className="w-full resize-none rounded-lg px-3 py-2.5 text-sm leading-5 outline-none"
              rows={3}
              placeholder="描述 3D 模型的细节，留空则自动生成"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={status === "generating"}
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                color: text,
              }}
            />
          </div>

          {/* 模型选择 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: sub }}>
              生成模型
            </label>
            <div className="grid grid-cols-2 gap-2">
              {THREED_GEN_MODEL_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={status === "generating"}
                  onClick={() => setModel(id)}
                  className="rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all"
                  style={{
                    background: model === id
                      ? isDark ? "rgba(124,92,255,0.22)" : "rgba(124,92,255,0.12)"
                      : inputBg,
                    border: `1px solid ${model === id ? "#7c5cff" : inputBorder}`,
                    color: model === id ? "#7c5cff" : text,
                    opacity: status === "generating" ? 0.5 : 1,
                  }}
                >
                  {MODEL_LABELS[id]}
                </button>
              ))}
            </div>
          </div>

          {/* 错误提示 */}
          {status === "error" && errorMsg && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-5"
              style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-between gap-3 px-5 pb-5"
        >
          <p className="text-[11px] leading-5" style={{ color: sub }}>
            约 300–500 积分 · 生成需 10–60 秒
          </p>
          {status === "generating" ? (
            <button
              type="button"
              onClick={handleAbort}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(239,68,68,0.14)", color: "#f87171", border: "1px solid rgba(239,68,68,0.28)" }}
            >
              <Loader2 size={13} className="animate-spin" />
              停止生成
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "#7c5cff", color: "#ffffff" }}
            >
              <Box size={13} />
              {status === "error" ? "重试" : "开始生成"}
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
