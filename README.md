# Canvas MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI assistants (Claude, etc.) read your Canvas LMS data — **no API token, no manual cookie copying, no admin approval needed**.

When your district blocks personal access token creation, this server logs into Canvas automatically using a real browser window. You log in normally (any method: username/password, Google SSO, Microsoft SSO, MFA), and the session is captured and cached silently. No DevTools, no copying anything.

---

## How It Works

1. On first launch, a browser window opens pointing to your Canvas login page.
2. You log in exactly as you normally would (supports all SSO and MFA methods).
3. Once logged in, the browser closes automatically and your session is saved locally.
4. All future launches use the saved session — no browser window, fully silent.
5. When your session eventually expires, the browser reopens automatically so you can log in again.

---

## Prerequisites

- [Node.js 18 or later](https://nodejs.org/) — works on Mac and Windows
- Claude Desktop (or any MCP-compatible client)

---

## Setup (3 steps)

### Step 1 — Install

Open a terminal (Mac: Terminal / Windows: Command Prompt or PowerShell):

```bash
git clone https://github.com/justicerox98577/canvas-mcp.git
cd canvas-mcp
npm install
```

### Step 2 — Install the browser

This only needs to be done once. It downloads a local Chromium browser (~150 MB) used for automatic login:

```bash
npm run install-browser
```

### Step 3 — Configure Claude Desktop

Open the Claude Desktop config file and add the `canvas` server block.

**Mac** — file location: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_BASE_URL": "https://myschool.instructure.com"
      }
    }
  }
}
```

**Windows** — file location: `%LOCALAPPDATA%\Claude\claude_desktop_config.json`

The config file lives in **Local** (`AppData\Local`), not Roaming. Run these commands in **PowerShell** to create it:

```powershell
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\Claude"
New-Item -ItemType File -Force -Path "$env:LOCALAPPDATA\Claude\claude_desktop_config.json"
```

Then open the file in Notepad:

```powershell
notepad "$env:LOCALAPPDATA\Claude\claude_desktop_config.json"
```

Paste this content (replace the path and URL):

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\canvas-mcp\\dist\\index.js"],
      "env": {
        "CANVAS_BASE_URL": "https://myschool.instructure.com"
      }
    }
  }
}
```

To find your exact path, run this in PowerShell — it prints the full path to paste into the config:

```powershell
(Resolve-Path ".\dist\index.js").Path -replace '\\', '\\'
```

(Run that from inside the `canvas-mcp` folder.)

Replace:
- The `args` path with the output of the command above
- `https://myschool.instructure.com` with your actual Canvas URL

Then **restart Claude Desktop**. The first time it loads, a browser window will open — log in and it will close on its own.

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
What files are available in course 12345?
```

---

## Troubleshooting

**Browser window doesn't open / closes immediately** — Make sure you ran `npm run install-browser` first.

**Login window opens but closes before I can finish MFA** — The window allows up to 10 minutes. If your MFA takes longer than that, open an issue.

**"CANVAS_BASE_URL must be set"** — The env block is missing from your Claude Desktop config. Check the setup above.

**"No Claude folder in AppData"** — The config goes in `AppData\Local\Claude\`, not `AppData\Roaming\Claude\`. Run the PowerShell commands in Step 3 above to create the folder and file in the right place.

**Canvas tools don't appear in Claude** — Restart Claude Desktop after editing the config file.

**Windows path errors** — Use double backslashes: `C:\\Users\\Name\\canvas-mcp\\dist\\index.js`. Use the PowerShell `Resolve-Path` command in Step 3 to get the correct path automatically.

---

## Privacy

- Your Canvas session is saved to `~/.canvas-mcp/session.json` on your own machine only.
- No credentials or tokens are ever sent to any third-party service.
- Data flows only between your machine and your school's Canvas server.
