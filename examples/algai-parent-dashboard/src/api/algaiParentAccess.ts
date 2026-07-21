import { demoLearningSummaries, demoStudentAccessRecords } from "./mockData";
import type {
  AlgaiAccessResolution,
  AlgaiStudentDataSource,
  AuthenticatedUser,
  DemoAlgaiStudentDataSource,
  ParentAccessUpdateInput,
  ParentAccessUpdateResult,
  ParentDashboardAccessPayload,
  StudentAccessRecord,
  StudentLearningSummary,
} from "./types";

const PARENT_TOKEN_STORAGE_KEY = "algai.parent-dashboard.parent-token";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const DEFAULT_ALGAI_STUDENT_APP_URL = "https://algai.vercel.app";
const LOCAL_ALGAI_STUDENT_APP_URL = "http://localhost:3000";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function normalizeParentEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const email of emails) {
    const value = normalizeEmail(email);
    if (!value || !isValidEmail(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function getAlgaiApiBaseUrl(): string {
  return (
    (import.meta.env.VITE_ALGAI_API_BASE_URL as string | undefined) ?? "/api"
  );
}

function isLocalDashboardHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname,
  );
}

export function getAlgaiStudentAppUrl(): string {
  const configuredUrl = (
    import.meta.env.VITE_ALGAI_STUDENT_APP_URL as string | undefined
  )?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  return isLocalDashboardHost()
    ? LOCAL_ALGAI_STUDENT_APP_URL
    : DEFAULT_ALGAI_STUDENT_APP_URL;
}

function joinApiPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`;
}

export function buildAlgaiLoginUrl(): string {
  const appUrl = getAlgaiStudentAppUrl().replace(/\/$/u, "");
  const loginUrl = new URL("/login", appUrl);
  loginUrl.searchParams.set("from", "/api/public/parent-dashboard/redirect");
  return loginUrl.toString();
}

function readStoredParentToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(PARENT_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredParentToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token) {
      window.sessionStorage.setItem(PARENT_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(PARENT_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Session storage may be unavailable in locked-down browser contexts.
  }
}

export function consumeParentHandoffTokenFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const token = params.get("algai_parent_token");

  if (!token) {
    return readStoredParentToken();
  }

  writeStoredParentToken(token);
  params.delete("algai_parent_token");
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
  return token;
}

export function clearParentHandoffToken(): void {
  writeStoredParentToken(null);
}

export function createMockAlgaiDataSource(input?: {
  initialUser?: AuthenticatedUser | null;
  accessRecords?: StudentAccessRecord[];
  learningSummaries?: StudentLearningSummary[];
}): DemoAlgaiStudentDataSource {
  const accessRecords = new Map(
    (input?.accessRecords ?? demoStudentAccessRecords).map((record) => [
      record.studentId,
      {
        ...record,
        parentEmails: normalizeParentEmails(record.parentEmails),
        childEmail: normalizeEmail(record.childEmail),
        teacherEmail: normalizeEmail(record.teacherEmail),
      },
    ]),
  );
  const learningSummaries = new Map(
    (input?.learningSummaries ?? demoLearningSummaries).map((summary) => [
      summary.student.id,
      summary,
    ]),
  );
  let currentUser = input?.initialUser ?? null;

  return {
    async getAuthenticatedUser() {
      return currentUser;
    },
    async setAuthenticatedUser(user) {
      currentUser = user;
    },
    async getParentDashboardAccess() {
      if (!currentUser) {
        return null;
      }

      const parentEmail = normalizeEmail(currentUser.email);
      const studentRecords = [...accessRecords.values()].filter((record) =>
        record.parentEmails.includes(parentEmail),
      );
      const students = studentRecords
        .map((record) => learningSummaries.get(record.studentId))
        .filter((summary): summary is StudentLearningSummary =>
          Boolean(summary),
        )
        .map((summary) => ({
          ...summary,
          dashboardPermissions: {
            ...summary.dashboardPermissions,
            validatedParentEmail: parentEmail,
            validatedAt: new Date().toISOString(),
          },
        }));

      if (students.length === 0) {
        return null;
      }

      return {
        user: currentUser,
        parentEmail,
        students,
        generatedAt: new Date().toISOString(),
      };
    },
    async getStudentAccessForEmail(email) {
      const normalized = normalizeEmail(email);
      return (
        [...accessRecords.values()].find(
          (record) =>
            record.childEmail === normalized ||
            record.parentEmails.includes(normalized),
        ) ?? null
      );
    },
    async getStudentAccessRecordsForEmail(email) {
      const normalized = normalizeEmail(email);
      return [...accessRecords.values()].filter(
        (record) =>
          record.childEmail === normalized ||
          record.parentEmails.includes(normalized),
      );
    },
    async getStudentAccessRecord(studentId) {
      return accessRecords.get(studentId) ?? null;
    },
    async getLearningSummary(studentId) {
      const summary = learningSummaries.get(studentId);
      const accessRecord = accessRecords.get(studentId);
      if (!summary || !accessRecord) {
        return null;
      }

      return {
        ...summary,
        dashboardPermissions: {
          ...summary.dashboardPermissions,
          validatedAt: new Date().toISOString(),
        },
      };
    },
    async isTeacherAuthorizedForStudent(teacherEmail, studentId) {
      const accessRecord = accessRecords.get(studentId);
      return Boolean(
        accessRecord &&
          normalizeEmail(accessRecord.teacherEmail) ===
            normalizeEmail(teacherEmail),
      );
    },
    async updateParentEmailsForStudent(input: ParentAccessUpdateInput) {
      const accessRecord = accessRecords.get(input.studentId);
      if (!accessRecord) {
        throw new Error("Student access record not found");
      }

      const teacherAuthorized = await this.isTeacherAuthorizedForStudent(
        input.teacherEmail,
        input.studentId,
      );
      if (!teacherAuthorized) {
        throw new Error("Teacher is not authorized to manage this student");
      }

      const parentEmails = normalizeParentEmails(input.parentEmails);
      const updated: StudentAccessRecord = {
        ...accessRecord,
        parentEmails,
        updatedAt: new Date().toISOString(),
      };
      accessRecords.set(input.studentId, updated);

      return {
        studentId: input.studentId,
        parentEmails,
        updatedAt: updated.updatedAt,
      };
    },
  };
}

export class AlgaiApiError extends Error {
  status: number;
  nextSteps?: string[];

  constructor(status: number, message: string, nextSteps?: string[]) {
    super(message);
    this.name = "AlgaiApiError";
    this.status = status;
    this.nextSteps = nextSteps;
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AlgaiApiError(
      response.status,
      typeof body?.message === "string"
        ? body.message
        : "AlgAI access validation failed.",
      Array.isArray(body?.nextSteps) ? body.nextSteps.map(String) : undefined,
    );
  }
  return body as T;
}

export function createAlgaiApiDataSource(input?: {
  apiBaseUrl?: string;
  parentToken?: string | null;
}): AlgaiStudentDataSource {
  const apiBaseUrl = input?.apiBaseUrl ?? getAlgaiApiBaseUrl();

  function authHeaders(): HeadersInit {
    const token = input?.parentToken ?? readStoredParentToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  async function getAccessPayload(): Promise<ParentDashboardAccessPayload | null> {
    try {
      const response = await fetch(
        joinApiPath(apiBaseUrl, "/public/parent-dashboard/access"),
        {
          credentials: "include",
          headers: authHeaders(),
        },
      );
      const payload = await parseApiResponse<ParentDashboardAccessPayload>(
        response,
      );

      if (!Array.isArray(payload.students)) {
        return null;
      }

      return payload;
    } catch (error) {
      if (error instanceof AlgaiApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }

  return {
    async getAuthenticatedUser() {
      const access = await getAccessPayload();
      return access?.user ?? null;
    },
    async getParentDashboardAccess() {
      return getAccessPayload();
    },
    async getStudentAccessForEmail(email) {
      const access = await getAccessPayload();
      const dashboard = access?.students.find(
        (student) =>
          student.dashboardPermissions.validatedParentEmail ===
          normalizeEmail(email),
      );
      return dashboard
        ? {
            studentId: dashboard.student.id,
            parentEmails: [normalizeEmail(email)],
            childEmail: dashboard.student.childEmail,
            teacherEmail: dashboard.student.teacher.email,
            updatedAt: dashboard.dashboardPermissions.validatedAt,
          }
        : null;
    },
    async getStudentAccessRecordsForEmail(email) {
      const access = await getAccessPayload();
      if (
        !access ||
        normalizeEmail(access.parentEmail) !== normalizeEmail(email)
      ) {
        return [];
      }
      return access.students.map((student) => ({
        studentId: student.student.id,
        parentEmails: [normalizeEmail(email)],
        childEmail: student.student.childEmail,
        teacherEmail: student.student.teacher.email,
        updatedAt: student.dashboardPermissions.validatedAt,
      }));
    },
    async getStudentAccessRecord(studentId) {
      const access = await getAccessPayload();
      const dashboard = access?.students.find(
        (student) => student.student.id === studentId,
      );
      return dashboard
        ? {
            studentId: dashboard.student.id,
            parentEmails: [dashboard.dashboardPermissions.validatedParentEmail],
            childEmail: dashboard.student.childEmail,
            teacherEmail: dashboard.student.teacher.email,
            updatedAt: dashboard.dashboardPermissions.validatedAt,
          }
        : null;
    },
    async getLearningSummary(studentId) {
      const access = await getAccessPayload();
      return (
        access?.students.find((student) => student.student.id === studentId) ??
        null
      );
    },
    async isTeacherAuthorizedForStudent() {
      return false;
    },
    async updateParentEmailsForStudent() {
      throw new Error(
        "Parent access updates must be saved from the AlgAI teacher app.",
      );
    },
  };
}

let defaultDataSource: AlgaiStudentDataSource =
  typeof window === "undefined"
    ? createMockAlgaiDataSource()
    : createAlgaiApiDataSource();

export function getDefaultAlgaiDataSource(): AlgaiStudentDataSource {
  return defaultDataSource;
}

export function setDefaultAlgaiDataSource(
  source: AlgaiStudentDataSource,
): void {
  defaultDataSource = source;
}

export async function getAuthenticatedUser(
  source = getDefaultAlgaiDataSource(),
): Promise<AuthenticatedUser | null> {
  return source.getAuthenticatedUser();
}

export async function getStudentAccessForEmail(
  email: string,
  source = getDefaultAlgaiDataSource(),
): Promise<StudentAccessRecord | null> {
  if (!isValidEmail(email)) {
    return null;
  }
  return source.getStudentAccessForEmail(normalizeEmail(email));
}

export async function getStudentAccessRecordsForEmail(
  email: string,
  source = getDefaultAlgaiDataSource(),
): Promise<StudentAccessRecord[]> {
  if (!isValidEmail(email)) {
    return [];
  }
  return source.getStudentAccessRecordsForEmail(normalizeEmail(email));
}

export async function isParentForStudent(
  parentEmail: string,
  studentId: string,
  source = getDefaultAlgaiDataSource(),
): Promise<boolean> {
  const record = await source.getStudentAccessRecord(studentId);
  return Boolean(
    record?.parentEmails
      .map(normalizeEmail)
      .includes(normalizeEmail(parentEmail)),
  );
}

export async function isChildEmail(
  email: string,
  source = getDefaultAlgaiDataSource(),
): Promise<boolean> {
  const record = await getStudentAccessForEmail(email, source);
  return Boolean(
    record && normalizeEmail(record.childEmail) === normalizeEmail(email),
  );
}

export async function resolveAlgaiAccess(
  email?: string | null,
  source = getDefaultAlgaiDataSource(),
): Promise<AlgaiAccessResolution> {
  if (!email) {
    try {
      const access = await source.getParentDashboardAccess();
      if (!access) {
        return {
          kind: "unauthenticated",
          message: "Open AlgAI and sign in with Google to continue.",
          loginUrl: buildAlgaiLoginUrl(),
        };
      }

      const parentEmail = normalizeEmail(
        access.parentEmail ||
          access.user?.email ||
          access.students[0]?.dashboardPermissions.validatedParentEmail ||
          "",
      );

      if (!parentEmail) {
        return {
          kind: "unauthenticated",
          message: "Open AlgAI and sign in with Google to continue.",
          loginUrl: buildAlgaiLoginUrl(),
        };
      }

      return {
        kind: "parent",
        email: parentEmail,
        user: access.user,
        dashboards: access.students,
        generatedAt: access.generatedAt,
      };
    } catch (error) {
      if (error instanceof AlgaiApiError) {
        if (error.status === 401) {
          return {
            kind: "unauthenticated",
            message: error.message,
            loginUrl: buildAlgaiLoginUrl(),
          };
        }

        return {
          kind: "denied",
          email: "",
          message: error.message,
          nextSteps: error.nextSteps ?? [
            "Use the parent email registered by the teacher.",
            "Open AlgAI and sign in again if your session has expired.",
          ],
        };
      }

      throw error;
    }
  }

  const authenticatedEmail = email
    ? normalizeEmail(email)
    : normalizeEmail((await getAuthenticatedUser(source))?.email ?? "");

  if (!authenticatedEmail) {
    return {
      kind: "unauthenticated",
      message: "Open AlgAI and sign in with Google to continue.",
      loginUrl: buildAlgaiLoginUrl(),
    };
  }

  const accessRecords = await getStudentAccessRecordsForEmail(
    authenticatedEmail,
    source,
  );
  if (accessRecords.length === 0) {
    return {
      kind: "denied",
      email: authenticatedEmail,
      message:
        "We could not find a parent or student record for this Google email.",
      nextSteps: [
        "Check that you used the email shared with the school.",
        "Ask the teacher to add your parent email for the student.",
        "Contact AlgAI support if the record was recently updated.",
      ],
    };
  }

  const accessRecord = accessRecords[0]!;
  if (normalizeEmail(accessRecord.childEmail) === authenticatedEmail) {
    return {
      kind: "child",
      email: authenticatedEmail,
      studentId: accessRecord.studentId,
      childAccessPath: "/child",
      message: "This email belongs to the student account.",
    };
  }

  const parentRecords = accessRecords.filter((record) =>
    record.parentEmails.includes(authenticatedEmail),
  );

  if (parentRecords.length > 0) {
    const dashboards = (
      await Promise.all(
        parentRecords.map((record) =>
          source.getLearningSummary(record.studentId),
        ),
      )
    )
      .filter((dashboard): dashboard is StudentLearningSummary =>
        Boolean(dashboard),
      )
      .map((dashboard) => ({
        ...dashboard,
        dashboardPermissions: {
          ...dashboard.dashboardPermissions,
          validatedParentEmail: authenticatedEmail,
          canViewParentDashboard: true,
        },
      }));

    if (dashboards.length === 0) {
      return {
        kind: "denied",
        email: authenticatedEmail,
        message:
          "Your parent access is valid, but the student summary is not ready yet.",
        nextSteps: [
          "Try again after the next teacher update.",
          "Ask the teacher whether the learning summary has been published.",
        ],
      };
    }

    return {
      kind: "parent",
      email: authenticatedEmail,
      dashboards,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    kind: "denied",
    email: authenticatedEmail,
    message:
      "This email is connected to the student, but not as an approved parent email.",
    nextSteps: [
      "Use the parent email registered by the teacher.",
      "Ask the teacher to update Parent Access for this student.",
    ],
  };
}

export async function getParentDashboardForEmail(
  email: string,
  source = getDefaultAlgaiDataSource(),
): Promise<StudentLearningSummary[]> {
  const resolution = await resolveAlgaiAccess(email, source);
  return resolution.kind === "parent" ? resolution.dashboards : [];
}

export async function updateParentAccessForStudent(
  input: ParentAccessUpdateInput,
  source = getDefaultAlgaiDataSource(),
): Promise<ParentAccessUpdateResult> {
  return source.updateParentEmailsForStudent({
    teacherEmail: normalizeEmail(input.teacherEmail),
    studentId: input.studentId,
    parentEmails: normalizeParentEmails(input.parentEmails),
  });
}
