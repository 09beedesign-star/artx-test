/**
 * 画布「属性编辑」面板（2026-11-14）。
 *
 * 字段按设计工具通用属性面板全量铺开：名称、变换(X/Y/W/H/旋转/锁比例)、
 * 外观(不透明度/圆角/填充/描边/混合模式/阴影)、排列(四档层级)、
 * 图层(可见/锁定)。所有值都只从当前节点的真实 data/position/style 读取，
 * 编辑后通过 onPatch 写回同一个节点。
 *
 * 🔒 右上角 X 是**唯一**关闭方式：面板不监听 pane-click / 全局 mousedown，
 *    点击画布空白处不会消失。头部可左键拖拽移动。
 */
import { useEffect, useState } from "react";
import type { Node } from "@xyflow/react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, PanelTopOpen, FolderDown, Unlock, X } from "lucide-react";
import { useDraggablePanel } from "./useDraggablePanel";

import {
  BLEND_MODES,
  num,
  readNodeForm,
  type LayerOrderAction,
  type NodePropertiesForm,
  type NodePropertiesPatch,
} from "@/lib/canvas-node-properties";

export type { LayerOrderAction, NodePropertiesPatch } from "@/lib/canvas-node-properties";

type Form = NodePropertiesForm;

export function CanvasPropertiesPanel({
  node,
  isDark,
  onClose,
  onPatch,
  onLayerAction,
}: {
  node: Node | null;
  isDark: boolean;
  onClose: () => void;
  onPatch: (patch: NodePropertiesPatch) => void;
  onLayerAction: (action: LayerOrderAction) => void;
}) {
  const { pos, dragging, dragHandlers } = useDraggablePanel("properties", {
    x: typeof window === "undefined" ? 1100 : Math.max(8, window.innerWidth - 316),
    y: 68,
  }, { width: 296, height: 560 });
  const [form, setForm] = useState<Form>(() => readNodeForm(node));
  const [lockRatio, setLockRatio] = useState(false);

  useEffect(() => {
    setForm(readNodeForm(node));
  }, [node?.id]);

  const bg = isDark ? "rgba(22,22,30,0.97)" : "rgba(255,255,255,0.98)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const text = isDark ? "rgba(240,240,248,0.9)" : "rgba(28,28,40,0.86)";
  const sub = isDark ? "rgba(180,180,190,0.6)" : "rgba(0,0,0,0.42)";
  const fieldBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)";

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    const map: Partial<Record<keyof Form, keyof NodePropertiesPatch>> = {
      hidden: "layerHidden", locked: "layerLocked",
    };
    onPatch({ [map[key] || key]: value } as NodePropertiesPatch);
  };

  const setSize = (which: "width" | "height", value: number) => {
    const next: NodePropertiesPatch = { [which]: value } as NodePropertiesPatch;
    if (lockRatio) {
      const baseW = form.width || 1;
      const baseH = form.height || 1;
      if (which === "width") next.height = Math.round(value * baseH / baseW);
      else next.width = Math.round(value * baseW / baseH);
    }
    setForm(prev => ({ ...prev, ...next }));
    onPatch(next);
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex items-center gap-2" style={{ minWidth: 0 }}>
      <span className="w-[30px] shrink-0 text-[11px]" style={{ color: sub }}>{label}</span>
      {children}
    </label>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%", minWidth: 0, height: 28, padding: "0 7px", fontSize: 11,
    color: text, background: fieldBg, border: `1px solid ${border}`,
    borderRadius: 6, outline: "none",
  };
  const sectionTitle = (t: string) => (
    <div className="mt-3 mb-1.5 text-[10px] font-semibold" style={{ color: sub, letterSpacing: "0.06em" }}>{t}</div>
  );

  const orderButtons: Array<{ action: LayerOrderAction; label: string; icon: React.ReactNode }> = [
    { action: "bring-to-front", label: "置顶", icon: <PanelTopOpen size={12} /> },
    { action: "bring-forward", label: "上移", icon: <ArrowUp size={12} /> },
    { action: "send-backward", label: "下移", icon: <ArrowDown size={12} /> },
    { action: "send-to-back", label: "置底", icon: <FolderDown size={12} /> },
  ];

  return (
    <div
      data-artx-canvas-properties-panel=""
      className="fixed nodrag nopan"
      style={{ left: pos.x, top: pos.y, width: 296, zIndex: 220, maxHeight: "calc(100vh - 100px)" }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl" style={{ background: bg, border: `1px solid ${border}`, backdropFilter: "blur(20px)" }}>
        {/* 头部 = 拖拽把手 */}
        <div
          {...dragHandlers}
          className="flex items-center justify-between px-3 py-2.5"
          style={{ borderBottom: `1px solid ${border}`, cursor: dragging ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}
        >
          <span style={{ color: text, fontSize: 12, fontWeight: 650 }}>属性编辑</span>
          <button
            data-panel-no-drag=""
            data-artx-canvas-properties-close=""
            type="button"
            onClick={onClose}
            aria-label="关闭属性编辑面板"
            className="rounded-full p-1"
            style={{ color: sub, background: "transparent", border: "none", cursor: "pointer", lineHeight: 1 }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto px-3 pb-3" style={{ maxHeight: "calc(100vh - 150px)" }}>
          {!node ? (
            <p className="py-8 text-center text-[11px]" style={{ color: sub }}>未选中图层</p>
          ) : (
            <>
              {sectionTitle("图层")}
              <input
                data-artx-prop="title"
                value={form.title}
                onChange={e => set("title", e.target.value)}
                aria-label="图层名称"
                style={inputStyle}
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  data-artx-prop="visible"
                  onClick={() => set("hidden", !form.hidden)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px]"
                  style={{ color: text, background: fieldBg, border: `1px solid ${border}` }}
                >
                  {form.hidden ? <EyeOff size={12} /> : <Eye size={12} />}{form.hidden ? "已隐藏" : "可见"}
                </button>
                <button
                  type="button"
                  data-artx-prop="locked"
                  onClick={() => set("locked", !form.locked)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px]"
                  style={{ color: text, background: fieldBg, border: `1px solid ${border}` }}
                >
                  {form.locked ? <Lock size={12} /> : <Unlock size={12} />}{form.locked ? "已锁定" : "未锁定"}
                </button>
              </div>

              {sectionTitle("变换")}
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="X"><input data-artx-prop="x" type="number" value={form.x} onChange={e => set("x", num(e.target.value, form.x))} style={inputStyle} /></Field>
                <Field label="Y"><input data-artx-prop="y" type="number" value={form.y} onChange={e => set("y", num(e.target.value, form.y))} style={inputStyle} /></Field>
                <Field label="W"><input data-artx-prop="width" type="number" min={1} value={form.width} onChange={e => setSize("width", Math.max(1, num(e.target.value, form.width)))} style={inputStyle} /></Field>
                <Field label="H"><input data-artx-prop="height" type="number" min={1} value={form.height} onChange={e => setSize("height", Math.max(1, num(e.target.value, form.height)))} style={inputStyle} /></Field>
              </div>
              <label className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: sub }}>
                <input type="checkbox" checked={lockRatio} onChange={e => setLockRatio(e.target.checked)} /> 锁定宽高比
              </label>
              <div className="mt-1.5">
                <Field label="旋转">
                  <input data-artx-prop="rotation" type="number" value={form.rotation} onChange={e => set("rotation", num(e.target.value, form.rotation))} style={inputStyle} />
                </Field>
              </div>

              {sectionTitle("外观")}
              <div className="flex items-center justify-between text-[11px]" style={{ color: sub }}>
                <span>不透明度</span><span style={{ color: text }}>{Math.round(form.opacity * 100)}%</span>
              </div>
              <input data-artx-prop="opacity" type="range" min={0} max={1} step={0.01} value={form.opacity}
                onChange={e => set("opacity", num(e.target.value, form.opacity))} className="w-full" style={{ accentColor: isDark ? "#ffffff" : "#161616" }} />
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <Field label="圆角"><input data-artx-prop="cornerRadius" type="number" min={0} value={form.cornerRadius} onChange={e => set("cornerRadius", Math.max(0, num(e.target.value, form.cornerRadius)))} style={inputStyle} /></Field>
                <Field label="描边"><input data-artx-prop="strokeWidth" type="number" min={0} value={form.strokeWidth} onChange={e => set("strokeWidth", Math.max(0, num(e.target.value, form.strokeWidth)))} style={inputStyle} /></Field>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px]" style={{ color: sub }}>填充</span>
                <input data-artx-prop="fill" type="color" value={form.fill} onChange={e => set("fill", e.target.value)} style={{ width: 34, height: 26, border: `1px solid ${border}`, borderRadius: 5, background: "transparent" }} />
                <span className="text-[11px]" style={{ color: sub }}>描边</span>
                <input data-artx-prop="stroke" type="color" value={form.stroke} onChange={e => set("stroke", e.target.value)} style={{ width: 34, height: 26, border: `1px solid ${border}`, borderRadius: 5, background: "transparent" }} />
              </div>
              <div className="mt-1.5">
                <Field label="混合">
                  <select data-artx-prop="blendMode" value={form.blendMode} onChange={e => set("blendMode", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {BLEND_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Field>
              </div>
              <label className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: sub }}>
                <input data-artx-prop="shadowEnabled" type="checkbox" checked={form.shadowEnabled} onChange={e => set("shadowEnabled", e.target.checked)} /> 投影
              </label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <Field label="模糊"><input data-artx-prop="shadowBlur" type="number" min={0} value={form.shadowBlur} onChange={e => set("shadowBlur", Math.max(0, num(e.target.value, form.shadowBlur)))} style={inputStyle} /></Field>
                <Field label="颜色"><input data-artx-prop="shadowColor" type="color" value={form.shadowColor} onChange={e => set("shadowColor", e.target.value)} style={{ ...inputStyle, padding: "2px 4px", cursor: "pointer" }} /></Field>
              </div>

              {sectionTitle("排列")}
              <div className="grid grid-cols-4 gap-1">
                {orderButtons.map(b => (
                  <button key={b.action} type="button" data-artx-layer-order={b.action} onClick={() => onLayerAction(b.action)}
                    className="flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px]"
                    style={{ color: text, background: fieldBg, border: `1px solid ${border}` }}>
                    {b.icon}{b.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
