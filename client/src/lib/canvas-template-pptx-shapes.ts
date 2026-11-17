/**
 * 版式单元 → PPTX DrawingML 形状（2026-11-17）。
 * 文字保持为真实可编辑文本框；矩形 / 圆 / 图位用预设形状；矢量 path 用自定义几何。
 * 1 px = 9525 EMU；字号 pt = px * 0.75。
 */
import type { TemplatePiece } from "./canvas-templates";

export const EMU_PER_PX = 9525;
const emu = (px: number) => Math.max(0, Math.round(px * EMU_PER_PX));

export function xmlEsc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hex(v: string | undefined, fallback = "000000"): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v || "");
  return m ? m[1].toUpperCase() : fallback;
}
function alpha(opacity: number | undefined): string {
  if (opacity === undefined || opacity >= 0.999) return "";
  return `<a:alpha val="${Math.round(Math.max(0, opacity) * 100000)}"/>`;
}
function solid(color: string | undefined, opacity?: number): string {
  return `<a:solidFill><a:srgbClr val="${hex(color)}">${alpha(opacity)}</a:srgbClr></a:solidFill>`;
}

function fillXml(p: TemplatePiece): string {
  if (p.fillEnabled === false || !p.fill || p.fill === "none") return "<a:noFill/>";
  if (p.fill === "gradient" && p.gradient && p.gradient.length >= 6) {
    const stops = p.gradient.slice(4).map(String);
    const gs = stops.map((c, i) =>
      `<a:gs pos="${Math.round((i / Math.max(1, stops.length - 1)) * 100000)}"><a:srgbClr val="${hex(c)}">${alpha(p.opacity)}</a:srgbClr></a:gs>`
    ).join("");
    return `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>`;
  }
  return solid(p.fill, p.opacity);
}
function lineXml(p: TemplatePiece, H: number): string {
  const on = p.strokeEnabled !== false && !!p.stroke && p.stroke !== "none";
  if (!on) return "<a:ln><a:noFill/></a:ln>";
  const w = emu(Math.max(0.5, (p.strokeRatio || 0) * H));
  const dash = (p.strokeDash || 0) > 0 ? '<a:prstDash val="dash"/>' : "";
  const join = p.strokeJoin === "round" ? "<a:round/>" : p.strokeJoin === "bevel" ? "<a:bevel/>" : "<a:miter/>";
  return `<a:ln w="${w}">${solid(p.stroke, p.opacity)}${dash}${join}</a:ln>`;
}
function effectXml(p: TemplatePiece, H: number): string {
  const s = p.shadow;
  if (!s || s.enabled === false || s.opacity <= 0) return "";
  const dx = s.x * H;
  const dy = s.y * H;
  const dist = emu(Math.hypot(dx, dy));
  const dir = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360 * 60000);
  return `<a:effectLst><a:outerShdw blurRad="${emu(s.blur * H)}" dist="${dist}" dir="${dir}" algn="ctr" rotWithShape="0"><a:srgbClr val="${hex(s.color)}"><a:alpha val="${Math.round(Math.min(1, s.opacity) * 100000)}"/></a:srgbClr></a:outerShdw></a:effectLst>`;
}
function xfrm(p: TemplatePiece, W: number, H: number): string {
  const rot = p.rotation ? ` rot="${Math.round(((p.rotation % 360) + 360) % 360 * 60000)}"` : "";
  const flip = `${p.flipX ? ' flipH="1"' : ""}${p.flipY ? ' flipV="1"' : ""}`;
  return `<a:xfrm${rot}${flip}><a:off x="${emu(p.x * W)}" y="${emu(p.y * H)}"/><a:ext cx="${emu(p.w * W)}" cy="${emu(p.h * H)}"/></a:xfrm>`;
}

