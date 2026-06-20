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

    return skills;
  } catch {
    return [];
  }
}

export async function getSkill(id: string) {
  const skills = await loadSkills();
  return skills.find((skill) => skill.id === id);
}

export async function matchSkill(capability: AiCapability, prompt = "") {
  const skills = await loadSkills();
  const normalizedPrompt = prompt.toLowerCase();
  const matched = skills.find((skill) => {
    return normalizedPrompt.includes(skill.id.toLowerCase()) || normalizedPrompt.includes(skill.title.toLowerCase());
  });
  return matched && matched.capability === capability ? matched : undefined;
}
