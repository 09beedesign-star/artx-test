import { describe, expect, it } from "vitest";

import { resolveAdminUploadUrl } from "./admin-upload-url";

describe("resolveAdminUploadUrl", () => {
  it("resolves backend upload paths against the configured API base URL", () => {
    expect(
      resolveAdminUploadUrl(
        "/uploads/feedback/bob/fb_1001/payment-screen.png",
        "https://backstage.artxsd.com/",
      ),
    ).toBe("https://backstage.artxsd.com/uploads/feedback/bob/fb_1001/payment-screen.png");
  });

  it("keeps absolute, data, and blob image sources unchanged", () => {
    expect(resolveAdminUploadUrl("https://cdn.example.com/a.png", "https://backstage.artxsd.com")).toBe("https://cdn.example.com/a.png");
    expect(resolveAdminUploadUrl("data:image/png;base64,abc", "https://backstage.artxsd.com")).toBe("data:image/png;base64,abc");
    expect(resolveAdminUploadUrl("blob:https://example.com/123", "https://backstage.artxsd.com")).toBe("blob:https://example.com/123");
  });
});
