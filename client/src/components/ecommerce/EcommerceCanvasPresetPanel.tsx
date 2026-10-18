/**
 * 电商画布参数预设管理面板
 *
 * 【设计决策】复制智能产品 SmartCommerceProductDialog 的预设面板 UI 逻辑，
 * 但字段适配 EcommerceCanvasPresetPayload。放在左侧参数区最下方。
 *
 * 【交互口径】
 * - 保存预设：当前全部参数存一份，下次进入自动套用
 * - 套用预设：覆盖所有参数，但 productTier/postRatio 尊重用户是否手动改过
 * - 更新预设：用当前参数覆盖选中的那一份
 * - 删除预设：移除一份
 * - 回到初始态：恢复面板出厂默认，取消下次自动套用
 *
 * 【用户改过优先规则】（2026-10-18 用户要求）
 * productTier / postRatio 套用预设时判断：
 *   - draft.userModifiedProductTier === true → 保留用户当前选择，不覆盖
 *   - 否则 → 用预设值覆盖
 */
import { useEffect, useState } from "react";
import { Check, PenLine, Save, Trash2, RotateCcw, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createEcommerceCanvasPresetId,
  nextEcommerceCanvasPresetName,
  readActiveEcommerceCanvasPresetId,
  readEcommerceCanvasPresets,
  writeActiveEcommerceCanvasPresetId,
  writeEcommerceCanvasPresets,
  mergeEcommerceCanvasPreset,
  ECOMMERCE_CANVAS_DEFAULT_PAYLOAD,
  ECOMMERCE_CANVAS_PRESET_LIMIT,
  type EcommerceCanvasPreset,
  type EcommerceCanvasPresetPayload,
} from "@/lib/ecommerce-canvas-presets";
import type { EcommerceDraft, EcommercePalette } from "./shared";

type Props = {
  palette: EcommercePalette;
  draft: EcommerceDraft;
  /** 更新草稿（套用预设时会用） */
  updateDraft: (
    patch: Partial<EcommerceDraft> | ((d: EcommerceDraft) => EcommerceDraft),
  ) => void;
  /** 账号 ID（用于隔离预设存储） */
  accountId: string | null | undefined;
};

