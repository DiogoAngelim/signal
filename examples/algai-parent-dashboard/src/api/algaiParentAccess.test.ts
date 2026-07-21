import {
  buildAlgaiLoginUrl,
  createMockAlgaiDataSource,
  getStudentAccessForEmail,
  isChildEmail,
  isParentForStudent,
  normalizeParentEmails,
  resolveAlgaiAccess,
  updateParentAccessForStudent,
} from "./algaiParentAccess";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("AlgAI parent access validation", () => {
  it("asks AlgAI login to return through the parent dashboard handoff", () => {
    const url = new URL(buildAlgaiLoginUrl());

    expect(url.origin).toBe("https://algai.vercel.app");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("from")).toBe(
      "/api/public/parent-dashboard/redirect",
    );
  });

  it("keeps local dashboard development pointed at the local AlgAI app", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          hostname: "localhost",
        },
      },
    });

    const url = new URL(buildAlgaiLoginUrl());

    expect(url.origin).toBe("http://localhost:3000");
  });

  it("normalizes, validates, and removes duplicate parent emails", () => {
    expect(
      normalizeParentEmails([
        " Parent.Rivera@Example.com ",
        "parent.rivera@example.com",
        "bad email",
        "Caregiver.Rivera@Example.com",
      ]),
    ).toEqual(["parent.rivera@example.com", "caregiver.rivera@example.com"]);
  });

  it("opens the parent dashboard only for an assigned parent email", async () => {
    const source = createMockAlgaiDataSource();

    await expect(
      isParentForStudent(
        "parent.rivera@example.com",
        "student-mia-rivera",
        source,
      ),
    ).resolves.toBe(true);

    const resolution = await resolveAlgaiAccess(
      "parent.rivera@example.com",
      source,
    );

    expect(resolution.kind).toBe("parent");
    if (resolution.kind === "parent") {
      expect(resolution.dashboards[0]?.student.childName).toBe("Mia Rivera");
      expect(
        resolution.dashboards[0]?.dashboardPermissions.validatedParentEmail,
      ).toBe("parent.rivera@example.com");
    }
  });

  it("returns every registered student connected to one parent email", async () => {
    const source = createMockAlgaiDataSource();
    const resolution = await resolveAlgaiAccess(
      "parent.rivera@example.com",
      source,
    );

    expect(resolution.kind).toBe("parent");
    if (resolution.kind === "parent") {
      expect(
        resolution.dashboards.map((dashboard) => dashboard.student.childName),
      ).toEqual(["Mia Rivera", "Noah Patel"]);
    }
  });

  it("uses the authenticated user email when the parent dashboard payload omits parentEmail", async () => {
    const source = createMockAlgaiDataSource({
      initialUser: {
        id: "parent-rivera",
        email: "parent.rivera@example.com",
        name: "Parent Rivera",
        provider: "google",
      },
    });
    const payload = await source.getParentDashboardAccess();

    const resolution = await resolveAlgaiAccess(undefined, {
      ...source,
      async getParentDashboardAccess() {
        return payload
          ? {
              ...payload,
              parentEmail: undefined as unknown as string,
            }
          : null;
      },
    });

    expect(resolution).toMatchObject({
      kind: "parent",
      email: "parent.rivera@example.com",
      user: {
        name: "Parent Rivera",
      },
    });
  });

  it("routes a student email away from the parent dashboard", async () => {
    const source = createMockAlgaiDataSource();

    await expect(
      isChildEmail("mia.rivera@student.algai.test", source),
    ).resolves.toBe(true);

    const resolution = await resolveAlgaiAccess(
      "mia.rivera@student.algai.test",
      source,
    );

    expect(resolution).toMatchObject({
      kind: "child",
      studentId: "student-mia-rivera",
      childAccessPath: "/child",
    });
  });

  it("denies unrelated Google emails without returning student data", async () => {
    const source = createMockAlgaiDataSource();
    const resolution = await resolveAlgaiAccess("visitor@example.com", source);

    expect(resolution.kind).toBe("denied");
    expect("dashboard" in resolution).toBe(false);
  });

  it("lets an authorized teacher save normalized parent emails for one student", async () => {
    const source = createMockAlgaiDataSource();

    const result = await updateParentAccessForStudent(
      {
        teacherEmail: "Ana.Martins@AlgAI.School",
        studentId: "student-mia-rivera",
        parentEmails: ["New.Parent@Example.com", "new.parent@example.com"],
      },
      source,
    );

    expect(result.parentEmails).toEqual(["new.parent@example.com"]);
    await expect(
      getStudentAccessForEmail("new.parent@example.com", source),
    ).resolves.toMatchObject({
      studentId: "student-mia-rivera",
    });
  });

  it("blocks a teacher from changing another teacher's student record", async () => {
    const source = createMockAlgaiDataSource();

    await expect(
      updateParentAccessForStudent(
        {
          teacherEmail: "other.teacher@algai.school",
          studentId: "student-mia-rivera",
          parentEmails: ["new.parent@example.com"],
        },
        source,
      ),
    ).rejects.toThrow(/not authorized/u);
  });
});
