import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelFallbackAttempts } from "../shared/image-models";
import * as tencentVodAigc from "./tencent-vod-aigc";
import { __testAssertSourcePreservingMask, __testBuildSmartProductPrompt, __testCompositeSourcePreservingImageEdit, __testCreatePicWishForegroundRemovalMask, __testHasPicWishExpansionMargins, __testNormalizeGeneratedImageSrc, __testNormalizeGeneratedImagesToTargetAspect, __testNormalizePicWishExpansionRatio, __testParseStructuredImageText, __testPreparePicWishEraseSourceImage, __testPreparePicWishExpansionSourceImage, __testResolveHighDefinitionTargetSize, __testResolveReferenceImageRoute, __testResolveSmartProductLayout, editImageWithPrompt, extractImageText, generateImages } from "./image-generation";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

/**
 * VOD 直连链路的测试替身。
 *
 * 2026-09-12 中转站图片模型整体下线后，注册表里只剩 vod-* 模型，
 * 出图必然走 server/tencent-vod-aigc.ts。原先靠 stub `fetch` 拦截
 * 中转站 HTTP 请求的做法对 VOD 链路无效 —— VOD 走的是腾讯云签名协议，
 * 且在凭证缺失时会被整体短路，根本发不出请求。
 *
 * 因此这里直接对模块边界打桩：
 *   - isVodAigcConfigured  → 让生成流程认为凭证已配置
 *   - generateImageWithVod → 由各用例自行决定成功/失败
 */
let vodGenerateSpy: ReturnType<typeof vi.spyOn>;

function stubVodCredentials() {
  vi.spyOn(tencentVodAigc, "isVodAigcConfigured").mockReturnValue(true);
}

