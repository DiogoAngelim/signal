import {
  normalizeParentEmails,
  resolveAlgaiAccess,
  updateParentAccessForStudent
} from "@/api/algaiParentAccess";
import type {
  AlgaiStudentDataSource,
  ParentAccessUpdateInput,
  StudentLearningSummary
} from "@/api/types";

export type ApiResponse<T> = {
  status: number;
  body: T;
};

export async function handleParentDashboardRequest(input: {
  authenticatedEmail?: string | null;
  studentId?: string | null;
  source: AlgaiStudentDataSource;
}): Promise<ApiResponse<
  | { dashboards: StudentLearningSummary[] }
  | { message: string; nextSteps?: string[] }
>> {
  if (!input.authenticatedEmail) {
    return { status: 401, body: { message: "Google login is required." } };
  }

  const resolution = await resolveAlgaiAccess(input.authenticatedEmail, input.source);
  if (resolution.kind !== "parent") {
    return {
      status: resolution.kind === "child" ? 303 : 403,
      body: {
        message: resolution.message,
        nextSteps: resolution.kind === "denied" ? resolution.nextSteps : undefined
      }
    };
  }

  const dashboards = input.studentId
    ? resolution.dashboards.filter((dashboard) => dashboard.student.id === input.studentId)
    : resolution.dashboards;

  if (input.studentId && dashboards.length === 0) {
    return {
      status: 403,
      body: { message: "This parent email is not approved for that student." }
    };
  }

  if (dashboards.length === 0) {
    return { status: 404, body: { message: "Student summary is not ready." } };
  }

  return { status: 200, body: { dashboards } };
}

export async function handleTeacherParentAccessUpdate(input: {
  authenticatedTeacherEmail?: string | null;
  studentId: string;
  parentEmails: string[];
  source: AlgaiStudentDataSource;
}): Promise<ApiResponse<{ studentId: string; parentEmails: string[]; updatedAt: string } | { message: string }>> {
  if (!input.authenticatedTeacherEmail) {
    return { status: 401, body: { message: "Teacher login is required." } };
  }

  const payload: ParentAccessUpdateInput = {
    teacherEmail: input.authenticatedTeacherEmail,
    studentId: input.studentId,
    parentEmails: normalizeParentEmails(input.parentEmails)
  };

  try {
    const result = await updateParentAccessForStudent(payload, input.source);
    return { status: 200, body: result };
  } catch (error) {
    return {
      status: /authorized/u.test(String((error as Error).message))
        ? 403
        : 404,
      body: { message: (error as Error).message }
    };
  }
}
