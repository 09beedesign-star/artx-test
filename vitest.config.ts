import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  /**
   * 【2026-09-19】别名必须和 vite.config.ts 保持一致。
   *
   * vite 侧有 `@` / `@shared` 两个别名，前端源码里有十几个文件在 import
   * `@shared/...`。但 vitest 一旦发现同目录存在 vitest.config.ts 就**只读这一份**，
   * 不会继承 vite.config.ts 的 resolve —— 于是任何 import 到这些模块的测试
   * 都会报「Failed to load url @shared/xxx，Does the file exist?」，
   * 报错长得像文件不存在，实际是别名没注册。
   *
   * ⚠️ 后续在 vite.config.ts 加别名时，这里要同步加，否则测试与构建会分叉。
   */
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "client/src/**/*.test.ts"],
  },
});