beforeEach(() => {
  vodGenerateSpy = vi.spyOn(tencentVodAigc, "generateImageWithVod");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generated image source normalization", () => {
  it("allows the image provider 90 seconds to return an asynchronous task ID by default", async () => {
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");

    expect(source).toContain("Number(process.env.AI_IMAGE_REQUEST_TIMEOUT_MS) || 90_000");
    expect(source).toContain("120_000");
  });

  it("routes smart annotation edits through a dedicated local-edit path without reference-generation fallback", async () => {
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");

    expect(source).toContain("maxAttempts = 150");
    expect(source).toContain("return editSmartAnnotationImage(input);");
    expect(source).toContain("function resolveSmartAnnotationEditModel");
    expect(source).toContain('requested.toLowerCase() === "auto" || requested === "gpt-image-2"');
    expect(source).toContain("return DEFAULT_IMAGE_MODEL_ID;");
    expect(source).toContain("editAnnotationViaReferenceGeneration");
    expect(source).toContain("shouldFallbackSmartAnnotationEdit");
    expect(source).not.toContain("当前图片模型不支持智能注释局部编辑");
    expect(source).not.toContain("autoAnnotationEditAsyncTaskMaxAttempts");
    expect(source).not.toContain("isAutoAnnotationEdit");
  });

  it("keeps camera-view edits on a generative viewpoint path instead of source-preserving local edit rules", async () => {
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");
    const editSource = source.match(
      /export async function editImageWithPrompt[\s\S]*?export async function eraseImageObjects/
    )?.[0] || "";

    expect(source).toContain("function buildCameraViewEditInstruction");
    expect(source).toContain("Target camera controls: X horizontal orbit");
    // 这两条断言原本锁的是含 "locking the visual content" / "change the background content"
    // 的旧措辞，而那正是导致「背景不跟着转」的矛盾表述来源，已改写。
    // 现在锁新措辞：保物体、不保角度。
    expect(source).toContain("Maximize the requested camera viewpoint change while keeping the same objects present in the scene");
    expect(source).toContain("Do not swap in a different location, do not remove or add props");
    expect(editSource).toContain('const isCameraViewOperation = input.operation === "camera_view";');
    expect(editSource).toContain("cameraViewInstruction");
    expect(editSource).toContain("Re-render that entire scene, subject and environment together");
    expect(editSource).toContain("do not treat it as a masked local edit");
    expect(source).toContain('operation === "text_edit"');
    expect(source).toContain('operation === "annotation_edit"');
    expect(source).not.toContain('operation === "camera_view" && !maskSrc');
  });

  it("rotates the whole scene with the camera instead of only the subject", async () => {
    // 回归防护：早期提示词只说 "fixed scene / fixed background"，
    // 模型据此只旋转主体、保留原视角背景，产生贴图感割裂。
    // 必须显式声明整个场景作为刚性 3D 空间一起转动。
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");
    const instruction = source.match(
      /function buildCameraViewEditInstruction[\s\S]*?\n}/
    )?.[0] || "";

    expect(instruction).toBeTruthy();
    expect(instruction).toContain("THE ENTIRE SCENE ROTATES TOGETHER");
    expect(instruction).toContain("subject AND the background must change viewpoint together");
    expect(instruction).toContain("shared vanishing point");
    expect(instruction).toContain("background must NEVER stay at its original angle");
    // 明确「锁内容而非锁角度」，避免再次被理解成背景像素不动
    expect(instruction).toContain("NOT the angle they are viewed from");

    // 关键回归防护：只加「背景要转」的正向约束是不够的。
    // 上一版就是加了新句子却没删旧的 "fixed scene / fixed background objects"，
    // 提示词内部自相矛盾，模型取省力解 —— 主体转了、背景没转，缺陷照旧复现。
    // 注意：只检查真正会发给模型的字符串字面量，注释里提到这些词是允许的
    //（注释正是用来解释「为什么不能这么写」）。
    const emittedLines = instruction
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(emittedLines).not.toContain("fixed scene");
    expect(emittedLines).not.toContain("fixed background");
    expect(emittedLines).not.toMatch(/locked scene/i);
  });

  it("disables VOD server-side prompt enhancement for camera-view edits", async () => {
    // VOD 的 EnhancePrompt 会把整段空间约束重写，
    // 「整个场景一起转」会在重写中被稀释成泛泛的「保持原图风格」，
    // 结果就是背景不跟着转。必须显式关闭。
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");
    expect(source).toContain("enhancePrompt: isCameraViewOperation ? false : undefined");
  });

  it("keeps alternate image models available for provider gateway retries", () => {
    expect(getImageModelFallbackAttempts("auto").length).toBeGreaterThan(1);
  });

  it("retries a provider gateway failure with the next compatible image model", async () => {
    /**
     * 2026-09-12 中转站图片模型下线后，auto 链上**全是 vod-\* 模型**，
     * 这条用例改为在 VOD 链路上验证同一个语义：
     * 第一个模型网关失败后，必须继续试链上的下一个而不是整体放弃。
     */
    stubVodCredentials();
    const requestedModels: string[] = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string }) => {
      requestedModels.push(input.model);
      if (input.model === DEFAULT_IMAGE_MODEL_ID) {
        throw new Error("openai_error: bad_response_status_code");
      }
      return { images: [{ src: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}` }] };
    });

    const result = await generateImages({
      prompt: "一只小白兔",
      model: "auto",
      ratio: "1:1",
    });

    expect(result.images).toHaveLength(1);
    expect(requestedModels[0]).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(requestedModels.length).toBeGreaterThan(1);
  });

  it("treats provider fetch failures as retryable image gateway failures", async () => {
    stubVodCredentials();
    const requestedModels: string[] = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string }) => {
      requestedModels.push(input.model);
      if (input.model === DEFAULT_IMAGE_MODEL_ID) {
        throw new TypeError("fetch failed");
      }
      return { images: [{ src: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}` }] };
    });

    const result = await generateImages({
      prompt: "一只小白兔",
      model: "auto",
      ratio: "1:1",
    });

    expect(result.images).toHaveLength(1);
    expect(requestedModels[0]).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(requestedModels.some(model => model !== DEFAULT_IMAGE_MODEL_ID)).toBe(true);
  });

  it("继续尝试下一个模型：上游返回「账号已耗尽」属临时容量问题", async () => {
    /**
     * 回归：2026-09-11 用户用 skill 生图报
     *   「图片模型未返回可用图片，系统已按默认优先级重试」
     *
     * 实测中转站对 gemini-3.5-flash-preview（auto 链上的**第 2 个**模型）返回
     *   503 {"error":{"message":"All available accounts exhausted",...}}
     *
     * 而 isProviderCapacityError 当时只认 "no available compatible accounts"，
     * 匹配不到 "All available accounts exhausted"，
     * 于是这个本该重试的错误走进了「图片生成接口暂不可用」的 throw ——
     * **整条 fallback 链在第 2 个模型上就断了**，后面 6 个可用模型一个没试。
     */
    stubVodCredentials();
    const requestedModels: string[] = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string }) => {
      requestedModels.push(input.model);
      // 前两个模型都返回「账号耗尽」，必须继续往后走而不是直接失败。
      if (requestedModels.length <= 2) {
        throw new Error("All available accounts exhausted");
      }
      return { images: [{ src: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}` }] };
    });

    const result = await generateImages({
      prompt: "一只小白兔",
      model: "auto",
      ratio: "1:1",
    });

    expect(result.images).toHaveLength(1);
    // 关键断言：撞上「账号耗尽」后没有中断，而是继续试到了能出图的模型。
    expect(
      requestedModels.length,
      "遇到账号耗尽就停了，fallback 链被提前中断",
    ).toBeGreaterThan(2);
  });

  it("「账号已耗尽」被归类为可重试的容量错误", async () => {
    /**
     * 纯分类断言，不跑真实重试链。
     *
     * 原本写成「全链都失败」的端到端用例，但那会触发每个候选模型的退避重试，
     * 30s 仍超时，代价与收益不成比例。这里直接锁正则本身：
     * 上游这几种「容量/通道不足」措辞都必须可重试，
     * 而「模型不存在」「鉴权失败」这类致命错误绝不能被误判为可重试
     * —— 否则会在一个注定失败的模型上空转整条链。
     */
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");
    const fnStart = source.indexOf("function isProviderCapacityError");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, fnStart + 1400);

    // 本次实测补入的措辞（gemini-3.5-flash-preview 的 503）
    expect(
      fnBody,
      "未覆盖「账号已耗尽」，auto 链会在第 2 个模型上提前中断",
    ).toContain("all available accounts exhausted");
    // 既有措辞不得在本次改动中丢失
    expect(fnBody).toContain("no available channel");
    expect(fnBody).toContain("no available compatible accounts");
  });

  it("does not replace a user-selected image model after a gateway failure", async () => {
    /**
     * 用户显式选中的模型失败后**不得改用别的模型** ——
     * 「我选了 A，你却用 B 出了图」比直接失败更糟。
     *
     * 这里同时覆盖了下线模型的迁移：传入旧 id `jimeng-4.0`，
     * 它会被归一化成 `vod-jimeng`，但仍然只尝试这一个模型。
     */
    stubVodCredentials();
    const requestedModels: string[] = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string }) => {
      requestedModels.push(input.model);
      throw new Error("openai_error: bad_response_status_code");
    });

    await expect(generateImages({
      prompt: "一只小白兔",
      model: "jimeng-4.0",
      ratio: "1:1",
    })).rejects.toThrow("VOD AIGC image generation failed");

    expect(requestedModels).not.toHaveLength(0);
    expect(new Set(requestedModels)).toEqual(new Set(["vod-jimeng"]));
  });

  /**
   * 下面三条验证的是**中转站 HTTP 链路**的请求生命周期（超时中断、日志脱敏、
   * requestId 贯穿）。2026-09-12 中转站图片模型下线后，选择器里的模型
   * 已全部走 VOD，但中转站链路本身仍为**固定后端能力**服务
   * （gpt-image-2 / gemini-3.1-flash-image*，不在选择器里，由内部流程调用）。
   *
   * 因此这些用例改用 gpt-image-2 打桩：它不在 IMAGE_MODEL_PRIORITY_IDS 里，
   * 会走 `[requestedModel]` 单模型分支直达中转站，语义与原先完全一致。
   */
  it("turns a stalled image-provider request into a model failure instead of leaving it pending", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      signals.push(init?.signal as AbortSignal);
      const error = new Error("request aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(generateImages({
      prompt: "一只小白兔",
      model: "gpt-image-2",
      ratio: "1:1",
    })).rejects.toThrow("图片模型未返回可用图片");

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("records request lifecycle metadata without including the prompt when the provider has no response", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const error = new Error("request aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(generateImages({
      prompt: "不应写进日志的用户提示词",
      model: "gpt-image-2",
      ratio: "1:1",
    })).rejects.toThrow("图片模型未返回可用图片");

    const start = info.mock.calls.find(([label, value]) =>
      label === "[image-provider]" && value?.event === "request-start"
    )?.[1];
    const timeout = warn.mock.calls.find(([label, value]) =>
      label === "[image-provider]" && value?.event === "timeout"
    )?.[1];
    expect(start).toMatchObject({ operation: "generate", model: "gpt-image-2", host: "image.example" });
    expect(timeout).toMatchObject({ requestId: start?.requestId, operation: "generate" });
    expect(JSON.stringify([...info.mock.calls, ...warn.mock.calls])).not.toContain("不应写进日志的用户提示词");
  });

  it("keeps the request ID on an upstream HTTP failure", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(
      { error: { message: "openai_error: bad_response_status_code" } },
      { status: 502 },
    ));

    await expect(generateImages({
      prompt: "一只小白兔",
      model: "gpt-image-2",
      ratio: "1:1",
    })).rejects.toThrow("图片模型未返回可用图片");

    const start = info.mock.calls
      .filter(([label, value]) => label === "[image-provider]" && value?.event === "request-start")
      .at(-1)?.[1];
    const failed = warn.mock.calls
      .filter(([label, value]) => label === "[image-provider]" && value?.event === "generation-attempt-failed")
      .at(-1)?.[1];
    expect(failed).toMatchObject({ requestId: start?.requestId, status: 502, kind: "gateway" });
    expect(failed?.error).toContain("图片生成服务暂时没有返回可用结果");
  });
  it("falls back to the default image model for smart product references", () => {
    /**
     * 2026-09-12：参考图兜底模型从已下线的 gemini-3.5-flash-preview
     * 改为 DEFAULT_IMAGE_MODEL_ID。这里用**仍然有效的固定后端模型**
     * gpt-image-2 / gemini-3.1-flash-image 来验证三条路由分支。
     */
    // 非 chat 模型 + 偏好 images 端点 → 走 images 端点，兜底用默认模型。
    expect(__testResolveReferenceImageRoute("gpt-image-2", true, true)).toEqual({
      usesChatPath: false,
      fallbackModel: DEFAULT_IMAGE_MODEL_ID,
    });
    // chat 兼容模型 → 走 chat 端点，不需要换模型。
    expect(__testResolveReferenceImageRoute("gemini-3.1-flash-image", true, true)).toEqual({
      usesChatPath: true,
      fallbackModel: "gemini-3.1-flash-image",
    });
    // 有参考图但不偏好 images 端点 → 走 chat 端点，保持原模型。
    expect(__testResolveReferenceImageRoute("gpt-image-2", true, false)).toEqual({
      usesChatPath: true,
      fallbackModel: "gpt-image-2",
    });
  });

  it("converts provider bare base64 payloads into data URLs", () => {
    expect(__testNormalizeGeneratedImageSrc(ONE_PIXEL_PNG_BASE64, "https://token.bkeel.com/v1"))
      .toBe(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`);
  });

  it("completes the requested image count when a provider returns only one image", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await generateImages({
      prompt: "一只小白兔",
      model: "gpt-image-2",
      ratio: "16:9",
      count: 3,
    });

    expect(result.images).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ n: 3, size: "1536x1024" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ n: 1, size: "1536x1024" });
  });

  it("returns a completed async task image when the provider uses a top-level data array", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const endpoint = String(url);
      if (init?.method === "POST" && endpoint.endsWith("/images/generations")) {
        return Response.json({ task_id: "completed-task-123" });
      }
      if (init?.method === "GET" && endpoint.endsWith("/async-images/completed-task-123")) {
        return Response.json({
          status: "succeeded",
          data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await generateImages({
      prompt: "一只小白兔",
      model: "gpt-image-2",
      ratio: "1:1",
    });

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/async-images/completed-task-123"))).toBe(true);
  });

  it("returns a completed async task image when the provider nests its data array under the task", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const endpoint = String(url);
      if (init?.method === "POST" && endpoint.endsWith("/images/generations")) {
        return Response.json({ task_id: "nested-completed-task-123" });
      }
      if (init?.method === "GET" && endpoint.endsWith("/async-images/nested-completed-task-123")) {
        return Response.json({
          data: {
            status: "completed",
            data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }],
          },
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await generateImages({
      prompt: "一只小白兔",
      model: "gpt-image-2",
      ratio: "1:1",
    });

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/async-images/nested-completed-task-123"))).toBe(true);
  });

  it("keeps relative provider paths as absolute URLs", () => {
    expect(__testNormalizeGeneratedImageSrc("/files/generated.png", "https://token.bkeel.com/v1"))
      .toBe("https://token.bkeel.com/v1/files/generated.png");
  });

  it("normalizes generated bitmap pixels to the requested aspect size", async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();

    const [image] = await __testNormalizeGeneratedImagesToTargetAspect(
      [{ src: `data:image/png;base64,${input.toString("base64")}`, width: 120, height: 120 }],
      864,
      1536,
    );
    const output = Buffer.from(image.src.split(";base64,")[1] || "", "base64");
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(864);
    expect(metadata.height).toBe(1536);
    expect(image.width).toBe(864);
    expect(image.height).toBe(1536);
  });

  it("keeps AI output dimensions at least as large as the source bitmap", () => {
    expect(__testResolveHighDefinitionTargetSize(420, 560, 1080, 1440))
      .toEqual({ width: 1152, height: 1536 });
  });

  it("raises small AI output dimensions to a high-definition long side", () => {
    expect(__testResolveHighDefinitionTargetSize(512, 512, 512, 512))
      .toEqual({ width: 1536, height: 1536 });
  });

  it("keeps explicit smart product requirements ahead of the selected style", () => {
    const prompt = __testBuildSmartProductPrompt({
      imageSrc: "data:image/png;base64,test",
      prompt: "用户明确要求：白天自然光客厅，不要霓虹灯",
      style: "赛博风",
    });

    expect(prompt).toContain("风格只能影响背景");
    expect(prompt.indexOf("白天自然光客厅"))
      .toBeLessThan(prompt.indexOf("补充风格标签：赛博风"));
  });

  it("uses the selected smart-product composition and scale for the prepared product canvas", () => {
    expect(__testResolveSmartProductLayout("left", "small")).toMatchObject({
      composition: "left",
      productScale: "small",
      x: 0.12,
      width: 0.46,
    });
    expect(__testResolveSmartProductLayout("bottom", "large")).toMatchObject({
      composition: "bottom",
      productScale: "large",
      y: 0.84,
      width: 0.82,
    });
  });

  it("parses OCR text regions used by smart copy masks", () => {
    expect(__testParseStructuredImageText(`\`\`\`json
{"text":"中秋快乐","regions":[{"text":"中秋快乐","x":0.1,"y":0.2,"width":0.6,"height":0.15}]}
\`\`\``)).toEqual({
      text: "中秋快乐",
      regions: [{ text: "中秋快乐", x: 0.1, y: 0.2, width: 0.6, height: 0.15 }],
    });
  });

  it("restores every source pixel outside the smart copy edit mask", async () => {
    const source = await sharp({
      create: { width: 2, height: 1, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const edited = await sharp({
      create: { width: 2, height: 1, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    }).png().toBuffer();
    const mask = await sharp(Buffer.from([
      255, 255, 255, 0,
      255, 255, 255, 255,
    ]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();

    const output = await __testCompositeSourcePreservingImageEdit(source, edited, mask, 2, 1);
    const pixels = await sharp(output).ensureAlpha().raw().toBuffer();

    expect(Array.from(pixels.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(pixels.subarray(4, 8))).toEqual([255, 0, 0, 255]);
  });

  it("blocks smart copy edits when OCR has no text regions", () => {
    expect(() => __testAssertSourcePreservingMask("text_edit", undefined))
      .toThrow("重新提取文案");
    expect(() => __testAssertSourcePreservingMask("edit", undefined))
      .not.toThrow();
  });

  it("prepares PicWish eraser source images at the high-definition target size", async () => {
    const input = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: "#111111",
      },
    }).png().toBuffer();

    const output = await __testPreparePicWishEraseSourceImage(input, 1536, 1152);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(1152);
    expect(metadata.format).toBe("png");
  });

  it("builds element background masks from opaque foreground pixels", async () => {
    const foreground = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{
        input: await sharp({
          create: {
            width: 2,
            height: 2,
            channels: 4,
            background: { r: 20, g: 120, b: 80, alpha: 1 },
          },
        }).png().toBuffer(),
        left: 1,
        top: 1,
      }])
      .png()
      .toBuffer();

    const mask = await __testCreatePicWishForegroundRemovalMask(foreground, 4, 4);
    const { data } = await sharp(mask).raw().toBuffer({ resolveWithObject: true });
    const topLeft = 0;
    const center = ((1 * 4) + 1) * 4;

    expect(data[topLeft]).toBe(0);
    expect(data[topLeft + 1]).toBe(0);
    expect(data[topLeft + 2]).toBe(0);
    expect(data[center]).toBe(255);
    expect(data[center + 1]).toBe(255);
    expect(data[center + 2]).toBe(255);
  });

  it("keeps PicWish expansion source images within provider dimension limits", async () => {
    const input = await sharp({
      create: {
        width: 4600,
        height: 2800,
        channels: 3,
        background: "#88aadd",
      },
    }).png().toBuffer();

    const output = await __testPreparePicWishExpansionSourceImage(input, "image/png");
    const metadata = await sharp(output.buffer).metadata();

    expect(Math.max(metadata.width || 0, metadata.height || 0)).toBeLessThanOrEqual(4096);
    expect(output.mimeType).toMatch(/^image\//);
  });

  it("keeps PicWish expansion uploads below the provider file size limit", async () => {
    const width = 2400;
    const height = 2400;
    const raw = Buffer.alloc(width * height * 3);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 37 + 19) % 256;
    }
    const input = await sharp(raw, {
      raw: { width, height, channels: 3 },
    }).png().toBuffer();

    const output = await __testPreparePicWishExpansionSourceImage(input, "image/png");

    expect(output.buffer.length).toBeLessThanOrEqual(4.8 * 1024 * 1024);
  });

  it("uses explicit PicWish expansion margins when any side extends", () => {
    expect(__testHasPicWishExpansionMargins({ top: 24, bottom: 0, left: 0, right: 0 })).toBe(true);
    expect(__testHasPicWishExpansionMargins({ top: 0, bottom: 0, left: 0, right: 0 })).toBe(false);
    expect(__testHasPicWishExpansionMargins({})).toBe(false);
  });

  it("normalizes PicWish image expansion margins as provider ratios", () => {
    expect(__testNormalizePicWishExpansionRatio(0.25)).toBe(0.25);
    expect(__testNormalizePicWishExpansionRatio(3)).toBe(1);
    expect(__testNormalizePicWishExpansionRatio(0)).toBeUndefined();
    expect(__testNormalizePicWishExpansionRatio("bad")).toBeUndefined();
  });

  it("falls back to reference-image generation when the image edit endpoint is unavailable", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const mask = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return new Response(JSON.stringify({ error: { message: "Not Found" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (endpoint.endsWith("/chat/completions")) {
        return Response.json({
          choices: [{
            message: {
              images: [{ url: `data:image/png;base64,${edited.toString("base64")}` }],
            },
          }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      prompt: "Add a green marker",
      targetWidth: 96,
      targetHeight: 64,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].width).toBe(1536);
    expect(result.images[0].height).toBe(1024);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(true);
  });

  it("preserves the source outside an annotation mask through the dedicated edit endpoint", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ff0000",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const maskPixels = Buffer.alloc(96 * 64 * 4, 255);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        maskPixels[(y * 96 + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, {
      raw: { width: 96, height: 64, channels: 4 },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return Response.json({
          data: [{ b64_json: edited.toString("base64") }],
        });
      }
      if (endpoint.endsWith("/chat/completions")) {
        throw new Error("Smart annotation must not fall back to reference generation");
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "给人物戴上一副眼镜",
      operation: "annotation_edit",
      preserveSource: true,
      targetWidth: 96,
      targetHeight: 64,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({ width: 96, height: 64 });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(false);
    const resultBuffer = Buffer.from(result.images[0].src.split(",")[1], "base64");
    const resultPixels = await sharp(resultBuffer).ensureAlpha().raw().toBuffer();
    expect(Array.from(resultPixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(resultPixels.subarray((95 * 4), (96 * 4)))).toEqual([255, 0, 0, 255]);
  });

  it("falls back for smart annotation edit provider gateway failures", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ff0000",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const maskPixels = Buffer.alloc(96 * 64 * 4, 255);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        maskPixels[(y * 96 + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, {
      raw: { width: 96, height: 64, channels: 4 },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return new Response(JSON.stringify({ error: { message: "openai_error / bad_response_status_code" } }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (endpoint.endsWith("/chat/completions")) {
        return Response.json({
          data: [{ b64_json: edited.toString("base64") }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "给人物戴上一副眼镜",
      operation: "annotation_edit",
      preserveSource: true,
      targetWidth: 96,
      targetHeight: 64,
      model: "auto",
    });

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/generations"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(true);
    const resultBuffer = Buffer.from(result.images[0].src.split(",")[1], "base64");
    const resultPixels = await sharp(resultBuffer).ensureAlpha().raw().toBuffer();
    expect(Array.from(resultPixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(resultPixels.subarray((95 * 4), (96 * 4)))).toEqual([255, 0, 0, 255]);
  });

  it("continues smart annotation reference fallback after a chat fetch failure", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ff0000",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const maskPixels = Buffer.alloc(96 * 64 * 4, 255);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        maskPixels[(y * 96 + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, {
      raw: { width: 96, height: 64, channels: 4 },
    }).png().toBuffer();

    const requestedModels: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return new Response(JSON.stringify({ error: { message: "openai_error / bad_response_status_code" } }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = JSON.parse(String(init?.body || "{}"));
      requestedModels.push(body.model);
      if (endpoint.endsWith("/chat/completions")) {
        throw new TypeError("fetch failed");
      }
      if (endpoint.endsWith("/images/generations")) {
        return Response.json({
          data: [{ b64_json: edited.toString("base64") }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "给人物戴上一副眼镜",
      operation: "annotation_edit",
      preserveSource: true,
      targetWidth: 96,
      targetHeight: 64,
      model: "auto",
    });

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/generations"))).toBe(true);
    expect(requestedModels).toContain("gemini-3.5-flash-preview");
    expect(requestedModels).toContain("og-image2-medium");
    const resultBuffer = Buffer.from(result.images[0].src.split(",")[1], "base64");
    const resultPixels = await sharp(resultBuffer).ensureAlpha().raw().toBuffer();
    expect(Array.from(resultPixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(resultPixels.subarray((95 * 4), (96 * 4)))).toEqual([255, 0, 0, 255]);
  });

  it("falls back when smart annotation native editing returns an unchanged image", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ff0000",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const maskPixels = Buffer.alloc(96 * 64 * 4, 255);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        maskPixels[(y * 96 + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, {
      raw: { width: 96, height: 64, channels: 4 },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return Response.json({
          data: [{ b64_json: source.toString("base64") }],
        });
      }
      if (endpoint.endsWith("/chat/completions")) {
        return Response.json({
          data: [{ b64_json: edited.toString("base64") }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "给人物戴上一副眼镜",
      operation: "annotation_edit",
      preserveSource: true,
      targetWidth: 96,
      targetHeight: 64,
      model: "auto",
    });

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/generations"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(true);
    const resultBuffer = Buffer.from(result.images[0].src.split(",")[1], "base64");
    const resultPixels = await sharp(resultBuffer).ensureAlpha().raw().toBuffer();
    expect(Array.from(resultPixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(resultPixels.subarray((95 * 4), (96 * 4)))).toEqual([255, 0, 0, 255]);
  });

  it("falls back when smart annotation native editing returns a model compatibility error", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ff0000",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const maskPixels = Buffer.alloc(96 * 64 * 4, 255);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        maskPixels[(y * 96 + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, {
      raw: { width: 96, height: 64, channels: 4 },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return new Response(JSON.stringify({ error: { message: "model gpt-image-2 not found" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (endpoint.endsWith("/chat/completions")) {
        return Response.json({
          data: [{ b64_json: edited.toString("base64") }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "给人物戴上一副眼镜",
      operation: "annotation_edit",
      preserveSource: true,
      targetWidth: 96,
      targetHeight: 64,
      model: "auto",
    });

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/generations"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(true);
    const resultBuffer = Buffer.from(result.images[0].src.split(",")[1], "base64");
    const resultPixels = await sharp(resultBuffer).ensureAlpha().raw().toBuffer();
    expect(Array.from(resultPixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(resultPixels.subarray((95 * 4), (96 * 4)))).toEqual([255, 0, 0, 255]);
  });

  it("uses gpt-image-2 native editing for automatic smart copy edits", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ff0000",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const mask = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    }).png().toBuffer();
    const attemptedModels: string[] = [];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        const form = init?.body as FormData;
        const providerModel = String(form.get("model"));
        attemptedModels.push(providerModel);
        if (providerModel === "gpt-image-2") {
          return Response.json({ data: [{ b64_json: edited.toString("base64") }] });
        }
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "把海报标题替换为新的活动文案",
      model: "auto",
      operation: "text_edit",
      preserveSource: true,
      targetWidth: 96,
      targetHeight: 64,
    });

    expect(result.images).toHaveLength(1);
    expect(attemptedModels).toContain("gpt-image-2");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
  });

  it("智能文案编辑默认走本地确定性绘制，只有显式 textApplyMode:\"ai\" 才交给图片模型", async () => {
    /**
     * 回归防护（2026-09-12）。
     *
     * 背景：本地绘制原本是硬编码的唯一路径（擦字成功就 return），
     * image2.5 几乎永远不会被调用。为了能评估 AI 叠字效果，
     * 加了 textApplyMode 开关。
     *
     * A/B 实测结论（894x817 横幅，"CUSTOM" → "秋季旗舰品鉴会"，各 2 轮）：
     *   local：逐字命中 7/7 = 100%（两轮一致），0.3~0.4s，零成本
     *   ai   ：逐字命中 3/7、4/7，第一轮还出现错字（"秋季"→"秋香"），29~42s
     * 生成式模型按扩散过程画字形，不保证字符级正确，中文长句尤其明显。
     *
     * 文案编辑的第一诉求是「字要对」，因此**默认必须是 local**。
     * 这条用例锁住这个语义，避免后续有人误把默认切成 AI。
     */
    const editSource = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");

    // 阶段 B 的入口必须是「不等于 ai 就走本地」，即默认 local
    expect(editSource).toContain('input.textApplyMode !== "ai"');

    // 且该判断必须出现在「确定性文字绘制」这一段里，而不是别处
    const stageB = editSource.match(
      /\/\/ ── 阶段 B：确定性文字绘制[\s\S]*?drawTextReplacement/
    )?.[0] || "";
    expect(stageB).toContain('input.textApplyMode !== "ai"');

    // 反向防护：默认值不得被改成 "ai"
    expect(stageB).not.toContain('input.textApplyMode === "local"');
  });

  it("擦字成功后把目标文案显式写进提示词，避免模型去找已不存在的原文字", async () => {
    /**
     * 擦字成功后源图里已经没有原文字了，但 textEditInstruction 基线
     * 仍写着「移除原有可读文字」。模型读到一个无法执行的指令时，
     * 可能会在画面里"找文字"并误伤其他元素。
     * 因此擦字成功分支必须把 editedText 原文喂给模型，
     * 把任务从「改写」收敛为「写入」。
     */
    const editSource = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");
    expect(editSource).toContain("The exact replacement text to render is:");
    expect(editSource).toContain("do not translate, paraphrase, reorder, or add any extra words");
  });

  it("retries automatic smart copy edits when the first model returns the unchanged source", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();
    const mask = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    }).png().toBuffer();
    const attemptedModels: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/images/edits")) {
        const form = init?.body as FormData;
        const providerModel = String(form.get("model"));
        attemptedModels.push(providerModel);
        if (providerModel !== "gpt-image-2") throw new Error(`Unexpected native edit model ${providerModel}`);
        return Response.json({ data: [{ b64_json: source.toString("base64") }] });
      }
      const body = JSON.parse(String(init?.body || "{}"));
      const providerModel = String(body.model);
      attemptedModels.push(providerModel);
      if (String(url).endsWith("/images/generations") && providerModel === "gpt-image-2") {
        return Response.json({
          data: [{ b64_json: source.toString("base64") }],
        });
      }
      if (String(url).endsWith("/images/generations") && providerModel === "og-image2-medium") {
        return Response.json({ data: [{ b64_json: edited.toString("base64") }] });
      }
      throw new Error(`Unexpected guided edit request ${String(url)} / ${providerModel}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "把原图中的 SALE 替换成 NEW ARRIVAL",
      model: "auto",
      operation: "text_edit",
      targetWidth: 96,
      targetHeight: 64,
    });

    expect(result.images).toHaveLength(1);
    expect(attemptedModels).toContain("gpt-image-2");
    expect(attemptedModels).toContain("og-image2-medium");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    const resultBuffer = Buffer.from(result.images[0].src.split(",")[1], "base64");
    const resultPixels = await sharp(resultBuffer).ensureAlpha().raw().toBuffer();
    expect(Array.from(resultPixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
  });

  it("falls back to multimodal text extraction when image OCR returns empty text", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://text.example/v1");
    vi.stubEnv("AI_TEXT_MODEL", "gpt-5.4-mini");

    const source = await sharp({
      create: {
        width: 160,
        height: 90,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.startsWith("https://image.example")) {
        return Response.json({ choices: [{ message: { content: "" } }] });
      }
      if (endpoint.startsWith("https://text.example")) {
        return Response.json({ choices: [{ message: { content: "SALE 2026\nARTX TEST" } }] });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await extractImageText({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
    });

    expect(result.text).toBe("SALE 2026\nARTX TEST");
    expect(result.provider).toBe("vision-chat-ocr+text-fallback");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://image.example"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://text.example"))).toBe(true);
  });
});
