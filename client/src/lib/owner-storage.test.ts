import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_STORAGE_KEY,
  getOwnedItem,
  getStorageOwnerId,
  legacyKeyOf,
  ownerScopedKey,
} from "./owner-storage";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

let local: MemoryStorage;

function loginAs(id: string, username: string) {
  local.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ token: "t", user: { id, username } }));
}

beforeEach(() => {
  local = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: new MemoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("owner-storage 账号隔离", () => {
  it("未登录时 key 原样返回（匿名使用合法）", () => {
    expect(getStorageOwnerId()).toBe("");
    expect(ownerScopedKey("artx:canvas-state:p1")).toBe("artx:canvas-state:p1");
  });

  it("⚠️ 「abc」与「abc@qq.com」按 userId 分桶，互相读不到", () => {
    loginAs("u_abc", "abc");
    local.setItem(ownerScopedKey("artx:creator-profile"), "A 的资料");

    loginAs("u_abc_mail", "abc@qq.com");
    expect(getOwnedItem(local, ownerScopedKey("artx:creator-profile"))).toBeNull();
    local.setItem(ownerScopedKey("artx:creator-profile"), "B 的资料");

    loginAs("u_abc", "abc");
    expect(getOwnedItem(local, ownerScopedKey("artx:creator-profile"))).toBe("A 的资料");
  });

  it("key 用 userId 而不是用户名：同名大小写不同的账号也不会撞", () => {
    loginAs("u1", "ABC");
    const a = ownerScopedKey("k");
    loginAs("u2", "abc");
    expect(ownerScopedKey("k")).not.toBe(a);
  });

  it("老的无账号 key 被第一个读取的账号认领后删除，第二个账号读不到", () => {
    local.setItem("artx:canvas-state:p1", "老画布");
    loginAs("u_abc", "abc");
    expect(getOwnedItem(local, ownerScopedKey("artx:canvas-state:p1"))).toBe("老画布");
    expect(local.getItem("artx:canvas-state:p1")).toBeNull();
    expect(local.getItem("artx:canvas-state:p1:u_abc")).toBe("老画布");

    loginAs("u_abc_mail", "abc@qq.com");
    expect(getOwnedItem(local, ownerScopedKey("artx:canvas-state:p1"))).toBeNull();
  });

  it("配额失败时不删老 key（宁可暂时共享也不丢数据）", () => {
    local.setItem("k", "v");
    loginAs("u1", "abc");
    const original = local.setItem.bind(local);
    local.setItem = (key: string, value: string) => {
      if (key === "k:u1") throw new Error("QuotaExceededError");
      original(key, value);
    };
    expect(getOwnedItem(local, ownerScopedKey("k"))).toBe("v");
    expect(local.getItem("k")).toBe("v");
  });

  it("legacyKeyOf 只认当前账号的后缀", () => {
    loginAs("u1", "abc");
    expect(legacyKeyOf("k:u1")).toBe("k");
    expect(legacyKeyOf("k:u2")).toBe("");
  });
});
