import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../server/image-generation.ts", import.meta.url), "utf8");
const eraseMatch = source.match(/async function eraseWithPicWish[\s\S]*?\n}/);
const maskMatch = source.match(/async function createPicWishEraseMasks[\s\S]*?return \{ providerMaskBuffer, eraseMaskBuffer \};\n}/);

if (!eraseMatch) {
  throw new Error("eraseWithPicWish was not found");
}
if (!maskMatch) {
  throw new Error("createPicWishEraseMasks was not found");
}

const eraseSource = eraseMatch[0];
const maskSource = maskMatch[0];

if (!/runPicWishImageTask\("inpaint"/.test(eraseSource)) {
  throw new Error("橡皮擦佐糖接口必须使用图片消除笔 inpaint task");
}

if (/runPicWishImageTask\("watermark"/.test(eraseSource)) {
  throw new Error("橡皮擦不能继续调用 watermark task");
}

if (!/maskBuffer/.test(eraseSource) || !/maskMimeType/.test(eraseSource)) {
  throw new Error("橡皮擦必须继续传入用户涂抹蒙版");
}

if (!/providerMask\[index\]\s*=\s*shouldErase\s*\?\s*0\s*:\s*255/.test(maskSource)) {
  throw new Error("传给佐糖消除笔的蒙版必须是黑色=擦除区域、白色=保护区域");
}

if (!/eraseMask\[index\]\s*=\s*shouldErase\s*\?\s*255\s*:\s*0/.test(maskSource)) {
  throw new Error("内部合成蒙版必须保持白色=擦除区域，确保只替换用户涂抹区域");
}

console.log("PicWish eraser route uses inpaint with black-remove provider mask and white-remove internal mask.");
