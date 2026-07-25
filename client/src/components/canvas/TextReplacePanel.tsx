/**
 * Text Replace Panel Component
 * 
 * UI for extracting and replacing text in images
 * Integrated into the canvas toolbar
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Type, X, Loader2, Check } from "lucide-react";
import {
  prepareTextReplacementUI,
  executeTextReplacement,
  type ImageTextRegion,
} from "../../lib/text-replace";

export interface TextReplaceItem {
  id: string;
  originalText: string;
  newText: string;
  regionIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  direction?: "horizontal" | "vertical";
}

interface TextReplacePanelProps {
  imageSrc: string;
  onClose: () => void;
  onSuccess: (images: Array<{ src: string; width: number; height: number }>) => void;
}

export function TextReplacePanel({
  imageSrc,
  onClose,
  onSuccess,
}: TextReplacePanelProps) {
  const [step, setStep] = useState<"idle" | "extracting" | "editing" | "replacing">("idle");
  const [editableItems, setEditableItems] = useState<TextReplaceItem[]>([]);
  const [error, setError] = useState<string>("");

  const handleExtractText = useCallback(async () => {
    setStep("extracting");
    setError("");

    try {
      const result = await prepareTextReplacementUI(imageSrc);

      if (!result.success) {
        setError(result.error || "提取文字失败");
        setStep("idle");
        return;
      }

      setEditableItems(result.editableItems || []);
      setStep("editing");
      toast.success(`成功提取 ${(result.editableItems || []).length} 段文字`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "提取文字失败";
      setError(message);
      setStep("idle");
      toast.error(message);
    }
  }, [imageSrc]);

  const handleUpdateText = useCallback((id: string, newText: string) => {
    setEditableItems(items =>
      items.map(item =>
        item.id === id ? { ...item, newText } : item
      )
    );
  }, []);

  const handleReplaceText = useCallback(async () => {
    setStep("replacing");
    setError("");

    try {
      const result = await executeTextReplacement(imageSrc, editableItems);

      if (!result.success) {
        setError(result.error || "文字替换失败");
        setStep("editing");
        toast.error(result.error || "文字替换失败");
        return;
      }

      toast.success("文字替换成功");
      onSuccess(result.images || []);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "文字替换失败";
      setError(message);
      setStep("editing");
      toast.error(message);
    }
  }, [imageSrc, editableItems, onSuccess, onClose]);

  const changedCount = editableItems.filter(
    item => item.newText !== item.originalText
  ).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5" />
            <h2 className="text-lg font-semibold">图片文字替换</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            disabled={step !== "idle" && step !== "editing"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {step === "idle" && (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">点击下方按钮开始提取图片中的文字</p>
              <button
                onClick={handleExtractText}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
              >
                提取文字
              </button>
            </div>
          )}

          {step === "extracting" && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-gray-600">正在提取文字...</p>
            </div>
          )}

          {step === "editing" && editableItems.length > 0 && (
            <div className="space-y-3">
              {editableItems.map(item => (
                <div key={item.id} className="border rounded p-3 hover:bg-gray-50">
                  <div className="text-sm text-gray-600 mb-2">
                    原文: <span className="font-mono">{item.originalText}</span>
                    {item.confidence && (
                      <span className="ml-2 text-xs text-gray-500">
                        置信度: {(item.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={item.newText}
                    onChange={e => handleUpdateText(item.id, e.target.value)}
                    placeholder="输入新文字"
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {item.newText !== item.originalText && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
                      <Check className="w-3 h-3" />
                      已修改
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === "replacing" && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-gray-600">正在替换文字...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end gap-2">
          {step === "editing" && (
            <>
              <button
                onClick={() => {
                  setEditableItems([]);
                  setStep("idle");
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50 transition"
              >
                重新提取
              </button>
              <button
                onClick={handleReplaceText}
                disabled={changedCount === 0 || step !== "editing"}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition flex items-center gap-2"
              >
                {step !== "editing" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    替换中...
                  </>
                ) : (
                  <>
                    替换文字 ({changedCount} 处)
                  </>
                )}
              </button>
            </>
          )}
          {step === "idle" && (
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50 transition"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
