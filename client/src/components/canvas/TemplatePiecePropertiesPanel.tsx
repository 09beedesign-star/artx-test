/**
 * 版式子单元「属性编辑」面板（参考截图的图形 / 文字属性，统一黑白配色）。
 *
 * 🔒 2026-11-14：截图里的命令全部实现，且每条都有真实落点：
 *   对齐 / 重复网格 / 布尔运算 / 3D / 沿路径文字 / 剪切蒙版 → 派发
 *   TEMPLATE_PIECE_COMMAND_EVENT（画布统一写回）；
 *   位置 / 尺寸 / 旋转 / 不透明度 / 圆角 / 混合模式 / 填充 / 描边 → patch 到
 *   piece 字段，由 renderPieceSvg 这一唯一渲染出口呈现。
 * ⚠️ 只有点右上角 X 关闭；画布空击不影响它。
 */
import { useEffect, useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, ChevronDown, FlipHorizontal, FlipVertical, Grid2X2, Lock, Maximize, Pipette, RotateCcw, Scissors, Type, Unlock, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ALIGN_COMMANDS,
  BLEND_MODES,
  BOOLEAN_COMMANDS,
  STROKE_ALIGNS,
  STROKE_JOINS,
  TEMPLATE_PIECE_COMMAND_EVENT,
  type TemplateSelectionDetail,
} from "@/lib/canvas-template-piece-actions";
import type { TemplatePiece, TemplatePieceCommand } from "@/lib/canvas-templates";
import {
  TEMPLATE_PIECE_PATCH_EVENT,
  TEMPLATE_PROPERTIES_OPEN_EVENT,
  TEMPLATE_SELECTION_EVENT,
} from "./CanvasTemplatePanel";

const ALIGN_ICONS = [
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
];

function toHex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/i.test(value) ? value : fallback;
}

