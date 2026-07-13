#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storePath = path.join(root, "client/src/lib/skill-store.ts");
const skillsDir = path.join(root, "server/skills");
const distSkillsDir = path.join(root, "dist/skills");
const canvasPath = path.join(root, "client/src/components/canvas/InfiniteCanvas.tsx");
const aiClientPath = path.join(root, "client/src/lib/ai.ts");
const serverIndexPath = path.join(root, "server/index.ts");
const registryPath = path.join(root, "server/skill-registry.ts");
const orchestratorPath = path.join(root, "server/ai-orchestrator.ts");
const validationPath = path.join(root, "docs/skill-validation-cases.md");
const validationJsonPath = path.join(root, "docs/skill-validation-cases.json");

const expectedIds = [
  "brand-system-kit",
  "logo-identity-lab",
  "landing-page-visual",
  "commerce-poster-social",
  "cross-border-commerce-agent",
  "product-photography",
  "video-storyboard",
  "image-local-edit",
  "visual-reference-audit",
];

const expectedCategories = [
  "brand_system",
  "logo_identity",
  "landing_page",
  "commerce_poster",
  "product_visual",
  "video_storyboard",
  "image_editing",
  "visual_audit",
];

const removedIds = [
  "brand-kit-generator",
  "poster-generator",
  "logo-exploration",
  "ppt-deck-builder",
  "motion-script-writer",
  "web-visual-composer",
  "whiteboard-visuals",
  "canvas-prototype",
  "background-removal",
  "text-to-image",
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseFrontmatter(raw, fileName) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    fail(`${fileName} is missing YAML frontmatter`);
    return { data: {}, body: raw };
  }
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (item) data[item[1]] = item[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: match[2].trim() };
}

const store = read(storePath);
const storeBlock = store.slice(
  store.indexOf("export const skillStoreItems"),
  store.indexOf("export const skillStoreStats"),
);
const storeItems = [...storeBlock.matchAll(/\{\n\s+id: "([^"]+)",[\s\S]*?\n\s+\}/g)].map((match) => match[0]);
const storeIds = storeItems.map((item) => item.match(/id: "([^"]+)"/)?.[1]).filter(Boolean);
const storeCategories = storeItems.map((item) => item.match(/\n\s+category: "([^"]+)"/)?.[1]).filter(Boolean);
const storePrompts = storeItems.map((item) => item.match(/\n\s+capabilityPrompt: "([^"]+)"/)?.[1]).filter(Boolean);
const storeCapabilitiesById = new Map(storeItems.map((item) => [
  item.match(/id: "([^"]+)"/)?.[1],
  item.match(/\n\s+capability: "([^"]+)"/)?.[1],
]).filter(([id]) => Boolean(id)));

if (storeItems.length !== expectedIds.length) fail(`skill store has ${storeItems.length} items, expected ${expectedIds.length}`);
for (const id of expectedIds) {
  if (!storeIds.includes(id)) fail(`skill store is missing ${id}`);
}
for (const category of expectedCategories) {
  if (!storeCategories.includes(category)) fail(`skill store is missing category ${category}`);
}
if (storePrompts.length !== expectedIds.length) fail("each skill store item must have capabilityPrompt");
if (storeCapabilitiesById.size !== expectedIds.length) fail("each skill store item must have capability");
if (!store.includes("生成能力：")) fail("skill prompt context must include the skill capability");
for (const removed of removedIds) {
  if (store.includes(`id: "${removed}"`)) fail(`removed skill id still exists in store: ${removed}`);
}

const mdFiles = fs.readdirSync(skillsDir).filter((file) => file.endsWith(".md")).sort();
const mdIds = [];
const mdCapabilitiesById = new Map();
for (const file of mdFiles) {
  const raw = read(path.join(skillsDir, file));
  const { data, body } = parseFrontmatter(raw, file);
  const id = data.id;
  mdIds.push(id);
  mdCapabilitiesById.set(id, data.capability);
  if (!expectedIds.includes(id)) fail(`unexpected skill md id ${id} in ${file}`);
  if (file !== `${id}.md`) fail(`${file} should be named ${id}.md`);
  if (!data.title) fail(`${file} is missing title`);
  if (!data.description) fail(`${file} is missing description`);
  if (!["text_to_image", "image_edit"].includes(data.capability)) fail(`${file} has unsupported capability ${data.capability}`);
  if (storeCapabilitiesById.get(id) !== data.capability) fail(`store capability for ${id} does not match ${file}`);
  if (!/Must include:|Must handle:/u.test(body)) fail(`${file} is missing execution checklist`);
  if (!/Generation priorities:/u.test(body)) fail(`${file} is missing generation priorities`);
  if (!/Open-source references used to shape this skill:/u.test(body)) fail(`${file} is missing open-source reference note`);
}
if (mdFiles.length !== expectedIds.length) fail(`server/skills has ${mdFiles.length} md files, expected ${expectedIds.length}`);
for (const id of expectedIds) {
  if (!mdIds.includes(id)) fail(`server/skills is missing ${id}.md`);
}

