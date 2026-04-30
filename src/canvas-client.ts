import fs from "fs";
import os from "os";
import path from "path";

export interface CanvasConfig {
  baseUrl: string;
  getSession: () => Promise<{ sessionCookie: string; csrfToken: string }>;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
  enrollment_state: string;
  workflow_state: string;
}

export interface Assignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  submission_types: string[];
  html_url: string;
  course_id: number;
}

export interface Submission {
  id: number;
  assignment_id: number;
  user_id: number;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  workflow_state: string;
  late: boolean;
  missing: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  author: { display_name: string } | null;
}

export interface Module {
  id: number;
  name: string;
  position: number;
  state: string;
  items_count: number;
}

export interface ModuleItem {
  id: number;
  title: string;
  type: string;
  content_id: number | null;
  html_url: string;
  url: string | null;
  completion_requirement: { type: string; completed: boolean } | null;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
  updated_at: string;
}

export interface GradeInfo {
  course_id: number;
  course_name: string;
  current_grade: string | null;
  current_score: number | null;
  final_grade: string | null;
  final_score: number | null;
}

const DOWNLOAD_DIR = path.join(os.homedir(), "canvas-downloads");

export class CanvasClient {
  private baseUrl: string;
  private getSession: CanvasConfig["getSession"];
  private sessionCookie = "";
  private csrfToken = "";

  constructor(config: CanvasConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.getSession = config.getSession;
  }

  private async ensureSession(): Promise<void> {
    if (!this.sessionCookie) {
      const s = await this.getSession();
      this.sessionCookie = s.sessionCookie;
      this.csrfToken = s.csrfToken;
    }
  }

