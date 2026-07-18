#!/usr/bin/env node

const backendUrl = (process.env.BACKEND_URL || "https://backstage.artxsd.com").replace(/\/+$/, "");
const apiKey = process.env.ARTX_MCP_API_KEY || process.env.ARTX_API_KEY || "";
const runImage = process.env.RUN_IMAGE === "1";
const prompt = process.env.MCP_IMAGE_PROMPT || "A small white rabbit sticker, clean background, commercial product icon style.";
const model = process.env.MCP_IMAGE_MODEL || "og-image2-low";
const ratio = process.env.MCP_IMAGE_RATIO || "1:1";

const results = [];

function record(name, status, details = "") {
  results.push({ name, status, details });
  const suffix = details ? ` - ${details}` : "";
  console.log(`${status === "ok" ? "OK" : status === "skip" ? "SKIP" : "FAIL"} ${name}${suffix}`);
}

function requireOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function mcpRequest(method, params = undefined) {
  requireOk(apiKey, "set ARTX_MCP_API_KEY to test MCP endpoints");
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
  const body = JSON.parse(text || "{}");
  requireOk(response.ok, `${method} failed: ${response.status} ${text}`);
  requireOk(!body.error, `${method} returned MCP error: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function verifyPublicHealth() {
  const response = await fetch(`${backendUrl}/api/health`);
  const body = await response.json().catch(() => null);
  requireOk(response.ok && body?.ok === true, `backend health failed: ${response.status}`);
  record("backend /api/health", "ok");
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
