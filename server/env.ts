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

export function loadServerEnv(projectRoot = process.cwd()) {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const item = parseEnvLine(line);
    if (item && process.env[item.key] === undefined) {
      process.env[item.key] = item.value;
    }
  }
}

loadServerEnv();
