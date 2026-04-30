#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { CanvasClient } from "./canvas-client.js";
import { loadSession, clearSession } from "./auth/cookie-store.js";
import { loginViaBrowser } from "./auth/browser-login.js";

// ── Config ────────────────────────────────────────────────────────────────────

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL?.trim();

if (!CANVAS_BASE_URL) {
  console.error(
    "Error: CANVAS_BASE_URL must be set in your MCP config.\n" +
      "  Example: https://myschool.instructure.com\n\n" +
      "See README.md for setup instructions."
  );
  process.exit(1);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getSession() {
  const cached = loadSession(CANVAS_BASE_URL!);
  if (cached) return cached;
  return loginViaBrowser(CANVAS_BASE_URL!);
}

async function getSessionWithClear() {
  clearSession();
  return getSession();
}

// ── Client ────────────────────────────────────────────────────────────────────

const client = new CanvasClient({
  baseUrl: CANVAS_BASE_URL,
  getSession: getSessionWithClear,
});

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "canvas_get_profile",
    description: "Get the current user's Canvas profile (name, email, login).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "canvas_list_courses",
    description: "List courses the user is enrolled in.",
    inputSchema: {
      type: "object",
      properties: {
        enrollment_state: {
          type: "string",
          enum: ["active", "completed", "all"],
          description: "Filter by enrollment state (default: active).",
        },
      },
      required: [],
    },
  },
  {
    name: "canvas_list_assignments",
    description: "List assignments for a course, ordered by due date.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number", description: "Canvas course ID." },
      },
      required: ["course_id"],
    },
  },
  {
    name: "canvas_get_assignment",
    description: "Get full details of a single assignment including its description.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
        assignment_id: { type: "number" },
      },
      required: ["course_id", "assignment_id"],
    },
  },
  {
    name: "canvas_get_assignment_attachments",
    description: "Get files attached to an assignment (worksheets, rubrics, etc.) with their IDs for downloading.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
        assignment_id: { type: "number" },
      },
      required: ["course_id", "assignment_id"],
    },
  },
  {
    name: "canvas_get_submission",
    description: "Get the current user's submission status and grade for an assignment.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
        assignment_id: { type: "number" },
      },
      required: ["course_id", "assignment_id"],
    },
  },
  {
    name: "canvas_get_grades",
    description: "Get current grades for all active courses.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "canvas_list_announcements",
    description: "List announcements for a course.",
    inputSchema: {
      type: "object",
      properties: { course_id: { type: "number" } },
      required: ["course_id"],
    },
  },
  {
    name: "canvas_list_modules",
    description: "List modules (units/weeks) in a course.",
    inputSchema: {
      type: "object",
      properties: { course_id: { type: "number" } },
      required: ["course_id"],
    },
  },
  {
    name: "canvas_list_module_items",
    description: "List items inside a specific module.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
        module_id: { type: "number" },
      },
      required: ["course_id", "module_id"],
    },
  },
  {
    name: "canvas_list_files",
    description: "List files in a course (most recently updated first).",
    inputSchema: {
      type: "object",
      properties: { course_id: { type: "number" } },
      required: ["course_id"],
    },
  },
  {
    name: "canvas_upcoming_assignments",
    description: "List upcoming assignments and events across all courses.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "canvas_download_file",
    description:
      "Download a Canvas file to your local machine by its file ID. " +
      "Use canvas_list_files or canvas_get_assignment_attachments to find file IDs. " +
      "Returns the local path the file was saved to.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "number", description: "Canvas file ID." },
        save_path: {
          type: "string",
          description:
            "Full local path to save the file (optional). Defaults to ~/canvas-downloads/<filename>.",
        },
      },
      required: ["file_id"],
    },
  },
  {
    name: "canvas_submit_text",
    description:
      "Submit an assignment as an online text entry. Use this when the assignment accepts typed responses.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
        assignment_id: { type: "number" },
        body: {
          type: "string",
          description: "The text content to submit. HTML is supported.",
        },
      },
      required: ["course_id", "assignment_id", "body"],
    },
  },
  {
    name: "canvas_submit_file",
    description:
      "Upload a local file and submit it as an assignment. " +
      "Provide the full path to a file on this machine. " +
      "Use this when the assignment accepts file uploads.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
        assignment_id: { type: "number" },
        file_path: {
          type: "string",
          description: "Full local path to the file to upload and submit.",
        },
      },
      required: ["course_id", "assignment_id", "file_path"],
    },
  },
];

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "canvas-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: unknown;

    switch (name) {
      case "canvas_get_profile":
        result = await client.getUserProfile();
        break;
      case "canvas_list_courses":
        result = await client.getCourses(
          (args?.enrollment_state as "active" | "completed" | "all") ?? "active"
        );
        break;
      case "canvas_list_assignments":
        result = await client.getAssignments(Number(args!.course_id));
        break;
      case "canvas_get_assignment":
        result = await client.getAssignment(Number(args!.course_id), Number(args!.assignment_id));
        break;
      case "canvas_get_assignment_attachments":
        result = await client.getAssignmentAttachments(Number(args!.course_id), Number(args!.assignment_id));
        break;
      case "canvas_get_submission":
        result = await client.getSubmission(Number(args!.course_id), Number(args!.assignment_id));
        break;
      case "canvas_get_grades":
        result = await client.getGrades();
        break;
      case "canvas_list_announcements":
        result = await client.getAnnouncements(Number(args!.course_id));
        break;
      case "canvas_list_modules":
        result = await client.getModules(Number(args!.course_id));
        break;
      case "canvas_list_module_items":
        result = await client.getModuleItems(Number(args!.course_id), Number(args!.module_id));
        break;
      case "canvas_list_files":
        result = await client.getFiles(Number(args!.course_id));
        break;
      case "canvas_upcoming_assignments":
        result = await client.getUpcomingAssignments();
        break;
      case "canvas_download_file":
        result = await client.downloadFile(
          Number(args!.file_id),
          args?.save_path as string | undefined
        );
        break;
      case "canvas_submit_text":
        result = await client.submitAssignmentText(
          Number(args!.course_id),
          Number(args!.assignment_id),
          String(args!.body)
        );
        break;
      case "canvas_submit_file":
        result = await client.submitAssignmentFile(
          Number(args!.course_id),
          Number(args!.assignment_id),
          String(args!.file_path)
        );
        break;
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
