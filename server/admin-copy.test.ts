import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const adminCopyFiles = [
  "client/src/App.tsx",
  "client/src/pages/AdminPrototypePage.tsx",
  "server/admin-store.ts",
];

describe("admin copy", () => {
  it("uses 积分 instead of 额度 in backstage/admin wording", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    for (const file of adminCopyFiles) {
      const content = await readFile(path.join(root, file), "utf-8");
      expect(content, file).not.toContain("额度");
      expect(content, file).not.toContain("已确认收入");
      expect(content, file).not.toContain("累计付费");
      expect(content, file).not.toContain("兑换积分");
      expect(content, file).not.toContain("钱和积分");
      expect(content, file).not.toContain("价格配置");
      expect(content, file).not.toContain("收入");
    }
  });
});
