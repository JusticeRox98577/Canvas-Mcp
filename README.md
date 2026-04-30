# Canvas MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI assistants (Claude, etc.) read your Canvas LMS data — **without needing to generate an API access token**.

Many school districts block students and teachers from creating personal access tokens in Canvas (User Settings → Access Tokens). This server uses your **browser session cookie** instead, which is always available as long as you are logged into Canvas normally.

---

## How It Works

When you log into Canvas in a browser, Canvas creates a session cookie called `canvas_session`. The Canvas REST API accepts this same cookie for authentication — it is identical to what the web app uses. This server reads that cookie from your environment and attaches it to every API request.

No token generation. No admin approval. No extra permissions.

---

## Prerequisites

- [Node.js 18 or later](https://nodejs.org/) (works on Mac and Windows)
- A Canvas account you can log into in a browser
- Claude Desktop (or any MCP-compatible client)

---

## Step 1 — Get Your Session Cookie

You need to copy the `canvas_session` cookie from your browser **while you are logged into Canvas**.

### Chrome / Edge (Mac and Windows)

1. Go to your Canvas URL (e.g. `https://myschool.instructure.com`) and log in.
2. Press **F12** to open DevTools (or right-click → Inspect).
3. Click the **Application** tab.
4. In the left sidebar expand **Cookies** and click your Canvas URL.
5. Find the row named **`canvas_session`**.
6. Double-click the **Value** column and copy the entire value.

### Firefox (Mac and Windows)

1. Log into Canvas.
2. Press **F12** → click **Storage** tab.
3. Expand **Cookies** → click your Canvas URL.
4. Find **`canvas_session`** and copy its value.

### Safari (Mac)

1. Enable the Develop menu: Safari → Settings → Advanced → check "Show Develop menu".
2. Log into Canvas.
3. Develop → Show Web Inspector → Storage → Cookies → your Canvas URL.
4. Copy the **`canvas_session`** value.

> **Note:** Session cookies expire when you log out or after a period of inactivity. If the server starts returning "401 Unauthorized", just log into Canvas again and copy a fresh cookie.

---

## Step 2 — Install and Build

Open a terminal (Mac: Terminal / Windows: Command Prompt or PowerShell) and run:

```bash
# 1. Clone this repo
git clone https://github.com/justicerox98577/canvas-mcp.git
cd canvas-mcp

# 2. Install dependencies
npm install

# 3. Build
npm run build
```

---

## Step 3 — Configure Claude Desktop

Claude Desktop reads MCP server configuration from a JSON file.

### Mac

File location: `~/Library/Application Support/Claude/claude_desktop_config.json`

Open it with any text editor (or create it if it doesn't exist) and add:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_BASE_URL": "https://myschool.instructure.com",
        "CANVAS_SESSION_COOKIE": "PASTE_YOUR_canvas_session_VALUE_HERE"
      }
    }
  }
}
```

Replace:
- `/Users/YOUR_USERNAME/canvas-mcp` with the actual path where you cloned this repo
- `https://myschool.instructure.com` with your school's Canvas URL
- `PASTE_YOUR_canvas_session_VALUE_HERE` with the cookie value from Step 1

### Windows

File location: `%APPDATA%\Claude\claude_desktop_config.json`

You can open it quickly by pressing **Win + R**, pasting `%APPDATA%\Claude\claude_desktop_config.json`, and pressing Enter.

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\canvas-mcp\\dist\\index.js"],
      "env": {
        "CANVAS_BASE_URL": "https://myschool.instructure.com",
        "CANVAS_SESSION_COOKIE": "PASTE_YOUR_canvas_session_VALUE_HERE"
      }
    }
  }
}
```

Replace the path, URL, and cookie value as above. Note that Windows paths use double backslashes (`\\`) inside JSON.

---

## Step 4 — Restart Claude Desktop

Quit and reopen Claude Desktop. The Canvas tools will now appear automatically.

---

## Available Tools

| Tool | What it does |
|---|---|
| `canvas_get_profile` | Your name, email, and login |
| `canvas_list_courses` | All enrolled courses (active / completed / all) |
| `canvas_list_assignments` | Assignments for a course, ordered by due date |
| `canvas_get_assignment` | Full details + description of one assignment |
| `canvas_get_submission` | Your submission status and grade for an assignment |
| `canvas_get_grades` | Current grades across all active courses |
| `canvas_list_announcements` | Announcements in a course |
| `canvas_list_modules` | Modules / units in a course |
| `canvas_list_module_items` | Items inside a module |
| `canvas_list_files` | Files in a course |
| `canvas_upcoming_assignments` | Upcoming assignments across all courses |

---

## Example Prompts

```
What assignments do I have due this week?
Show me my grades for all my current courses.
Summarize the announcements in my Biology course.
What are the files available in course 12345?
```

---

## Troubleshooting

**"401 Unauthorized"** — Your session cookie expired. Log back into Canvas, copy a fresh `canvas_session` value, and update `claude_desktop_config.json`.

**"CANVAS_BASE_URL and CANVAS_SESSION_COOKIE must be set"** — The environment variables are missing from `claude_desktop_config.json`. Double-check the `env` block.

**Claude doesn't show Canvas tools** — Make sure you restarted Claude Desktop after editing the config file.

**Windows path errors** — Use double backslashes in the path: `C:\\Users\\Name\\canvas-mcp\\dist\\index.js`.

---

## Privacy

Your session cookie is stored only in your local Claude Desktop config file and is never sent anywhere except your own school's Canvas server. No third-party services are involved.
