import { chromium } from "playwright";
import { saveCookie } from "./cookie-store.js";

/**
 * Opens a visible Chromium browser window pointed at the Canvas login page.
 * Waits for the user to finish logging in (any method: native, Google SSO,
 * Microsoft SSO, MFA, etc.), then automatically extracts the canvas_session
 * cookie, saves it to disk, and closes the browser.
 *
 * The user never has to touch DevTools or copy anything manually.
 */
export async function loginViaBrowser(baseUrl: string): Promise<string> {
  console.error(
    "\n[Canvas MCP] Opening browser for Canvas login...\n" +
      "  → A browser window will open. Log in normally.\n" +
      "  → The window will close automatically once you are logged in.\n"
  );

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to Canvas. Whatever login flow the district uses (native,
  // Google, Microsoft, MFA) will appear in the visible browser window.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // Wait until the URL no longer contains "/login" — that means the user
  // has been authenticated and redirected to the dashboard or similar.
  // Allow up to 10 minutes for slow SSO / MFA flows.
  await page.waitForURL(
    (url) => {
      const p = url.pathname.toLowerCase();
      return !p.includes("/login") && !p.includes("/auth");
    },
    { timeout: 10 * 60 * 1000 }
  );

  // Give Canvas a moment to set all cookies after the final redirect
  await page.waitForTimeout(1500);

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "canvas_session");

  await browser.close();

  if (!sessionCookie) {
    throw new Error(
      "Login appeared to succeed but canvas_session cookie was not found. " +
        "Try logging in again."
    );
  }

  saveCookie(baseUrl, sessionCookie.value);
  console.error("[Canvas MCP] Login successful — session saved.\n");
  return sessionCookie.value;
}
