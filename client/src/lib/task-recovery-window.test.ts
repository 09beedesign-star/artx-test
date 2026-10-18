/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  RECOVERY_PROMPT_WINDOW_MS,
  isInRecoveryWindow,
  recoveryBatchSignature,
  hasPromptedThisSession,
  markPromptedThisSession,
} from "./task-recovery-window";

const store = new Map<string, string>();
globalThis.sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size; },
} as Storage;

describe("task-recovery-window", () => {
  beforeEach(() => store.clear());

  it("2 分钟窗口：边界内为 true，超过为 false", () => {
    const load = 1_000_000;
    expect(RECOVERY_PROMPT_WINDOW_MS).toBe(120_000);
    expect(isInRecoveryWindow(load, load + 119_999)).toBe(true);
    expect(isInRecoveryWindow(load, load + 120_000)).toBe(true);
    expect(isInRecoveryWindow(load, load + 120_001)).toBe(false);
  });

  it("批次签名与顺序无关、去重", () => {
    expect(recoveryBatchSignature(["b", "a", "a"])).toBe(recoveryBatchSignature(["a", "b"]));
  });

  it("同一批任务只提示一次", () => {
    const sig = recoveryBatchSignature(["t1", "t2"]);
    expect(hasPromptedThisSession("workspace", sig)).toBe(false);
    markPromptedThisSession("workspace", sig);
    expect(hasPromptedThisSession("workspace", sig)).toBe(true);
  });

  it("出现新的未完成任务会再次提示（不会被旧标记永久压住）", () => {
    markPromptedThisSession("workspace", recoveryBatchSignature(["t1"]));
    expect(hasPromptedThisSession("workspace", recoveryBatchSignature(["t2"]))).toBe(false);
  });

  it("不同入口互不影响", () => {
    const sig = recoveryBatchSignature(["t1"]);
    markPromptedThisSession("workspace", sig);
    expect(hasPromptedThisSession("ecommerce-canvas", sig)).toBe(false);
  });
});
