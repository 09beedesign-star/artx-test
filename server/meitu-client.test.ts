import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildMeituMask, buildSignedHeaders, inpaintWithMeitu, mapMeituError } from "./meitu-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * 生成注释式 alpha 蒙版：左半透明（= 可编辑区）、右半不透明（= 保留区），
 * 与前端 createAnnotationEditMask 的语义（透明=编辑区）一致。
 */
async function makeAlphaMask(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const editable = x < width / 2;
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = editable ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeSourceImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 130, b: 140 } },
  })
    .png()
    .toBuffer();
}

function stubMeituEnv() {
  vi.stubEnv("ACCESS_KEY", "test-ak");
  vi.stubEnv("SECRET_KEY", "test-sk");
  vi.stubEnv("MEITU_INPAINT_TIMEOUT_MS", "5000");
}

describe("buildMeituMask（doc/312 mask 语义：白=重绘区、黑=保留区）", () => {
  it("将透明编辑区转为白色、不透明保留区转为黑色，并输出目标尺寸", async () => {
    const alphaMask = await makeAlphaMask(120, 80);
    const converted = await buildMeituMask(alphaMask, 120, 80);

    const { data, info } = await sharp(converted)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(120);
    expect(info.height).toBe(80);

    const whitePixel = data[(40 * 120 + 20) * 3]; // (x=20, y=40) 左半 → 编辑区 → 白
    const blackPixel = data[(40 * 120 + 100) * 3]; // (x=100, y=40) 右半 → 保留区 → 黑
    expect(whitePixel).toBeGreaterThan(250);
    expect(blackPixel).toBeLessThan(10);
  });

  it("hat 模式仅保留编辑区上方 30% 为白色，下方整体转为保留区", async () => {
    const alphaMask = await makeAlphaMask(100, 100);
    const converted = await buildMeituMask(alphaMask, 100, 100, "hat");

    const { data } = await sharp(converted)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // minY=0, maxY=99 → cutoff = 0 + floor(99*0.3) = 29
    expect(data[(10 * 100 + 10) * 3]).toBeGreaterThan(250); // y=10 ≤ 29 → 白
    expect(data[(90 * 100 + 10) * 3]).toBeLessThan(10); // y=90 > 29 → 黑
  });

  it("白色（重绘）区域向外扩展并做边缘羽化（避免补丁感与接缝）", async () => {
    vi.stubEnv("MEITU_MASK_EXPAND_PX", "6");
    vi.stubEnv("MEITU_MASK_FEATHER_PX", "6");
    // 60x40，左半透明（x<30 为编辑区），右半保留
    const alphaMask = await makeAlphaMask(60, 40);
    const converted = await buildMeituMask(alphaMask, 60, 40);

    const { data } = await sharp(converted)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => data[(y * 60 + x) * 3];

    // 原边界 x=30，膨胀 6px 后白区应延伸到 x≈36：
    expect(pixel(33, 20)).toBeGreaterThan(180); // 无膨胀时此处应为 0 → 证明膨胀生效
    // 羽化后边界是渐变而非硬切（x=37 处于过渡带，应介于两者之间）：
    const feathered = pixel(37, 20);
    expect(feathered).toBeGreaterThan(10);
    expect(feathered).toBeLessThan(220);
    // 远离边界处仍是纯黑：
    expect(pixel(50, 20)).toBeLessThan(30);
    // 白区内核保持纯白：
    expect(pixel(10, 20)).toBeGreaterThan(250);
  });
});

