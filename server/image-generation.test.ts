import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  it("prefers Jimeng for smart annotation local edits, and reads intent only from the user's own words", async () => {
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");

    /**
     * 即梦（Jimeng 4.0）是智能注释局部编辑的首选模型，OG / GEM 只做失败兜底。
     * 2026-09-13 实测：即梦在「加头部配饰」与「换属性」两类请求上，对用户描述的遵循度、
     * 与人物头部的融合度都最好。这里锁住顺序，防止有人顺手把它挪回兜底位。
     */
    expect(source).toContain('const addObjectVodModels = ["vod-jimeng", "vod-og", "vod-gem"];');
    expect(source).toContain('const editPropertyVodModels = ["vod-jimeng", "vod-gem", "vod-og"];');

    /**
     * 意图识别必须基于 extractUserRequest 剥出的「用户原话」，不能直接扫整段 prompt。
     * 前端在头部配饰场景会往 prompt 里塞「帽子、头盔、皇冠或其他头部配饰」这类样板文字，
     * 直接扫整段会让「给她戴个皇冠」被判成帽子请求，后端于是追加「必须是棒球帽」的款式约束，
     * 与用户请求互相打架。两处判断各锁一条：一处决定参考图 prompt，一处决定蒙版扩展策略，
     * 漏改任何一处都会复发（蒙版被大幅上扩 / prompt 补错款式）。
     */
    expect(source).toContain("const userRequest = extractUserRequest(editPrompt);");
    expect(source).toContain("const userRequest = extractUserRequest(userPrompt);");

    const hatChecks = source.match(/const isHatRequest = [^\n]*/g) || [];
    const glassesChecks = source.match(/const isGlassesRequest = [^\n]*/g) || [];
    expect(hatChecks).toHaveLength(2);
    expect(glassesChecks).toHaveLength(2);

    for (const check of [...hatChecks, ...glassesChecks]) {
      // 判定输入必须是剥离后的用户原话
      expect(check).toContain(".test(userRequest)");
      expect(check).not.toContain(".test(editPrompt)");
      expect(check).not.toContain(".test(userPrompt)");
    }
    for (const check of hatChecks) {
      // 皇冠/头饰属于通用约束，不应触发「帽子」的款式分支与蒙版大幅上扩
      expect(check).not.toContain("头饰");
    }
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

  it("disables VOD server-side prompt enhancement for camera-view and text edits", async () => {
    // VOD 的 EnhancePrompt 会把整段空间约束重写，两种情况都必须显式关闭：
    // - 视角转换：「整个场景一起转」被稀释成泛泛的「保持原图风格」，
    //   结果就是背景不跟着转。
    // - 智能文案编辑：提示词里「必须逐字渲染这段文案」的精确指令被整体改写，
    //   表现就是漏字、错字、自行改写文案（2026-09-13 评估即梦时确认）。
    const source = await readFile(resolve(__dirname, "image-generation.ts"), "utf8");
    expect(source).toContain(
      "enhancePrompt: isCameraViewOperation || isTextEditOperation ? false : undefined"
    );
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

  /*
    2026-09-16：「产品占画面比例」整项下线，__testResolveSmartProductLayout
    不再接受 productScale，占位固化为原 medium 档（0.66 × 0.72）。

    ⚠️ 这里断言的重点从「档位算得对不对」转向「构图锚点是不是真的把产品放在那一侧」——
       因为同一天前端把「左侧留白 / 右侧留白」改成了「产品居左 / 产品居右」，
       必须有一条测试锁住「left = 产品靠左」这个语义，
       否则以后有人望文生义地去翻转 x，功能会反过来且没人发现。
  */
  it("keeps the smart-product anchor on the side the composition names", () => {
    const left = __testResolveSmartProductLayout("left");
    const right = __testResolveSmartProductLayout("right");

    // 产品居左 → 归一化横向锚点必须靠近 0（贴左），且明显小于居右
    expect(left).toMatchObject({ composition: "left", x: 0.12 });
    expect(right).toMatchObject({ composition: "right", x: 0.88 });
    expect(left.x).toBeLessThan(right.x);

    // 占位固化，不再随档位变化
    expect(left).toMatchObject({ width: 0.66, height: 0.72 });
    expect(__testResolveSmartProductLayout("bottom")).toMatchObject({
      composition: "bottom",
      y: 0.84,
      width: 0.66,
    });
    // 未知构图落回居中
    expect(__testResolveSmartProductLayout(undefined)).toMatchObject({
      composition: "center",
      x: 0.5,
    });
  });

  it("always tells the model not to crop the product", () => {
    // 「不得裁切」原先挂在 productScale 分支上，随它一起删掉就会静默失去这条约束。
    const prompt = __testBuildSmartProductPrompt({
      imageSrc: "data:image/png;base64,test",
      prompt: "极简白底",
    });
    expect(prompt).toContain("不得裁切");
  });

  it("parses OCR text regions used by smart copy masks", () => {
    expect(__testParseStructuredImageText(`\`\`\`json
{"text":"中秋快乐","regions":[{"text":"中秋快乐","x":0.1,"y":0.2,"width":0.6,"height":0.15}]}
\`\`\``)).toEqual({
      text: "中秋快乐",
      // 解析器会给 region 补默认 rotate=0 / fontColor=undefined（见
      // __testParseStructuredImageText 的规范化逻辑，确定性绘制依赖这两个字段）。
      regions: [{ text: "中秋快乐", x: 0.1, y: 0.2, width: 0.6, height: 0.15, rotate: 0, fontColor: undefined }],
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

  it("sends VOD smart annotation models straight to the reference path without touching the transfer station", async () => {
    /**
     * 2026-09-13 变更：智能注释可用的模型恒为 vod-*（resolveSmartAnnotationEditModel
     * 只返回 DEFAULT_IMAGE_MODEL_ID 或调用方显式传入的模型），而中转站不认这些模型名，
     * 主链路 /images/edits 必然回 503。实测同一请求连打两次（51071ms + 20985ms），
     * 用户点完要干等 72 秒才看到图，而结论必然是降级到参考图链路。
     * 因此 VOD 模型必须直接走参考图链路，一个中转站请求都不该发出去。
     */
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

    stubVodCredentials();
    const requestedModels: string[] = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string }) => {
      requestedModels.push(input.model);
      return { images: [{ src: `data:image/png;base64,${edited.toString("base64")}` }] };
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      throw new Error(`Unexpected fetch ${String(url)}`);
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
    // 即梦恒为智能注释参考图链路的第一个候选
    expect(requestedModels[0]).toBe("vod-jimeng");
    // 一个中转站请求都没有发出去
    expect(fetchMock).not.toHaveBeenCalled();
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

  /*
   * 回归防线：首选视觉模型**报错**时同样要兜底。
   *
   * 原实现在 !response.ok 处直接 throw，下面的文本模型兜底只在
   * 「上游 200 但解析不出 regions」时才跑到 —— 等于兜底形同虚设。
   *
   * 实测（2026-09-19）：AI_IMAGE_MODEL 留空 → 回落到出图模型
   * vod-og25-sunburst-medium → 发给 /v1/chat/completions 得到
   * 503 model_not_found → 整条 OCR 抛错，智能文案编辑与提示词反推
   * **一个字都拿不到**。
   */
  it("falls back to multimodal text extraction when the primary OCR model is rejected", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "");
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://text.example/v1");
    vi.stubEnv("AI_TEXT_MODEL", "claude-opus-5");

    const source = await sharp({
      create: { width: 160, height: 90, channels: 3, background: "#ffffff" },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.startsWith("https://image.example")) {
        return new Response(
          JSON.stringify({ error: { message: "No available channel for model" } }),
          { status: 503 },
        );
      }
      if (endpoint.startsWith("https://text.example")) {
        return Response.json({
          choices: [{ message: { content: '{"text":"春季新品发布会","regions":[{"text":"春季新品发布会","x":0.1,"y":0.2,"width":0.3,"height":0.1}]}' } }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await extractImageText({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
    });

    expect(result.text).toBe("春季新品发布会");
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.provider).toBe("vision-chat-ocr+text-fallback");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://text.example"))).toBe(true);
  });

  it("surfaces the primary OCR error when both channels fail", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://text.example/v1");
    vi.stubEnv("AI_TEXT_MODEL", "claude-opus-5");

    const source = await sharp({
      create: { width: 160, height: 90, channels: 3, background: "#ffffff" },
    }).png().toBuffer();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.startsWith("https://image.example")) {
        return new Response(
          JSON.stringify({ error: { message: "No available channel for model" } }),
          { status: 503 },
        );
      }
      return new Response(JSON.stringify({ error: { message: "text provider down" } }), { status: 502 });
    });

    await expect(
      extractImageText({ imageSrc: `data:image/png;base64,${source.toString("base64")}` }),
    ).rejects.toThrow(/No available channel for model/);
  });

  /*
   * 回归防线：首选 OCR 模型**从一开始就不该是出图模型**。
   *
   * AI_IMAGE_MODEL 留空时 getProviderConfig() 回落 DEFAULT_IMAGE_MODEL_ID
   * （出图模型），发 /chat/completions 必然 503。上一条测试守的是
   * 「失败了要能兜底」，这一条守的是「别让必败的首次调用发生」——
   * 否则即使兜底成功，用户每次也要先白等首选模型空转的十几到上百秒。
   * 首选应直接落到 AI_TEXT_MODEL（claude-opus-5，实测支持视觉识图）。
   */
  it("uses the text model as primary OCR model when AI_IMAGE_MODEL is unset", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "");
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_TEXT_MODEL", "claude-opus-5");

    const source = await sharp({
      create: { width: 160, height: 90, channels: 3, background: "#ffffff" },
    }).png().toBuffer();

    const requestBodies: Array<{ model?: string }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const endpoint = String(url);
      if (endpoint.startsWith("https://image.example")) {
        requestBodies.push(JSON.parse(String(init?.body || "{}")));
        return Response.json({
          choices: [{ message: { content: '{"text":"春季新品发布会","regions":[{"text":"春季新品发布会","x":0.1,"y":0.2,"width":0.3,"height":0.1}]}' } }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await extractImageText({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
    });

    expect(result.text).toBe("春季新品发布会");
    expect(result.provider).toBe("vision-chat-ocr");
    // 首选（也是唯一一次）调用必须带 claude 文本模型，而不是出图模型。
    expect(requestBodies.length).toBe(1);
    expect(requestBodies[0].model).toBe("claude-opus-5");
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  /**
   * 回归防线：送进模型的必须是**像素**，不能是画布里的 src 原样字符串。
   *
   * 2026-09-19 实测：同一张有文字的图，`data:` URL 能一次直出 16 个区域，
   * 而 `/uploads/...` 相对路径（本地 dev 下 getCanvasRenderableImageSrc 的
   * 返回值）和已过期的上传 URL 都返回**空文本 + 空 regions，且不报错** ——
   * 模型只收到一个它取不到内容的字符串，像素根本没送进去。
   *
   * 这是「智能文案编辑显示未识别到可读文案」的根因：图没送到，却伪装成
   * 「图里没有文字」，前端两种失败长得一模一样，只能靠猜。
   * 这条用例锁住「相对路径要先取回像素再下发」。
   */
  it("resolves /uploads relative paths to real pixels before sending them to the OCR model", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "");
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_TEXT_MODEL", "claude-opus-5");

    const uploadsDir = mkdtempSync(join(tmpdir(), "artx-ocr-uploads-"));
    vi.stubEnv("ARTX_UPLOADS_DIR", uploadsDir);
    const source = await sharp({
      create: { width: 160, height: 90, channels: 3, background: "#ffffff" },
    }).png().toBuffer();
    mkdirSync(join(uploadsDir, "images", "dev-tester"), { recursive: true });
    writeFileSync(join(uploadsDir, "images", "dev-tester", "poster.png"), source);

    const imageUrls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const endpoint = String(url);
      if (endpoint.startsWith("https://image.example")) {
        const body = JSON.parse(String(init?.body || "{}"));
        for (const part of body?.messages?.[0]?.content || []) {
          if (part?.type === "image_url") imageUrls.push(String(part?.image_url?.url || ""));
        }
        return Response.json({
          choices: [{ message: { content: '{"text":"春季新品发布会","regions":[{"text":"春季新品发布会","x":0.1,"y":0.2,"width":0.3,"height":0.1}]}' } }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await extractImageText({
      imageSrc: "/uploads/images/dev-tester/poster.png",
    });

    expect(result.text).toBe("春季新品发布会");
    expect(imageUrls.length).toBe(1);
    // 关键断言：下发的是 data URL（真实像素），不是 "/uploads/..." 这段路径字符串
    expect(imageUrls[0].startsWith("data:image/png;base64,")).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});

/**
 * 即梦背景修复擦除通道（2026-09-13 新增）。
 *
 * 背景：用户反馈「复杂场景（水彩 / 羽翼这类艺术底）擦除很差」。佐糖是专用 inpaint，
 * 在平涂上表现好，但在复杂纹理上会留白板、鬼影和色块；即梦 4.0 的生成式补全更自然，
 * 因此把它接成**复杂纹理场景的第一顺位擦除通道**，代价是复杂场景每次擦字多一次 VOD 调用
 * （用户已确认接受该计费）。
 *
 * 这里锁三条**契约** —— 任一条被改都会静默劣化擦除质量，所以必须显式失败：
 *   1. 通道顺序：textured → 即梦第一；flat/smooth → 不放即梦（那里生成式补全是负收益）；
 *   2. VOD 调用契约：固定 vod-jimeng、蒙版 title="annotation mask"、关闭 prompt 增强；
 *   3. 蒙版外回贴：VOD 是参考图生成，不回贴会把「整图重绘」当成擦除结果。
 */
describe("text_edit 擦除通道：即梦背景修复", () => {
  const readEraseSource = () => readFile(resolve(__dirname, "image-generation.ts"), "utf8");

  const jimengChannelBlock = async () => {
    const source = await readEraseSource();
    const start = source.indexOf("const jimengEraseChannel");
    expect(start, "jimengEraseChannel 通道实现已消失").toBeGreaterThan(-1);
    const end = source.indexOf("const eraseChannels", start);
    expect(end, "无法在 jimengEraseChannel 之后定位 eraseChannels 数组").toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it("复杂纹理场景即梦排第一，平涂场景不放即梦", async () => {
    const source = await readEraseSource();
    expect(source).toContain(
      "? [jimengEraseChannel, engineEraseChannel, picwishEraseChannel, localEraseChannel]",
    );
    // 平涂 / 柔和渐变分支必须保持「引擎 → 本地 → 佐糖」且不放即梦：
    // 那里本地像素擦除等价于精确常量填充，生成式模型只会脑补纹理与接缝，
    // 把即梦放进来等于让平涂场景白白多付一次 VOD 调用。
    expect(source).toContain(": [engineEraseChannel, localEraseChannel, picwishEraseChannel]");
    // 参数化引擎此前是数组里硬编码的首位（不在 textured/flat 分支内），
    // 配了 TEXT_ENGINE_BASE_URL 的环境会让它无条件插到即梦前面，于是
    // 「即梦复杂场景排第一」只在没配引擎的机器上成立（本地没配 → 看着对，测服配了 → 其实不对）。
    // 上面两条正是把整个顺序收进分支后的形态，任一被改回硬编码首位都会失败。
  });

  it("按 VOD mask 契约调用：固定 vod-jimeng、蒙版 title 正确、关闭 prompt 增强", async () => {
    const block = await jimengChannelBlock();
    expect(block).toContain('model: "vod-jimeng"');
    // generateImages 是按参考图的 title 认蒙版的（tryVodGeneration 里
    // find(image => image.title === "annotation mask")）。改名会让 VOD 侧
    // hasMask 恒为 false，模型从「被硬约束在蒙版内」退化成「靠猜」，会改到画面其他位置。
    expect(block).toContain('title: "annotation mask"');
    // 未配 VOD 凭证必须静默让位，不能抛错打断整条擦除链。
    expect(block).toContain("if (!isVodAigcConfigured()) return null;");
    // 擦字是纯指令任务，服务端 prompt 增强会把「不得写字 / 蒙版外必须原样」稀释掉。
    expect(block).toContain("enhancePrompt: false");
  });

  it("即梦结果必须蒙版外回贴，避免整图重绘被当成擦除结果", async () => {
    const block = await jimengChannelBlock();
    // 合成必须用 createOgdEditMaskDataUrl 返回的 compositeMaskBuffer（alpha 语义：
    // 编辑区透明、保留区不透明），而不是 VOD 那份白/黑蒙版 —— 后者 alpha 恒 255，
    // 拿它做合成会 100% 保留原图，等于擦除完全没生效。
    expect(block).toContain("compositeMaskBuffer");
    expect(block).toContain("__testCompositeSourcePreservingImageEdit(");
  });

  it("复杂纹理底上即梦作为擦除通道被调用，且带上精确蒙版", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "gpt-image-2");
    // 只留即梦通道可用：引擎与佐糖都不配置，否则「即梦被跳过」会被其它通道掩盖。
    vi.stubEnv("TEXT_ENGINE_BASE_URL", "");
    vi.stubEnv("PICWISH_API_KEY", "");

    const width = 160;
    const height = 120;
    // 复杂纹理底：确定性 LCG 造噪点。不用 Math.random 是为了让输入可复现
    // （背景复杂度分档依赖像素统计，随机底会让断言时灵时不灵）。
    let seed = 20260913;
    const noise = Buffer.alloc(width * height * 3);
    for (let index = 0; index < noise.length; index += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[index] = (seed >>> 16) & 0xff;
    }
    const source = await sharp(noise, { raw: { width, height, channels: 3 } }).png().toBuffer();
    // 即梦返回纯灰：蒙版内被替换成灰，足以让 hasVisibleLocalEdit 判定「擦除区确实变了」。
    const erased = await sharp({
      create: { width, height, channels: 3, background: "#808080" },
    }).png().toBuffer();

    // 前端蒙版：左半边透明 = 文字擦除区（与 dilateMaskTransparent 的 alpha 语义一致）
    const maskPixels = Buffer.alloc(width * height * 4, 255);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width / 2; x += 1) {
        maskPixels[(y * width + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    stubVodCredentials();
    const vodCalls: Array<{ model: string; maskDataUrl?: string; prompt: string }> = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string; maskDataUrl?: string; prompt: string }) => {
      vodCalls.push(input);
      return { images: [{ src: `data:image/png;base64,${erased.toString("base64")}` }] };
    });
    // 这条链路除 VOD 外不该碰任何 HTTP：中转站图片模型已整体下线。
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      throw new Error(`Unexpected fetch ${String(url)}`);
    });

    await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "把标题替换成 NEW ARRIVAL",
      model: "auto",
      operation: "text_edit",
      preserveSource: true,
      textRegions: [{ text: "SALE", x: 0.04, y: 0.3, width: 0.42, height: 0.18 }],
      editedText: "NEW ARRIVAL",
      targetWidth: width,
      targetHeight: height,
    });

    // textApplyMode 默认 local：擦字成功后走本地确定性绘制，不会再有第二次模型调用。
    expect(vodCalls).toHaveLength(1);
    expect(vodCalls[0].model).toBe("vod-jimeng");
    expect(String(vodCalls[0].maskDataUrl || "")).toMatch(/^data:image\/png;base64,/);
    // 擦除阶段的提示词必须表达「抹掉文字」，不能出现待写入的新文案 ——
    // 后者会让模型把新字画进擦除结果，叠字阶段再画一次 → 双层字。
    expect(vodCalls[0].prompt).toContain("remove the text inside the white areas");
    expect(vodCalls[0].prompt).not.toContain("NEW ARRIVAL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️⚠️⚠️ AI 叠字提示词契约（2026-09-20）。
 *
 * 【事故】用户实测智能文案编辑，出图是「海报上摆一个白底黑字的细体文本框」，
 * 质感极差，看起来完全不像即梦的水平。
 *
 * 【排查结论】即梦被正确调用了，也成功返回了 2496x1664 的图 ——
 * 模型没问题。问题出在提示词：那版指令写的是
 *   "Typography must read as typeset, not painted: thin-to-regular stroke weight,
 *    generous letter-spacing ... do not enlarge the glyphs to fill the available area"
 * 把任务定义成了**排版**。即梦忠实照做，于是给了一个排版框。
 *
 * 📌⭐⭐⭐ 判据：出图「像贴上去的」时，先怀疑提示词把任务描述成了
 *    「排版 / 写字」，而不是怀疑模型能力。模型是照着指令画的 ——
 *    指令说 typeset 它就给 typeset，永远不会自己想到要还原艺术字。
 *
 * 这组测试锁死修复后的语义，防止有人为了压「字太粗」再把
 * typeset / thin stroke 那套绝对约束加回来。
 */
describe("text_edit AI 叠字：提示词必须要求复刻原图字体设计", () => {
  const readTextEditSource = () => readFile(resolve(__dirname, "image-generation.ts"), "utf8");

  /**
   * ⚠️ 反向断言必须剥掉注释再断言。
   *
   * 实现文件里为了讲清事故，注释中原样引用了事故版指令的原文。
   * 直接对全文做 not.toContain 会把**注释里的引用**当成指令回归，
   * 产生永远为红的假阳性 —— 这类断言会被后人直接删掉，反而失去防护。
   */
  const readTextEditInstructionSource = async () => {
    const source = await readTextEditSource();
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  };

  it("不得把任务描述成排版（typeset），也不得要求细字重", async () => {
    const instructions = await readTextEditInstructionSource();
    // 剥注释后仍要能看到修复后的指令，否则说明剥离器把代码也吃掉了，
    // 下面三条反向断言会恒绿（这是「没量到」伪装成「没问题」的典型）。
    expect(instructions).toContain("reproduce the SAME lettering design");
    // 这三句是事故版指令的原文特征，任何一句回归都会让即梦退化成排版框。
    expect(instructions).not.toContain("Typography must read as typeset, not painted");
    expect(instructions).not.toContain("thin-to-regular stroke weight");
    expect(instructions).not.toContain("do not enlarge the glyphs to fill the available area");
  });

  it("必须显式要求复刻原字体的描边/投影/透视等设计特征", async () => {
    const source = await readTextEditSource();
    expect(source).toContain("part of the original poster design");
    expect(source).toContain("reproduce the SAME lettering design");
    // 描边、投影、做旧质感是艺术字的核心特征，漏掉任一条都会退化成普通字。
    expect(source).toContain("drop shadow");
    expect(source).toContain("grunge or distressed texture");
    expect(source).toContain("same perspective and skew");
  });

  it("必须从正反两侧禁止文字底板 / 白色色块 / 文本框", async () => {
    const source = await readTextEditSource();
    // 正向指令侧
    expect(source).toContain("do not draw any solid background panel");
    expect(source).toContain("no container behind them");
    // 负面约束侧（两条出口共用 textEditNegativeInstruction，改一处全覆盖）
    expect(source).toContain("文字底板、白色色块、文本框");
    expect(source).toContain("No solid plate, box, banner or sticker behind the replacement text");
  });

  /**
   * ⚠️ 上面三条都是源码断言，只能证明「代码里写了」。
   *    这一条走真实调用，证明这些约束**确实被下发到了即梦**。
   *    📌 「代码里有」和「下发到了」是两件事：中途任何一次提前 return、
   *       或走到另一条出口，都会让前者成立而后者不成立。
   */
  it("叠字调用的 prompt 里真的带上了这些约束", async () => {
    const width = 160;
    const height = 120;
    let seed = 20260920;
    const noise = Buffer.alloc(width * height * 3);
    for (let index = 0; index < noise.length; index += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[index] = (seed >>> 16) & 0xff;
    }
    const source = await sharp(noise, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const erased = await sharp({
      create: { width, height, channels: 3, background: "#808080" },
    }).png().toBuffer();

    const maskPixels = Buffer.alloc(width * height * 4, 255);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width / 2; x += 1) {
        maskPixels[(y * width + x) * 4 + 3] = 0;
      }
    }
    const mask = await sharp(maskPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();

    stubVodCredentials();
    // editImageWithPrompt 开头会校验 AI_IMAGE_API_KEY（即使最终走 VOD 也要过这道闸）。
    vi.stubEnv("AI_IMAGE_API_KEY", "test-key");
    const vodCalls: Array<{ model: string; prompt: string }> = [];
    vodGenerateSpy.mockImplementation(async (input: { model: string; prompt: string }) => {
      vodCalls.push(input);
      return { images: [{ src: `data:image/png;base64,${erased.toString("base64")}` }] };
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      throw new Error(`Unexpected fetch ${String(url)}`);
    });

    await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      maskSrc: `data:image/png;base64,${mask.toString("base64")}`,
      prompt: "把标题替换成 NEW ARRIVAL",
      model: "vod-jimeng",
      operation: "text_edit",
      // 关键：显式 "ai" 才会走到叠字阶段（默认 local 会被本地绘制截胡）
      textApplyMode: "ai",
      preserveSource: true,
      textRegions: [{ text: "SALE", x: 0.04, y: 0.3, width: 0.42, height: 0.18 }],
      editedText: "NEW ARRIVAL",
      targetWidth: width,
      targetHeight: height,
    });

    // 第 1 次是擦字，第 2 次才是叠字
    expect(vodCalls.length).toBeGreaterThanOrEqual(2);
    const overlayPrompt = vodCalls[vodCalls.length - 1].prompt;
    expect(overlayPrompt).toContain("reproduce the SAME lettering design");
    expect(overlayPrompt).toContain("do not draw any solid background panel");
    expect(overlayPrompt).toContain("No solid plate, box, banner or sticker");
    // 待写入的新文案必须逐字下发
    expect(overlayPrompt).toContain("NEW ARRIVAL");
    // 事故版的排版指令绝不能再出现在真实下发的 prompt 里
    expect(overlayPrompt).not.toContain("must read as typeset");
    expect(overlayPrompt).not.toContain("thin-to-regular stroke weight");
  });
});
