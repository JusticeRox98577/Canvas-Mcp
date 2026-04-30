export interface CanvasConfig {
  /** e.g. "https://myschool.instructure.com" — no trailing slash */
  baseUrl: string;
  /** Called to get a fresh cookie (triggers browser login if needed) */
  getSessionCookie: () => Promise<string>;
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

export class CanvasClient {
  private baseUrl: string;
  private getSessionCookie: () => Promise<string>;
  private currentCookie: string = "";

  constructor(config: CanvasConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.getSessionCookie = config.getSessionCookie;
  }

  async init(): Promise<void> {
    this.currentCookie = await this.getSessionCookie();
  }

  private makeHeaders(): Record<string, string> {
    return {
      Cookie: `canvas_session=${this.currentCookie}`,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  private async request<T>(path: string, attempt = 0): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, { headers: this.makeHeaders() });

    if (res.status === 401 && attempt === 0) {
      // Cookie expired — get a fresh one (triggers browser login) and retry once
      console.error("[Canvas MCP] Session expired, re-authenticating...");
      this.currentCookie = await this.getSessionCookie();
      return this.request<T>(path, 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Canvas API ${res.status}: ${body.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  /** Follows Canvas Link header pagination and returns all items. */
  private async requestAll<T>(path: string, attempt = 0): Promise<T[]> {
    const sep = path.includes("?") ? "&" : "?";
    const firstRes = await fetch(
      `${this.baseUrl}/api/v1${path}${sep}per_page=100`,
      { headers: this.makeHeaders() }
    );

    if (firstRes.status === 401 && attempt === 0) {
      console.error("[Canvas MCP] Session expired, re-authenticating...");
      this.currentCookie = await this.getSessionCookie();
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
      grades: {
        current_grade: string | null;
        current_score: number | null;
        final_grade: string | null;
        final_score: number | null;
      };
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
    return this.requestAll<Announcement>(
      `/courses/${courseId}/discussion_topics?only_announcements=true`
    );
  }

  async getModules(courseId: number): Promise<Module[]> {
    return this.requestAll<Module>(`/courses/${courseId}/modules`);
  }

  async getModuleItems(courseId: number, moduleId: number): Promise<ModuleItem[]> {
    return this.requestAll<ModuleItem>(`/courses/${courseId}/modules/${moduleId}/items`);
  }

  async getFiles(courseId: number): Promise<CanvasFile[]> {
    return this.requestAll<CanvasFile>(
      `/courses/${courseId}/files?sort=updated_at&order=desc`
    );
  }

  async getUserProfile(): Promise<{ id: number; name: string; login_id: string; email: string }> {
    return this.request(`/users/self/profile`);
  }

  async getUpcomingAssignments(): Promise<Assignment[]> {
    return this.requestAll<Assignment>(`/users/self/upcoming_events`);
  }
}
