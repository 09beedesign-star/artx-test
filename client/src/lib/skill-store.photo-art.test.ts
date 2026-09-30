import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { skillCategoryMeta, skillStoreItems } from "./skill-store";

/**
 * 「图像创意」分类：来自 vechooool-skills 合集中许可证为 MIT、且产物是单张图片的 10 个 skill。
 *
 * 为什么全部是 text_to_image 而不是 image_edit：
 * image_edit 分支会追加「保持构图/主体/背景不变」的引导语，而且后台 image_edit
 * 路径不注入 server/skills/<id>.md —— 这些风格转换类 skill 恰恰要改掉构图与材质，
 * 走 image_edit 等于规则全丢、还被反向约束。text_to_image 路径照片作为引用图透传，
 * 且 orchestrator 会把 MD 前置进提示词。
 */
const PHOTO_ART_IDS = [
  "photo-organic-knit",
  "photo-travel-sketch",
  "surreal-pop-collage",
  "photo-stamp-archive",
  "washi-tape-collage",
  "pulp-print-poster",
  "halftone-dot-poster",
  "minimal-zine-poster",
  "xiaohei-object-scenes",
  "ip-mascot-logo",
];

const PHOTO_REQUIRED = [
  "photo-organic-knit",
  "photo-travel-sketch",
  "surreal-pop-collage",
  "photo-stamp-archive",
  "washi-tape-collage",
];

const root = resolve(__dirname, "../../..");

describe("photo_art skills", () => {
  const items = skillStoreItems.filter((skill) => skill.category === "photo_art");

  it("registers exactly the vetted MIT image skills", () => {
    expect(items.map((skill) => skill.id).sort()).toEqual([...PHOTO_ART_IDS].sort());
    expect(skillCategoryMeta.photo_art.label).toBe("图像创意");
  });

  it("routes every photo_art skill through text_to_image so the server MD is injected", () => {
    for (const skill of items) {
      expect(skill.capability).toBe("text_to_image");
      const mdPath = resolve(root, "server/skills", `${skill.id}.md`);
      expect(existsSync(mdPath)).toBe(true);
      const md = readFileSync(mdPath, "utf-8");
      expect(md).toContain("capability: text_to_image");
      expect(md).toContain("(MIT)");
      expect(skill.sourceUrl).toMatch(/^https:\/\/github\.com\//);
    }
  });

  it("tells users up front which skills need a photo", () => {
    for (const id of PHOTO_REQUIRED) {
      const skill = items.find((item) => item.id === id);
      expect(skill?.summary).toContain("需先上传一张照片");
    }
  });

  it("declares a canvas size so the skill ratio beats the 9:16 default", () => {
    for (const skill of items) {
      expect(skill.canvasSizes?.[0]).toMatch(/^\d+x\d+$/);
    }
  });

  it("shows the photo_art tab right after image editing on the store page", () => {
    const source = readFileSync(resolve(root, "client/src/pages/SkillsPage.tsx"), "utf-8");
    expect(source).toContain('"image_editing",\n  "photo_art",');
  });
});
