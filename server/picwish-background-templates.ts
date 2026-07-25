export type PicWishBackgroundTemplate = {
  id: number;
  name: string;
  category: string;
  previewUrl?: string;
};

type TemplatePayload = Record<string, unknown>;

let cachedTemplates: { expiresAt: number; templates: PicWishBackgroundTemplate[] } | null = null;

function asRecord(value: unknown): TemplatePayload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as TemplatePayload
    : null;
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTemplateId(value: TemplatePayload) {
  const candidate = value.scene_type ?? value.sceneType ?? value.id ?? value.template_id ?? value.templateId;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function collectTemplates(value: unknown, category = "全部", results: PicWishBackgroundTemplate[] = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectTemplates(item, category, results));
    return results;
  }
  const record = asRecord(value);
  if (!record) return results;
  const nextCategory = readText(record.category_name ?? record.categoryName ?? record.category ?? record.name ?? record.title) || category;
  const id = readTemplateId(record);
  if (id) {
    const name = readText(record.template_name ?? record.templateName ?? record.name ?? record.title ?? record.scene_name ?? record.sceneName) || `模板 ${id}`;
    const previewUrl = readText(record.template_url ?? record.templateUrl ?? record.image_url ?? record.imageUrl ?? record.preview_url ?? record.previewUrl ?? record.cover_url ?? record.coverUrl);
    if (!results.some(template => template.id === id)) results.push({ id, name, category, previewUrl: previewUrl || undefined });
    return results;
  }
  for (const child of Object.values(record)) {
    if (Array.isArray(child) || asRecord(child)) collectTemplates(child, nextCategory, results);
  }
  return results;
}

export async function getPicWishBackgroundTemplates() {
  if (cachedTemplates && cachedTemplates.expiresAt > Date.now()) return cachedTemplates.templates;
  const apiKey = process.env.PICWISH_API_KEY || process.env.AOS_API_KEY || "";
  if (!apiKey) throw new Error("Missing PICWISH_API_KEY");
  const baseUrl = (process.env.PICWISH_TEMPLATE_BASE_URL || "https://aw.aoscdn.com").replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/app/picwish/third-party/background-template`);
  url.searchParams.set("language", "en");
  const response = await fetch(url, { headers: { "X-API-KEY": apiKey } });
  const payload = await response.json().catch(() => null) as TemplatePayload | null;
  if (!response.ok) throw new Error(readText(payload?.message) || `PicWish background templates returned ${response.status}`);
  const templates = collectTemplates(payload?.data ?? payload);
  if (templates.length === 0) throw new Error("PicWish did not return background templates");
  cachedTemplates = { templates, expiresAt: Date.now() + 10 * 60 * 1000 };
  return templates;
}
