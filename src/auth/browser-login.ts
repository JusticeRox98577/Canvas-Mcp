import { chromium } from "playwright";
import { saveCookie } from "./cookie-store.js";

/**
 * Opens a visible Chromium browser window pointed at the Canvas login page.
 * Waits for the user to finish logging in — including Microsoft SSO, Google
 * SSO, MFA, or any other redirect-based flow — then extracts the
 * canvas_session cookie automatically and closes the browser.
 *
 * The detection logic waits until:
 *   1. The URL is back on the Canvas domain (not Microsoft/Google/etc.)
 *   2. The path is no longer a login or auth page
 *   3. The canvas_session cookie is actually present
 * This prevents false-positives during multi-step SSO redirects.
 */
export async function loginViaBrowser(baseUrl: string): Promise<string> {
  const canvasHost = new URL(baseUrl).hostname;

  console.error(
    "\n[Canvas MCP] Opening browser for Canvas login...\n" +
      "  → A browser window will open. Log into Canvas as normal.\n" +
      "  → If your school uses Microsoft login, complete that too.\n" +
      "  → The window will close automatically once you are fully logged in.\n"
  );

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // Step 1: Wait until the browser is back on the Canvas domain AND past the
  // login/auth pages. This correctly handles Microsoft/Google SSO redirects
  // because those external domains never satisfy the canvasHost check.
  await page.waitForURL(
    (url) => {
      if (url.hostname !== canvasHost) return false;
      const p = url.pathname.toLowerCase();
      return (
        !p.includes("/login") &&
        !p.includes("/auth") &&
        !p.includes("/saml") &&
        !p.includes("/sso")
      );
    },
    { timeout: 10 * 60 * 1000 }
  );

  // Step 2: Poll until canvas_session actually appears in the cookie jar.
  // After an SSO redirect, Canvas sometimes sets the cookie via a server-side
  // response that arrives slightly after the URL change fires.
  let sessionCookie: { name: string; value: string } | undefined;
  const deadline = Date.now() + 15_000;
  while (!sessionCookie && Date.now() < deadline) {
    const cookies = await context.cookies();
    sessionCookie = cookies.find(
      (c) => c.name === "canvas_session" && c.domain.includes(canvasHost)
    );
    if (!sessionCookie) await page.waitForTimeout(500);
  }

  await browser.close();

  if (!sessionCookie) {
    throw new Error(
      "Login appeared to succeed but the canvas_session cookie was not found. " +
        "Make sure you completed the login all the way to the Canvas dashboard, then try again."
    );
  }

  saveCookie(baseUrl, sessionCookie.value);
  console.error("[Canvas MCP] Login successful — session saved.\n");
  return sessionCookie.value;
}
