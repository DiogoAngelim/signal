import { demoLearningSummaries } from "@/api/mockData";
import { renderToString } from "react-dom/server";
import { LearningReview, ParentDashboard } from "./ParentDashboard";

describe("ParentDashboard", () => {
  it("renders a valid parent learning summary without gated data placeholders", () => {
    const html = renderToString(
      <ParentDashboard
        dashboards={[demoLearningSummaries[0]!]}
        user={{
          id: "google-parent.rivera@example.com",
          email: "parent.rivera@example.com",
          name: "Parent Rivera",
          provider: "google",
        }}
        onSignOut={() => undefined}
      />,
    );

    expect(html).toContain("Mia Rivera");
    expect(html).toContain(
      "Read together for 15 minutes three times this week.",
    );
    expect(html).toContain("Parent access validated");
    for (const restrictedWord of ["b" + "uy", "s" + "ell", "port" + "folio"]) {
      expect(html).not.toContain(restrictedWord);
    }
  });

  it("renders evidence-centered decision quality for learning review", () => {
    const html = renderToString(
      <LearningReview dashboard={demoLearningSummaries[0]!} />,
    );

    expect(html).toContain("What AlgAI knows and still needs to check");
    expect(html).toContain("Contradictory indicators");
    expect(html).toContain("Next best evidence");
    expect(html).toContain("Whether short breaks improve long math tasks.");
    expect(html).not.toContain("partially_right");
  });

  it("renders learning review when live AlgAI data omits decision quality", () => {
    const { decisionQuality: _decisionQuality, ...dashboard } =
      demoLearningSummaries[0]!;
    const html = renderToString(<LearningReview dashboard={dashboard} />);

    expect(html).toContain("What the evidence says");
    expect(html).toContain("Reading answers now include more detail.");
    expect(html).not.toContain("Decision quality");
  });

  it("renders a student switcher for parent emails linked to multiple students", () => {
    const html = renderToString(
      <ParentDashboard
        dashboards={demoLearningSummaries}
        user={{
          id: "google-parent.rivera@example.com",
          email: "parent.rivera@example.com",
          name: "Parent Rivera",
          provider: "google",
        }}
        onSignOut={() => undefined}
      />,
    );

    expect(html).toContain("associated students");
    expect(html).toContain("Mia Rivera");
    expect(html).toContain("Noah Patel");
  });

  it("renders the Google profile name instead of an email alias for the parent", () => {
    const html = renderToString(
      <ParentDashboard
        dashboards={[demoLearningSummaries[0]!]}
        user={{
          id: "google-iamdiogoangelim@gmail.com",
          email: "iamdiogoangelim@gmail.com",
          name: "Diogo Angelim",
          provider: "google",
        }}
        onSignOut={() => undefined}
      />,
    );

    expect(html).toContain("Diogo Angelim");
    expect(html).not.toContain("Iamdiogoangelim");
  });

  it("dedupes repeated dashboard and review items", () => {
    const dashboard = {
      ...demoLearningSummaries[0]!,
      learningReview: {
        changed: ["Repeated item", "Repeated item"],
        improved: [],
        stable: [],
        stillNeedsProof: [],
      },
      recentChanges: [],
    };

    const reviewHtml = renderToString(<LearningReview dashboard={dashboard} />);
    expect(reviewHtml.match(/Repeated item/g)).toHaveLength(1);

    const dashboardHtml = renderToString(
      <ParentDashboard
        dashboards={[demoLearningSummaries[0]!, demoLearningSummaries[0]!]}
        user={{
          id: "google-parent.rivera@example.com",
          email: "parent.rivera@example.com",
          name: "Parent Rivera",
          provider: "google",
        }}
        onSignOut={() => undefined}
      />,
    );

    expect(dashboardHtml).not.toContain("associated students");
  });

  it("renders evidence transitions with an arrow icon", () => {
    const dashboard = {
      ...demoLearningSummaries[0]!,
      subjects: [
        {
          ...demoLearningSummaries[0]!.subjects[0]!,
          evidence: ["What is 2 + 2? -> correct"],
        },
      ],
    };

    const html = renderToString(
      <ParentDashboard
        dashboards={[dashboard]}
        user={{
          id: "google-parent.rivera@example.com",
          email: "parent.rivera@example.com",
          name: "Parent Rivera",
          provider: "google",
        }}
        onSignOut={() => undefined}
      />,
    );

    expect(html).toContain("lucide-arrow-right");
    expect(html).not.toContain("What is 2 + 2? -&gt; correct");
  });
});
