import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Dashboard, {
  discoveryRecognitionSentence,
  maximumExposureSubLabel,
  recognitionClearsDiscoveryNoveltyNarrative,
  recognitionStateRecurrenceLine,
  reconcileDiscoveryInvalidationConditions,
  reconcileRecoveryBlockersWithRecognition,
  reconcileRecoveryUnlockConditionsWithRecognition,
  reconcileResolveUnlockConditionsWithRecognition,
  resolveDashboardNeedDiagnostics,
} from "./dashboard";

describe("Dashboard calibration diagnostics", () => {
  it("renders calibration diagnostics without breaking the existing dashboard shell", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("Investment dashboard");
    expect(html).toContain("Executive Reasoning");
    expect(html).toContain("System state in one explanation");
    expect(html).toContain("Governance Evolution");
    expect(html).toContain("Decision authority and learning loop");
    expect(html).toContain("Operator command");
    expect(html).toContain("Confidence ledger");
    expect(html).toContain("Restriction accountability");
    expect(html).toContain("Evidence Summary");
    expect(html).toContain("Strongest justification");
    expect(html).toContain("Decision Pipeline");
    expect(html).toContain("Discovery to Output");
    expect(html).toContain("Why not full size?");
    expect(html).toContain("What would change the decision?");
    expect(html).toContain("Terminology hierarchy");
    expect(html).toContain("Calibration");
    expect(html).toContain("Belief diagnostics");
    expect(html).toContain("Recognition diagnostics");
    expect(html).toContain("Recurrence");
    expect(html).toContain("Judgement similarity");
    expect(html).toContain("Judgement diagnostics");
    expect(html).toContain("Survival memory diagnostics");
    expect(html).toContain("Survival memory status");
    expect(html).toContain("Scar count");
    expect(html).toContain("Near-ruin count");
    expect(html).toContain("Average survival cost");
    expect(html).toContain("Recovery burden");
    expect(html).toContain("Survival confidence");
    expect(html).toContain("Current state similarity to past fragile states");
    expect(html).toContain("Resolve diagnostics");
    expect(html).toContain("Discovery confidence");
    expect(html).toContain("Discovery support");
    expect(html).toContain("Discovery contradictions");
    expect(html).toContain("Memory summary");
    expect(html).toContain("Human review required");
    expect(html).toContain(
      "Judgement compares the current state with similar historical situations and checks whether past outcomes justify trusting the current signal.",
    );
    expect(html).toContain("Evidence agreement");
    expect(html).toContain("Top supporting evidence");
    expect(html).toContain("Top contradictory evidence");
    expect(html).toContain("Raw confidence");
    expect(html).toContain("Calibrated confidence");
    expect(html).toContain("Trustworthiness");
    expect(html).toContain("Readiness remediation planner");
    expect(html).toContain(
      "Calibration checks whether past confidence matched actual outcomes.",
    );
  });

  it("renders a decision-first executive summary with the required priority signals", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain('data-testid="executive-summary"');
    expect(html).toContain('data-layout="responsive-executive-grid"');
    expect(html).toContain("Confidence / Trust");
    expect(html).toContain("Max Exposure");
    expect(html).toContain("Portfolio Posture");
    expect(html).toContain("Risk state:");
    expect(html).toContain("Primary posture");
    expect(html).toContain('data-mobile-posture-summary="true"');
  });

  it("groups the dashboard into calmer decision layers", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("Executive Summary");
    expect(html).toContain("Market Health");
    expect(html).toContain("Opportunity &amp; Allocation");
    expect(html).toContain("Risk &amp; Constraints");
    expect(html).toContain("Signal Diagnostics");
    expect(html).toContain("System Intelligence");
    expect(html).toContain("Raw/Advanced Details");
  });

  it("keeps advanced/internal sections collapsed by default", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain(
      'data-advanced-section="Signal diagnostics and internal engine traces"',
    );
    expect(html).toContain('data-advanced-section="All evidence checks"');
    expect(html).toContain(
      'data-advanced-section="Calibration internals and readiness gates"',
    );
    expect(html).toContain('data-advanced-section="Calibration internals"');
    expect(html).toContain(
      'data-advanced-section="Trace details and raw contributors"',
    );
    expect(html).toContain(
      'data-advanced-section="Overfit/risk diagnostics and strategy audit logs"',
    );
    expect(html).toContain(
      'data-advanced-section="Backtest detail and benchmark context"',
    );
    expect(html).not.toContain("<details open");
  });

  it("keeps responsive dashboard structure on the primary sections", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("responsive-executive-grid");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("xl:grid-cols-4");
    expect(html).toContain(
      "xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]",
    );
    expect(html).toContain('data-layout="responsive-ledger-row"');
  });

  it("does not display participation needs when commitment gates are blocked", () => {
    const needs = resolveDashboardNeedDiagnostics({
      rawNeeds: [
        {
          needId: "increase-participation:40",
          category: "increase-participation",
          severity: 40,
          confidence: 80,
          explanation: "Alignment supports graduated participation.",
          recommendations: [],
        },
      ],
      strategyReadinessBlocked: true,
      strategyMaxPositionPct: 0,
      calibrationStatus: "unstable-outcomes",
      calibrationTrustworthiness: 76,
      calibratedConfidence: 43,
      rawConfidence: 45,
    });

    expect(needs).toHaveLength(1);
    expect(needs[0]?.category).toBe("wait");
    expect(needs[0]?.explanation).toContain("Strategy readiness");
    expect(needs[0]?.explanation).toContain("block participation");
  });

  it("describes calibration-only review gates without blaming strategy readiness", () => {
    const needs = resolveDashboardNeedDiagnostics({
      rawNeeds: [
        {
          needId: "increase-participation:40",
          category: "increase-participation",
          severity: 40,
          confidence: 80,
          explanation: "Alignment supports graduated participation.",
          recommendations: [],
        },
      ],
      strategyReadinessBlocked: false,
      strategyMaxPositionPct: 5,
      calibrationStatus: "unstable-outcomes",
      calibrationTrustworthiness: 72,
      calibratedConfidence: 66,
      rawConfidence: 85,
    });

    expect(needs[0]?.category).toBe("wait");
    expect(needs[0]?.explanation).toContain("outcomes are unstable");
    expect(needs[0]?.explanation).not.toContain("Strategy readiness");
  });

  it("keeps framework needs when no commitment gate is blocking action", () => {
    const rawNeeds = [
      {
        needId: "increase-participation:40",
        category: "increase-participation",
        severity: 40,
        confidence: 80,
        explanation: "Alignment supports graduated participation.",
        recommendations: [],
      },
    ];

    expect(
      resolveDashboardNeedDiagnostics({
        rawNeeds,
        strategyReadinessBlocked: false,
        strategyMaxPositionPct: 2,
        calibrationStatus: "trusted",
        calibrationTrustworthiness: 82,
        calibratedConfidence: 72,
        rawConfidence: 75,
      }),
    ).toBe(rawNeeds);
  });

  it("uses Recognition to reconcile stale Discovery novelty copy", () => {
    const recognition = {
      recognitionScore: 81,
      recurrenceConfidence: 76,
      noveltyScore: 19,
      archetype: "stable_positive_state",
      archetypeConfidence: 97,
      stateFingerprint: "recog-v1:test",
      matchedSamples: 1313,
      matchedPositiveOutcomes: 1200,
      matchedNegativeOutcomes: 112,
      outcomeStability: 79,
      discoveryNoveltyJustified: false,
      judgementSimilarityJustified: true,
      verdict: "recognized" as const,
      reason: "Recognized.",
      missingEvidence: [],
      invalidationConditions: [],
    };

    expect(recognitionClearsDiscoveryNoveltyNarrative(recognition)).toBe(true);
    expect(
      reconcileDiscoveryInvalidationConditions(
        [
          "Invalidate if opportunity density collapses across candidates.",
          "The current context remains too novel to compare with known states.",
        ],
        recognition,
      ),
    ).toEqual([
      "Invalidate if opportunity density collapses across candidates.",
      "Re-open Discovery novelty only if Recognition recurrence falls below 70/100 or the stable positive state outcome linkage weakens.",
    ]);
    expect(
      discoveryRecognitionSentence({
        discoveryConfidence: 42,
        discoveryNovelty: 93,
        recognition,
      }),
    ).toContain("Recognition rejects that novelty with 76% recurrence.");
    expect(recognitionStateRecurrenceLine(recognition)).toBe(
      "Recognition state recurrence 1313 matched samples; Discovery outcome memory remains separate.",
    );
    expect(
      reconcileRecoveryBlockersWithRecognition(
        [
          "Survival confidence has not cleared the normal-sizing threshold.",
          "Positive similar-outcome ratio is below restoration threshold.",
        ],
        recognition,
      ),
    ).toEqual([
      "Survival confidence has not cleared the normal-sizing threshold.",
      "Recovery needs survival-safe outcome linkage; Recognition has 1313 state matches, but normal sizing still requires reduced-size outcomes with acceptable drawdown and stress.",
    ]);
    expect(
      reconcileRecoveryUnlockConditionsWithRecognition(
        ["Raise survival confidence to at least 70/100 for normal sizing."],
        recognition,
      ),
    ).toContain(
      "Close reduced-size outcomes for the stable positive state archetype with survival cost below the recovery boundary before restoring normal sizing.",
    );
    expect(
      reconcileResolveUnlockConditionsWithRecognition({
        conditions: ["Raise agency trust to at least 70/100."],
        missingEvidence: ["Agency trust", "Reduced-size survival review"],
        recognition,
      }),
    ).toEqual([
      "Raise agency trust to at least 70/100.",
      "Convert additional clean reduced-size outcomes into Agency trust until the average clears 70/100.",
      "Close reduced-size outcomes for the stable positive state archetype with acceptable drawdown and stress before normal sizing is restored.",
    ]);
    expect(
      maximumExposureSubLabel({
        sizingMode: "micro",
        suggestedMaximumExposurePct: 2,
        semanticWord: "Dormant",
      }),
    ).toBe("reduced-size portfolio cap");
  });
});