/** 归一化 path（M/L/C/Q/H/V/Z，绝对坐标）→ a:custGeom；坐标单位 = 1/100000 盒宽。 */
function custGeom(d: string): string {
  const toks = d.match(/[MLCQHVZmlcqhvz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const S = 100000;
  const pt = (x: number, y: number) => `<a:pt x="${Math.round(x * S)}" y="${Math.round(y * S)}"/>`;
  let i = 0, cmd = "", cx = 0, cy = 0;
  const out: string[] = [];
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) { cmd = toks[i++].toUpperCase(); if (cmd === "Z") out.push("<a:close/>"); continue; }
    if (cmd === "M") { cx = num(); cy = num(); out.push(`<a:moveTo>${pt(cx, cy)}</a:moveTo>`); cmd = "L"; }
    else if (cmd === "L") { cx = num(); cy = num(); out.push(`<a:lnTo>${pt(cx, cy)}</a:lnTo>`); }
    else if (cmd === "H") { cx = num(); out.push(`<a:lnTo>${pt(cx, cy)}</a:lnTo>`); }
    else if (cmd === "V") { cy = num(); out.push(`<a:lnTo>${pt(cx, cy)}</a:lnTo>`); }
    else if (cmd === "C") { const a = [num(), num(), num(), num(), num(), num()]; cx = a[4]; cy = a[5]; out.push(`<a:cubicBezTo>${pt(a[0], a[1])}${pt(a[2], a[3])}${pt(a[4], a[5])}</a:cubicBezTo>`); }
    else if (cmd === "Q") { const a = [num(), num(), num(), num()]; cx = a[2]; cy = a[3]; out.push(`<a:quadBezTo>${pt(a[0], a[1])}${pt(a[2], a[3])}</a:quadBezTo>`); }
    else i += 1;
  }
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${S}" h="${S}">${out.join("")}</a:path></a:pathLst></a:custGeom>`;
}

function geometry(p: TemplatePiece, W: number, H: number): string {
  if (p.kind === "ellipse") return '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';
  if (p.kind === "path" && p.path) return custGeom(p.path);
  const r = (p.cornerRadiusRatio || 0) * Math.min(W, H);
  if (r > 0) {
    const adj = Math.round(Math.min(50000, (r / Math.max(1, Math.min(p.w * W, p.h * H))) * 100000));
    return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  }
  return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
}

function textBodyXml(p: TemplatePiece, H: number): string {
  const sizePx = Math.max(1, (p.sizeRatio || 0.014) * H);
  const sz = Math.max(100, Math.round(sizePx * 0.75 * 100));
  const algn = p.textAlign === "center" ? "ctr" : p.textAlign === "right" ? "r" : "l";
  const spc = Math.round((p.trackingRatio || 0) * H * 0.75 * 100);
  const color = p.color && p.color !== "none" ? solid(p.color, p.opacity) : "<a:noFill/>";
  const outline = p.strokeColor && p.strokeColor !== "none"
    ? `<a:ln w="${emu(Math.max(0.5, (p.strokeRatio || 0.001) * H))}">${solid(p.strokeColor)}</a:ln>` : "";
  const lh = Math.round((p.lineHeight || 1.12) * 100000 * 0.83);
  const paras = (p.text || "").split("\n").map(line =>
    `<a:p><a:pPr algn="${algn}"><a:lnSpc><a:spcPct val="${lh}"/></a:lnSpc></a:pPr><a:r><a:rPr lang="zh-CN" sz="${sz}" b="${(p.fontWeight || 400) >= 600 ? 1 : 0}" i="${p.italic ? 1 : 0}"${spc ? ` spc="${spc}"` : ""} dirty="0">${outline}${color}<a:latin typeface="Inter"/><a:ea typeface="PingFang SC"/></a:rPr><a:t>${xmlEsc(line)}</a:t></a:r></a:p>`
  ).join("");
  return `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`;
}

/** 单个单元 → <p:sp>。id 从 2 开始（1 留给 spTree 自己）。 */
export function pieceToPptxShape(p: TemplatePiece, W: number, H: number, id: number, embedRid?: string): string {
  if (p.hidden) return "";
  const name = xmlEsc(p.name || `单元 ${id}`);
  if (p.kind === "image") {
    // 图片单元 → <p:pic>，媒体文件由 buildTemplatePptx 写入 ppt/media 并登记 rels
    if (!embedRid) return "";
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${embedRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(p, W, H)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  const isText = p.kind === "text";
  const sp = isText
    ? `${xfrm(p, W, H)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${p.fill && p.fill !== "none" ? fillXml(p) : "<a:noFill/>"}<a:ln><a:noFill/></a:ln>${effectXml(p, H)}`
    : `${xfrm(p, W, H)}${geometry(p, W, H)}${fillXml(p)}${lineXml(p, H)}${effectXml(p, H)}`;
  const nv = `<p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr${isText ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr>`;
  const body = isText ? textBodyXml(p, H) : "";
  return `<p:sp>${nv}<p:spPr>${sp}</p:spPr>${body}</p:sp>`;
}