describe("inpaintWithMeitu formula 通道（doc/331 契约：/api/v1/sdk/sync/push + task=/v1/InPainting/468520）", () => {
  it("请求体中已转换的白/黑 mask 保持原语义（回归：禁止二次 alpha→白/黑 转换）", async () => {
    stubMeituEnv();
    const source = await makeSourceImage(100, 100);
    const convertedMask = await buildMeituMask(await makeAlphaMask(100, 100), 100, 100);

    let sentBody:
      | {
          params: string;
          init_images: { url: string; profile: { media_profiles: { media_data_type: string }; version: string } }[];
        }
      | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      sentBody = JSON.parse(String(init?.body)) as typeof sentBody;
      return Response.json({
        code: 0,
        message: "",
        data: { status: 10, result: { id: "task-1", urls: ["https://cdn.example/result.png"] }, progress: 1 },
      });
    });

    const result = await inpaintWithMeitu({
      imageBuffer: source,
      maskBuffer: convertedMask,
      width: 100,
      height: 100,
      promptPos: "test prompt",
    });

    expect(result.images).toHaveLength(1);
    expect(sentBody).toBeDefined();

    const sentMask = Buffer.from(sentBody!.init_images[1].url, "base64");
    const { data } = await sharp(sentMask)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // 左半（原编辑区）必须仍是白色 —— 修复前因二次转换变成全黑，导致无重绘区域
    expect(data[(50 * 100 + 20) * 3]).toBeGreaterThan(200);
    expect(data[(50 * 100 + 80) * 3]).toBeLessThan(60);
  });

  it("按 doc/331 契约组装请求体：params 内嵌 parameter、profile 单数、task 固定值、task_type=formula", async () => {
    stubMeituEnv();
    const source = await makeSourceImage(64, 64);
    const mask = await buildMeituMask(await makeAlphaMask(64, 64), 64, 64);

    let sentUrl = "";
    let sentBody: {
      params: string;
      init_images: {
        url: string;
        profile: { media_profiles: { media_data_type: string }; version: string };
      }[];
      task: string;
      task_type: string;
      sync_timeout?: number;
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      sentUrl = String(url);
      sentBody = JSON.parse(String(init?.body)) as typeof sentBody;
      return Response.json({
        code: 0,
        message: "",
        data: { status: 10, result: { id: "task-1", urls: ["https://cdn.example/result.png"] }, progress: 1 },
      });
    });

    await inpaintWithMeitu({
      imageBuffer: source,
      maskBuffer: mask,
      width: 64,
      height: 64,
      promptPos: "把帽子换成红色",
      seed: 42,
    });

    expect(sentUrl).toContain("/api/v1/sdk/sync/push");
    expect(sentBody.task).toBe("/v1/InPainting/468520");
    expect(sentBody.task_type).toBe("formula");
    expect(sentBody.sync_timeout).toBe(30);
    expect(sentBody.init_images).toHaveLength(2);
    for (const item of sentBody.init_images) {
      // doc/331: profile（单数）内嵌 media_profiles.media_data_type="jpg"（base64）+ version="v1"
      expect(item.profile).toEqual({
        media_profiles: { media_data_type: "jpg" },
        version: "v1",
      });
    }
    // params 必须是 {"parameter":{...}} 的 JSON 字符串
    const parsedParams = JSON.parse(sentBody.params) as { parameter: Record<string, unknown> };
    expect(parsedParams.parameter.rsp_media_type).toBe("url");
    expect(parsedParams.parameter.return_format_type).toBe("png");
    // prompt_pos 已自动拼接基础约束前缀 + 用户请求
    expect(parsedParams.parameter.prompt_pos).toContain("把帽子换成红色");
    expect(parsedParams.parameter.prompt_pos).toContain("STRICT local edit");
    expect(parsedParams.parameter.seed).toBe(42);
    // doc/331 未定义的字段不允许出现在 parameter 里
    expect(parsedParams.parameter).not.toHaveProperty("prompt");
    expect(parsedParams.parameter).not.toHaveProperty("steps");
    expect(parsedParams.parameter).not.toHaveProperty("denoise_strength");
  });

  it("V4 签名头随请求携带（X-Sdk-Date/X-Sdk-Content-Sha256/Authorization）", async () => {
    stubMeituEnv();
    const source = await makeSourceImage(32, 32);
    const mask = await buildMeituMask(await makeAlphaMask(32, 32), 32, 32);

    let sentHeaders: Record<string, string> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return Response.json({
        code: 0,
        message: "",
        data: { status: 10, result: { id: "task-1", urls: ["https://cdn.example/result.png"] }, progress: 1 },
      });
    });

    await inpaintWithMeitu({ imageBuffer: source, maskBuffer: mask, width: 32, height: 32 });

    expect(sentHeaders["X-Sdk-Date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(sentHeaders["X-Sdk-Content-Sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(sentHeaders["Authorization"].startsWith("Bearer ")).toBe(true);
    const decodedAuth = Buffer.from(sentHeaders["Authorization"].slice("Bearer ".length), "base64").toString("utf8");
    expect(decodedAuth.startsWith("SDK-HMAC-SHA256 Access=test-ak, ")).toBe(true);
  });

  it("push 返回 task id 且 status=9 时轮询 /api/v1/sdk/status 取结果（doc/222 结构）", async () => {
    stubMeituEnv();
    const source = await makeSourceImage(32, 32);
    const mask = await buildMeituMask(await makeAlphaMask(32, 32), 32, 32);

    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, _init) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/sdk/sync/push")) {
        return Response.json({
          code: 0,
          message: "",
          data: { status: 9, result: { id: "task-abc" }, progress: 0.2 },
        });
      }
      if (u.includes("/sdk/status?task_id=task-abc")) {
        return Response.json({
          code: 0,
          message: "",
          data: { status: 10, result: { id: "task-abc", urls: ["https://cdn.example/final.png"] }, progress: 1 },
        });
      }
      return Response.json({ code: 1, message: "unexpected", data: null });
    });

    const result = await inpaintWithMeitu({ imageBuffer: source, maskBuffer: mask, width: 32, height: 32 });
    expect(result.images).toEqual([{ src: "https://cdn.example/final.png", width: 32, height: 32 }]);
    expect(calls.some((c) => c.includes("/sdk/status?task_id=task-abc"))).toBe(true);
  });

  it("按 doc/331 失败结构 {ErrorCode, ErrorMsg, Data} 映射为友好中文提示", async () => {
    stubMeituEnv();
    const source = await makeSourceImage(16, 16);
    const mask = await buildMeituMask(await makeAlphaMask(16, 16), 16, 16);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ErrorCode: 20003, ErrorMsg: "detect no face", Data: null }, { status: 400 }),
    );

    await expect(
      inpaintWithMeitu({ imageBuffer: source, maskBuffer: mask, width: 16, height: 16 }),
    ).rejects.toThrow(/人脸/);
  });
});

