import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AI_PAYLOAD_IMAGE_MAX_BYTES,
  AI_PAYLOAD_IMAGE_MAX_EDGE,
  AI_REQUEST_BODY_LIMIT_BYTES,
  compressAiRequestBody,
  compressImageForAiPayload,
  estimateDataUrlBytes,
  estimateJsonBytes,
  isDataUrl,
} from "./ai-payload-image";
import { stripSourceComments } from "../../../shared/strip-source-comments";

const LIB_DIR = path.resolve(import.meta.dirname);
const SERVER_INDEX = path.resolve(LIB_DIR, "../../../server/index.ts");
const AI_SOURCE = path.join(LIB_DIR, "ai.ts");
const PAYLOAD_SOURCE = path.join(LIB_DIR, "ai-payload-image.ts");

function readCode(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const stripped = stripSourceComments(raw);
  // 注释剥离闸门：剥掉的比例过高说明正则把代码也吃了，断言会变成恒绿/恒红。
  const removedRatio = 1 - stripped.length / raw.length;
  // 本仓库注释密度本来就高（ai-payload-image.ts 实测 46%），
  // 阈值卡的是「正则把代码也吃了」这种失控情形，不是注释多少。
  expect(
    removedRatio,
    `${path.basename(filePath)} 注释剥离比例 ${(removedRatio * 100).toFixed(1)}% 异常，断言输入已被污染`
  ).toBeLessThan(0.6);
  expect(stripped.length).toBeGreaterThan(200);
  return stripped;
}

describe("estimateDataUrlBytes", () => {
  it("按 base64 解码后的真实字节数估算，而不是字符串长度", () => {
    // "AAAA" 是 4 个 base64 字符 → 3 字节
    const src = "data:image/png;base64,AAAA";
    expect(estimateDataUrlBytes(src)).toBe(3);
    // 直接用 src.length 会得到 26，高估近 9 倍
    expect(estimateDataUrlBytes(src)).not.toBe(src.length);
  });

  it("正确处理 padding", () => {
    expect(estimateDataUrlBytes("data:image/png;base64,QUJD")).toBe(3); // ABC
    expect(estimateDataUrlBytes("data:image/png;base64,QUI=")).toBe(2); // AB
    expect(estimateDataUrlBytes("data:image/png;base64,QQ==")).toBe(1); // A
  });

  it("相对字符串长度必须明显更小（防止有人改回 src.length）", () => {
    const payload = "Q".repeat(4000);
    const src = `data:image/png;base64,${payload}`;
    const bytes = estimateDataUrlBytes(src);
    expect(bytes).toBe(3000);
    // base64 固定 4:3，估算值必须落在 74%~76% 区间
    expect(bytes / payload.length).toBeGreaterThan(0.74);
    expect(bytes / payload.length).toBeLessThan(0.76);
  });
});

