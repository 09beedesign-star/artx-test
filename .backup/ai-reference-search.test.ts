import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchReferenceImages, type ReferenceImageResult } from "./ai";

const API_BASE_URL = "https://api.example.test";
const EMPTY_IMAGES_ERROR = "暂未找到可用参考图，请换个关键词重试，或上传参考图片。";
const fetchMock = vi.fn<typeof fetch>();

function referenceImage(src: string, id = "reference-1"): ReferenceImageResult {
  return {
    id,
    title: "参考图片",
    src,
    width: 800,
    height: 600,
    source: "测试图片源",
  };
}

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

beforeEach(() => {
  vi.stubEnv("VITE_AI_API_BASE_URL", API_BASE_URL);
  vi.stubEnv("VITE_API_BASE_URL", API_BASE_URL);
  vi.stubGlobal("window", {
    location: new URL("https://app.example.test/"),
    localStorage: {
      getItem: vi.fn((key: string) => key === "artx-auth-session"
        ? JSON.stringify({
          token: "mock-reference-token",
          user: { id: "mock-user", username: "reference-tester" },
        })
        : null),
    },
    dispatchEvent: vi.fn(),
  });
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("测试未设置响应，禁止访问真实接口"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchReferenceImages 行为", () => {
  it("将图片代理相对 URL 转为 API 域名下的绝对 URL，并透传认证及搜索参数", async () => {
    const image = {
      ...referenceImage("/api/images/proxy?url=https%3A%2F%2Fimages.example.test%2Fphoto.jpg"),
      originalSrc: "https://images.example.test/photo.jpg",
    };
    respondWith({ images: [image] });

    await expect(searchReferenceImages({ query: "自然风景", limit: 3 })).resolves.toEqual({
      images: [{ ...image, src: `${API_BASE_URL}${image.src}` }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/api/references/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-reference-token",
      },
      body: JSON.stringify({ query: "自然风景", limit: 3 }),
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ["本地同源空 base", "", "http://127.0.0.1:3000/", "/api/images/proxy?url=sky"],
    ["localhost 同源空 base", "", "http://localhost:3000/", "/api/images/proxy?url=sky"],
  ])("%s 时代理图不能因 URL 解析失败而丢失", async (_label, base, href, expected) => {
    vi.stubEnv("VITE_AI_API_BASE_URL", base);
    vi.stubEnv("VITE_API_BASE_URL", base);
    window.location = new URL(href) as unknown as Location;
    const image = referenceImage("/api/images/proxy?url=sky");
    respondWith({ images: [image] });
    await expect(searchReferenceImages({ query: "天空" })).resolves.toEqual({ images: [{ ...image, src: expected }] });
  });

  it("保留 HTTP/HTTPS 绝对图片地址，未指定数量时使用默认 10 张", async () => {
    const images = [
      referenceImage("https://images.example.test/secure.jpg", "https"),
      referenceImage("http://images.example.test/plain.jpg", "http"),
    ];
    respondWith({ images });

    await expect(searchReferenceImages({ query: "建筑" })).resolves.toEqual({ images });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      query: "建筑",
      limit: 10,
    });
  });

  it.each([
    ["空 images 数组", { images: [] }],
    ["缺少 images 字段", {}],
    ["images 为 null", { images: null }],
    ["images 不是数组", { images: "invalid" }],
  ])("%s 必须 reject，不能伪装为成功", async (_label, body) => {
    respondWith(body);

    await expect(searchReferenceImages({ query: "风景" })).rejects.toThrow(EMPTY_IMAGES_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP 200 带 error 时即使同时返回有效图片也必须 reject", async () => {
    respondWith({
      error: "参考图搜索服务暂不可用",
      images: [referenceImage("https://images.example.test/photo.jpg")],
    });

    await expect(searchReferenceImages({ query: "风景" })).rejects.toThrow("参考图搜索服务暂不可用");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["空字符串", ""],
    ["纯空白", "   "],
    ["javascript 协议", "javascript:alert(1)"],
    ["协议相对地址", "//images.example.test/photo.jpg"],
    ["data URL", "data:image/png;base64,AA=="],
    ["blob URL", "blob:https://app.example.test/mock-image"],
    ["FTP 地址", "ftp://images.example.test/photo.jpg"],
    ["普通相对地址", "images/photo.jpg"],
    ["非代理根相对地址", "/uploads/photo.jpg"],
    ["缺少代理查询参数", "/api/images/proxy"],
    ["缺少 src", undefined],
    ["null src", null],
    ["数字 src", 123],
  ])("仅有%s时必须 reject", async (_label, src) => {
    respondWith({ images: [{ ...referenceImage(""), src }] });

    await expect(searchReferenceImages({ query: "风景" })).rejects.toThrow(EMPTY_IMAGES_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("有效与无效图片混合时只保留有效项，并保持顺序与元数据", async () => {
    const absoluteImage = referenceImage("https://images.example.test/photo.jpg", "absolute");
    const proxyImage = referenceImage("/api/images/proxy?url=https%3A%2F%2Fimages.example.test%2Fproxy.jpg", "proxy");
    respondWith({
      images: [
        null,
        referenceImage(""),
        absoluteImage,
        referenceImage("javascript:alert(1)"),
        referenceImage("//images.example.test/photo.jpg"),
        {},
        { src: 123 },
        proxyImage,
        referenceImage("/uploads/photo.jpg"),
      ],
    });

    await expect(searchReferenceImages({ query: "风景" })).resolves.toEqual({
      images: [absoluteImage, { ...proxyImage, src: `${API_BASE_URL}${proxyImage.src}` }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["服务端提供错误信息", { error: "参考图服务内部错误" }, "参考图服务内部错误"],
    ["服务端没有错误信息", {}, "参考图抓取失败"],
  ])("HTTP 500（%s）必须 reject，即使响应含有效图片", async (_label, body, message) => {
    respondWith({
      ...body,
      images: [referenceImage("https://images.example.test/photo.jpg")],
    }, 500);

    await expect(searchReferenceImages({ query: "风景" })).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
