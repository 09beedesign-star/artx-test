import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../server/image-generation.ts", import.meta.url), "utf8");
const eraseMatch = source.match(/async function eraseWithPicWish[\s\S]*?\n}/);

if (!eraseMatch) {
  throw new Error("eraseWithPicWish was not found");
}

const eraseSource = eraseMatch[0];

if (!/runPicWishImageTask\("inpaint"/.test(eraseSource)) {
  throw new Error("橡皮擦佐糖接口必须使用图片消除笔 inpaint task");
}

if (/runPicWishImageTask\("watermark"/.test(eraseSource)) {
  throw new Error("橡皮擦不能继续调用 watermark task");
}

if (!/maskBuffer/.test(eraseSource) || !/maskMimeType/.test(eraseSource)) {
  throw new Error("橡皮擦必须继续传入用户涂抹蒙版");
}

console.log("PicWish eraser route uses inpaint with mask input.");
