import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const dataDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  delete process.env.ARTX_DATA_DIR;
  await Promise.all(dataDirs.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("image provider failure log", () => {
  it("exports safe JSONL records without prompts or credentials", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-image-failure-log-"));
    dataDirs.push(dataDir);
    process.env.ARTX_DATA_DIR = dataDir;
    const log = await import("./image-provider-failure-log");

    await log.recordImageProviderFailure({
      requestId: "img_test",
      operation: "generate",
      model: "og-image2-medium",
      host: "provider.example",
      path: "/v1/images/generations",
      status: 502,
      kind: "http-error",
      error: "openai_error: bad_response_status_code",
    });

    const exported = await log.exportImageProviderFailureLog();
    const entry = JSON.parse(exported.trim());
    expect(entry).toMatchObject({ requestId: "img_test", model: "og-image2-medium", status: 502 });
    expect(exported).not.toContain("Bearer");
    expect(exported).not.toContain("prompt");
    expect((await readFile(path.join(dataDir, "image-provider-failures.jsonl"), "utf8")).trim()).toBe(exported.trim());
  });
});
