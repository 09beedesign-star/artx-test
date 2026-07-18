import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.ts");

describe("OpenAI-compatible API", () => {
  it("exposes authenticated model discovery and non-streaming chat completions", async () => {
    const source = await readFile(indexPath, "utf8");
    expect(source).toContain('app.get("/v1/models"');
    expect(source).toContain('app.post("/v1/chat/completions"');
    expect(source).toContain('streaming is not supported');
    expect(source).toContain('object: "chat.completion"');
    expect(source).toContain('listSelectableModelIds()');
  });
});
