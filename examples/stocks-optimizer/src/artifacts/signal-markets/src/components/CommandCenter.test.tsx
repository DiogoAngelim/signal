import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCommandCenterViewModel } from "@/lib/command-center";
import CommandCenter from "./CommandCenter";

describe("CommandCenter component", () => {
  it("renders the strategy command-center systems from a derived view model", () => {
    const model = buildCommandCenterViewModel({
      market: "US",
      operatorSummary:
        "The system has not yet earned authorization to deploy capital at normal size.",
      participationMode: "limited",
      trustScore: 68,
      survivalConfidence: 62,
      readinessScore: 57,
      historyDepthScore: 71,
      regimeCoverageScore: 64,
      sampleDiversityScore: 58,
      calibrationTrustworthiness: 82,
      knowledgeCompletenessScore: 74,
      dataReliabilityScore: 96,
      agencyMaturityScore: 66,
      memoryDepthScore: 71,
      discoveryScore: 73,
      recognitionScore: 79,
      judgementScore: 61,
      recoveryScore: 42,
      wisdomScore: 70,
      overfitRiskScore: 44,
      hasSurvivalScar: true,
      topRestriction: {
        label: "Reduced-Size Deployment",
        unlockCondition: "Complete the recovery proof lane.",
      },
      restorationProgress: {
        status: "collecting_evidence",
        restorationState: "watch",
        progressPct: 42,
        summary:
          "The recovery campaign remains active. Additional evidence is required before deployment authority is restored.",
        gates: [
          {
            id: "survival-confidence",
            label: "Survival Confidence 70",
            passed: false,
            current: "62",
            target: "70",
            progressPct: 88,
            detail: "Survival confidence remains below threshold.",
          },
        ],
        outcomeProof: {
          requiredCleanOutcomes: 3,
          cleanReducedSizeOutcomeCount: 1,
          activeProofBoundaryBreakCount: 0,
        },
      } as any,
    });

    const html = renderToStaticMarkup(<CommandCenter model={model} />);

    expect(html).toContain('data-testid="command-center"');
    expect(html).toContain("Command Center");
    expect(html).toContain("Operator Level");
    expect(html).toContain("Operator XP");
    expect(html).toContain("XP Sources");
    expect(html).toContain("World Map");
    expect(html).toContain("Campaign Progress");
    expect(html).toContain("Active Missions");
    expect(html).toContain("Boss Battles");
    expect(html).toContain("Skill Tree");
    expect(html).toContain("Reputation");
    expect(html).toContain("Operator Identity");
    expect(html).toContain("Signal Advisor");
    expect(html).toContain("Unlock System");
    expect(html).toContain("Unlock History");
    expect(html).toContain("Achievements");
    expect(html).toContain("Badges");
    expect(html).toContain("Campaign History");
    expect(html).toContain("Milestones");
    expect(html).toContain("Streak System");
    expect(html).toContain("Prestige System");
    expect(html).toContain("Overfit Hydra");
    expect(html).toContain("Probe Operator");
  });
});
