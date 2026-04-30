import fs from "fs";
import os from "os";
import path from "path";

interface StoredSession {
  baseUrl: string;
  sessionCookie: string;
  csrfToken: string;
  savedAt: number;
}

const STORE_DIR = path.join(os.homedir(), ".canvas-mcp");
const STORE_FILE = path.join(STORE_DIR, "session.json");

// Re-login proactively after 8 hours
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

export interface SessionData {
  sessionCookie: string;
  csrfToken: string;
}

export function loadSession(baseUrl: string): SessionData | null {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const data: StoredSession = JSON.parse(raw);
    if (data.baseUrl !== baseUrl) return null;
    if (Date.now() - data.savedAt > MAX_AGE_MS) return null;
    return { sessionCookie: data.sessionCookie, csrfToken: data.csrfToken };
  } catch {
    return null;
  }
}

export function saveSession(baseUrl: string, sessionCookie: string, csrfToken: string): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const data: StoredSession = { baseUrl, sessionCookie, csrfToken, savedAt: Date.now() };
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function clearSession(): void {
  try {
    fs.unlinkSync(STORE_FILE);
  } catch {
    // already gone
  }
}
