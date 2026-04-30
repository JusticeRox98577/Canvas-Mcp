import { chromium } from "playwright";
import { saveSession, SessionData } from "./cookie-store.js";

export async function loginViaBrowser(baseUrl: string): Promise<SessionData> {
  const canvasHost = new URL(baseUrl).hostname;

  console.error(
    "\n[Canvas MCP] Opening browser for Canvas login...\n" +
      "  → A browser window will open. Log into Canvas as normal.\n" +
      "  → If your school uses Microsoft login, complete that too.\n" +
      "  → The window will close automatically once you are fully logged in.\n"
  );

  const browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // Wait until we're back on the Canvas domain and past any login/auth page.
  // The canvasHost check prevents false-positives during Microsoft/Google SSO
  // redirects (those external domains never match).
  await page.waitForURL(
    (url) => {
      if (url.hostname !== canvasHost) return false;
      const p = url.pathname.toLowerCase();
      return !p.includes("/login") && !p.includes("/auth") && !p.includes("/saml") && !p.includes("/sso");
    },
    { timeout: 10 * 60 * 1000 }
  );

  // Poll until both cookies are present — SSO flows can set them slightly
  // after the URL change fires.
  let sessionCookie: string | undefined;
  let csrfToken: string | undefined;
  const deadline = Date.now() + 15_000;

  while ((!sessionCookie || !csrfToken) && Date.now() < deadline) {
    const cookies = await context.cookies();
    const sc = cookies.find((c) => c.name === "canvas_session" && c.domain.includes(canvasHost));
    const ct = cookies.find((c) => c.name === "_csrf_token" && c.domain.includes(canvasHost));
    if (sc) sessionCookie = sc.value;
    // CSRF token is URL-encoded in the cookie value
    if (ct) csrfToken = decodeURIComponent(ct.value);
    if (!sessionCookie || !csrfToken) await page.waitForTimeout(500);
  }

  await browser.close();

  if (!sessionCookie) {
    throw new Error(
      "Login appeared to succeed but canvas_session cookie was not found. " +
        "Make sure you complete the login all the way to the Canvas dashboard."
    );
  }

  const session: SessionData = { sessionCookie, csrfToken: csrfToken ?? "" };
  saveSession(baseUrl, session.sessionCookie, session.csrfToken);
  console.error("[Canvas MCP] Login successful — session saved.\n");
  return session;
}
