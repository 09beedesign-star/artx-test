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
 *
 * 【布局要求】（2026-10-18 截图参考智能产品）
 * 分段控件「保存预设 | ▲」，点箭头向上展开浮层（absolute bottom-full），
 * 不能平铺撑高左栏 → 避免出滚动条。
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, PenLine, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  // 点浮层外 / 按 Esc 收起（与智能产品同交互）
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !renamingPresetId) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, renamingPresetId]);

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
    <div ref={rootRef} className="relative" data-testid="ecommerce-preset-panel">
      <div
        className="flex h-9 items-stretch overflow-hidden rounded-md"
        style={{
          border: `1px solid ${menuOpen || activePresetId ? "rgba(197,237,71,0.55)" : palette.border}`,
          background: palette.panel,
        }}
      >
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1 px-3 text-[11px] font-semibold transition-opacity hover:opacity-80"
          style={{ color: palette.text }}
          onClick={handleSave}
          title="把当前面板的全部参数保存为一组预设，下次进入自动套用"
        >
          <Plus size={12} /> 保存预设
        </button>
        <button
          type="button"
          className="flex w-8 items-center justify-center transition-opacity hover:opacity-80"
          style={{ color: palette.sub, borderLeft: `1px solid ${palette.border}` }}
          onClick={() => {
            setMenuOpen(prev => !prev);
            setRenamingPresetId(null);
          }}
          aria-expanded={menuOpen}
          aria-label="我的预设参数"
          title="我的预设参数"
        >
          {menuOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {menuOpen ? (
        <div
          /*
            ⚠️ 向上展开的绝对定位浮层：不占文档流，左栏高度不变、不出滚动条。
               宽度跟随左栏（left-0 right-0）而不是智能产品的固定 300px——
               左栏比 300px 窄，固定宽会横向溢出。
          */
          className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-md"
          data-testid="ecommerce-preset-menu"
          style={{
            // 2026-10-18 用户要求：改深灰毛玻璃质感，80% 不透明度（原 panelStrong 叠底色方案太淡）。
            //    深灰 #2a2a2a + 80% 不透明 + backdrop-filter blur 实现毛玻璃。
            background: "rgba(42, 42, 42, 0.8)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${palette.border}`,
            boxShadow: "0 -14px 36px rgba(0,0,0,0.36)",
          }}
          role="menu"
          aria-label="预设参数列表"
        >
          <div
            className="px-3 py-2 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: palette.sub, borderBottom: `1px solid ${palette.border}` }}
          >
            我的预设（{presets.length}/{ECOMMERCE_CANVAS_PRESET_LIMIT}）
          </div>

          {/*
            ⚠️ 列表区单独限高滚动，而不是让整个菜单长高：
               12 组预设 + 底部「回到初始态」全摊开会顶破面板顶边，
               而「回到初始态」必须始终可见（它是兜底出口）。
          */}
          <div className="max-h-[228px] overflow-y-auto py-1">
            {presets.length === 0 ? (
              <p className="px-3 py-3 text-[10px] leading-4" style={{ color: palette.sub }}>
                还没有预设。调好参数后点左边「保存预设」，下次进入就会自动套用。
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
                        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded px-2 text-left text-[10px] transition-colors"
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
                        className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10"
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
                        className="flex h-7 items-center gap-1 rounded px-1.5 text-[9px] font-semibold transition-colors hover:bg-white/10"
                        style={{ color: "rgb(197,237,71)" }}
                        onClick={() => handleUpdate(preset)}
                        title="用当前面板参数覆盖这组预设"
                      >
                        <Save size={12} />
                        更新
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10"
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
            className="flex h-9 w-full items-center gap-1.5 px-3 text-left text-[10px] font-semibold transition-colors hover:bg-white/5"
            style={{ color: palette.sub, borderTop: `1px solid ${palette.border}` }}
            onClick={handleResetToDefault}
            title="恢复面板出厂默认参数，并取消下次自动套用（不会删除已存预设）"
          >
            <RotateCcw size={12} />
            回到初始态
          </button>
        </div>
      ) : null}
    </div>
  );
}
