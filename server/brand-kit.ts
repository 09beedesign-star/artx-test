import { promises as fs } from "fs";
import path from "path";

export type BrandKit = {
  id: string;
  name: string;
  colors: string[];
  typography?: string;
  tone?: string;
  logoPrompt?: string;
  constraints?: string[];
  createdAt: string;
  updatedAt: string;
};

type BrandKitStore = {
  kits: BrandKit[];
};

const storePath = path.resolve(process.cwd(), "data", "brand-kits.json");

async function readStore(): Promise<BrandKitStore> {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as BrandKitStore;
    return { kits: Array.isArray(parsed.kits) ? parsed.kits : [] };
  } catch {
    return { kits: [] };
  }
}

async function writeStore(store: BrandKitStore) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
}

function createId() {
  return `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBrandKit(input: Partial<BrandKit>): BrandKit {
  const now = new Date().toISOString();
  return {
    id: input.id || createId(),
    name: input.name?.trim() || "Untitled Brand Kit",
    colors: Array.isArray(input.colors) ? input.colors.filter(Boolean) : [],
    typography: input.typography,
    tone: input.tone,
    logoPrompt: input.logoPrompt,
    constraints: Array.isArray(input.constraints) ? input.constraints.filter(Boolean) : [],
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export async function listBrandKits() {
  const store = await readStore();
  return store.kits;
}

export async function getBrandKit(id: string) {
  const store = await readStore();
  return store.kits.find((kit) => kit.id === id);
}

export async function createBrandKit(input: Partial<BrandKit>) {
  const store = await readStore();
  const kit = normalizeBrandKit(input);
  const index = store.kits.findIndex((item) => item.id === kit.id);
  if (index >= 0) {
    kit.createdAt = store.kits[index].createdAt;
    store.kits[index] = kit;
  } else {
    store.kits.push(kit);
  }
  await writeStore(store);
  return kit;
}

export async function deleteBrandKit(id: string) {
  const store = await readStore();
  const nextKits = store.kits.filter((kit) => kit.id !== id);
  await writeStore({ kits: nextKits });
  return nextKits.length !== store.kits.length;
}

export function brandKitToPrompt(kit?: BrandKit) {
  if (!kit) return "";
  return [
    `品牌包：${kit.name}`,
    kit.colors.length ? `主色：${kit.colors.join(", ")}` : "",
    kit.typography ? `字体气质：${kit.typography}` : "",
    kit.tone ? `品牌语气：${kit.tone}` : "",
    kit.logoPrompt ? `Logo/视觉线索：${kit.logoPrompt}` : "",
    kit.constraints?.length ? `约束：${kit.constraints.join("；")}` : "",
  ].filter(Boolean).join("\n");
}

export function brandKitToConstraints(kit?: BrandKit) {
  if (!kit) return [];
  return [
    ...kit.colors.map((color) => `优先使用品牌色 ${color}`),
    ...(kit.constraints || []),
  ];
}

function extractJsonObject(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw.match(/\{[\s\S]*\}/)?.[0] || "";
  if (!candidate) return null;

  try {
    return JSON.parse(candidate) as Partial<BrandKit>;
  } catch {
    return null;
  }
}

export async function parseBrandKitFromImage(
  imageSrc: string,
  chat: (input: { prompt: string; images?: Array<{ src: string; title?: string }>; model?: string; module?: string }) => Promise<{ text: string }>,
) {
  const result = await chat({
    module: "brand-kit-parse",
    model: "gpt-5.4-mini",
    images: [{ src: imageSrc, title: "brand reference" }],
    prompt: [
      "请从这张品牌/视觉参考图中提取品牌包信息。",
      "只返回 JSON，不要解释。字段：name, colors, typography, tone, logoPrompt, constraints。",
      "colors 使用十六进制颜色数组；constraints 是中文短句数组。",
    ].join("\n"),
  });
  const parsed = extractJsonObject(result.text) || {};
  return normalizeBrandKit(parsed);
}
