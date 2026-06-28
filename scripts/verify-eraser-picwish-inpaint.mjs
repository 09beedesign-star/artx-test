import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../server/image-generation.ts", import.meta.url), "utf8");
const eraseMatch = source.match(/async function eraseWithPicWish[\s\S]*?\n}/);
const createTaskMatch = source.match(/async function createPicWishInpaintTask[\s\S]*?\n}/);
const pollTaskMatch = source.match(/async function pollPicWishInpaintTask[\s\S]*?\n}/);
const maskMatch = source.match(/async function createPicWishEraseMask[\s\S]*?return providerMaskBuffer;\n}/);
const eraseImageObjectsMatch = source.match(/export async function eraseImageObjects[\s\S]*?\n}/);

if (!eraseMatch) {
  throw new Error("eraseWithPicWish was not found");
}
if (!createTaskMatch) {
  throw new Error("createPicWishInpaintTask was not found");
}
if (!pollTaskMatch) {
  throw new Error("pollPicWishInpaintTask was not found");
}
if (!maskMatch) {
  throw new Error("createPicWishEraseMask was not found");
}
if (!eraseImageObjectsMatch) {
  throw new Error("eraseImageObjects was not found");
}

const eraseSource = eraseMatch[0];
const createTaskSource = createTaskMatch[0];
const pollTaskSource = pollTaskMatch[0];
const maskSource = maskMatch[0];
const eraseImageObjectsSource = eraseImageObjectsMatch[0];

if (!/\/api\/tasks\/visual\/inpaint/.test(createTaskSource)) {
  throw new Error("橡皮擦必须直连 PicWish inpaint 创建任务接口");
}

if (!/\/api\/tasks\/visual\/inpaint\/\$/.test(pollTaskSource)) {
  throw new Error("橡皮擦必须直连 PicWish inpaint 轮询接口");
}

if (!/X-API-KEY/.test(createTaskSource) || !/X-API-KEY/.test(pollTaskSource)) {
  throw new Error("橡皮擦 PicWish 请求必须使用 X-API-KEY 认证");
}

if (!/body\.append\("sync", input\.sync \? "1" : "0"\)/.test(createTaskSource)) {
  throw new Error("橡皮擦必须支持 PicWish sync=0 和 sync=1");
}

if (!/image_url/.test(createTaskSource) || !/image_file/.test(createTaskSource)) {
  throw new Error("橡皮擦必须支持 image_url 和 image_file 两种原图来源");
}

if (!/mask_url/.test(createTaskSource) || !/mask_file/.test(createTaskSource) || !/rectangles/.test(createTaskSource)) {
  throw new Error("橡皮擦必须支持 mask_url、mask_file 和 rectangles 三种去除区域");
}

if (!/attempt < 180/.test(pollTaskSource)) {
  throw new Error("橡皮擦异步轮询最长必须支持 180 秒");
}

if (!/state > 0/.test(pollTaskSource) || !/state < 0/.test(pollTaskSource) || !/imageUrl/.test(pollTaskSource)) {
  throw new Error("橡皮擦轮询必须结合 data.state 和 data.image 判断成功/失败");
}

if (!/maskBuffer/.test(eraseSource) || !/maskMimeType/.test(eraseSource) || !/pollPicWishInpaintTask/.test(eraseSource)) {
  throw new Error("橡皮擦必须继续传入用户涂抹蒙版");
}

if (!createTaskSource.includes("if (!taskId)")) {
  throw new Error("PicWish inpaint 创建后必须强制校验 taskId");
}

if (!createTaskSource.includes("returned an image but no task id")) {
  throw new Error("PicWish inpaint 返回图片但没有 taskId 时必须记录失败日志");
}

if (!eraseSource.includes("withProviderTaskIds(result, [taskId])")) {
  throw new Error("橡皮擦成功结果必须绑定 PicWish taskId");
}

if (!/providerMask\[index\]\s*=\s*shouldErase\s*\?\s*255\s*:\s*0/.test(maskSource)) {
  throw new Error("传给 PicWish inpaint 的蒙版必须是白色=擦除区域、黑色=保护区域");
}

if (/createLocalEraseFallback|compositeEraseResultInsidePicWishMask|didEraseChangeMaskedArea|doesEraseBlendIntoBackground|compositeEraseResultOnlyInsideMask/.test(source)) {
  throw new Error("旧橡皮擦兜底、合成或二次判断代码仍有残留");
}

if (/createLocalEraseFallback|compositeEraseResultInsidePicWishMask|didEraseChangeMaskedArea|doesEraseBlendIntoBackground|runPicWishImageTask\("inpaint"/.test(eraseImageObjectsSource)) {
  throw new Error("eraseImageObjects 不能再走旧橡皮擦链路");
}

console.log("PicWish eraser route matches the documented inpaint API, including sync modes, URL/file inputs, rectangles, 180s polling, and white-remove masks.");
