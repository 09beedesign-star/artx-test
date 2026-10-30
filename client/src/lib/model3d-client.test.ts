import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODEL3D_FORMAT_NOTICE_ZH,
  MODEL3D_ID_PATTERN,
  MODEL3D_MAX_BYTES,
  MODEL3D_SIZE_LIMIT_NOTICE_ZH,
} from "@shared/model3d";

describe("MODEL3D_MAX_BYTES", () => {
  it("is exactly the 60MB product hard limit", () => {
    expect(MODEL3D_MAX_BYTES).toBe(60 * 1024 * 1024);
  });

  it("oversize notice uses the agreed wording", () => {
    expect(MODEL3D_SIZE_LIMIT_NOTICE_ZH).toBe("模型文件体积超过 60MB，请调整模型体积后再导入");
  });

  it("size notice reflects the actual limit", () => {
    expect(MODEL3D_SIZE_LIMIT_NOTICE_ZH).toContain(
      `${Math.round(MODEL3D_MAX_BYTES / 1024 / 1024)}MB`
    );
  });
});

describe("MODEL3D_ID_PATTERN", () => {
  it("only matches fbx / obj / glb / gltf ids", () => {
    const hex = "a".repeat(32);
    for (const ext of ["fbx", "obj", "glb", "gltf"]) {
      expect(MODEL3D_ID_PATTERN.test(`${hex}.${ext}`)).toBe(true);
    }
    expect(MODEL3D_ID_PATTERN.test(`${hex}.stl`)).toBe(false);
    expect(MODEL3D_ID_PATTERN.test(`../${hex}.glb`)).toBe(false);
  });
});
import { uploadModel3DFile, validateModel3DFile } from "./model3d-client";

function makeFile(name: string, size = 16) {
  return new File([new Uint8Array(size)], name, { type: "" });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("validateModel3DFile", () => {
  it("accepts fbx / obj / glb / gltf (case-insensitive)", () => {
    for (const name of ["a.glb", "a.gltf", "A.GLB", "b.GlTf", "c.fbx", "C.FBX", "d.obj", "D.Obj"]) {
      expect(validateModel3DFile(makeFile(name))).toBeNull();
    }
  });

  it("rejects other 3D formats", () => {
    for (const ext of ["stl", "ply", "3mf", "dae", "usdz"]) {
      expect(validateModel3DFile(makeFile(`a.${ext}`))).toBe(MODEL3D_FORMAT_NOTICE_ZH);
    }
  });

  it("rejects unsupported / empty / oversized files", () => {
    expect(validateModel3DFile(makeFile("a.png"))).toBe(MODEL3D_FORMAT_NOTICE_ZH);
    expect(validateModel3DFile(makeFile("a.glb", 0))).toBe("模型文件为空");
    const big = makeFile("a.glb", 1);
    Object.defineProperty(big, "size", { value: MODEL3D_MAX_BYTES + 1 });
    expect(validateModel3DFile(big)).toBe(MODEL3D_SIZE_LIMIT_NOTICE_ZH);
    const edge = makeFile("a.fbx", 1);
    Object.defineProperty(edge, "size", { value: MODEL3D_MAX_BYTES });
    expect(validateModel3DFile(edge)).toBeNull();
  });
});

describe("uploadModel3DFile", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requires login before sending any request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      uploadModel3DFile(makeFile("a.glb"), { apiBaseUrl: "", fetchImpl })
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts raw binary with encoded filename + bearer token, parses ISO dates", async () => {
    store.set("artx-auth-session", JSON.stringify({ token: "t0k" }));
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        modelId: "a".repeat(32) + ".glb",
        name: "椅子.glb",
        size: 16,
        uploadedAt: "2026-10-29T00:00:00.000Z",
        expiresAt: "2026-10-31T00:00:00.000Z",
      })
    );
    const result = await uploadModel3DFile(makeFile("椅子.glb"), {
      apiBaseUrl: "https://api.example.com/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/models3d");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t0k");
    expect(headers["X-Model-Filename"]).toBe(encodeURIComponent("椅子.glb"));
    expect(result.uploadedAt).toBe(Date.parse("2026-10-29T00:00:00.000Z"));
    expect(result.expiresAt - result.uploadedAt).toBe(48 * 3600 * 1000);
  });

  it("surfaces nginx 413 HTML as the size-limit notice instead of a JSON parse error", async () => {
    store.set("artx-auth-session", JSON.stringify({ token: "t0k" }));
    const fetchImpl = vi.fn(
      async () => new Response("<html>413 Request Entity Too Large</html>", { status: 413 })
    );
    await expect(
      uploadModel3DFile(makeFile("a.glb"), {
        apiBaseUrl: "",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ status: 413, message: MODEL3D_SIZE_LIMIT_NOTICE_ZH });
  });
});
