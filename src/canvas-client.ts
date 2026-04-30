/**
 * Canvas API client that authenticates using browser session cookies.
 *
 * Districts often block personal access token creation (User Settings → Access Tokens),
 * but Canvas's REST API also accepts the same session cookies your browser uses when
 * you're logged in normally. This client uses those cookies instead.
 *
 * How to get your session cookie:
 *   1. Log into Canvas in Chrome/Firefox/Edge.
 *   2. Open DevTools → Application (Chrome) or Storage (Firefox) → Cookies.
 *   3. Find the cookie named `canvas_session` for your Canvas domain.
 *   4. Copy its value and set it as CANVAS_SESSION_COOKIE in your environment.
 */

export interface CanvasConfig {
  /** e.g. "https://myschool.instructure.com" — no trailing slash */
  baseUrl: string;
  /** Value of the `canvas_session` cookie from your logged-in browser */
  sessionCookie: string;
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
  private headers: Record<string, string>;

  constructor(config: CanvasConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      Cookie: `canvas_session=${config.sessionCookie}`,
      Accept: "application/json",
      // Canvas requires this header when using cookie auth to prevent CSRF
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...(options.headers as Record<string, string> | undefined) },
    });

    if (res.status === 401) {
      throw new Error(
        "Canvas returned 401 Unauthorized. Your session cookie may have expired — log back into Canvas and copy a fresh cookie value."
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Canvas API error ${res.status}: ${body.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  /** Follow Canvas pagination and collect all pages. */
  private async requestAll<T>(path: string): Promise<T[]> {
    const separator = path.includes("?") ? "&" : "?";
    const firstPage = await fetch(`${this.baseUrl}/api/v1${path}${separator}per_page=100`, {
      headers: this.headers,
    });

    if (firstPage.status === 401) {
      throw new Error(
        "Canvas returned 401 Unauthorized. Your session cookie may have expired."
      );
    }
    if (!firstPage.ok) {
      const body = await firstPage.text().catch(() => "");
      throw new Error(`Canvas API error ${firstPage.status}: ${body.slice(0, 300)}`);
    }

    const items: T[] = await firstPage.json();
    const linkHeader = firstPage.headers.get("Link") ?? "";

    let nextUrl = this.parseNextLink(linkHeader);
    while (nextUrl) {
      const page = await fetch(nextUrl, { headers: this.headers });
      if (!page.ok) break;
      const pageItems: T[] = await page.json();
      items.push(...pageItems);
      nextUrl = this.parseNextLink(page.headers.get("Link") ?? "");
    }

    return items;
  }

  private parseNextLink(linkHeader: string): string | null {
    // Link: <url>; rel="next", <url>; rel="last"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }

  async getCourses(enrollmentState: "active" | "completed" | "all" = "active"): Promise<Course[]> {
    const state = enrollmentState === "all" ? "" : `&enrollment_state=${enrollmentState}`;
    return this.requestAll<Course>(`/courses?include[]=course_image${state}`);
  }

  async getAssignments(courseId: number, orderBy: "due_at" | "name" = "due_at"): Promise<Assignment[]> {
    return this.requestAll<Assignment>(
      `/courses/${courseId}/assignments?order_by=${orderBy}&include[]=description`
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
    }>(`/users/self/enrollments?type[]=StudentEnrollment&state[]=active&include[]=observed_users`);

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
    return this.requestAll<Module>(`/courses/${courseId}/modules?include[]=items`);
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
