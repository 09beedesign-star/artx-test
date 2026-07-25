#!/usr/bin/env node

const backendUrl = (process.env.BACKEND_URL || "https://backstage.artxsd.com").replace(/\/+$/, "");
const apiKey = process.env.ARTX_MCP_API_KEY || process.env.ARTX_API_KEY || "";
const runImage = process.env.RUN_IMAGE === "1";
const prompt = process.env.MCP_IMAGE_PROMPT || "A small white rabbit sticker, clean background, commercial product icon style.";
const model = process.env.MCP_IMAGE_MODEL || "og-image2-low";
const ratio = process.env.MCP_IMAGE_RATIO || "1:1";
const mcpRequestDelayMs = Number(process.env.MCP_REQUEST_DELAY_MS || 3500);
const mcpMaxAttempts = Number(process.env.MCP_MAX_ATTEMPTS || 4);

const results = [];
let lastMcpRequestAt = 0;

function record(name, status, details = "") {
  results.push({ name, status, details });
  const suffix = details ? ` - ${details}` : "";
  console.log(`${status === "ok" ? "OK" : status === "skip" ? "SKIP" : "FAIL"} ${name}${suffix}`);
}

function requireOk(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mcpRequest(method, params = undefined) {
  requireOk(apiKey, "set ARTX_MCP_API_KEY to test MCP endpoints");
  let lastError = "";

  for (let attempt = 1; attempt <= mcpMaxAttempts; attempt += 1) {
    const elapsed = Date.now() - lastMcpRequestAt;
    if (elapsed < mcpRequestDelayMs) await sleep(mcpRequestDelayMs - elapsed);
    lastMcpRequestAt = Date.now();

    const response = await fetch(`${backendUrl}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${Date.now()}`,
        method,
        ...(params ? { params } : {}),
      }),
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json") || /^[\s\n\r]*[{[]/.test(text);

    if (!response.ok || !isJson) {
      lastError = `${method} failed: ${response.status} ${text.slice(0, 180)}`;
      if ((response.status === 429 || !isJson) && attempt < mcpMaxAttempts) {
        await sleep(Math.min(15000, mcpRequestDelayMs * attempt));
        continue;
      }
      throw new Error(lastError);
    }

    const body = JSON.parse(text || "{}");
    requireOk(!body.error, `${method} returned MCP error: ${JSON.stringify(body.error)}`);
    return body.result;
  }

  throw new Error(lastError || `${method} failed`);
}

async function verifyPublicHealth() {
  let lastStatus = "";
  for (let attempt = 1; attempt <= mcpMaxAttempts; attempt += 1) {
    const response = await fetch(`${backendUrl}/api/health`);
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json") || /^[\s\n\r]*[{[]/.test(text);
    const body = isJson ? JSON.parse(text || "{}") : null;
    if (response.ok && body?.ok === true) {
      record("backend /api/health", "ok");
      return;
    }
    lastStatus = `${response.status} ${text.slice(0, 180)}`;
    if (response.status === 429 && attempt < mcpMaxAttempts) {
      await sleep(Math.min(15000, mcpRequestDelayMs * attempt));
      continue;
    }
    break;
  }
  throw new Error(`backend health failed: ${lastStatus}`);
}

async function verifyMcpHealth() {
  if (!apiKey) {
    record("MCP API key", "skip", "set ARTX_MCP_API_KEY to run MCP smoke");
    return false;
  }
  const initialized = await mcpRequest("initialize");
  requireOk(initialized?.serverInfo?.name === "artx-image", "invalid MCP initialize response");
  record("MCP initialize", "ok", initialized.serverInfo.name);

  const listed = await mcpRequest("tools/list");
  const toolNames = (listed?.tools || []).map(tool => tool.name);
  requireOk(toolNames.includes("artx_health"), "artx_health missing");
  requireOk(toolNames.includes("artx_generate_image"), "artx_generate_image missing");
  record("MCP tools/list", "ok", toolNames.join(", "));

  const health = await mcpRequest("tools/call", {
    name: "artx_health",
    arguments: {},
  });
  const healthText = health?.content?.find(item => item.type === "text")?.text || "{}";
  const parsed = JSON.parse(healthText);
  requireOk(parsed.ok === true, "artx_health did not return ok");
  requireOk(!String(healthText).includes(apiKey), "health response leaked the full API key");
  record("MCP artx_health", "ok", parsed.user || "authenticated");
  return true;
}

async function verifyImageGeneration() {
  if (!runImage) {
    record("MCP image generation", "skip", "set RUN_IMAGE=1 to consume the minimum image quota");
    return;
  }
  const result = await mcpRequest("tools/call", {
    name: "artx_generate_image",
    arguments: {
      prompt,
      model,
      ratio,
      count: 1,
    },
  });
  const structured = result?.structuredContent || {};
  const imageUrl = structured.images?.[0]?.url || "";
  requireOk(/^https?:\/\//i.test(imageUrl), `MCP did not return a public image URL: ${JSON.stringify(structured)}`);
  const imageResponse = await fetch(imageUrl);
  const contentType = imageResponse.headers.get("content-type") || "";
  const bytes = Buffer.from(await imageResponse.arrayBuffer()).byteLength;
  requireOk(imageResponse.ok, `generated image download failed: ${imageResponse.status}`);
  requireOk(contentType.startsWith("image/") || contentType === "application/octet-stream", `generated URL is not image content: ${contentType}`);
  requireOk(bytes > 1000, `generated image too small: ${bytes}`);
  record("MCP image generation", "ok", `${model}, ${bytes} bytes`);
  record("MCP generated image URL", "ok", imageUrl.replace(/\?.*$/, ""));
}

async function main() {
  try {
    await verifyPublicHealth();
    const canUseMcp = await verifyMcpHealth();
    if (canUseMcp) await verifyImageGeneration();
  } catch (error) {
    record("MCP smoke", "fail", error instanceof Error ? error.message : String(error));
  }

  const failed = results.filter(result => result.status === "fail");
  const skipped = results.filter(result => result.status === "skip");
  console.log();
  console.log(`Summary: ${results.length - failed.length - skipped.length} ok, ${skipped.length} skipped, ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

await main();
