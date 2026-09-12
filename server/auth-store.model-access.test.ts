import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEXT_MODEL } from "../shared/text-models";
import { IMAGE_MODEL_PRIORITY_IDS } from "../shared/image-models";

let dataDir = "";

async function loadStore() {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./auth-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-model-access-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const key of [
    "ARTX_AUTH_DATA_BACKEND",
    "ARTX_DATA_DIR",
    "ADMIN_SESSION_SECRET",
    "ARTX_BOOTSTRAP_ADMIN_USERNAME",
    "ARTX_BOOTSTRAP_ADMIN_PASSWORD",
  ]) delete process.env[key];
});

describe("auth user model access", () => {
  it("defaults new users to every selectable model and persists an admin allowlist", async () => {
    const store = await loadStore();
    const created = await store.createAuthUserForAdmin({
      actorId: "admin",
      actorName: "admin@example.com",
      username: "limited@example.com",
    });

    expect(created.status).toBe(201);
    if (created.status !== 201) throw new Error("Expected test user to be created");
    // 新用户默认拥有全部「可选模型」= 全部图片模型 + 默认文本模型。
    //
    // 这里直接引用 IMAGE_MODEL_PRIORITY_IDS 而不是手抄一份清单：
    // 之前是逐字拷贝的字面量数组，每次调整模型优先级（如 2026-09-11
    // 把 VOD 模型整体前移、新增 image2.5 六个档位）都得同步改这里，
    // 漏改就会得到一条与业务无关的失败。断言的真正意图是
    // 「默认白名单 = 全部可选模型」，而不是「顺序恰好是这 16 个」。
    expect(created.body.user.allowedAiModels).toEqual([
      ...IMAGE_MODEL_PRIORITY_IDS,
      DEFAULT_TEXT_MODEL,
    ]);

    const updated = await store.updateAuthUserAdmin({
      actorId: "admin",
      actorName: "admin@example.com",
      userId: created.body.user.id,
      allowedAiModels: ["vod-og25-sunburst-medium", "vod-mj", DEFAULT_TEXT_MODEL, "picwish-scale"],
    });

    expect(updated.status).toBe(200);
    // picwish-scale 是固定后端能力，不属于「可选模型」，应被过滤掉。
    expect(updated.body.user.allowedAiModels).toEqual([
      "vod-og25-sunburst-medium",
      "vod-mj",
      DEFAULT_TEXT_MODEL,
    ]);
  });

  it("migrates a retired relay image allowlist instead of emptying it", async () => {
    /**
     * 存量账号保护 —— 这是整个下线动作里最容易出人命的一处。
     *
     * normalizeAllowedModels 在**读盘那一刻**就 `.filter(isSelectableModel)`。
     * 若只把中转站图片模型从注册表删掉而不做迁移，
     * 白名单里只含这些 id 的账号过滤后会变成**空数组** `[]`；
     * 而鉴权里只有 `undefined` 表示「放行全部」，`[]` 等于「一个都不准用」——
     * 该账号彻底失去出图能力，报错还是误导性的「当前账号无权使用该模型」。
     *
     * 所以这里断言的是「迁移」而不是「保留」也不是「丢弃」：
     * 每个旧 id 变成画风/档位对应的那一个 VOD 模型，权限既不丢失也不放大。
     */
    const store = await loadStore();
    const created = await store.createAuthUserForAdmin({
      actorId: "admin",
      actorName: "admin@example.com",
      username: "legacy@example.com",
    });
    if (created.status !== 201) throw new Error("Expected test user to be created");

    const updated = await store.updateAuthUserAdmin({
      actorId: "admin",
      actorName: "admin@example.com",
      userId: created.body.user.id,
      // 全部是已下线的中转站图片模型，一个 VOD id 都没有。
      allowedAiModels: ["og-image2-medium", "mj-v7", "mj-v8.1", "keling", "jimeng-4.0"],
    });

    expect(updated.status).toBe(200);
    const allowed = updated.body.user.allowedAiModels as string[];
    // 最关键的一条：绝不能被清空。
    expect(allowed.length).toBeGreaterThan(0);
    // mj-v7 与 mj-v8.1 都迁移到 vod-mj，去重后只剩一个。
    expect([...allowed].sort()).toEqual([
      "vod-jimeng",
      "vod-kling",
      "vod-mj",
      "vod-og25-sunburst-medium",
    ]);
  });
});
