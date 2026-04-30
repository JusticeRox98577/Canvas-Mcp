import fs from "fs";
import os from "os";
import path from "path";

interface StoredSession {
  baseUrl: string;
  cookie: string;
  savedAt: number;
}

// Store in ~/.canvas-mcp/session.json — works on Mac, Windows, and Linux
const STORE_DIR = path.join(os.homedir(), ".canvas-mcp");
const STORE_FILE = path.join(STORE_DIR, "session.json");

// Treat cookies older than 8 hours as stale and re-login proactively
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function loadCookie(baseUrl: string): string | null {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const data: StoredSession = JSON.parse(raw);
    if (data.baseUrl !== baseUrl) return null;
    if (Date.now() - data.savedAt > MAX_AGE_MS) return null;
    return data.cookie;
  } catch {
    return null;
  }
}

export function saveCookie(baseUrl: string, cookie: string): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const data: StoredSession = { baseUrl, cookie, savedAt: Date.now() };
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function clearCookie(): void {
  try {
    fs.unlinkSync(STORE_FILE);
  } catch {
    // already gone
  }
}
