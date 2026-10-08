import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FREE_PLAN_LOCKED_IMAGE_MODEL_ID,
  HIGH_COST_IMAGE_CREDITS_THRESHOLD,
  isHighCostImageModel,
  isImageModelAllowedForFreePlan,
} from "../shared/ai-credit-policy";
import { DEFAULT_IMAGE_MODEL_ID, IMAGE_MODEL_PRIORITY_IDS } from "../shared/image-models";

/**
 * 2026-10 需求：「模型选择器标出高消耗」+「免费用户锁定 70 积分默认档」。
 *
 * ⚠️ 两条反向约束同样重要：
 *   - 免费用户的抠图/扩图/去水印（固定后端模型）、auto、image_edit 不能被误伤；
 *   - 付费用户与测试账号不能被锁。
 * 只测「被拦」不测「被放过」= 可能把整个免费档锁死而测试全绿。
 */

let dataDir = "";

async function loadAdminStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./admin-store");
}

async function seedUser(overrides: Record<string, unknown> = {}) {
  const user = {
    id: "user-1",
    name: "tester",
    email: "tester@example.com",
    account: "tester@example.com",
    registeredAt: "2026-01-01 00:00:00",
    loginMethod: "email",
    role: "viewer",
    status: "normal",
    plan: "Free",
    organization: "个人",
    credits: 5000,
    frozenCredits: 0,
    expiredCredits: 0,
    totalRecharge: 0,
    totalConsumed: 0,
    lastSeen: "刚刚",
    risk: "低",
    ...overrides,
  };
  await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({ users: [user] }, null, 2)}\n`);
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-free-lock-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const key of [
    "ARTX_ADMIN_DATA_BACKEND", "ARTX_AUTH_DATA_BACKEND", "ARTX_DATA_DIR",
    "ADMIN_SESSION_SECRET", "ARTX_BOOTSTRAP_ADMIN_USERNAME", "ARTX_BOOTSTRAP_ADMIN_PASSWORD",
  ]) delete process.env[key];
});

describe("高消耗标记口径", () => {
  it("阈值 = 默认档单价 70，且默认档本身不标", () => {
    expect(HIGH_COST_IMAGE_CREDITS_THRESHOLD).toBe(70);
    expect(isHighCostImageModel(DEFAULT_IMAGE_MODEL_ID)).toBe(false);
    expect(isHighCostImageModel("vod-og25-flare-medium")).toBe(false);
    expect(isHighCostImageModel("vod-og25-sunburst-low")).toBe(false);
    expect(isHighCostImageModel("auto")).toBe(false);
    expect(isHighCostImageModel("")).toBe(false);
  });

  it("高于 70 的选择器模型全部标「高消耗」", () => {
    for (const id of ["vod-og25-sunburst-high", "vod-gem", "vod-gem-lite", "vod-jimeng", "vod-og", "vod-mj", "vod-kling", "vod-si", "vod-qwen"]) {
      expect(isHighCostImageModel(id), id).toBe(true);
    }
  });
});

describe("免费版模型白名单（纯函数）", () => {
  it("选择器里只有默认档可用", () => {
    expect(FREE_PLAN_LOCKED_IMAGE_MODEL_ID).toBe(DEFAULT_IMAGE_MODEL_ID);
    const allowed = IMAGE_MODEL_PRIORITY_IDS.filter((id) => isImageModelAllowedForFreePlan(id));
    expect(allowed).toEqual([DEFAULT_IMAGE_MODEL_ID]);
  });

  it("auto / 空 / 固定后端能力模型放行（不误伤抠图扩图）", () => {
    for (const id of ["auto", "", undefined, "picwish-segmentation", "vod-kling-image-expand", "claude-opus-5"]) {
      expect(isImageModelAllowedForFreePlan(id as string | undefined), String(id)).toBe(true);
    }
  });

  it("已下线旧 id 按迁移后的模型判定（og-image2-medium → 默认档放行）", () => {
    expect(isImageModelAllowedForFreePlan("og-image2-medium")).toBe(true);
  });
});

describe("服务端锁：assertCanUseAiImageModel", () => {
  it("⭐ Free 用户文生图选 banana（300）→ 被拦，且文案能映射 403", async () => {
    await seedUser({ plan: "Free" });
    const { assertCanUseAiImageModel, FREE_PLAN_MODEL_LOCK_MESSAGE } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "vod-gem", outputCount: 1, capabilityKey: "text_to_image",
    })).rejects.toThrow(FREE_PLAN_MODEL_LOCK_MESSAGE);
    expect(FREE_PLAN_MODEL_LOCK_MESSAGE.startsWith("免费版仅可使用默认模型")).toBe(true);
  });

  it("Free 用户选 low（40，更便宜）也拦 —— 需求是「锁定默认档」不是「拦贵的」", async () => {
    await seedUser({ plan: "Free" });
    const { assertCanUseAiImageModel } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "vod-og25-sunburst-low", capabilityKey: "text_to_image",
    })).rejects.toThrow(/免费版仅可使用默认模型/);
  });

  it("Free 用户 high 模型命中的是免费锁文案，而非旧的「仅限 Pro」", async () => {
    await seedUser({ plan: "Free" });
    const { assertCanUseAiImageModel } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "vod-og25-sunburst-high", capabilityKey: "text_to_image",
    })).rejects.toThrow(/免费版仅可使用默认模型/);
  });

  it("Free 用户默认档 / auto 放行", async () => {
    await seedUser({ plan: "Free" });
    const { assertCanUseAiImageModel } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: DEFAULT_IMAGE_MODEL_ID, capabilityKey: "text_to_image",
    })).resolves.toBeUndefined();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "auto", capabilityKey: "text_to_image",
    })).resolves.toBeUndefined();
  });

  it("Free 用户 image_edit（固定 180/次，换模型不改价）不被锁", async () => {
    await seedUser({ plan: "Free" });
    const { assertCanUseAiImageModel } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "vod-jimeng", capabilityKey: "image_edit",
    })).resolves.toBeUndefined();
  });

  it("Pro 用户选 banana 不被锁", async () => {
    await seedUser({ plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { assertCanUseAiImageModel } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "vod-gem", capabilityKey: "text_to_image",
    })).resolves.toBeUndefined();
  });

  it("测试账号（Free 档）不被锁", async () => {
    await seedUser({
      plan: "Free",
      accountType: "test",
      testProfile: { dailyCreditLimit: 1000, expiresAt: "2030-01-01T00:00:00.000Z" },
    });
    const { assertCanUseAiImageModel } = await loadAdminStore();
    await expect(assertCanUseAiImageModel({
      userId: "user-1", model: "vod-gem", capabilityKey: "text_to_image",
    })).resolves.toBeUndefined();
  });
});

describe("权益接口：前端置灰与后端拦截同口径", () => {
  it("Free 用户：选择器模型里只有默认档不是 unavailable", async () => {
    await seedUser({ plan: "Free" });
    const { getAiModelEntitlementsForUser } = await loadAdminStore();
    const result = await getAiModelEntitlementsForUser("user-1");
    const selectable = result.imageModels.filter((item) =>
      (IMAGE_MODEL_PRIORITY_IDS as readonly string[]).includes(item.model));
    const usable = selectable.filter((item) => item.status !== "unavailable").map((item) => item.model);
    expect(usable).toEqual([DEFAULT_IMAGE_MODEL_ID]);
    expect(selectable.find((item) => item.model === "vod-gem")?.message).toContain("免费版");
  });

  it("Pro 用户：标准模型全部可用", async () => {
    await seedUser({ plan: "Pro", planExpiresAt: "2030-01-01 00:00:00" });
    const { getAiModelEntitlementsForUser } = await loadAdminStore();
    const result = await getAiModelEntitlementsForUser("user-1");
    expect(result.imageModels.find((item) => item.model === "vod-gem")?.status).toBe("standard");
  });
});