export function EcommerceCanvasPresetPanel({ palette, draft, updateDraft, accountId }: Props) {
  /*
   * ⚠️ 初始值必须是空，不能在 useState 里直接读 localStorage：
   *    accountId 首帧可能还是 null（AuthContext 尚未 hydrate），
   *    会读到 guest 位的预设。跟着 accountId 在 effect 里重读（与智能产品同口径）。
   */
  const [presets, setPresets] = useState<EcommerceCanvasPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  useEffect(() => {
    setPresets(readEcommerceCanvasPresets(accountId));
    setActivePresetId(readActiveEcommerceCanvasPresetId(accountId));
  }, [accountId]);
  const [expanded, setExpanded] = useState(false);
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  /** 从当前 draft 提取存储字段 */
  function extractPayload(): EcommerceCanvasPresetPayload {
    return {
      model: draft.model,
      productRatio: draft.productRatio,
      productTier: draft.productTier,
      productCount: draft.productCount,
      bgTemplate: draft.bgTemplate
        ? { id: draft.bgTemplate.id, name: draft.bgTemplate.name, category: draft.bgTemplate.category }
        : null,
      platform: draft.platform,
      market: draft.market,
      language: draft.language,
      postRatio: draft.postRatio,
      postCount: draft.postCount,
      tplId: draft.tplId,
      sellingPoints: draft.sellingPoints,
      noTextOnImage: draft.noTextOnImage,
      withCopy: draft.withCopy,
    };
  }

  /** 套用预设：唯一合并口在 mergeEcommerceCanvasPreset（分辨率/画幅比用户改过优先） */
  function applyPayload(payload: EcommerceCanvasPresetPayload, force = false) {
    updateDraft(prev => mergeEcommerceCanvasPreset(prev, payload, { force }));
  }

  function handleSave() {
    if (presets.length >= ECOMMERCE_CANVAS_PRESET_LIMIT) {
      toast(`最多保存 ${ECOMMERCE_CANVAS_PRESET_LIMIT} 组预设`, {
        description: "删除旧预设腾出空间，或更新现有预设。",
      });
      return;
    }
    const preset: EcommerceCanvasPreset = {
      id: createEcommerceCanvasPresetId(),
      name: nextEcommerceCanvasPresetName(presets),
      payload: extractPayload(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...presets, preset];
    if (!writeEcommerceCanvasPresets(accountId, next)) {
      toast.error("保存失败", { description: "可能是浏览器隐私模式或存储空间满。" });
      return;
    }
    setPresets(next);
    setActivePresetId(preset.id);
    writeActiveEcommerceCanvasPresetId(accountId, preset.id);
    toast.success(`预设「${preset.name}」已保存`, {
      description: "下次进入自动套用这组参数。",
    });
  }

  function handleApply(preset: EcommerceCanvasPreset) {
    applyPayload(preset.payload);
    setActivePresetId(preset.id);
    writeActiveEcommerceCanvasPresetId(accountId, preset.id);
    toast(`已套用「${preset.name}」`, {
      description: draft.userModifiedProductTier || draft.userModifiedPostRatio
        ? "分辨率/画幅比保留你手动选择的值。"
        : undefined,
    });
  }

  function handleUpdate(preset: EcommerceCanvasPreset) {
    const updated = { ...preset, payload: extractPayload(), updatedAt: Date.now() };
    const next = presets.map(p => (p.id === preset.id ? updated : p));
    if (!writeEcommerceCanvasPresets(accountId, next)) {
      toast.error("更新失败");
      return;
    }
    setPresets(next);
    toast.success(`「${preset.name}」参数已更新`);
  }

  function handleCommitRename(preset: EcommerceCanvasPreset) {
    setRenamingPresetId(null);
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === preset.name) return;
    const updated = { ...preset, name: trimmed, updatedAt: Date.now() };
    const next = presets.map(p => (p.id === preset.id ? updated : p));
    writeEcommerceCanvasPresets(accountId, next);
    setPresets(next);
  }

  function handleDelete(preset: EcommerceCanvasPreset) {
    const next = presets.filter(p => p.id !== preset.id);
    writeEcommerceCanvasPresets(accountId, next);
    setPresets(next);
    if (activePresetId === preset.id) {
      setActivePresetId(null);
      writeActiveEcommerceCanvasPresetId(accountId, null);
    }
    toast(`「${preset.name}」已删除`);
  }

  function handleResetToDefault() {
    // 回到初始态 = 全部归默认，包括用户手选过的分辨率/画幅比（force）
    applyPayload(ECOMMERCE_CANVAS_DEFAULT_PAYLOAD, true);
    setActivePresetId(null);
    writeActiveEcommerceCanvasPresetId(accountId, null);
    toast("已恢复初始态", { description: "下次进入不会自动套用预设。" });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold" style={{ color: palette.text }}>
          参数预设
        </span>
        <span className="text-[9px]" style={{ color: palette.sub }}>
          {presets.length}/{ECOMMERCE_CANVAS_PRESET_LIMIT}
        </span>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold"
          style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.text }}
          onClick={handleSave}
        >
          <Plus size={12} /> 保存预设
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-[11px]"
          style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.text }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : "管理"}
        </button>
      </div>

      {expanded ? (
        <div
          className="mt-2 overflow-hidden rounded-md"
          style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
        >
          <div
            className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: palette.sub, borderBottom: `1px solid ${palette.border}` }}
          >
            我的预设
          </div>

          <div className="max-h-[228px] overflow-y-auto py-1">
            {presets.length === 0 ? (
              <p className="px-2.5 py-3 text-[10px] leading-relaxed" style={{ color: palette.sub }}>
                还没有预设。调好参数后点「保存预设」，下次进入就会自动套用。
              </p>
            ) : (
              presets.map(preset => {
                const active = preset.id === activePresetId;
                const renaming = renamingPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className="flex items-center gap-1 px-1.5 py-0.5"
                    style={{ background: active ? "rgba(197,237,71,0.10)" : "transparent" }}
                  >
                    {renaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        maxLength={24}
                        onChange={event => setRenameDraft(event.target.value)}
                        onBlur={() => handleCommitRename(preset)}
                        onKeyDown={event => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitRename(preset);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            setRenamingPresetId(null);
                          }
                        }}
                        className="h-7 min-w-0 flex-1 rounded px-2 text-[10px] outline-none"
                        style={{
                          color: palette.text,
                          background: palette.field,
                          border: `1px solid rgba(197,237,71,0.55)`,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded px-2 text-left text-[10px]"
                        style={{ color: active ? palette.text : palette.sub }}
                        onClick={() => handleApply(preset)}
                        title={`套用「${preset.name}」`}
                      >
                        {active ? (
                          <Check size={11} style={{ color: "rgb(197,237,71)" }} />
                        ) : (
                          <span className="inline-block w-[11px]" />
                        )}
                        <span className="truncate font-semibold">{preset.name}</span>
                      </button>
                    )}
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10"
                        style={{ color: palette.sub }}
                        onClick={() => {
                          setRenamingPresetId(preset.id);
                          setRenameDraft(preset.name);
                        }}
                        title="重命名"
                      >
                        <PenLine size={12} />
                      </button>
                      <button
                        type="button"
                        className="flex h-7 items-center gap-1 rounded px-1.5 text-[9px] font-semibold hover:bg-white/10"
                        style={{ color: "rgb(197,237,71)" }}
                        onClick={() => handleUpdate(preset)}
                        title="用当前面板参数覆盖这组预设"
                      >
                        <Save size={12} />
                        更新
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10"
                        style={{ color: "#F87171" }}
                        onClick={() => handleDelete(preset)}
                        title="删除这组预设"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            className="flex h-9 w-full items-center gap-1.5 px-2.5 text-left text-[10px] font-semibold hover:bg-white/5"
            style={{ color: palette.sub, borderTop: `1px solid ${palette.border}` }}
            onClick={handleResetToDefault}
            title="恢复出厂默认，取消下次自动套用（不删除已存预设）"
          >
            <RotateCcw size={12} />
            回到初始态
          </button>
        </div>
      ) : null}
    </div>
  );
}
