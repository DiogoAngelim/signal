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
  selectStableExecutiveSummaryMetrics,
} from "./dashboard";

describe("Dashboard calibration diagnostics", () => {
  it("renders the Decision Operating System shell", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain('data-testid="decision-operating-system"');
    expect(html).toContain('data-testid="decision-step-screen"');
    expect(html).toContain('data-active-step="intent"');
    expect(html).toContain("Decision Operating System");
    expect(html).toContain("Market State");
    expect(html).toContain("Decision Readiness");
    expect(html).toContain("Recommended Action");
    expect(html).toContain("Suggested Exposure");
  });

  it("renders one active decision question with the repeated step structure", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("What decision am I trying to make?");
    expect(html).toContain("Decision Summary");
    expect(html).toContain('data-testid="supporting-evidence-panel"');
    expect(html).toContain("Supporting Evidence");
    expect(html).toContain("Recommended Next Step");
    expect(html).toContain("Current Decision");
    expect(html).not.toContain("What is happening?");
    expect(html).not.toContain("What opportunity matters most?");
  });

  it("holds executive summary metrics steady during quote refresh", () => {
    const previous = {
      market: "US",
      confidenceValue: "86%",
      confidenceSub: "Trusted by governance at 71%",
      confidenceTone: "good" as const,
      maxExposureValue: "No exposure",
      maxExposureSub: "Sizing locked by governance",
      exposureTone: "bad" as const,
      portfolioPostureValue: "Limited",
      portfolioPostureSub: "Wait for confirmation",
      postureTone: "warn" as const,
      marketHealthValue: "Smooth",
      marketHealthSub: "74%",
      marketHealthTone: "good" as const,
    };
    const transient = {
      ...previous,
      confidenceValue: "42%",
      confidenceSub: "Trust pending",
      maxExposureValue: "Pending",
      portfolioPostureValue: "Loading",
      marketHealthValue: "Pending",
      marketHealthSub: "Awaiting synchronized data",
    };

    expect(
      selectStableExecutiveSummaryMetrics({
        current: transient,
        previous,
        refreshing: true,
      }),
    ).toBe(previous);
    expect(
      selectStableExecutiveSummaryMetrics({
        current: transient,
        previous,
        refreshing: false,
      }),
    ).toBe(transient);
    expect(
      selectStableExecutiveSummaryMetrics({
        current: { ...transient, market: "ETF" },
        previous,
        refreshing: true,
      }),
    ).toEqual({ ...transient, market: "ETF" });
  });

  it("renders the eight-step decision workflow", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("Intent");
    expect(html).toContain("Sense");
    expect(html).toContain("Pulse");
    expect(html).toContain("Core");
    expect(html).toContain("Judgement");
    expect(html).toContain("Sizing");
    expect(html).toContain("Action");
    expect(html).toContain("Reflection");
  });

  it("keeps metrics and diagnostics behind progressive disclosure modes", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("Default");
    expect(html).toContain("Evidence");
    expect(html).toContain("Advanced");
    expect(html).toContain("Expert");
    expect(html).toContain("Debug");
    expect(html).toContain("Conclusion view");
    expect(html).not.toContain("Advanced view");
    expect(html).not.toContain("Expert view");
    expect(html).not.toContain("Debug view");
    expect(html).not.toContain("<details open");
  });

  it("does not render the old gamified dashboard surface", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).not.toContain('data-testid="command-center"');
    expect(html).not.toContain("Operator Level");
    expect(html).not.toContain("Campaign Progress");
    expect(html).not.toContain("Boss Battles");
    expect(html).not.toContain("Skill Tree");
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
    expect(
      maximumExposureSubLabel({
        sizingMode: "none",
        suggestedMaximumExposurePct: 0,
        semanticWord: "Dormant",
      }),
    ).toBe("Sizing locked by governance");
  });
});