const registry = read(registryPath);
if (!registry.includes("return skills;")) fail("skill registry should return md skills directly");
for (const removed of removedIds) {
  if (registry.includes(`id: "${removed}"`)) fail(`removed skill id still exists in registry: ${removed}`);
}

const orchestrator = read(orchestratorPath);
const requiredOrchestratorSnippets = [
  "input.skillId ? await getSkill(input.skillId) : await matchSkill(capability, input.prompt)",
  "buildPrompt(input, brandKitToPrompt(brandKit), skill?.prompt)",
  "skillPrompt ? `能力说明：\\n${skillPrompt}` : \"\"",
  "skill: skill?.id",
];
for (const snippet of requiredOrchestratorSnippets) {
  if (!orchestrator.includes(snippet)) fail(`orchestrator is missing skill prompt snippet: ${snippet}`);
}

const aiClient = read(aiClientPath);
const requiredAiClientSnippets = [
  "skillId?: string",
  "skillId,",
  "capability: \"text_to_image\"",
  "capability: \"image_edit\"",
];
for (const snippet of requiredAiClientSnippets) {
  if (!aiClient.includes(snippet)) fail(`AI client is missing skill request snippet: ${snippet}`);
}

const canvas = read(canvasPath);
const requiredCanvasSnippets = [
  "PENDING_SKILL_LOAD_KEY",
  "buildSkillPromptContext(activeSkill)",
  "activeSkill.capability === \"image_edit\"",
  "skillId: activeSkill.id",
  "editImageWithPrompt({",
  "setActiveSkill(payload)",
];
for (const snippet of requiredCanvasSnippets) {
  if (!canvas.includes(snippet)) fail(`canvas is missing skill chain snippet: ${snippet}`);
}

const serverIndex = read(serverIndexPath);
const requiredServerIndexSnippets = [
  "async function runBackgroundImageTask",
  "void runBackgroundImageTask(req.body, user)",
  "orchestrator.run({",
  "capability: \"text_to_image\"",
  "intent: \"text_to_image\"",
  "operation: \"generate\"",
  "providerTaskId: result.providerTaskId",
  "capabilityKey: capabilityFromOrchestrator(result.capability)",
];
for (const snippet of requiredServerIndexSnippets) {
  if (!serverIndex.includes(snippet)) fail(`background image task route is missing required task routing snippet: ${snippet}`);
}

const validation = read(validationPath);
for (const id of expectedIds) {
  if (!validation.includes(`| \`${id}\` |`)) fail(`validation cases are missing ${id}`);
}
if (!validation.includes("Suggested Validation Flow")) fail("validation cases are missing suggested validation flow");
if (!validation.includes("image_edit")) fail("validation cases should call out image_edit coverage");

let validationCases = [];
try {
  validationCases = JSON.parse(read(validationJsonPath));
} catch (error) {
  fail(`failed to parse ${validationJsonPath}: ${error.message}`);
}

if (!Array.isArray(validationCases)) fail("validation JSON must be an array");
if (validationCases.length !== expectedIds.length) {
  fail(`validation JSON has ${validationCases.length} cases, expected ${expectedIds.length}`);
}

const validationJsonIds = validationCases.map((item) => item.skillId);
for (const id of expectedIds) {
  const item = validationCases.find((candidate) => candidate.skillId === id);
  if (!item) {
    fail(`validation JSON is missing ${id}`);
    continue;
  }
  if (item.capability !== mdCapabilitiesById.get(id)) {
    fail(`validation JSON capability for ${id} does not match ${id}.md`);
  }
  if (typeof item.requiresReferenceImage !== "boolean") {
    fail(`validation JSON requiresReferenceImage for ${id} must be boolean`);
  }
  if (item.requiresReferenceImage !== (id === "image-local-edit")) {
    fail(`validation JSON requiresReferenceImage for ${id} is incorrect`);
  }
  for (const field of ["minimumPrompt", "expectedVisualResult", "passCriteria"]) {
    if (typeof item[field] !== "string" || item[field].trim().length < 20) {
      fail(`validation JSON ${field} for ${id} is missing or too short`);
    }
  }
}
for (const id of validationJsonIds) {
  if (!expectedIds.includes(id)) fail(`validation JSON has unexpected skill id ${id}`);
}

if (fs.existsSync(distSkillsDir)) {
  const distMdFiles = fs.readdirSync(distSkillsDir).filter((file) => file.endsWith(".md")).sort();
  if (distMdFiles.length !== expectedIds.length) {
    fail(`dist/skills has ${distMdFiles.length} md files, expected ${expectedIds.length}`);
  }
  for (const id of expectedIds) {
    if (!distMdFiles.includes(`${id}.md`)) fail(`dist/skills is missing ${id}.md`);
  }
}

if (!process.exitCode) {
  console.log(`OK: ${expectedIds.length} skill store items match ${mdFiles.length} MD files, validation cases, and canvas skill loading chain.`);
}
