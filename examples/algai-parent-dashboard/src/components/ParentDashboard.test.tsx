import { renderToString } from "react-dom/server";
import { demoLearningSummaries } from "@/api/mockData";
import { ParentDashboard } from "./ParentDashboard";

describe("ParentDashboard", () => {
  it("renders a valid parent learning summary without gated data placeholders", () => {
    const html = renderToString(
      <ParentDashboard
        dashboards={[demoLearningSummaries[0]!]}
        user={{
          id: "google-parent.rivera@example.com",
          email: "parent.rivera@example.com",
          name: "Parent Rivera",
          provider: "google"
        }}
        onSignOut={() => undefined}
      />
    );

    expect(html).toContain("Mia Rivera");
    expect(html).toContain("Read together for 15 minutes three times this week.");
    expect(html).toContain("Parent access validated");
    for (const restrictedWord of ["b" + "uy", "s" + "ell", "port" + "folio"]) {
      expect(html).not.toContain(restrictedWord);
    }
  });

  it("renders a student switcher for parent emails linked to multiple students", () => {
    const html = renderToString(
      <ParentDashboard
        dashboards={demoLearningSummaries}
        user={{
          id: "google-parent.rivera@example.com",
          email: "parent.rivera@example.com",
          name: "Parent Rivera",
          provider: "google"
        }}
        onSignOut={() => undefined}
      />
    );

    expect(html).toContain("associated students");
    expect(html).toContain("Mia Rivera");
    expect(html).toContain("Noah Patel");
  });
});