describe("mapMeituError（doc/312 错误码全覆盖）", () => {
  it("覆盖文档列出的全部局部重绘业务错误码，且不落入兜底文案", () => {
    const documentedCodes = [
      20001, 20003, 20004, 20007, 20008, 20009, 20010, 20011, 20012, 20013, 20014, 20015,
      20020, 20021, 20022, 20023, 21001, 21002, 21003, 21004, 21005, 21006, 21007, 21008,
      21009, 21010, 21011, 21012, 21013, 30001,
    ];
    for (const code of documentedCodes) {
      const message = mapMeituError(code);
      expect(message).not.toContain("error_code");
      expect(message).not.toContain("undefined");
      expect(message.length).toBeGreaterThan(4);
    }
  });

  it("关键错误码映射为可读中文", () => {
    expect(mapMeituError(20008)).toContain("照片不符合规范");
    expect(mapMeituError(20013)).toContain("分辨率过大");
    expect(mapMeituError(21002)).toContain("HAIR_MASK_LOSS");
    expect(mapMeituError(21013)).toContain("RECT_OUT_IMAGE");
    expect(mapMeituError(30001)).toContain("生成错误");
    expect(mapMeituError(80001)).toContain("未开通");
  });
});

describe("buildSignedHeaders（官方 sign.js SDK 算法：SDK-HMAC-SHA256 + Bearer base64）", () => {
  it("Authorization 为 Bearer base64(SDK-HMAC-SHA256 Access=AK, SignedHeaders=..., Signature=...) 格式", () => {
    const headers = buildSignedHeaders(
      "POST",
      "https://openapi.meitu.com/api/v1/sdk/sync/push",
      { "Content-Type": "application/json" },
      JSON.stringify({ task: "demo" }),
      "AK_TEST_32CHARS",
      "SK_TEST_64CHARS_sk_test_sk_test_sk_test_sk_test_sk_test_sk_te",
    );

    expect(headers["Host"]).toBe("openapi.meitu.com");
    // X-Sdk-Date 格式 YYYYMMDDTHHMMSSZ（无毫秒）
    expect(headers["X-Sdk-Date"]).toMatch(/^\d{8}T\d{6}Z$/);
    // body sha256 hex（64 字符）
    expect(headers["X-Sdk-Content-Sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["X-Sdk-Content-Sha256"]).toBe(
      crypto.createHash("sha256").update(JSON.stringify({ task: "demo" }), "utf8").digest("hex"),
    );
    // Bearer + base64
    expect(headers["Authorization"].startsWith("Bearer ")).toBe(true);
    const decoded = Buffer.from(headers["Authorization"].slice("Bearer ".length), "base64").toString("utf8");
    expect(decoded.startsWith("SDK-HMAC-SHA256 Access=AK_TEST_32CHARS, ")).toBe(true);
    expect(decoded).toContain("SignedHeaders=content-type;host;x-sdk-date");
    expect(decoded).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("SignedHeaders 覆盖全部请求头（content-type;host;x-sdk-date）且签名确定性：同 body 签名可复算、不同 body 签名不同", () => {
    const body1 = JSON.stringify({ task: "t1", params: "{}" });
    const body2 = JSON.stringify({ task: "t2", params: "{}" });
    const build = (body: string) => buildSignedHeaders(
      "POST",
      "https://openapi.meitu.com/api/v1/sdk/sync/push",
      { "Content-Type": "application/json" },
      body,
      "AK_TEST_32CHARS",
      "SK_TEST_64CHARS_sk_test_sk_test_sk_test_sk_test_sk_test_sk_te",
    );
    const h1a = build(body1);
    const h1b = build(body1);
    const h2 = build(body2);

    const sig1a = Buffer.from(h1a["Authorization"].slice("Bearer ".length), "base64").toString("utf8");
    const sig1b = Buffer.from(h1b["Authorization"].slice("Bearer ".length), "base64").toString("utf8");
    const sig2 = Buffer.from(h2["Authorization"].slice("Bearer ".length), "base64").toString("utf8");
    expect(sig1a).toBe(sig1b);
    expect(sig1a).not.toBe(sig2);
  });

  it("GET /sdk/status 带 query 时 task_id 入 canonicalQuery 参与签名，body 空则 payloadHash 为空串哈希", () => {
    const headers = buildSignedHeaders(
      "GET",
      "https://openapi.meitu.com/api/v1/sdk/status?task_id=TASK_123",
      { "Content-Type": "application/json" },
      "",
      "AK_TEST_32CHARS",
      "SK_TEST_64CHARS_sk_test_sk_test_sk_test_sk_test_sk_test_sk_te",
    );
    // GET 请求体空，bodySha256 = sha256("") = e3b0c442...
    expect(headers["X-Sdk-Content-Sha256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(headers["Authorization"].startsWith("Bearer ")).toBe(true);
    const decoded = Buffer.from(headers["Authorization"].slice("Bearer ".length), "base64").toString("utf8");
    expect(decoded.startsWith("SDK-HMAC-SHA256 Access=AK_TEST_32CHARS, ")).toBe(true);
  });
});
