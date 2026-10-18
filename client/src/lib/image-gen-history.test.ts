import { describe, it, expect, beforeEach, vi } from "vitest";
import type { EcommerceHistoryEntry } from "../components/ecommerce/EcommerceHistory";
import {
  HISTORY_LIMIT,
  SMART_COMMERCE_RESULT_STYLE,
  smartCommerceEntryFromTask,
  addEcommerceHistoryEntry,
  clearEcommerceHistory,
  deleteEcommerceHistoryEntry,
  getHistoryEntryDaysLeft,
  isHistoryEntryExpired,
  pruneExpiredHistory,
  readEcommerceHistory,
  writeEcommerceHistory,
} from "./image-gen-history";

const DAY = 24 * 60 * 60 * 1000;
const storage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(storage).forEach(k => delete storage[k]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete storage[key]; }),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  };
});

function entry(id: string, createdAt = 1, mode: "product" | "post" = "product"): EcommerceHistoryEntry {
  return {
    id, mode, model: "m", count: 1, credits: 0,
    templateName: "", backgroundName: "", prompt: "",
    images: [`/uploads/images/u/${id}.png`], createdAt,
  };
}

describe("image-gen-history 存储", () => {
  it("无数据返回空数组", () => {
    expect(readEcommerceHistory("u")).toEqual([]);
  });

  it("写入后可读回", () => {
    writeEcommerceHistory("u", [entry("a")]);
    expect(readEcommerceHistory("u")).toEqual([entry("a")]);
  });

  it("账号隔离", () => {
    writeEcommerceHistory("alice", [entry("a")]);
    writeEcommerceHistory("bob", [entry("b")]);
    expect(readEcommerceHistory("alice").map(e => e.id)).toEqual(["a"]);
    expect(readEcommerceHistory("bob").map(e => e.id)).toEqual(["b"]);
  });

  it("作用域隔离：电商画布与智能产品互不串", () => {
    addEcommerceHistoryEntry("u", entry("canvas"), "ecommerce-canvas");
    addEcommerceHistoryEntry("u", entry("smart"), "smart-commerce");
    expect(readEcommerceHistory("u", "ecommerce-canvas").map(e => e.id)).toEqual(["canvas"]);
    expect(readEcommerceHistory("u", "smart-commerce").map(e => e.id)).toEqual(["smart"]);
  });

  it("未登录落 guest 键", () => {
    writeEcommerceHistory(null, [entry("g")]);
    expect(storage["artx:ecommerce-canvas-history:guest"]).toBeDefined();
  });

  it("追加：最新在前、超上限丢最旧、返回值等于存储值", () => {
    writeEcommerceHistory("u", Array.from({ length: HISTORY_LIMIT }, (_, i) => entry(`old-${i}`, i)));
    const returned = addEcommerceHistoryEntry("u", entry("new", 999));
    const stored = readEcommerceHistory("u");
    expect(returned).toEqual(stored);
    expect(stored).toHaveLength(HISTORY_LIMIT);
    expect(stored[0].id).toBe("new");
    expect(stored[HISTORY_LIMIT - 1].id).toBe(`old-${HISTORY_LIMIT - 2}`);
  });

  it("删除单条", () => {
    writeEcommerceHistory("u", [entry("a"), entry("b"), entry("c")]);
    expect(deleteEcommerceHistoryEntry("u", "b").map(e => e.id)).toEqual(["a", "c"]);
    expect(readEcommerceHistory("u").map(e => e.id)).toEqual(["a", "c"]);
  });

  it("清空", () => {
    writeEcommerceHistory("u", [entry("x")]);
    clearEcommerceHistory("u");
    expect(readEcommerceHistory("u")).toEqual([]);
  });

  it("坏 JSON / 坏条目不崩", () => {
    storage["artx:ecommerce-canvas-history:u"] = "{ bad";
    expect(readEcommerceHistory("u")).toEqual([]);
    storage["artx:ecommerce-canvas-history:u"] = JSON.stringify([{ id: 1 }, entry("ok")]);
    expect(readEcommerceHistory("u").map(e => e.id)).toEqual(["ok"]);
  });
});

describe("智能产品完成事件 → 历史条目", () => {
  const base = {
    style: SMART_COMMERCE_RESULT_STYLE,
    status: "completed",
    generationId: "g1",
    model: "gem",
    prompt: "p",
    images: [{ src: "/uploads/images/u/1.png" }, { src: "" }, null, { src: "/uploads/images/u/2.png" }],
  };

  it("completed + 智能产品 style + 有图 → 生成条目，空图被丢掉", () => {
    const e = smartCommerceEntryFromTask(base, 123)!;
    expect(e.id).toBe("g1");
    expect(e.images).toEqual(["/uploads/images/u/1.png", "/uploads/images/u/2.png"]);
    expect(e.count).toBe(2);
    expect(e.createdAt).toBe(123);
  });

  it("pending / failed / 其他功能的 style / 无图 → 不记", () => {
    expect(smartCommerceEntryFromTask({ ...base, status: "pending" })).toBeNull();
    expect(smartCommerceEntryFromTask({ ...base, status: "failed" })).toBeNull();
    expect(smartCommerceEntryFromTask({ ...base, style: "智能判断" })).toBeNull();
    expect(smartCommerceEntryFromTask({ ...base, images: [] })).toBeNull();
    expect(smartCommerceEntryFromTask(null)).toBeNull();
  });

  it("同一 generationId 重复完成（后台轮询恢复）只记一条", () => {
    const e = smartCommerceEntryFromTask(base)!;
    addEcommerceHistoryEntry("u", e, "smart-commerce");
    addEcommerceHistoryEntry("u", { ...e, createdAt: e.createdAt + 1 }, "smart-commerce");
    expect(readEcommerceHistory("u", "smart-commerce")).toHaveLength(1);
  });
});

describe("image-gen-history 过期口径（与服务端保留天数同源）", () => {
  const now = 100 * DAY;

  it("保留期内不算过期，到期即过期", () => {
    expect(isHistoryEntryExpired({ createdAt: now - 14 * DAY }, 15, now)).toBe(false);
    expect(isHistoryEntryExpired({ createdAt: now - 15 * DAY }, 15, now)).toBe(true);
  });

  it("天数跟着服务端下发值走，不写死 15", () => {
    const e = { createdAt: now - 10 * DAY };
    expect(isHistoryEntryExpired(e, 15, now)).toBe(false);
    expect(isHistoryEntryExpired(e, 7, now)).toBe(true);
  });

  it("剩余天数向上取整，过期为 0", () => {
    expect(getHistoryEntryDaysLeft({ createdAt: now - 14.5 * DAY }, 15, now)).toBe(1);
    expect(getHistoryEntryDaysLeft({ createdAt: now }, 15, now)).toBe(15);
    expect(getHistoryEntryDaysLeft({ createdAt: now - 20 * DAY }, 15, now)).toBe(0);
  });

  it("prune 删除过期记录并写回", () => {
    writeEcommerceHistory("u", [entry("fresh", now - DAY), entry("stale", now - 16 * DAY)]);
    expect(pruneExpiredHistory("u", 15, "ecommerce-canvas", now).map(e => e.id)).toEqual(["fresh"]);
    expect(readEcommerceHistory("u").map(e => e.id)).toEqual(["fresh"]);
  });

  it("retentionDays 非法时不删任何东西（宁可多留不可误删）", () => {
    writeEcommerceHistory("u", [entry("a", 0)]);
    expect(pruneExpiredHistory("u", 0, "ecommerce-canvas", now)).toHaveLength(1);
  });
});
