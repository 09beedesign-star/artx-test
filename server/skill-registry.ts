import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AiCapability } from "./model-router";

export type AiSkill = {
  id: string;
  title: string;
  capability: AiCapability;
  description: string;
  prompt: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsDir = path.resolve(__dirname, "skills");

const BUILTIN_STORE_SKILLS: AiSkill[] = [
  {
    id: "logo-exploration",
    title: "Logo 探索器",
    capability: "text_to_image",
    description: "围绕品牌关键词生成字标、图标、徽章和极简符号方向。",
    prompt: "作为 Logo 探索 skill，请生成品牌识别方向：包含简洁图标、字标比例、黑白可用性、可扩展图形语言和适合继续迭代的标志方案。",
  },
  {
    id: "motion-script-writer",
    title: "视频脚本分镜",
    capability: "text_to_image",
    description: "生成短视频脚本、镜头节奏、字幕节拍和可交付的分镜卡。",
    prompt: "作为视频脚本分镜 skill，请把需求转成可视化分镜画面：包含镜头主体、运动节奏、字幕位置、开场钩子和竖屏/横屏封面图方向。",
  },
  {
    id: "canvas-prototype",
    title: "交互画布原型",
    capability: "text_to_image",
    description: "把 UI 想法转成可拖拽、可缩放、可批注的高保真画布。",
    prompt: "作为交互画布原型 skill，请生成高保真产品画布：包含关键组件、状态、布局网格、交互提示和适合继续编辑的节点结构。",
  },
  {
    id: "face-restore",
    title: "人像修复增强",
    capability: "image_edit",
    description: "修复人脸细节、提升清晰度，并适配证件照、海报人像和直播封面。",
    prompt: "作为人像修复增强 skill，请改善人像清晰度、肤色、五官细节和光影自然度，同时保持身份一致和真实质感。",
  },
  {
    id: "competitor-visual-audit",
    title: "竞品视觉扫描",
    capability: "text_to_image",
    description: "比较竞品站点、广告和社媒图，提炼视觉机会和差异化方向。",
    prompt: "作为竞品视觉扫描 skill，请基于用户描述分析竞品视觉套路、差异机会、信息层级和可借鉴但不抄袭的创作方向。",
  },
  {
    id: "prompt-safety-review",
    title: "生成提示词审阅",
    capability: "text_to_image",
    description: "提前发现提示词歧义、缺尺寸、缺主体、版权风险和不可执行描述。",
    prompt: "作为生成提示词审阅 skill，请先修正用户提示词中的歧义、缺失、版权风险和不可执行要求，再形成稳定可生图的提示词。",
  },
  {
    id: "design-system-audit",
    title: "设计系统一致性",
    capability: "text_to_image",
    description: "检查页面是否符合品牌 token、组件用法、间距、圆角和字体规范。",
    prompt: "作为设计系统一致性 skill，请让输出符合统一 token、组件边界、间距、圆角、字体、颜色和页面结构规范。",
  },
  {
    id: "tiktok-pack",
    title: "TikTok/抖音尺寸套件",
    capability: "text_to_image",
    description: "生成竖屏视频封面、直播封面、信息流广告和商品卡尺寸。",
    prompt: "作为 TikTok/抖音尺寸套件 skill，请生成竖屏优先的封面或信息流视觉：主体大、钩子强、文字短、移动端可读。",
  },
  {
    id: "ecommerce-pack",
    title: "电商主图套件",
    capability: "text_to_image",
    description: "生成 1:1 主图、3:4 详情封面、白底图、透明底和活动图。",
    prompt: "作为电商主图套件 skill，请生成平台友好的商品视觉：主体清晰、卖点明确、白底/场景图可选、文字不过载并适合主图审核。",
  },
  {
    id: "ad-platform-pack",
    title: "广告投放尺寸套件",
    capability: "text_to_image",
    description: "生成 Meta、Google Display、信息流和横幅广告常用画布。",
    prompt: "作为广告投放尺寸套件 skill，请生成可投放广告视觉：强主张、清晰 CTA、品牌露出、安全边距和多尺寸裁切一致性。",
  },
];

function parseFrontmatter(raw: string) {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };

  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const data: Record<string, string> = {};

  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }

  return { data, body };
}

export async function loadSkills(): Promise<AiSkill[]> {
  try {
    const entries = await fs.readdir(skillsDir);
    const markdownFiles = entries.filter((entry) => entry.endsWith(".md"));
    const skills = await Promise.all(markdownFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(skillsDir, fileName), "utf8");
      const { data, body } = parseFrontmatter(raw);
      const id = data.id || fileName.replace(/\.md$/, "");

      return {
        id,
        title: data.title || id,
        capability: (data.capability || "chat") as AiCapability,
        description: data.description || "",
        prompt: body,
      };
    }));

    const merged = new Map<string, AiSkill>();
    [...BUILTIN_STORE_SKILLS, ...skills].forEach((skill) => merged.set(skill.id, skill));
    return Array.from(merged.values());
  } catch {
    return BUILTIN_STORE_SKILLS;
  }
}

export async function getSkill(id: string) {
  const skills = await loadSkills();
  return skills.find((skill) => skill.id === id);
}

export async function matchSkill(capability: AiCapability, prompt = "") {
  const skills = await loadSkills();
  const direct = skills.find((skill) => skill.capability === capability);
  if (direct) return direct;

  const normalizedPrompt = prompt.toLowerCase();
  return skills.find((skill) => {
    return normalizedPrompt.includes(skill.id.toLowerCase()) || normalizedPrompt.includes(skill.title.toLowerCase());
  });
}
