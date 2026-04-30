#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { CanvasClient } from "./canvas-client.js";

// ── Config from environment ───────────────────────────────────────────────────

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL?.trim();
const CANVAS_SESSION_COOKIE = process.env.CANVAS_SESSION_COOKIE?.trim();

if (!CANVAS_BASE_URL || !CANVAS_SESSION_COOKIE) {
  console.error(
    "Error: CANVAS_BASE_URL and CANVAS_SESSION_COOKIE must be set.\n" +
      "  CANVAS_BASE_URL         — e.g. https://myschool.instructure.com\n" +
      "  CANVAS_SESSION_COOKIE   — the canvas_session cookie from your logged-in browser\n\n" +
      "See README.md for instructions on finding your session cookie."
  );
  process.exit(1);
}

const client = new CanvasClient({
  baseUrl: CANVAS_BASE_URL,
  sessionCookie: CANVAS_SESSION_COOKIE,
});

// ── Tool definitions ──────────────────────────────────────────────────────────

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
        course_id: {
          type: "number",
          description: "Canvas course ID (use canvas_list_courses to find it).",
        },
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
      properties: {
        course_id: { type: "number" },
      },
      required: ["course_id"],
    },
  },
  {
    name: "canvas_list_modules",
    description: "List modules (units/weeks) in a course.",
    inputSchema: {
      type: "object",
      properties: {
        course_id: { type: "number" },
      },
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
      properties: {
        course_id: { type: "number" },
      },
      required: ["course_id"],
    },
  },
  {
    name: "canvas_upcoming_assignments",
    description: "List upcoming assignments and events across all courses.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// ── MCP Server ────────────────────────────────────────────────────────────────

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
        result = await client.getAssignment(
          Number(args!.course_id),
          Number(args!.assignment_id)
        );
        break;

      case "canvas_get_submission":
        result = await client.getSubmission(
          Number(args!.course_id),
          Number(args!.assignment_id)
        );
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
        result = await client.getModuleItems(
          Number(args!.course_id),
          Number(args!.module_id)
        );
        break;

      case "canvas_list_files":
        result = await client.getFiles(Number(args!.course_id));
        break;

      case "canvas_upcoming_assignments":
        result = await client.getUpcomingAssignments();
        break;

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
