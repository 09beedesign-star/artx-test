/**
 * 版式导出：PPT / PDF / SVG / PNG / JPG（2026-11-17）。
 *
 * ⚠️ 视觉只走 renderTemplateSvg（唯一 SVG 出口）；PNG / JPG / PDF 都是它的栅格化，
 *    PPT 走 canvas-template-pptx（可编辑文本框 + 形状），不各画一套。
 * 不消耗积分，全部在浏览器本地完成。
 */
import { renderTemplateSvg, type TemplatePiece } from "./canvas-templates";
import { buildTemplatePptx } from "./canvas-template-pptx";

export type TemplateExportFormat = "pptx" | "pdf" | "svg" | "png" | "jpg";
export const TEMPLATE_EXPORT_FORMATS: Array<{ id: TemplateExportFormat; label: string; ext: string }> = [
  { id: "pptx", label: "PPT", ext: "pptx" },
  { id: "pdf", label: "PDF", ext: "pdf" },
  { id: "svg", label: "SVG", ext: "svg" },
  { id: "png", label: "PNG", ext: "png" },
  { id: "jpg", label: "JPG", ext: "jpg" },
];
export type TemplateExportScope = "frame" | "piece";
export const TEMPLATE_EXPORT_EVENT = "canvas-template-export";
export interface TemplateExportRequest {
  nodeId: string;
  format: TemplateExportFormat;
  scope: TemplateExportScope;
}

export interface TemplateExportJob {
  pieces: TemplatePiece[];
  width: number;
  height: number;
  background: string;
  name: string;
  /** 只导出单个单元时：裁切到这个归一化框 */
  crop?: { x: number; y: number; w: number; h: number };
}

/** 单元导出：把该单元平移到原点，画板缩成单元大小（坐标仍按原画板比例，保证字号 / 线宽不变）。 */
export function cropJobToPiece(job: TemplateExportJob, piece: TemplatePiece): TemplateExportJob {
  const pw = Math.max(1, piece.w * job.width);
  const ph = Math.max(1, piece.h * job.height);
  return { ...job, crop: { x: piece.x, y: piece.y, w: piece.w, h: piece.h }, pieces: [piece], width: pw, height: ph, background: "" };
}

export function jobToSvg(job: TemplateExportJob): string {
  if (!job.crop) return renderTemplateSvg(job.pieces, job.width, job.height, job.background || undefined);
  // 裁切：按原画板尺寸渲染，再把 viewBox 收到单元框
  const fullW = job.width / Math.max(1e-6, job.crop.w);
  const fullH = job.height / Math.max(1e-6, job.crop.h);
  const svg = renderTemplateSvg(job.pieces, fullW, fullH);
  const vb = `${job.crop.x * fullW} ${job.crop.y * fullH} ${job.width} ${job.height}`;
  return svg.replace(/^<svg([^>]*)width="[^"]*" height="[^"]*" viewBox="[^"]*"/,
    `<svg$1width="${Math.round(job.width)}" height="${Math.round(job.height)}" viewBox="${vb}" overflow="visible"`);
}

export function safeFileName(name: string): string {
  return (name || "ArtX版式").replace(/[\\/:*?"<>|\n\r]+/g, "_").slice(0, 80);
}

/**
 * 🔒 多模板批量导出命名：按选中顺序加两位序列号「名称_01.png」「名称_02.png」…
 * 序列号本身就保证唯一，重名模板也不会互相覆盖；仍做一次兜底去重（防外部传入重复）。
 */
export function serialFileNames(names: string[], ext: string): string[] {
  const width = Math.max(2, String(names.length).length);
  const used = new Set<string>();
  return names.map((raw, i) => {
    const base = `${safeFileName(raw)}_${String(i + 1).padStart(width, "0")}`;
    let file = `${base}.${ext}`;
    let k = 2;
    while (used.has(file.toLowerCase())) file = `${base}-${k++}.${ext}`;
    used.add(file.toLowerCase());
    return file;
  });
}

async function svgToCanvas(svg: string, width: number, height: number, background?: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d")!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, q));

/** 栅格化倍率：长边至少 2400px，最多 6000px。 */
export function exportScale(width: number, height: number): number {
  const long = Math.max(width, height);
  return Math.min(6000 / long, Math.max(2, 2400 / long));
}

/** 最小 PDF：一页，页面尺寸 = 画板（pt），内容是一张高清 JPEG。 */
export function buildJpegPdf(jpeg: Uint8Array, imgW: number, imgH: number, pageW: number, pageH: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: string | (() => void)) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    if (typeof body === "string") push(body); else body();
    push("\nendobj\n");
  };
  const pw = pageW.toFixed(2), ph = pageH.toFixed(2);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push("\nendstream");
  });
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export async function exportTemplateJob(job: TemplateExportJob, format: TemplateExportFormat): Promise<{ blob: Blob; fileName: string }> {
  const base = safeFileName(job.name);
  const ext = TEMPLATE_EXPORT_FORMATS.find(f => f.id === format)?.ext || format;
  const fileName = `${base}.${ext}`;
  if (format === "pptx") {
    const blob = await buildTemplatePptx({
      pieces: job.crop
        ? job.pieces.map(p => ({ ...p, x: 0, y: 0, w: 1, h: 1, sizeRatio: (p.sizeRatio || 0.014) / job.crop!.h, strokeRatio: (p.strokeRatio || 0) / job.crop!.h, trackingRatio: (p.trackingRatio || 0) / job.crop!.h }))
        : job.pieces,
      width: job.width, height: job.height, background: job.background, title: job.name,
    });
    return { blob, fileName };
  }
  const svg = jobToSvg(job);
  if (format === "svg") return { blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), fileName };
  const k = exportScale(job.width, job.height);
  const pxW = Math.round(job.width * k), pxH = Math.round(job.height * k);
  // JPG / PDF 没有透明通道：单元导出时垫白底
  const solidBg = job.background || (format === "png" ? undefined : "#ffffff");
  const canvas = await svgToCanvas(svg, pxW, pxH, solidBg);
  if (format === "png") return { blob: await toBlob(canvas, "image/png"), fileName };
  const jpg = await toBlob(canvas, "image/jpeg", 0.95);
  if (format === "jpg") return { blob: jpg, fileName };
  const bytes = new Uint8Array(await jpg.arrayBuffer());
  // 页面尺寸：画板 px 按 96dpi 换算成 pt
  return { blob: buildJpegPdf(bytes, pxW, pxH, job.width * 0.75, job.height * 0.75), fileName };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
