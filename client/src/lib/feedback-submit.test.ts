import { afterEach, describe, expect, it, vi } from "vitest";

import { submitUserFeedback } from "./feedback-submit";

describe("submitUserFeedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts feedback content and image attachments with the auth token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feedback: { id: "fb_test" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitUserFeedback({
      token: "session-token",
      content: "界面出现问题",
      module: "帮助弹窗",
      attachments: [
        { name: "screen.png", src: "data:image/png;base64,abc" },
      ],
    });

    expect(result).toEqual({ feedback: { id: "fb_test" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      },
      body: JSON.stringify({
        content: "界面出现问题",
        module: "帮助弹窗",
        attachments: [
          { name: "screen.png", src: "data:image/png;base64,abc" },
        ],
      }),
    });
  });
});
