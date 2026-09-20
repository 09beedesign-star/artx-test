/**
 * 空蒙版闸门 —— 行为测试。
 *
 * 【这条测试盯的是哪个真实故障】
 * 2026-09-21 生产取证：「智能编辑文案 → 提取文字 → 应用到新图」之后，
 * 用户会看到「vod拉取图片失败 / 网络开小差」。日志里 20 次擦字 12 次白费，
 * 失败的每一次都带着同一行：`[inpaint-mask] 输出: ..., 重绘区(白)占比=0.00%`。
 *
 * 根因在前端（见 client/src/lib/ai-payload-image.ts 的 MASK_FIELD_NAMES 注释）：
 * 蒙版被当成普通照片一起做了有损 JPEG 压缩，JPEG 没有 alpha 通道，
 * 蒙版用透明区表达的「要擦的文字区」被白底填实 → 服务端读到零编辑区。
 *
 * 前端修好之后，这里仍然要有一道闸门：**空蒙版一旦出现，必须立刻失败，
 * 不能送上游。** 上游拿到空蒙版要么原样退回、要么空转到 360s 超时，
 * 两种都照常计费 —— 这一刀省的是钱，不只是时间。
 *
 * ⚠️ 用真实 sharp 造像素，不 mock：被测函数整个逻辑就是像素统计，
 *    mock 掉 sharp 等于把被测对象换成了测试自己写的假货。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildInpaintMask } from "./inpaint-mask";
import { stripSourceComments } from "../shared/strip-source-comments";

const WIDTH = 64;
const HEIGHT = 48;

/**
 * 造一张 PNG 蒙版：整体不透明（= 保留区），把 rect 区域挖成全透明（= 编辑区）。
 * 这正是前端 createSmartCopyEditMask 的像素语义：fillRect 铺白 + clearRect 挖洞。
 */
async function makeMaskPng(rect: { x: number; y: number; w: number; h: number } | null) {
  const sharp = (await import("sharp")).default;
  const raw = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      const inside =
        rect !== null && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      raw[i] = 255;
      raw[i + 1] = 255;
      raw[i + 2] = 255;
      // 透明 = 要擦的区域；不透明 = 保留
      raw[i + 3] = inside ? 0 : 255;
    }
  }
  return await sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png()
    .toBuffer();
}

describe("buildInpaintMask 的空蒙版闸门", () => {
  it("有透明编辑区时正常产出蒙版（闸门不能误伤正常链路）", async () => {
    const mask = await makeMaskPng({ x: 8, y: 8, w: 20, h: 10 });
    const out = await buildInpaintMask(mask, WIDTH, HEIGHT);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it("整张全不透明（alpha 被抹平）时必须抛错，而不是返回一张没用的蒙版", async () => {
    const mask = await makeMaskPng(null);
    await expect(buildInpaintMask(mask, WIDTH, HEIGHT)).rejects.toThrow(/没有任何可编辑区域/);
  });

  it("报错必须点出 alpha 被压缩抹平这条真因，否则下次还会被当成网络问题", async () => {
    const mask = await makeMaskPng(null);
    await expect(buildInpaintMask(mask, WIDTH, HEIGHT)).rejects.toThrow(/alpha/i);
  });

  /*
   * 变异自证：把"挖洞"这一步去掉（即模拟 JPEG 抹平 alpha），
   * 上面那条"正常产出"的断言必须翻红 —— 证明它盯的是 alpha 而不是别的。
   *
   * ⚠️ 这里不改源码，而是改输入：同一个被测函数，唯一变量是蒙版有没有透明区。
   *    两个用例结果相反，就说明闸门真的在按 alpha 判定。
   */
  it("变异自证：同一函数，唯一变量是有无透明区，结果必须相反", async () => {
    const withHole = await makeMaskPng({ x: 1, y: 1, w: 2, h: 2 });
    const noHole = await makeMaskPng(null);
    await expect(buildInpaintMask(withHole, WIDTH, HEIGHT)).resolves.toBeInstanceOf(Buffer);
    await expect(buildInpaintMask(noHole, WIDTH, HEIGHT)).rejects.toThrow();
  });

  it("哪怕只有 1 个透明像素也放行：闸门只拦确定性故障，不替业务判断擦得够不够", async () => {
    const mask = await makeMaskPng({ x: 30, y: 20, w: 1, h: 1 });
    await expect(buildInpaintMask(mask, WIDTH, HEIGHT)).resolves.toBeInstanceOf(Buffer);
  });
});

describe("源码断言：即梦（VOD）通道也必须有同一道闸门", () => {
  it("createOgdEditMaskDataUrl 在空蒙版时 throw，而不是安静跳过扩展逻辑", () => {
    const file = path.resolve(import.meta.dirname, "image-generation.ts");
    const raw = fs.readFileSync(file, "utf8");
    const code = stripSourceComments(raw);
    const removedRatio = 1 - code.length / raw.length;
    expect(
      removedRatio,
      `image-generation.ts 注释剥离比例 ${(removedRatio * 100).toFixed(1)}% 异常，断言输入已被污染`,
    ).toBeLessThan(0.6);

    const fnIndex = code.indexOf("async function createOgdEditMaskDataUrl");
    expect(fnIndex, "没找到 createOgdEditMaskDataUrl").toBeGreaterThan(-1);
    // 只看这个函数体内的一段，避免断言被文件里其他地方的同名片段蒙混过关
    const body = code.slice(fnIndex, fnIndex + 6000);

    const guardIndex = body.indexOf("if (maxX < 0 || maxY < 0)");
    expect(guardIndex, "空蒙版闸门不见了").toBeGreaterThan(-1);
    expect(body.slice(guardIndex, guardIndex + 400)).toContain("throw new Error");

    /*
     * ⚠️ 闸门必须在**扩展/膨胀逻辑之前**。放到后面等于先算一通再抛，
     *    虽然也不会送上游，但会掩盖"这段逻辑对空蒙版是静默跳过"的事实，
     *    下次有人把 throw 挪走就又退回原状了。
     */
    const dilateIndex = body.indexOf("extractUserRequest(editPrompt)");
    expect(dilateIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(dilateIndex);
  });
});
