import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PicWish background template integration", () => {
  it("keeps provider credentials on the server and requests the configured regional host", () => {
    const source = readFileSync(resolve(__dirname, "picwish-background-templates.ts"), "utf8");
    expect(source).toContain('process.env.PICWISH_API_KEY');
    expect(source).toContain('/app/picwish/third-party/background-template');
    expect(source).toContain('"X-API-KEY": apiKey');
    expect(source).toContain('process.env.PICWISH_BASE_URL');
    expect(source).toContain('"https://techsz.aoscdn.com"');
  });

  it("exposes a template route and passes the chosen scene type to r-background", () => {
    const indexSource = readFileSync(resolve(__dirname, "index.ts"), "utf8");
    const generationSource = readFileSync(resolve(__dirname, "image-generation.ts"), "utf8");
    expect(indexSource).toContain('app.get("/api/images/background-templates"');
    expect(generationSource).toContain('...(input.sceneType ? { scene_type: input.sceneType } : { prompt })');
  });
});
