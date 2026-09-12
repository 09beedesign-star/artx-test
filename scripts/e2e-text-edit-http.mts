import fs from "node:fs";
import sharp from "sharp";

const BASE = "http://127.0.0.1:3001";
const POSTER = "/Users/ericbi/Desktop/artx-测试海报.png";

let TOKEN = "";

async function login() {
  const r = await fetch(`${BASE}/api/auth/dev-session`, { signal: AbortSignal.timeout(10000) });
  const j: any = await r.json();
  TOKEN = j.token ?? "";
  const allowed: string[] = j.user?.allowedAiModels ?? [];
  // 2026-09-12 起默认图片模型是 VOD 直连的 image2.5 medium；
  // 白名单读盘时旧 id 已被迁移，这里必须用新 id 检查，否则恒为 ✗。
  const defaultImageModel = "vod-og25-sunburst-medium";
  console.log(`测试会话: ${j.user?.username} | 白名单含 ${defaultImageModel}: ${allowed.includes(defaultImageModel) ? "✓" : "✗"}`);
}

async function post(url: string, body: unknown, timeoutMs = 300000) {
  const t = Date.now();
  const r = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const txt = await r.text();
  return { status: r.status, secs: ((Date.now() - t) / 1000).toFixed(1), txt };
}

/** 前端同款：把待改区域涂白，其余为黑（白=重绘，黑=保留） */
async function buildMask(regions: any[], width: number, height: number) {
  const rects = regions
    .map((r) => {
      const padX = r.width * width * 0.04;
      const padY = r.height * height * 0.12;
      const x = Math.max(0, Math.round(r.x * width - padX));
      const y = Math.max(0, Math.round(r.y * height - padY));
      const w = Math.min(width - x, Math.round(r.width * width + padX * 2));
      const h = Math.min(height - y, Math.round(r.height * height + padY * 2));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000000"/>${rects}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function main() {
  await login();
  if (!fs.existsSync(POSTER)) {
    console.log(`未找到 ${POSTER}`);
    return;
  }
  const buf = fs.readFileSync(POSTER);
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  const meta = await sharp(buf).metadata();
  const width = meta.width!, height = meta.height!;
  console.log(`测试图 ${width}x${height}`);

  // 1) OCR
  const ocr = await post("/api/images/ocr", { imageSrc: dataUrl }, 120000);
  console.log(`\n[1] OCR -> HTTP ${ocr.status} 用时 ${ocr.secs}s`);
  if (ocr.status !== 200) return console.log("  错误:", ocr.txt.slice(0, 400));
  const regions = JSON.parse(ocr.txt).regions ?? [];
  regions.forEach((r: any, i: number) => console.log(`  ${i}: "${r.text}"`));
  if (!regions.length) return;

  // 2) 只改第一行。
  // 关键：textRegions[].text 必须保留【原文】，editedText 传【新文案】；
  // createModifiedRegionsMask 靠两者的差异判定改哪些区域，若 text 已写成新值会被判定为"无改动"，
  // 生成全白 mask 从而完全保留原图（表现为"改了等于没改"）。
  const NEW = "秋季旗舰品鉴会";
  const target = [regions[0]];
  const maskSrc = await buildMask(target, width, height);

  const edit = await post("/api/images/edit", {
    imageSrc: dataUrl,
    maskSrc,
    operation: "text_edit",
    prompt: `将文字替换为"${NEW}"`,
    textRegions: target,
    editedText: NEW,
  });
  console.log(`\n[2] text_edit -> HTTP ${edit.status} 用时 ${edit.secs}s`);
  if (edit.status !== 200) return console.log("  错误:", edit.txt.slice(0, 600));

  const j = JSON.parse(edit.txt);
  const first = Array.isArray(j.images) ? j.images[0] : undefined;
  console.log(`  返回 images[0] 字段: ${first ? Object.keys(first).join(",") : "无"} | src 前缀: ${String(first?.src ?? "").slice(0, 30)}`);
  const outSrc: string =
    j.imageSrc ?? j.url ?? j.imageUrl ??
    (typeof first === "string" ? first : first?.url ?? first?.imageSrc ?? first?.src ?? "");
  if (!outSrc) return console.log("  返回字段:", Object.keys(j).join(","), "| images[0]:", JSON.stringify(first).slice(0, 200));

  let outBuf: Buffer;
  if (outSrc.startsWith("data:")) outBuf = Buffer.from(outSrc.split(",")[1], "base64");
  else {
    const rr = await fetch(outSrc.startsWith("http") ? outSrc : `${BASE}${outSrc}`);
    outBuf = Buffer.from(await rr.arrayBuffer());
  }
  const outPath = "/Users/ericbi/Desktop/artx-文字编辑结果.png";
  fs.writeFileSync(outPath, outBuf);

  // 3) 逐区域改动率
  const a = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(outBuf).resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = a.info.channels;
  console.log("\n[3] 逐区域像素改动率");
  regions.forEach((r: any, i: number) => {
    const x0 = Math.max(0, Math.round(r.x * width)), y0 = Math.max(0, Math.round(r.y * height));
    const x1 = Math.min(width, Math.round((r.x + r.width) * width)), y1 = Math.min(height, Math.round((r.y + r.height) * height));
    let diff = 0, total = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = (y * width + x) * ch; total++;
      if (Math.abs(a.data[k] - b.data[k]) + Math.abs(a.data[k + 1] - b.data[k + 1]) + Math.abs(a.data[k + 2] - b.data[k + 2]) > 24) diff++;
    }
    console.log(`  ${r.text} [${i === 0 ? "改动" : "保留"}]: ${total ? ((diff / total) * 100).toFixed(2) : "0.00"}%`);
  });
  console.log(`\n结果: ${outPath}`);
}

main().catch((e) => console.log("失败:", String(e).slice(0, 300)));
