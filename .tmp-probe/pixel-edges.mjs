import sharp from "sharp";
for (const n of ["f0-collapsed","f1","f2","f3","f4"]) {
  const { data, info } = await sharp(`/tmp/${n}.png`).raw().toBuffer({ resolveWithObject: true });
  const y = 130; // 卡片中部（不含文字）
  const starts = [];
  let inWhite = false;
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const r = data[i], g = data[i+1], b = data[i+2];
    const white = r >= 252 && g >= 252 && b >= 252;
    if (white && !inWhite) { starts.push(x); inWhite = true; }
    if (!white) inWhite = false;
  }
  console.log(n, "white card left edges:", starts.slice(0, 6).join(", "));
}
