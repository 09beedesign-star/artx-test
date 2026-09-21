import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("skills store card presentation", () => {
  it("hides source metadata and sync badges while keeping only the load action", () => {
    const source = readFileSync(resolve(__dirname, "SkillsPage.tsx"), "utf-8");

    expect(source).not.toContain("来源：{skill.sourceRepo}");
    expect(source).not.toContain("formatScore(skill.sourceScore)");
    expect(source).not.toContain("{skill.status}");
    expect(source).not.toContain("进入画布并连接生成");
    expect(source).not.toContain('placeholder="搜索技能、尺寸、来源"');
    expect(source).toContain("快速加载");
  });
});
