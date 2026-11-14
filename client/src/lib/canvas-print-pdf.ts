/**
 * 打印面板直出 PDF（2026-11-14）。
 *
 * 背景：用户反馈「有两层打印界面，重复了」—— 我们自己的白色打印面板点「保存」后
 * 原来会再调 iframe.contentWindow.print() 弹出浏览器系统打印框（深色那层，
 * 自带一套预览/纸张/布局，和我们的面板完全重复）。用户要求只保留白色面板。
 *
 * ✅ 改为在本地把每一页（与预览同一个 drawPrintPage 画出来的 canvas）编码成 JPEG，
 *    再手写一个最小 PDF（每页一张 DCTDecode 图片铺满整页），直接下载。
 *    不引入第三方依赖（项目对三方包有审计要求）。
 */

export interface PdfPageImage {
  /** JPEG 文件字节（canvas.toBlob("image/jpeg") 得到） */
  jpeg: Uint8Array;
  /** 图片像素尺寸 */
  width: number;
  height: number;
}

const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return Math.round(mm * MM_TO_PT * 100) / 100;
}

/**
 * 生成 PDF 字节。每页尺寸 pageWpt × pageHpt（单位 pt），图片拉伸铺满
 * （页面像素已按纸张比例绘制，所以不会变形）。
 */
export function buildImagePdf(pages: PdfPageImage[], pageWpt: number, pageHpt: number): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObj = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  // 对象编号：1 Catalog, 2 Pages, 之后每页 3 个对象（Page / Image / Content）
  const pageObjId = (i: number) => 3 + i * 3;
  const imageObjId = (i: number) => 4 + i * 3;
  const contentObjId = (i: number) => 5 + i * 3;
  const totalObjects = 2 + pages.length * 3;

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  beginObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObj(2);
  const kids = pages.map((_, i) => `${pageObjId(i)} 0 R`).join(" ");
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    beginObj(pageObjId(i));
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
      `/Resources << /XObject << /Im${i} ${imageObjId(i)} 0 R >> >> ` +
      `/Contents ${contentObjId(i)} 0 R >>\nendobj\n`,
    );

    beginObj(imageObjId(i));
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    );
    push(page.jpeg);
    push("\nendstream\nendobj\n");

    const content = `q\n${pageWpt} 0 0 ${pageHpt} 0 0 cm\n/Im${i} Do\nQ\n`;
    beginObj(contentObjId(i));
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefOffset = length;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjects; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
