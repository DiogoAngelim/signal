import { createMockAlgaiDataSource } from "@/api/algaiParentAccess";
import {
  handleParentDashboardRequest,
  handleTeacherParentAccessUpdate,
} from "./parentDashboardApi";

describe("parent dashboard server boundary", () => {
  it("requires a Google-authenticated email before returning dashboard data", async () => {
    const source = createMockAlgaiDataSource();

    await expect(
      handleParentDashboardRequest({ authenticatedEmail: null, source }),
    ).resolves.toMatchObject({
      status: 401,
      body: { message: "Google login is required." },
    });
  });

  it("returns the dashboard for a valid parent request", async () => {
    const source = createMockAlgaiDataSource();

    const response = await handleParentDashboardRequest({
      authenticatedEmail: "parent.rivera@example.com",
      studentId: "student-mia-rivera",
      source,
    });

    expect(response.status).toBe(200);
    expect("dashboards" in response.body).toBe(true);
    if ("dashboards" in response.body) {
      expect(response.body.dashboards).toHaveLength(1);
      expect(response.body.dashboards[0]?.student.childName).toBe("Mia Rivera");
    }
  });

  it("returns all dashboards for a parent linked to multiple students", async () => {
    const source = createMockAlgaiDataSource();

    const response = await handleParentDashboardRequest({
      authenticatedEmail: "parent.rivera@example.com",
      source,
    });

    expect(response.status).toBe(200);
    expect("dashboards" in response.body).toBe(true);
    if ("dashboards" in response.body) {
      expect(
        response.body.dashboards.map(
          (dashboard) => dashboard.student.childName,
        ),
      ).toEqual(["Mia Rivera", "Noah Patel"]);
    }
  });

  it("does not return one student's dashboard to another approved parent", async () => {
    const source = createMockAlgaiDataSource();

    const response = await handleParentDashboardRequest({
      authenticatedEmail: "parent.patel@example.com",
      studentId: "student-mia-rivera",
      source,
    });

    expect(response.status).toBe(403);
    expect("dashboards" in response.body).toBe(false);
  });

  it("returns a redirect-style response when the child email tries parent access", async () => {
    const source = createMockAlgaiDataSource();

    const response = await handleParentDashboardRequest({
      authenticatedEmail: "mia.rivera@student.algai.test",
      source,
    });

    expect(response.status).toBe(303);
    expect("dashboards" in response.body).toBe(false);
  });

  it("validates teacher ownership before parent email updates", async () => {
    const source = createMockAlgaiDataSource();

    const blocked = await handleTeacherParentAccessUpdate({
      authenticatedTeacherEmail: "other.teacher@algai.school",
      studentId: "student-mia-rivera",
      parentEmails: ["new.parent@example.com"],
      source,
    });
    expect(blocked.status).toBe(403);

    const allowed = await handleTeacherParentAccessUpdate({
      authenticatedTeacherEmail: "ana.martins@algai.school",
      studentId: "student-mia-rivera",
      parentEmails: ["New.Parent@Example.com"],
      source,
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({
      studentId: "student-mia-rivera",
      parentEmails: ["new.parent@example.com"],
    });
  });
});
