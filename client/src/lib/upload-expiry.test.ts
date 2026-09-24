/**
 * 图片过期提醒前端数据层的行为测试。
 *
 * 这里测的重点不是「函数能不能跑」，而是几条**零报错静默失效**的路径：
 * 画布上的地址和接口下发的地址形态不同时，匹配会全军覆没但没有任何异常，
 * 用户看到的就是「说好的倒计时从来不出现」。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  EMPTY_UPLOAD_EXPIRY,
  buildUploadExpiryIndex,
  fetchUploadExpiry,
  lookupUploadExpiry,
  toUploadExpiryKey,
  type UploadExpiryEntry,
} from "./upload-expiry";

function makeEntry(src: string, daysLeft: number): UploadExpiryEntry {
  return {
    src,
    daysLeft,
    expiresAt: new Date(Date.now() + daysLeft * 86400000).toISOString(),
    isWarning: true,
  };
}

describe("toUploadExpiryKey", () => {
  it("绝对 URL 与相对路径必须归一成同一个键", () => {
    // ⚠️ 这是最要命的一条：生产环境画布里的 localSrc 是带域名的绝对地址，
    //    接口下发的是相对路径。不归一 = 一张图都匹配不上且零报错。
    const relative = toUploadExpiryKey("/uploads/images/alice/a.png");
    const absolute = toUploadExpiryKey(
      "https://backstage.artxsd.com/uploads/images/alice/a.png",
    );
    expect(relative).toBeTruthy();
    expect(absolute).toBe(relative);
  });

  it("带缓存键 artxv 的地址要和不带的归一成同一个键", () => {
    expect(toUploadExpiryKey("/uploads/images/alice/a.png?artxv=abc123")).toBe(
      toUploadExpiryKey("/uploads/images/alice/a.png"),
    );
  });

  it("URL 编码与解码后的中文用户名必须归一成同一个键", () => {
    // 服务端用 encodeURIComponent 拼 src，画布里可能是解码后的原文。
    const encoded = toUploadExpiryKey("/uploads/images/%E5%BC%A0%E4%B8%89/a.png");
    const decoded = toUploadExpiryKey("/uploads/images/张三/a.png");
    expect(encoded).toBe(decoded);
    expect(encoded).toContain("张三");
  });

  it("⭐ data: 与 blob: 地址必须返回空串，且空串不能互相匹配", () => {
    // 📌 如果这里返回原串或某个固定值，所有本地 base64 图会互相匹配上，
    //    集体挂上别人的倒计时角标 —— 比不显示更糟。
    expect(toUploadExpiryKey("data:image/png;base64,AAAA")).toBe("");
    expect(toUploadExpiryKey("blob:https://x/y")).toBe("");

    const index = buildUploadExpiryIndex([
      makeEntry("/uploads/images/alice/a.png", 2),
    ]);
    expect(lookupUploadExpiry(index, "data:image/png;base64,AAAA")).toBeNull();
    expect(lookupUploadExpiry(index, "blob:https://x/y")).toBeNull();
  });

  it("非 uploads 路径返回空串", () => {
    expect(toUploadExpiryKey("/assets/builtin/logo.png")).toBe("");
    expect(toUploadExpiryKey("https://cdn.example.com/x.png")).toBe("");
    expect(toUploadExpiryKey("")).toBe("");
  });

  it("URL 解析失败时也要尽力剥掉 query 而不是放弃", () => {
    // 放弃 = 不提醒，是静默失效。这里构造一个畸形但仍以 /uploads/ 开头的串。
    expect(toUploadExpiryKey("/uploads/images/a/b.png#frag")).toBe(
      "/uploads/images/a/b.png",
    );
  });
});

describe("buildUploadExpiryIndex / lookupUploadExpiry", () => {
  it("接口下发的编码 src 能被画布上的解码地址查到", () => {
    // ⭐ 建索引和查询必须用同一个归一函数，否则「建的时候编码、查的时候解码」
    //    两边各自正确却永远对不上 —— 这正是既存 shanghaiDate 缺陷的同款形态。
    const index = buildUploadExpiryIndex([
      makeEntry("/uploads/images/%E5%BC%A0%E4%B8%89/a.png", 3),
    ]);
    const hit = lookupUploadExpiry(
      index,
      "https://backstage.artxsd.com/uploads/images/张三/a.png?artxv=v9",
    );
    expect(hit?.daysLeft).toBe(3);
  });

  it("未进入提醒窗口的图查不到，返回 null", () => {
    const index = buildUploadExpiryIndex([
      makeEntry("/uploads/images/alice/a.png", 1),
    ]);
    expect(lookupUploadExpiry(index, "/uploads/images/alice/b.png")).toBeNull();
  });

  it("src 无法归一的 entry 不进索引，不会污染查询", () => {
    const index = buildUploadExpiryIndex([
      makeEntry("data:image/png;base64,AAA", 1),
      makeEntry("/uploads/images/alice/a.png", 4),
    ]);
    expect(index.size).toBe(1);
    expect(lookupUploadExpiry(index, "/uploads/images/alice/a.png")?.daysLeft).toBe(4);
  });
});

describe("fetchUploadExpiry", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (key: string) =>
          key === "artx-auth-session" ? JSON.stringify({ token: "t0" }) : null,
      },
    };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it("未登录时不发请求，直接返回空结果", async () => {
    (globalThis as Record<string, unknown>).window = {
      localStorage: { getItem: () => null },
    };
    const fetchImpl = vi.fn();
    const result = await fetchUploadExpiry({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual(EMPTY_UPLOAD_EXPIRY);
  });

  it("带上 Bearer token 请求 /api/uploads/expiry", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        retentionDays: 15,
        warningDays: 5,
        entries: [makeEntry("/uploads/images/alice/a.png", 2)],
      }),
    }));
    const result = await fetchUploadExpiry({
      apiBaseUrl: "https://backstage.artxsd.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://backstage.artxsd.com/api/uploads/expiry");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0");
    expect(result.warningCount).toBe(1);
    expect(result.minDaysLeft).toBe(2);
  });

  it("⭐ 非 2xx 必须在读 body 之前就返回空结果", async () => {
    // 📌 判 status 早于判 body：413/502 的响应体是整页 HTML，
    //    先 .json() 会抛出和真实原因无关的解析错误，把排查引向错误方向。
    const json = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json }));
    const result = await fetchUploadExpiry({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(json).not.toHaveBeenCalled();
    expect(result).toEqual(EMPTY_UPLOAD_EXPIRY);
  });

  it("网络异常吞成空结果，不向上抛", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    await expect(
      fetchUploadExpiry({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual(EMPTY_UPLOAD_EXPIRY);
  });

  it("接口缺字段时回落到兜底天数，而不是 0 或 NaN", async () => {
    // ⚠️ 0 天会让界面显示「今天内清除」，把一张还有半个月的图说成即将删除。
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ entries: [] }),
    }));
    const result = await fetchUploadExpiry({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.retentionDays).toBe(15);
    expect(result.warningDays).toBe(5);
    expect(result.minDaysLeft).toBeNull();
  });
});