  private makeHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Cookie: `canvas_session=${this.sessionCookie}`,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": this.csrfToken,
      ...extra,
    };
  }

  private async request<T>(path: string, attempt = 0): Promise<T> {
    await this.ensureSession();
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, { headers: this.makeHeaders() });
    if (res.status === 401 && attempt === 0) {
      console.error("[Canvas MCP] Session expired, re-authenticating...");
      const s = await this.getSession();
      this.sessionCookie = s.sessionCookie;
      this.csrfToken = s.csrfToken;
      return this.request<T>(path, 1);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Canvas API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown, attempt = 0): Promise<T> {
    await this.ensureSession();
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method: "POST",
      headers: this.makeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0) {
      console.error("[Canvas MCP] Session expired, re-authenticating...");
      const s = await this.getSession();
      this.sessionCookie = s.sessionCookie;
      this.csrfToken = s.csrfToken;
      return this.post<T>(path, body, 1);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Canvas API ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  private async requestAll<T>(path: string, attempt = 0): Promise<T[]> {
    await this.ensureSession();
    const sep = path.includes("?") ? "&" : "?";
    const firstRes = await fetch(`${this.baseUrl}/api/v1${path}${sep}per_page=100`, {
      headers: this.makeHeaders(),
    });
    if (firstRes.status === 401 && attempt === 0) {
      console.error("[Canvas MCP] Session expired, re-authenticating...");
      const s = await this.getSession();
      this.sessionCookie = s.sessionCookie;
      this.csrfToken = s.csrfToken;
      return this.requestAll<T>(path, 1);
    }
    if (!firstRes.ok) {
      const body = await firstRes.text().catch(() => "");
      throw new Error(`Canvas API ${firstRes.status}: ${body.slice(0, 300)}`);
    }
    const items: T[] = await firstRes.json();
    let nextUrl = this.parseNextLink(firstRes.headers.get("Link") ?? "");
    while (nextUrl) {
      const page = await fetch(nextUrl, { headers: this.makeHeaders() });
      if (!page.ok) break;
      items.push(...(await page.json() as T[]));
      nextUrl = this.parseNextLink(page.headers.get("Link") ?? "");
    }
    return items;
  }

  private parseNextLink(linkHeader: string): string | null {
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }

  // ── File download ─────────────────────────────────────────────────────────

  async downloadFile(fileId: number, savePath?: string): Promise<{ saved_to: string; size: number; display_name: string }> {
    await this.ensureSession();

    // Get file metadata to find the authenticated download URL and filename
    const info = await this.request<{ url: string; display_name: string; filename: string; size: number }>(
      `/files/${fileId}`
    );

    const dest = savePath ?? path.join(DOWNLOAD_DIR, info.filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    // Canvas file URLs redirect to S3; follow with our auth headers for the first hop
    const res = await fetch(info.url, { headers: this.makeHeaders(), redirect: "follow" });
    if (!res.ok) throw new Error(`Failed to download file: HTTP ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buffer);

    return { saved_to: dest, size: buffer.length, display_name: info.display_name };
  }

  async getAssignmentAttachments(courseId: number, assignmentId: number): Promise<Array<{ id: number; display_name: string; content_type: string; size: number }>> {
    const assignment = await this.request<{
      description: string | null;
      attachments?: Array<{ id: number; display_name: string; content_type: string; size: number }>;
    }>(`/courses/${courseId}/assignments/${assignmentId}?include[]=attachments`);
    return assignment.attachments ?? [];
  }

  // ── Assignment submission ─────────────────────────────────────────────────

  async submitAssignmentText(courseId: number, assignmentId: number, body: string): Promise<Submission> {
    return this.post<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      { submission: { submission_type: "online_text_entry", body } }
    );
  }

  async submitAssignmentFile(courseId: number, assignmentId: number, filePath: string): Promise<Submission> {
    await this.ensureSession();

    const fileName = path.basename(filePath);
    const fileBytes = fs.readFileSync(filePath);
    const contentType = guessContentType(fileName);

    // Step 1 — request an upload slot from Canvas
    const uploadMeta = await this.post<{
      upload_url: string;
      upload_params: Record<string, string>;
      file_param?: string;
    }>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
      { name: fileName, size: fileBytes.length, content_type: contentType, on_duplicate: "overwrite" }
    );

    // Step 2 — upload the file to the provided URL (S3 or Canvas local storage).
    // Do NOT include Canvas auth headers here — S3 will reject them.
    const form = new FormData();
    for (const [k, v] of Object.entries(uploadMeta.upload_params)) {
      form.append(k, v);
    }
    form.append(
      uploadMeta.file_param ?? "file",
      new Blob([fileBytes], { type: contentType }),
      fileName
    );

    const uploadRes = await fetch(uploadMeta.upload_url, {
      method: "POST",
      body: form,
      redirect: "manual", // handle redirect manually so we can re-attach Canvas auth
    });

    // After S3 upload, Canvas redirects back to itself to confirm the file.
    // Follow that redirect with our Canvas auth headers.
    let fileId: number;
    if (uploadRes.status >= 300 && uploadRes.status < 400) {
      const confirmUrl = uploadRes.headers.get("location");
      if (!confirmUrl) throw new Error("Upload redirect had no location header");
      const confirmRes = await fetch(confirmUrl, { headers: this.makeHeaders() });
      if (!confirmRes.ok) throw new Error(`File confirm failed: HTTP ${confirmRes.status}`);
      const confirmed = await confirmRes.json() as { id: number };
      fileId = confirmed.id;
    } else if (uploadRes.ok) {
      const data = await uploadRes.json() as { id: number };
      fileId = data.id;
    } else {
      const text = await uploadRes.text().catch(() => "");
      throw new Error(`File upload failed: HTTP ${uploadRes.status} — ${text.slice(0, 200)}`);
    }

    // Step 3 — submit the assignment with the uploaded file ID
    return this.post<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      { submission: { submission_type: "online_upload", file_ids: [fileId] } }
    );
  }

  // ── Existing methods ──────────────────────────────────────────────────────

  async getCourses(enrollmentState: "active" | "completed" | "all" = "active"): Promise<Course[]> {
    const state = enrollmentState === "all" ? "" : `&enrollment_state=${enrollmentState}`;
    return this.requestAll<Course>(`/courses?${state}`);
  }

  async getAssignments(courseId: number): Promise<Assignment[]> {
    return this.requestAll<Assignment>(
      `/courses/${courseId}/assignments?order_by=due_at&include[]=description`
    );
  }

  async getAssignment(courseId: number, assignmentId: number): Promise<Assignment> {
    return this.request<Assignment>(
      `/courses/${courseId}/assignments/${assignmentId}?include[]=description`
    );
  }

  async getSubmission(courseId: number, assignmentId: number): Promise<Submission> {
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self`
    );
  }

  async getGrades(): Promise<GradeInfo[]> {
    const enrollments = await this.requestAll<{
      course_id: number;
      grades: { current_grade: string | null; current_score: number | null; final_grade: string | null; final_score: number | null };
    }>(`/users/self/enrollments?type[]=StudentEnrollment&state[]=active`);
    const courses = await this.getCourses("active");
    const courseMap = new Map(courses.map((c) => [c.id, c.name]));
    return enrollments.map((e) => ({
      course_id: e.course_id,
      course_name: courseMap.get(e.course_id) ?? `Course ${e.course_id}`,
      current_grade: e.grades?.current_grade ?? null,
      current_score: e.grades?.current_score ?? null,
      final_grade: e.grades?.final_grade ?? null,
      final_score: e.grades?.final_score ?? null,
    }));
  }

  async getAnnouncements(courseId: number): Promise<Announcement[]> {
    return this.requestAll<Announcement>(`/courses/${courseId}/discussion_topics?only_announcements=true`);
  }

  async getModules(courseId: number): Promise<Module[]> {
    return this.requestAll<Module>(`/courses/${courseId}/modules`);
  }

  async getModuleItems(courseId: number, moduleId: number): Promise<ModuleItem[]> {
    return this.requestAll<ModuleItem>(`/courses/${courseId}/modules/${moduleId}/items`);
  }

  async getFiles(courseId: number): Promise<CanvasFile[]> {
    return this.requestAll<CanvasFile>(`/courses/${courseId}/files?sort=updated_at&order=desc`);
  }

  async getUserProfile(): Promise<{ id: number; name: string; login_id: string; email: string }> {
    return this.request(`/users/self/profile`);
  }

  async getUpcomingAssignments(): Promise<Assignment[]> {
    return this.requestAll<Assignment>(`/users/self/upcoming_events`);
  }
}

function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".zip": "application/zip",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".html": "text/html",
    ".css": "text/css",
    ".json": "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}
