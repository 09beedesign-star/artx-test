import { chromium } from "playwright";

const targetUrl = process.env.ARTX_VERIFY_URL || "https://backstage.artxsd.com/";
const waitMs = Number.parseInt(process.env.ARTX_VERIFY_WAIT_MS || "3000", 10);

const fatalErrors = [];
const consoleErrors = [];
let browser;

try {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Executable doesn't exist|browserType.launch/.test(message)) {
      throw error;
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on("pageerror", error => {
    fatalErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", message => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const response = await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(Number.isFinite(waitMs) ? waitMs : 3000);

  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const status = response?.status() || 0;
  const hasReact185 = /Minified React error #185|Maximum update depth exceeded|setNodes/.test(bodyText);

  if (status < 200 || status >= 400) {
    fatalErrors.push(`http status: ${status}`);
  }
  if (hasReact185) {
    fatalErrors.push("React #185 / maximum update depth error text was found on the page");
  }

  if (fatalErrors.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          url: targetUrl,
          status,
          bodyStart: bodyText.slice(0, 240),
          fatalErrors,
          consoleErrors: consoleErrors.slice(0, 10),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify(
        {
          ok: true,
          url: targetUrl,
          status,
          bodyStart: bodyText.slice(0, 240),
          consoleErrorCount: consoleErrors.length,
        },
        null,
        2
      )
    );
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        url: targetUrl,
        error: error instanceof Error ? error.message : String(error),
        hint:
          error instanceof Error && /Executable doesn't exist|browserType.launch/.test(error.message)
            ? "Run `pnpm exec playwright install chromium` once on this machine, then retry `pnpm verify:live-page`."
            : undefined,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
