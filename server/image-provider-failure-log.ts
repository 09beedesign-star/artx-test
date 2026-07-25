import fs from "node:fs/promises";
import path from "node:path";

export type ImageProviderFailureLogEntry = {
  timestamp: string;
  requestId: string;
  operation: "generate" | "chat" | "edit";
  model: string;
  host: string;
  path: string;
  status?: number;
  kind: "http-error" | "timeout" | "network-error" | "generation-failed";
  durationMs?: number;
  error?: string;
};

const DATA_DIR = process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data");
const LOG_FILE = path.join(DATA_DIR, "image-provider-failures.jsonl");
const MAX_EXPORT_ENTRIES = 5_000;
const MAX_ENTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sanitizeEntry(entry: ImageProviderFailureLogEntry): ImageProviderFailureLogEntry {
  return {
    timestamp: entry.timestamp,
    requestId: entry.requestId.slice(0, 80),
    operation: entry.operation,
    model: entry.model.slice(0, 120),
    host: entry.host.slice(0, 240),
    path: entry.path.slice(0, 400),
    status: typeof entry.status === "number" ? entry.status : undefined,
    kind: entry.kind,
    durationMs: typeof entry.durationMs === "number" ? Math.max(0, Math.round(entry.durationMs)) : undefined,
    error: entry.error?.replace(/\s+/g, " ").trim().slice(0, 220),
  };
}

export async function recordImageProviderFailure(entry: Omit<ImageProviderFailureLogEntry, "timestamp">) {
  const record = sanitizeEntry({ ...entry, timestamp: new Date().toISOString() });
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o750 });
  await fs.appendFile(LOG_FILE, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o640 });
  return record;
}

export async function exportImageProviderFailureLog(now = Date.now()) {
  let content = "";
  try {
    content = await fs.readFile(LOG_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }

  const cutoff = now - MAX_ENTRY_AGE_MS;
  return content
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as ImageProviderFailureLogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is ImageProviderFailureLogEntry => Boolean(entry))
    .filter(entry => Date.parse(entry.timestamp) >= cutoff)
    .slice(-MAX_EXPORT_ENTRIES)
    .map(entry => JSON.stringify(sanitizeEntry(entry)))
    .join("\n") + (content ? "\n" : "");
}
