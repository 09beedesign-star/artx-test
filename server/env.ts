import fs from "node:fs";
import path from "node:path";

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed
    .slice(separatorIndex + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  return key ? { key, value } : null;
}

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const item = parseEnvLine(line);
    if (item && process.env[item.key] === undefined) {
      process.env[item.key] = item.value;
    }
  }
}

export function loadServerEnv(projectRoot = process.cwd()) {
  // .env.local 优先于 .env（先读取者胜出，因为已存在的 key 不会被覆盖）。
  // .env.local 用于本地开发覆盖，已被 .gitignore 忽略。
  loadEnvFile(path.join(projectRoot, ".env.local"));
  loadEnvFile(path.join(projectRoot, ".env"));
}

loadServerEnv();
