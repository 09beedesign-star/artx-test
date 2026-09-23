// 生成 VOD 模型擦字回填横评对照图（贴回蒙版内后的产物）
import sharp from "sharp";

const OUT = "/Users/ericbi/WorkBuddy/2026-09-07-21-55-56/text-edit-basketball-v2/vod-model-sheet.png";
const DIR = "/tmp/artx-vod-composite";
const PICKS = [
  ["comp-og-image2-high.png", "og-image2-high  推荐 风格最还原"],
  ["comp-og25-sunburst-high.png", "og25-sunburst-high  次选 字形最稳"],
  ["comp-si.png", "si 5.0-pro  字形规整但非原字体"],
  ["comp-gem-3.1-lite.png", "gem-3.1-lite  最快 17s"],
  ["comp-jimeng.png", "jimeng 4.0  配色被改"],
  ["comp-og25-flare-medium.png", "og25-flare  错字/黑块 不可用"],
];

const CW = 640, LABEL = 42, COLS = 2;
const tiles = [];
for (const [f, label] of PICKS) {
  const img = sharp(`${DIR}/${f}`).resize(CW);
  const meta = await sharp(`${DIR}/${f}`).metadata();
  const h = Math.round(meta.height * (CW / meta.width));
  const body = await img.png().toBuffer();
  const bar = await sharp({
    create: { width: CW, height: LABEL, channels: 3, background: "#101216" },
  })
    .composite([{
      input: Buffer.from(
        `<svg width="${CW}" height="${LABEL}"><text x="12" y="28" font-family="PingFang SC,Helvetica,Arial" font-size="19" fill="#e8eaed">${label}</text></svg>`
      ),
      top: 0, left: 0,
    }])
    .png().toBuffer();
  const tile = await sharp({
    create: { width: CW, height: h + LABEL, channels: 3, background: "#101216" },
  })
    .composite([{ input: bar, top: 0, left: 0 }, { input: body, top: LABEL, left: 0 }])
    .png().toBuffer();
  tiles.push({ buf: tile, w: CW, h: h + LABEL });
}

const rowH = Math.max(...tiles.map(t => t.h));
const rows = Math.ceil(tiles.length / COLS);
const GAP = 10;
const W = COLS * CW + (COLS + 1) * GAP;
const H = rows * rowH + (rows + 1) * GAP;

const comps = tiles.map((t, i) => ({
  input: t.buf,
  left: GAP + (i % COLS) * (CW + GAP),
  top: GAP + Math.floor(i / COLS) * (rowH + GAP),
}));

await sharp({ create: { width: W, height: H, channels: 3, background: "#16181d" } })
  .composite(comps)
  .png()
  .toFile(OUT);
console.log("已生成", OUT, `${W}x${H}`);
