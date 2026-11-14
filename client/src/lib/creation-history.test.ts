import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLocalFileName,
  detectImageFormat,
  groupCreationHistory,
  recordsFromImageTask,
  type CreationHistoryRecord,
} from "./creation-history-core";

const day = 86_400_000;
const NOW = new Date(2026, 10, 14, 13, 0, 0).getTime();

function rec(partial: Partial<CreationHistoryRecord>): CreationHistoryRecord {
  return {
    id: Math.random().toString(36),
    ownerId: "u1",
    generationId: "g",
    projectId: "p1",
    projectName: "画板A",
    folderName: "",
    prompt: "",
    model: "",
    style: "",
    src: "https://x/a.png",
    width: 1,
    height: 1,
    format: "png",
    createdAt: NOW,
    ...partial,
  };
}

describe("detectImageFormat", () => {
  it("识别 data URL / 后缀 / 代理内层 / twimg format 参数", () => {
    expect(detectImageFormat("data:image/jpeg;base64,xx")).toBe("jpg");
    expect(detectImageFormat("/uploads/a.webp")).toBe("webp");
    expect(detectImageFormat(`/api/images/proxy?url=${encodeURIComponent("https://h/x.PNG")}`)).toBe("png");
    expect(detectImageFormat("https://pbs.twimg.com/media/X?format=jpg&name=large")).toBe("jpg");
    expect(detectImageFormat("https://h/noext")).toBe("other");
  });
});

describe("recordsFromImageTask", () => {
  it("只收 completed 且有图，按 generationId#index 生成稳定 id", () => {
    const ctx = { ownerId: "u1", projectName: "画板A", folderName: "品牌", now: NOW };
    expect(recordsFromImageTask({ status: "pending", images: [{ src: "a.png" }] }, ctx)).toEqual([]);
    const out = recordsFromImageTask(
      { status: "completed", generationId: "g1", projectId: "p9", images: [{ src: "a.png" }, null, { src: "" }, { src: "b.jpg" }] },
      ctx,
    );
    expect(out.map(r => r.id)).toEqual(["g1#0", "g1#3"]);
    expect(out[1].format).toBe("jpg");
    expect(out[0]).toMatchObject({ projectId: "p9", folderName: "品牌", ownerId: "u1" });
  });
});

describe("groupCreationHistory", () => {
  const records = [
    rec({ id: "1", createdAt: NOW - 1000, projectId: "pa", projectName: "A", format: "png", folderName: "" }),
    rec({ id: "2", createdAt: NOW - day, projectId: "pb", projectName: "B", format: "jpg", folderName: "品牌" }),
    rec({ id: "3", createdAt: NOW - 3 * day, projectId: "pa", projectName: "A", format: "png", folderName: "品牌" }),
  ];

  it("五个维度都能分组", () => {
    expect(groupCreationHistory(records, "history", { now: NOW })[0].records.map(r => r.id)).toEqual(["1", "2", "3"]);
    expect(groupCreationHistory(records, "project", { now: NOW }).map(g => g.label)).toEqual(["A", "B"]);
    expect(groupCreationHistory(records, "format", { now: NOW }).map(g => g.label)).toEqual(["JPG", "PNG"]);
    expect(groupCreationHistory(records, "folder", { now: NOW }).map(g => g.label)).toEqual(["品牌", "未归类"]);
    expect(groupCreationHistory(records, "time", { now: NOW }).map(g => g.label)).toEqual(["今天", "昨天", "2026-11-11"]);
  });

  it("ascending 翻转时间顺序", () => {
    expect(groupCreationHistory(records, "history", { ascending: true, now: NOW })[0].records.map(r => r.id)).toEqual(["3", "2", "1"]);
  });

  it("空列表不产生空组", () => {
    expect(groupCreationHistory([], "history")).toEqual([]);
  });
});

describe("buildLocalFileName", () => {
  it("去掉文件名非法字符并带扩展名", () => {
    const name = buildLocalFileName({ id: "gen-123#0", createdAt: NOW, projectName: "a/b:c d", format: "other" });
    expect(name).toBe("ArtX_20261114-130000_a_b_c_d_gen1230.png");
  });
});

describe("🔒 创作历史纯本地（用户硬性要求：不能进云端）", () => {
  // 只查代码不查注释：注释里写「别接 workspace-sync」是警告，不是接入
  const read = (p: string) =>
    readFileSync(resolve(__dirname, p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const files = ["./creation-history.ts", "./creation-history-core.ts", "./creation-history-recorder.ts", "../pages/CreationHistoryPage.tsx"];

  it("不调用任何写接口 / 不接入云同步", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} 出现 POST/PUT`).not.toMatch(/method:\s*["'](POST|PUT|PATCH)/i);
      expect(src, `${f} 接入了 workspace-sync`).not.toMatch(/workspace-sync|scheduleWorkspaceSync/);
      expect(src, `${f} 上传了文件`).not.toMatch(/uploadProjectCover|\/api\/uploads(?!\/expiry)/);
    }
  });

  it("记录存 IndexedDB 而不是 artx: 前缀的 localStorage", () => {
    const store = read("./creation-history.ts");
    expect(store).toContain("indexedDB.open(DB_NAME");
    expect(store).not.toContain("localStorage");
  });

  it("侧边栏两处入口都在画布社区下方", () => {
    const shell = read("../components/layout/AppShell.tsx");
    for (const pair of [
      ['label="画布社区"  path="/community"', 'label="创作历史"  path="/creation-history"'],
      ['label="画布社区"   path="/community"', 'label="创作历史"   path="/creation-history"'],
    ]) {
      const a = shell.indexOf(pair[0]);
      const b = shell.indexOf(pair[1]);
      expect(a, pair[0]).toBeGreaterThan(-1);
      expect(b, pair[1]).toBeGreaterThan(a);
    }
    expect(read("../App.tsx")).toContain('<Route path="/creation-history">');
  });
});
