import { afterEach, describe, expect, it, vi } from "vitest";

import { getNotificationStatus, sendUserEmailNotification } from "./notifications";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.SMTP_FROM;
});

describe("email notifications", () => {
  it("treats Resend API credentials as a configured email channel", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "ArtX <noreply@artxsd.com>";

    expect(getNotificationStatus()).toMatchObject({
      emailConfigured: true,
      emailProvider: "resend",
      resendConfigured: true,
      smtpConfigured: false,
    });
  });

  it("sends user email through Resend before falling back to SMTP", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "ArtX <noreply@artxsd.com>";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await sendUserEmailNotification({
      to: "owner@example.com",
      subject: "验证码",
      text: "验证码：123456",
    });

    expect(result).toMatchObject({ sent: true, provider: "resend" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
      }),
    );
  });
});
