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
  isMaskFieldName,
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

describe("蒙版字段禁止有损压缩（2026-09-21 擦字静默失效）", () => {
  /*
   * 【这组测试盯的是哪个真实故障】
   * 用户报：「智能编辑文案提取文字并应用到新图之后，会提示 vod拉取图片失败
   * 或者网络开小差」。生产日志 20 次擦字 12 次白费，失败的每一次
   * 服务端都打 `重绘区(白)占比=0.00%`。
   *
   * 真因不在网络、也不在超时：蒙版用 **alpha 通道** 表达「哪块要擦」
   * （createSmartCopyEditMask 的 clearRect 挖透明），而这里的压缩会
   * 铺白底 + 转 JPEG，JPEG 没有 alpha —— 透明区被填实，蒙版变成
   * 「一个可编辑像素都没有」。上游拿到后空转到 360s 超时，还照常计费。
   */
  it("isMaskFieldName 认得全部蒙版字段名，且不误伤普通图片字段", () => {
    for (const key of [
      "maskSrc",
      "mask_url",
      "maskUrl",
      "mask_base64",
      "eraseMaskDataUrl",
      "maskDataUrl",
    ]) {
      expect(isMaskFieldName(key), `${key} 应被识别为蒙版字段`).toBe(true);
    }
    // 大小写兜底：调用方写成 masksrc 也不能漏
    expect(isMaskFieldName("masksrc")).toBe(true);
    expect(isMaskFieldName("MASKURL")).toBe(true);

    // 反向：普通图片字段必须照常压，否则 413 的老毛病会回来
    for (const key of ["imageSrc", "src", "referenceImages", "sourceBackgroundSrc", "image"]) {
      expect(isMaskFieldName(key), `${key} 不该被当成蒙版`).toBe(false);
    }
  });

  /**
   * 装一套最小假 DOM，让 compressImageForAiPayload 真的走完压缩分支。
   *
   * ⚠️ 不装的话，node 环境下压缩函数一律原样返回 —— 那时候
   *    「蒙版没被改动」这条断言会**恒绿**，等于没有检测器。
   *    装上之后普通字段确实会变短，两者对照才证明豁免真的生效。
   */
  function installFakeDom() {
    const compressed = "data:image/jpeg;base64,QQ==";
    const fakeCtx = {
      fillStyle: "",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "",
      fillRect: () => {},
      drawImage: () => {},
    };
    const g = globalThis as Record<string, unknown>;
    const prevDocument = g.document;
    const prevImage = g.Image;
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
        toDataURL: () => compressed,
      }),
    };
    g.Image = class {
      naturalWidth = 3000; // > AI_PAYLOAD_IMAGE_MAX_EDGE，确保触发降采样
      naturalHeight = 2000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    };
    return {
      compressed,
      restore() {
        g.document = prevDocument;
        g.Image = prevImage;
      },
    };
  }

  it("同一份载荷里：普通图片被压，maskSrc 原样保留（对照组证明检测器没恒绿）", async () => {
    const dom = installFakeDom();
    try {
      const bigPng = `data:image/png;base64,${"Q".repeat(4000)}`;
      const out = await compressAiRequestBody({ imageSrc: bigPng, maskSrc: bigPng });
      // 对照组：普通字段确实被压了 —— 说明假 DOM 生效，断言有判别力
      expect(out.imageSrc).toBe(dom.compressed);
      expect(out.imageSrc).not.toBe(bigPng);
      // 被测项：蒙版一个字节都不能动
      expect(out.maskSrc).toBe(bigPng);
    } finally {
      dom.restore();
    }
  });

  it("蒙版字段嵌在深层对象 / 数组里同样豁免", async () => {
    const dom = installFakeDom();
    try {
      const bigPng = `data:image/png;base64,${"Q".repeat(4000)}`;
      const out = await compressAiRequestBody({
        task: { input: { maskSrc: bigPng, imageSrc: bigPng } },
        masks: { maskDataUrl: [bigPng, bigPng] },
      });
      expect(out.task.input.maskSrc).toBe(bigPng);
      expect(out.task.input.imageSrc).toBe(dom.compressed);
      // 数组元素继承父字段名：maskDataUrl: [a, b] 里每一项都是蒙版
      expect(out.masks.maskDataUrl).toEqual([bigPng, bigPng]);
    } finally {
      dom.restore();
    }
  });

  it("蒙版字段里的非 data URL（远程蒙版）照常原样透传", async () => {
    const dom = installFakeDom();
    try {
      const remote = "https://backstage.artxsd.com/uploads/images/u/mask.png";
      const out = await compressAiRequestBody({ maskSrc: remote });
      expect(out.maskSrc).toBe(remote);
    } finally {
      dom.restore();
    }
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

  it("walk 必须把字段名一路带下去，否则递归到字符串时已经分不清蒙版和照片", () => {
    const code = readCode(PAYLOAD_SOURCE);
    // 函数签名必须收 key
    expect(code).toMatch(/const walk\s*=\s*async\s*\(value: unknown,\s*key\?: string\)/);
    // 对象分支要把子字段名传下去
    expect(code).toContain("await walk(item, childKey)");
    // 数组分支要让元素继承父字段名
    expect(code).toContain("walk(item, key)");
    /*
     * ⚠️ 这条是计数断言而不是 toContain：
     *    walk 全站只应有 3 处调用（数组分支 1、对象分支 1、顶层入口 1；
     *    字符串分支不递归）。只写 toContain 的话，有人新增一条**不传 key**
     *    的递归分支也不会变红 —— 那正是这个 bug 的原始形态。
     */
    const walkCalls = code.match(/walk\(/g) ?? [];
    expect(walkCalls.length, "walk 调用点数量变了，请确认新分支也传了 key").toBe(3);
  });

  it("蒙版豁免必须发生在调用压缩之前（顺序反了等于没豁免）", () => {
    const code = readCode(PAYLOAD_SOURCE);
    const guard = code.indexOf("isMaskFieldName(key)");
    const compress = code.indexOf("return await compressImageForAiPayload(value);");
    expect(guard, "walk 里的蒙版豁免判断不见了").toBeGreaterThan(-1);
    expect(compress).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(compress);
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
