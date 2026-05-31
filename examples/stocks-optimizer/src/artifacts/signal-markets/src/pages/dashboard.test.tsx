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
    expect(html).toContain('data-active-step="opportunity"');
    expect(html).toContain("Signal Investment Brief");
    expect(html).toContain("Recommended action");
    expect(html).toContain("Opportunity");
    expect(html).toContain("Trust");
    expect(html).toContain("Size");
    expect(html).toContain("Action");
  });

  it("renders one active investor question with the repeated story structure", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("What deserves attention?");
    expect(html).toContain("What happened");
    expect(html).toContain("Why it matters");
    expect(html).toContain("What to do");
    expect(html).toContain('data-testid="primary-answer"');
    expect(html).not.toContain("What is happening?");
    expect(html).not.toContain("What decision am I trying to make?");
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

  it("renders the four-step investor decision flow", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("Opportunity");
    expect(html).toContain("Trust");
    expect(html).toContain("Size");
    expect(html).toContain("Action");
    expect(html).not.toContain("Intent");
    expect(html).not.toContain("Sense");
    expect(html).not.toContain("Pulse");
    expect(html).not.toContain("Core");
    expect(html).not.toContain("Judgement");
    expect(html).not.toContain("Reflection");
  });

  it("keeps numbers and system notes behind progressive disclosure modes", () => {
    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain("Answer");
    expect(html).toContain("Why");
    expect(html).toContain("Evidence");
    expect(html).toContain("Numbers");
    expect(html).toContain("Notes");
    expect(html).not.toContain("Advanced");
    expect(html).not.toContain("Expert");
    expect(html).not.toContain("Debug");
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