describe("isDataUrl", () => {
  it("识别 data URL，拒绝普通 URL 与相对路径", () => {
    expect(isDataUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isDataUrl("  data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isDataUrl("https://backstage.artxsd.com/uploads/images/a/b.png")).toBe(false);
    expect(isDataUrl("/uploads/images/a/b.png")).toBe(false);
    expect(isDataUrl("")).toBe(false);
  });
});

describe("estimateJsonBytes", () => {
  it("能估算普通对象体积，循环引用时返回 0 而不是抛错", () => {
    expect(estimateJsonBytes({ a: "x".repeat(100) })).toBeGreaterThan(100);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(estimateJsonBytes(cyclic)).toBe(0);
  });
});

describe("compressImageForAiPayload（node 环境无 document）", () => {
  it("非 data URL 一律原样返回：远程 URL 由服务端自己取像素", async () => {
    const remote = "https://backstage.artxsd.com/uploads/images/u/a.png?artxv=x";
    await expect(compressImageForAiPayload(remote)).resolves.toBe(remote);
    await expect(compressImageForAiPayload("/uploads/images/u/a.png")).resolves.toBe(
      "/uploads/images/u/a.png"
    );
  });

  it("没有浏览器环境时返回原图，绝不抛错（压缩失败不能阻断业务）", async () => {
    const src = `data:image/png;base64,${"Q".repeat(4000)}`;
    await expect(compressImageForAiPayload(src)).resolves.toBe(src);
  });
});

describe("compressAiRequestBody", () => {
  it("不改原对象，深层字段也会被遍历到", async () => {
    const body = {
      prompt: "写一段提示词",
      imageSrc: "https://example.com/a.png",
      images: [{ src: "/uploads/images/u/b.png", title: "图" }],
      nested: { referenceImages: ["https://example.com/c.png"] },
    };
    const snapshot = JSON.parse(JSON.stringify(body));
    const out = await compressAiRequestBody(body);
    expect(body).toEqual(snapshot); // 原对象未被污染
    expect(out).toEqual(snapshot); // 无 data URL 时内容不变
    expect(out).not.toBe(body);
  });

  it("非对象载荷原样返回", async () => {
    await expect(compressAiRequestBody(null)).resolves.toBe(null);
    await expect(compressAiRequestBody("x")).resolves.toBe("x");
    await expect(compressAiRequestBody(42)).resolves.toBe(42);
  });

  it("保留非字符串值的类型（数字 / 布尔 / null 不被字符串化）", async () => {
    const body = { count: 2, hd: true, mask: null, tags: ["a", 1, false] };
    await expect(compressAiRequestBody(body)).resolves.toEqual(body);
  });
});

describe("阈值一致性（改一边忘另一边必须变红）", () => {
  it("单图上限必须明显小于请求体上限，否则多图请求仍会撞 413", () => {
    expect(AI_PAYLOAD_IMAGE_MAX_BYTES).toBeLessThan(AI_REQUEST_BODY_LIMIT_BYTES);
    // 至少留出「3 张满额图 + 正文」的余量
    expect(AI_PAYLOAD_IMAGE_MAX_BYTES * 3).toBeLessThan(AI_REQUEST_BODY_LIMIT_BYTES);
  });

  it("本地声明的请求体上限必须与 server/index.ts 的 express.json limit 对齐", () => {
    const serverCode = readCode(SERVER_INDEX);
    const match = serverCode.match(/express\.json\(\{\s*limit:\s*"(\d+)mb"/);
    expect(match, "没在 server/index.ts 找到 express.json({ limit: \"Nmb\" })").toBeTruthy();
    const serverLimitBytes = Number(match![1]) * 1024 * 1024;
    expect(AI_REQUEST_BODY_LIMIT_BYTES).toBe(serverLimitBytes);
  });

  it("长边阈值不能低于视觉模型 patch 网格上限（低于会真丢字）", () => {
    expect(AI_PAYLOAD_IMAGE_MAX_EDGE).toBeGreaterThanOrEqual(1568);
  });
});

describe("源码断言：压缩链路的关键约束不能被改掉", () => {
  it("JPEG 转换前必须铺白底，否则透明区变黑会让 OCR 读不出白字", () => {
    const code = readCode(PAYLOAD_SOURCE);
    expect(code).toMatch(/fillStyle\s*=\s*"#ffffff"/);
    expect(code).toMatch(/fillRect\(0,\s*0,\s*width,\s*height\)/);
    // 铺白底必须在 drawImage 之前，顺序反了等于没铺
    expect(code.indexOf("fillRect(")).toBeLessThan(code.indexOf("drawImage("));
  });

  it("压缩失败必须返回原图，不能抛错", () => {
    const code = readCode(PAYLOAD_SOURCE);
    expect(code).toMatch(/catch\s*\{\s*return src;\s*\}/);
  });
});

describe("源码断言：ai.ts 的收口与 413 文案", () => {
  it("压缩收口在 fetchAiJson 的发请求处，且用压缩结果而非原 body", () => {
    const code = readCode(AI_SOURCE);
    expect(code).toContain("const payload = await compressAiRequestBody(body);");
    expect(code).toContain("body: JSON.stringify(payload),");
    // 反向断言：不能再出现直接把原 body 序列化发出去的写法
    expect(code).not.toContain("body: JSON.stringify(body),");
  });

  it("413 必须给出「图太大」的人话提示，而不是沿用「后端未连接」", () => {
    const code = readCode(AI_SOURCE);
    expect(code).toContain("response.status === 413");
    expect(code).toMatch(/413[\s\S]{0,400}?图片体积超出服务端上限/);
    /*
     * 413 分支必须出现在**抛出「后端未正确连接」的那句 throw** 之前。
     *
     * ⚠️ 不能拿 `startsWith("<")` 当参照物 —— 那只是 looksLikeHtml 的变量赋值，
     *    赋值天然在所有分支之前，拿它比较会让这条断言恒红（实测踩过）。
     *    真正决定用户看到哪句话的是 throw 的先后。
     */
    /*
     * ⚠️ 「AI 后端地址未正确连接」这串在文件里出现 4 次：
     *    3 次在 isRetryable* 的重试判定正则里（都在 fetchAiJson 之前），
     *    只有最后一次才是真正抛给用户的那句。
     *    用 indexOf 会抓到第一条正则，让断言恒红（实测踩过）。
     */
    const idx413 = code.indexOf("response.status === 413");
    const idxHtmlThrow = code.lastIndexOf("AI 后端地址未正确连接");
    expect(idx413).toBeGreaterThan(-1);
    expect(idxHtmlThrow).toBeGreaterThan(-1);
    expect(idx413).toBeLessThan(idxHtmlThrow);
  });
});
