import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const csvPath = "/Users/ericbi/Documents/智能化 UI/ai_image_prompt_rank_50/ai_image_prompt_rank_50.csv";
const outDir = "/Users/ericbi/Desktop/ai_image_prompt_rank_50_images";
const zipPath = "/Users/ericbi/Desktop/ai_image_prompt_rank_50_images.zip";

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuote) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuote = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function pickExt(url, contentType) {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(fromUrl)) return fromUrl === ".jpeg" ? ".jpg" : fromUrl;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  return ".jpg";
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

function runQuiet(command, args) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${command} exited ${code}`));
      }
    });
  });
}

async function downloadWithCurl(url, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await runQuiet("/usr/bin/curl", [
    "-L",
    "--fail",
    "--http1.1",
    "--retry",
    "3",
    "--retry-delay",
    "2",
    "--connect-timeout",
    "20",
    "--max-time",
    "90",
    "-A",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    "-H",
    "Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "-o",
    destination,
    url,
  ]);
}

async function downloadOne(url, destination) {
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`not an image: ${contentType}`);
    }

    await mkdir(dirname(destination), { recursive: true });
    await pipeline(response.body, createWriteStream(destination));
    return { contentType, bytes: Number(response.headers.get("content-length")) || null, method: "fetch" };
  } catch (fetchError) {
    await downloadWithCurl(url, destination);
    return { contentType: "image/*", bytes: null, method: "curl", fetchError: fetchError.message };
  }
}

const csv = (await readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
const rows = parseCsv(csv);
const header = rows[0];
const get = (record, key) => record[header.indexOf(key)]?.trim() || "";
const records = rows.slice(1).filter((record) => record.length > 1);

await rm(outDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(outDir, { recursive: true });

const manifest = [];
const failures = [];

for (const record of records) {
  const rank = Number(get(record, "rank"));
  const title = get(record, "title");
  const primary = get(record, "image_url");
  const alternates = get(record, "all_image_urls")
    .split(/\s+/)
    .map((url) => url.trim())
    .filter(Boolean);
  const urls = [...new Set([primary, ...alternates].filter(Boolean))];

  let success = null;
  for (const url of urls) {
    try {
      const ext = pickExt(url);
      const destination = join(outDir, `prompt-${String(rank).padStart(2, "0")}${ext}`);
      const result = await downloadOne(url, destination);
      success = { rank, title, url, file: destination, ...result };
      console.log(`ok ${String(rank).padStart(2, "0")} ${title}`);
      break;
    } catch (error) {
      console.warn(`fail ${String(rank).padStart(2, "0")} ${url} ${error.message}`);
    }
  }

  if (success) {
    manifest.push(success);
  } else {
    failures.push({ rank, title, urls });
  }
}

await writeFile(join(outDir, "manifest.json"), JSON.stringify({ downloaded: manifest, failures }, null, 2));

if (failures.length) {
  console.error(`Downloaded ${manifest.length}/${records.length}; ${failures.length} failed.`);
} else {
  console.log(`Downloaded all ${manifest.length} images.`);
}

await run("/usr/bin/zip", ["-r", zipPath, "."], outDir);
console.log(`zip: ${zipPath}`);

if (failures.length) {
  process.exitCode = 2;
}