export function TemplatePiecePropertiesPanel() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TemplateSelectionDetail | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [gridCols, setGridCols] = useState(3);
  const [gridRows, setGridRows] = useState(2);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onSelection = (e: Event) => {
      const next = (e as CustomEvent<TemplateSelectionDetail | null>).detail;
      setDetail(next || null);
      if (!next) setOpen(false);
    };
    window.addEventListener(TEMPLATE_PROPERTIES_OPEN_EVENT, onOpen);
    window.addEventListener(TEMPLATE_SELECTION_EVENT, onSelection);
    return () => {
      window.removeEventListener(TEMPLATE_PROPERTIES_OPEN_EVENT, onOpen);
      window.removeEventListener(TEMPLATE_SELECTION_EVENT, onSelection);
    };
  }, []);

  const bg = isDark ? "#171717" : "#ffffff";
  const ink = isDark ? "#f4f4f4" : "#161616";
  const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(22,22,22,0.48)";
  const line = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,22,0.09)";
  const field = isDark ? "rgba(255,255,255,0.06)" : "#f5f5f5";

  if (!open || !detail) return null;
  const piece = detail.piece;
  const isText = piece.kind === "text" || piece.kind === "placeholder";

  const patch = (p: Partial<TemplatePiece>) => {
    window.dispatchEvent(new CustomEvent(TEMPLATE_PIECE_PATCH_EVENT, {
      detail: { nodeId: detail.nodeId, patch: p },
    }));
    setDetail({ ...detail, piece: { ...piece, ...p } });
  };
  const command = (id: TemplatePieceCommand, args?: { cols?: number; rows?: number }) => {
    window.dispatchEvent(new CustomEvent(TEMPLATE_PIECE_COMMAND_EVENT, {
      detail: { nodeId: detail.nodeId, command: id, args },
    }));
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${line}` }}>
      <div style={{ fontSize: 11.5, color: muted, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
  const IconBtn = ({ label, children, onClick, active, title }: {
    label?: string; children: React.ReactNode; onClick: () => void; active?: boolean; title?: string;
  }) => (
    <button
      type="button" title={title || label} aria-label={title || label} aria-pressed={active}
      data-artx-piece-action={label}
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, height: 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        border: `1px solid ${active ? ink : line}`, borderRadius: 8,
        background: active ? ink : field, color: active ? bg : ink,
        fontSize: 11, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
  const Num = ({ label, value, onChange, step = 1, min, max }: {
    label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
  }) => (
    <label style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: field, borderRadius: 9, padding: "8px 10px" }}>
      <span style={{ fontSize: 12, color: muted, flexShrink: 0 }}>{label}</span>
      <input
        type="number" value={Math.round(value * 1000) / 1000} step={step} min={min} max={max}
        data-artx-piece-field={label}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: ink, fontSize: 12.5, fontWeight: 600 }}
      />
    </label>
  );
  const ColorInput = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
      <input type="color" value={value} aria-label={`${label}取色`} onChange={e => onChange(e.target.value)}
        style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${line}`, background: "transparent", padding: 2, cursor: "pointer", flexShrink: 0 }} />
      <input value={value} aria-label={label} data-artx-piece-field={label}
        onChange={e => onChange(e.target.value)}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: field, color: ink, fontSize: 12.5, fontWeight: 600, borderRadius: 9, padding: "9px 10px" }} />
    </div>
  );
  const Select = ({ value, options, onChange, label }: {
    value: string; options: Array<{ id: string; label: string }>; onChange: (v: string) => void; label: string;
  }) => (
    <div style={{ position: "relative" }}>
      <select aria-label={label} data-artx-piece-field={label} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", appearance: "none", border: `1px solid ${line}`, background: field, color: ink, borderRadius: 10, padding: "11px 32px 11px 12px", fontSize: 12.5, outline: "none" }}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} color={muted} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
  const Check = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} data-artx-piece-check={label}
      onClick={() => onChange(!checked)}
      style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: `1px solid ${checked ? ink : line}`, background: checked ? ink : "transparent", color: bg, display: "grid", placeItems: "center", cursor: "pointer" }}>
      {checked ? "✓" : ""}
    </button>
  );

  return (
    <div
      data-artx-piece-properties=""
      className="nodrag nopan"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top: 92, right: 16, width: 320,
        maxHeight: "calc(100vh - 124px)", overflowY: "auto",
        background: bg, color: ink, border: `1px solid ${line}`, borderRadius: 16,
        boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(0,0,0,0.14)",
        zIndex: 120,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", borderBottom: `1px solid ${line}`, position: "sticky", top: 0, background: bg, zIndex: 2 }}>
        <b style={{ fontSize: 16 }}>{isText ? "文字" : "图形"}</b>
        <button type="button" aria-label="关闭属性编辑" onClick={() => setOpen(false)}
          style={{ border: "none", background: "transparent", color: ink, cursor: "pointer", display: "grid", placeItems: "center" }}>
          <X size={18} />
        </button>
      </div>

      <Section title="名称">
        <input value={piece.name} aria-label="单元名称" onChange={e => patch({ name: e.target.value })}
          style={{ width: "100%", border: `1px solid ${line}`, background: field, color: ink, borderRadius: 9, padding: "9px 10px", fontSize: 12.5, outline: "none" }} />
      </Section>

      <Section title="对齐">
        <div style={{ display: "flex", gap: 4 }}>
          {ALIGN_COMMANDS.map((item, i) => {
            const Icon = ALIGN_ICONS[i];
            return (
              <button key={item.id} type="button" title={item.label} aria-label={item.label}
                data-artx-piece-command={item.id} onClick={() => command(item.id)}
                style={{ flex: 1, height: 34, display: "grid", placeItems: "center", border: `1px solid ${line}`, borderRadius: 8, background: field, color: ink, cursor: "pointer" }}>
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="重复网格">
        <IconBtn label="repeat-grid" title="重复网格" onClick={() => setGridOpen(v => !v)} active={gridOpen}>
          <Grid2X2 size={16} />
        </IconBtn>
        {gridOpen && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Num label="列" value={gridCols} step={1} min={1} max={12} onChange={v => setGridCols(Math.max(1, Math.min(12, v)))} />
              <Num label="行" value={gridRows} step={1} min={1} max={12} onChange={v => setGridRows(Math.max(1, Math.min(12, v)))} />
            </div>
            <button type="button" data-artx-piece-command="repeat-grid" onClick={() => command("repeat-grid", { cols: gridCols, rows: gridRows })}
              style={{ width: "100%", border: "none", borderRadius: 9, background: ink, color: bg, padding: "9px", fontSize: 12, fontWeight: 650, cursor: "pointer" }}>
              生成 {gridCols} × {gridRows} 网格
            </button>
          </div>
        )}
      </Section>

      <Section title="布尔运算">
        <div style={{ display: "flex", gap: 6 }}>
          {BOOLEAN_COMMANDS.map(item => (
            <button key={item.id} type="button" title={item.label} aria-label={item.label}
              data-artx-piece-command={item.id} onClick={() => command(item.id)}
              style={{ flex: 1, height: 38, display: "grid", placeItems: "center", border: `1px solid ${line}`, borderRadius: 9, background: field, color: ink, fontSize: 18, cursor: "pointer" }}>
              {item.glyph}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: muted, marginTop: 8, lineHeight: 1.5 }}>与同画板内另一个图形单元合成</div>
      </Section>

      <Section title="位置">
        <div style={{ display: "flex", gap: 8 }}>
          <Num label="X" value={piece.x * detail.frameW} step={1} onChange={v => patch({ x: v / detail.frameW })} />
          <Num label="Y" value={piece.y * detail.frameH} step={1} onChange={v => patch({ y: v / detail.frameH })} />
        </div>
      </Section>

      <Section title="旋转">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Num label="∠" value={piece.rotation || 0} step={1} onChange={v => patch({ rotation: v })} />
          <Num label="X°" value={piece.rotateX || 0} step={1} onChange={v => patch({ rotateX: v })} />
          <Num label="Y°" value={piece.rotateY || 0} step={1} onChange={v => patch({ rotateY: v })} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <IconBtn label="reset-rotation" title="重置旋转" onClick={() => command("reset-rotation")}><RotateCcw size={15} /></IconBtn>
          <IconBtn label="flip-x" title="水平翻转" onClick={() => command("flip-x")}><FlipHorizontal size={15} /></IconBtn>
          <IconBtn label="flip-y" title="垂直翻转" onClick={() => command("flip-y")}><FlipVertical size={15} /></IconBtn>
          <IconBtn label="clip-mask" title="剪切蒙版" active={!!piece.clipMask} onClick={() => command("clip-mask")}><Scissors size={15} /></IconBtn>
        </div>
      </Section>

      <Section title="布局 · 尺寸">
        <div style={{ display: "flex", gap: 8 }}>
          <Num label="W" value={piece.w * detail.frameW} step={1} min={1} onChange={v => patch({ w: Math.max(0.001, v / detail.frameW) })} />
          <Num label="H" value={piece.h * detail.frameH} step={1} min={1} onChange={v => patch({ h: Math.max(0.001, v / detail.frameH) })} />
        </div>
      </Section>

      <Section title="外观">
        <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>不透明度</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: field, borderRadius: 9, padding: "8px 10px" }}>
          <span style={{ fontSize: 12, fontWeight: 650, width: 34 }}>{Math.round((piece.opacity ?? 1) * 100)}</span>
          <span style={{ fontSize: 11, color: muted }}>%</span>
          <input type="range" min={0} max={100} value={Math.round((piece.opacity ?? 1) * 100)}
            aria-label="不透明度" data-artx-piece-field="不透明度"
            onChange={e => patch({ opacity: Number(e.target.value) / 100 })}
            style={{ flex: 1, accentColor: ink }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Num label="圆角" value={(piece.cornerRadiusRatio || 0) * 100} step={1} min={0} onChange={v => patch({ cornerRadiusRatio: Math.max(0, v / 100) })} />
          <IconBtn label="toggle-lock" title={piece.locked ? "解锁" : "锁定"} active={!!piece.locked} onClick={() => command("toggle-lock")}>
            {piece.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </IconBtn>
          <IconBtn label="bring-front" title="移到最上层" onClick={() => command("bring-front")}><Maximize size={15} /></IconBtn>
        </div>
      </Section>

      <Section title="混合模式">
        <Select label="混合模式" value={piece.blendMode || "穿透"}
          options={BLEND_MODES.map(m => ({ id: m, label: m === "穿透" ? "穿透" : m }))}
          onChange={v => patch({ blendMode: v })} />
      </Section>

      <Section title="填充">
        <Select label="填充类型" value={piece.fill === "gradient" ? "gradient" : "solid"}
          options={[{ id: "solid", label: "纯色" }, { id: "gradient", label: "渐变" }]}
          onChange={v => patch({ fill: v === "gradient" ? "gradient" : toHex(piece.fill, "#f2f2f2") })} />
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <Check label="填充开关" checked={piece.fillEnabled !== false} onChange={v => patch({ fillEnabled: v })} />
          <ColorInput label="填充色" value={toHex(piece.fill === "gradient" ? undefined : piece.fill, "#f2f2f2")}
            onChange={v => patch({ fill: v })} />
          <button type="button" title="吸管取色" aria-label="吸管取色"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "color";
              input.value = toHex(piece.fill, "#f2f2f2");
              input.oninput = () => patch({ fill: input.value });
              input.click();
            }}
            style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${line}`, background: field, color: ink, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
            <Pipette size={15} />
          </button>
        </div>
      </Section>

      <Section title="描边">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Check label="描边开关" checked={piece.strokeEnabled !== false} onChange={v => patch({ strokeEnabled: v })} />
          <ColorInput label="描边色" value={toHex(piece.stroke, "#666666")} onChange={v => patch({ stroke: v })} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Num label="大小" value={(piece.strokeRatio || 0) * 100} step={0.1} min={0} onChange={v => patch({ strokeRatio: Math.max(0, v / 100) })} />
          <Num label="虚线" value={(piece.strokeDash || 0) * 100} step={0.1} min={0} onChange={v => patch({ strokeDash: Math.max(0, v / 100) })} />
          <Num label="间隙" value={(piece.strokeGap || 0) * 100} step={0.1} min={0} onChange={v => patch({ strokeGap: Math.max(0, v / 100) })} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>描边位置</div>
            <div style={{ display: "flex", gap: 4 }}>
              {STROKE_ALIGNS.map(o => (
                <button key={o.id} type="button" title={o.label} aria-label={o.label} data-artx-piece-field={`描边${o.label}`}
                  onClick={() => patch({ strokeAlign: o.id })}
                  style={{ flex: 1, height: 30, fontSize: 10, border: `1px solid ${(piece.strokeAlign || "center") === o.id ? ink : line}`, borderRadius: 7, background: (piece.strokeAlign || "center") === o.id ? ink : field, color: (piece.strokeAlign || "center") === o.id ? bg : ink, cursor: "pointer" }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>转角</div>
            <div style={{ display: "flex", gap: 4 }}>
              {STROKE_JOINS.map(o => (
                <button key={o.id} type="button" title={o.label} aria-label={o.label} data-artx-piece-field={`转角${o.label}`}
                  onClick={() => patch({ strokeJoin: o.id })}
                  style={{ flex: 1, height: 30, fontSize: 10, border: `1px solid ${(piece.strokeJoin || "miter") === o.id ? ink : line}`, borderRadius: 7, background: (piece.strokeJoin || "miter") === o.id ? ink : field, color: (piece.strokeJoin || "miter") === o.id ? bg : ink, cursor: "pointer" }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {isText && (
        <Section title="文字">
          <textarea value={piece.text || ""} aria-label="文案" rows={3}
            onChange={e => patch({ text: e.target.value })}
            style={{ width: "100%", border: `1px solid ${line}`, background: field, color: ink, borderRadius: 9, padding: "9px 10px", fontSize: 12.5, outline: "none", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Num label="字号%" value={(piece.sizeRatio || 0) * 100} step={0.1} onChange={v => patch({ sizeRatio: Math.max(0, v / 100) })} />
            <Num label="字重" value={piece.fontWeight || 500} step={100} onChange={v => patch({ fontWeight: v })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Num label="行距" value={piece.lineHeight || 1.12} step={0.05} onChange={v => patch({ lineHeight: v })} />
            <Num label="字距‰" value={(piece.trackingRatio || 0) * 1000} step={1} onChange={v => patch({ trackingRatio: v / 1000 })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <ColorInput label="字色" value={toHex(piece.color, "#121212")} onChange={v => patch({ color: v })} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <IconBtn label="path-text" title="沿路径文字" active={!!piece.pathText} onClick={() => command("path-text")}><Type size={15} /></IconBtn>
            <IconBtn label="3d-extrude" title="3D立体处理" onClick={() => command("3d-extrude")}>3D</IconBtn>
            <IconBtn label="3d-path" title="沿路径3D立体处理" onClick={() => command("3d-path")}>3D+</IconBtn>
            <IconBtn label="3d-rotate" title="空间 3D 旋转" onClick={() => command("3d-rotate")}><RotateCcw size={15} /></IconBtn>
          </div>
        </Section>
      )}

      <Section title="剪切蒙版">
        <IconBtn label="clip-mask" title="切换剪切蒙版" active={!!piece.clipMask} onClick={() => command("clip-mask")}>
          <Scissors size={15} /> {piece.clipMask ? "取消蒙版" : "应用蒙版"}
        </IconBtn>
      </Section>

      <div style={{ padding: "12px 16px 18px", fontSize: 10.5, color: muted, lineHeight: 1.6 }}>
        所有属性与命令实时作用于画布单元；下载 / 复制 / 参考图在选中单元上方的悬浮命令条中。
      </div>
    </div>
  );
}
