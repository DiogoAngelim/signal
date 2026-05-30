import { describe, expect, it } from "vitest";
import { planReadinessRemediation } from "./engine";

describe("Readiness Remediation Planner", () => {
  it("ranks specific trust and robustness blockers before duplicated generic flags", () => {
    const result = planReadinessRemediation({
      gates: [
        {
          id: "robustness",
          label: "Robustness risk",
          category: "robustness",
          passed: false,
          score: 52,
          severity: "high",
          reason: "Robustness overfit risk is above the production threshold.",
          unlockCriteria: ["Reduce overfit risk to 30% or lower."],
        },
        {
          id: "benchmark",
          label: "Benchmark comparison",
          passed: false,
          score: 44,
          severity: "bad" as any,
          reason: "Benchmark edge is below margin.",
        },
        {
          id: "data",
          label: "Data reliability",
          category: "data_reliability",
          passed: true,
          score: 100,
          severity: "good" as any,
        },
      ],
      failureFlags: ["ROBUSTNESS_OVERFIT_RISK", "BENCHMARK_FAILED", "WEAK_BENCHMARK_MARGIN"],
      trust: {
        trustScore: 35,
        confidenceCap: 35,
        participationMode: "exits_only",
        primaryBlocker: "robustness_overfit_risk",
        blockers: [{
          id: "robustness_overfit_risk",
          severity: "high",
          reason: "Robustness overfit risk is above the execution threshold.",
          unlockCriteria: ["Retest on independent periods before allowing exposure."],
        }],
      },
      robustness: {
        overfitRisk: 48,
        deploymentReadiness: 64,
        safetyGate: "reduce",
      },
      context: {
        readinessScore: 48,
        maxConfidence: 35,
        currentStage: "Research only",
        targetStage: "Limited live",
      },
    });

    expect(result.module).toBe("signal.readiness-remediation-planner");
    expect(result.executionGate).toBe("review");
    expect(result.status).toBe("review");
    expect(result.targetStage).toBe("Limited live");
    expect(result.steps[0]?.category).toBe("robustness");
    expect(result.steps.filter((step) => step.category === "robustness")).toHaveLength(1);
    expect(result.steps[0]?.reason).toMatch(/execution threshold/i);
    expect(result.steps[0]?.unlocks.join(" ")).toMatch(/independent periods/i);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.totalExpectedTrustLift).toBeGreaterThan(0);
    expect(result.audit).toMatchObject({
      inputGateCount: 3,
      failedGateCount: 2,
      failureFlagCount: 3,
    });
  });

  it("creates calibration remediation from warnings even when gates are not supplied", () => {
    const result = planReadinessRemediation({
      calibration: {
        status: "trusted",
        sampleSize: 120,
        rawConfidence: 85,
        calibratedConfidence: 55,
        trustworthiness: 62,
        warnings: ["overconfidence", "unstable outcomes"],
      },
      trust: {
        participationMode: "paper",
        trustScore: 60,
        unlockCriteria: ["Observe more closed outcomes."],
      },
      context: {
        allowsNewExposure: false,
      },
    });

    expect(result.executionGate).toBe("blocked");
    expect(result.status).toBe("blocked");
    expect(result.steps.map((step) => step.category)).toContain("calibration");
    expect(result.steps.map((step) => step.category)).toContain("capacity");
    expect(result.steps.find((step) => step.category === "calibration")?.severity).toBe("high");
  });

  it("separates unstable and poor calibration remediation reasons", () => {
    const unstable = planReadinessRemediation({
      calibration: {
        status: "unstable-outcomes",
        rawConfidence: 60,
        calibratedConfidence: 58,
        trustworthiness: 61,
        warnings: [],
      },
    });
    const poor = planReadinessRemediation({
      calibration: {
        status: "poor-calibration",
        rawConfidence: 60,
        calibratedConfidence: 58,
        trustworthiness: 61,
        warnings: [],
      },
    });

    expect(unstable.steps[0]?.reason).toMatch(/outcomes are unstable/i);
    expect(poor.steps[0]?.severity).toBe("medium");
    expect(poor.steps[0]?.reason).toMatch(/quality does not support/i);
  });

  it("handles warning-only calibration and deployment-only robustness inputs", () => {
    const result = planReadinessRemediation({
      calibration: {
        status: "",
        calibratedConfidence: 50,
        warnings: ["poor calibration"],
      },
      robustness: {
        deploymentReadiness: 40,
        robustnessScore: 44,
      },
    });

    const calibration = result.steps.find((step) => step.category === "calibration");
    const robustness = result.steps.find((step) => step.category === "robustness");

    expect(calibration?.sourceIds).toContain("calibration");
    expect(calibration?.metrics.currentScore).toBe(50);
    expect(robustness?.metrics.currentScore).toBe(44);
    expect(robustness?.severity).toBe("high");
  });

  it("uses severity as a stable tiebreaker when expected lift matches", () => {
    const result = planReadinessRemediation({
      gates: [
        {
          id: "robustness",
          category: "robustness",
          passed: false,
          score: 70,
          targetScore: 70,
          severity: "critical",
        },
        {
          id: "benchmark",
          category: "benchmark",
          passed: false,
          score: 25,
          targetScore: 70,
          severity: "high",
        },
      ],
    });

    expect(result.steps[0]?.category).toBe("robustness");
    expect(result.steps[0]?.expectedTrustLift).toBe(result.steps[1]?.expectedTrustLift);
  });

  it("returns a ready plan when all inputs are clear", () => {
    const result = planReadinessRemediation({
      gates: [
        { id: "liveSignal", label: "Live signal match", passed: true, score: 91 },
        { id: "riskControl", label: "Risk control", passed: true, score: 88 },
      ],
      calibration: {
        status: "trusted",
        calibratedConfidence: 82,
        trustworthiness: 88,
        warnings: [],
      },
      robustness: {
        overfitRisk: 12,
        deploymentReadiness: 86,
        safetyGate: "allow",
      },
      trust: {
        participationMode: "normal",
        blockers: [],
      },
      context: {
        readinessScore: 90,
        maxConfidence: 84,
        allowsNewExposure: true,
      },
    });

    expect(result.status).toBe("ready");
    expect(result.executionGate).toBe("open");
    expect(result.steps).toEqual([]);
    expect(result.topAction).toBe("No remediation required");
    expect(result.summary).toBe("No readiness remediation is required.");
  });

  it("returns a ready plan when diagnostics are omitted", () => {
    const result = planReadinessRemediation();

    expect(result.status).toBe("ready");
    expect(result.executionGate).toBe("open");
    expect(result.audit.inputGateCount).toBe(0);
  });

  it("keeps low-severity remediation in watch mode when execution stays open", () => {
    const result = planReadinessRemediation({
      gates: [
        { id: "agency", label: "Agency review", category: "agency", passed: false, score: 75, targetScore: 70 },
        { id: "judgement", label: "Judgement review", category: "judgement", passed: false, score: 65, targetScore: 70 },
        { id: "capacity", label: "Capacity", category: "capacity", passed: false, score: 51, targetScore: 70 },
      ],
      trust: { participationMode: "normal", blockers: [] },
      context: { allowsNewExposure: true },
    });

    expect(result.executionGate).toBe("open");
    expect(result.status).toBe("watch");
    expect(result.steps.find((step) => step.category === "agency")?.status).toBe("watch");
    expect(result.steps.find((step) => step.category === "judgement")?.status).toBe("review");
    expect(result.steps.find((step) => step.category === "capacity")?.status).toBe("review");
  });

  it("normalizes unknown, critical, and low-score inputs deterministically", () => {
    const result = planReadinessRemediation({
      gates: [
        {
          id: "mystery",
          label: "Unclassified blocker",
          passed: false,
          score: 10,
          targetScore: 70,
          evidenceRequired: ["Manual diagnosis"],
          value: null,
        },
        {
          id: "capacity-watch",
          label: "Capacity watch",
          category: "capacity",
          passed: false,
          score: 69,
          severity: "low",
        },
      ],
      failureFlags: [
        "DATA_QUALITY_NOT_PROMOTABLE",
        "LIVE_SIGNAL_MISMATCH",
        "HIGH_DRAWDOWN",
        "BELIEF_WEAK",
        "JUDGEMENT_REVIEW_REQUIRED",
        "AGENCY_REVIEW_GATE",
        "UNMAPPED_THING",
      ],
      trust: {
        participationMode: "blocked",
        blockers: [{
          id: "data_reliability_unusable",
          severity: "critical",
          label: "Data reliability unusable",
        }],
      },
      calibration: {
        status: "insufficient-history",
        calibratedConfidence: 48,
        trustworthiness: 49,
        warnings: [],
      },
      robustness: {
        overfitRiskPct: 72,
        deploymentReadinessScore: 40,
        safetyGate: "block",
        robustnessScore: 30,
      },
      context: {
        readinessScore: 44,
        maxConfidence: 45,
      },
    });

    const categories = result.steps.map((step) => step.category);
    expect(result.executionGate).toBe("blocked");
    expect(result.status).toBe("blocked");
    expect(categories).toContain("data_reliability");
    expect(categories).toContain("live_signal");
    expect(categories).toContain("risk_control");
    expect(categories).toContain("belief");
    expect(categories).toContain("judgement");
    expect(categories).toContain("agency");
    expect(categories).toContain("other");
    expect(result.steps.find((step) => step.category === "other")?.metrics.currentScore).toBe(10);
    expect(result.steps.find((step) => step.category === "capacity")?.severity).toBe("low");
  });

  it("classifies alternate remediation vocabulary and missing scores", () => {
    const result = planReadinessRemediation({
      gates: [
        { id: "manual", label: "Manual review", category: "other", passed: false },
        { id: "benchmark", passed: false, score: 50 },
        { id: "exposure", label: "Exposure cap", category: "capacity", passed: false, score: 50, targetScore: 70 },
      ],
      failureFlags: [
        "LOW_SHARPE",
        "WALK_FORWARD_UNSTABLE",
        "PARAMETER_INSTABILITY",
        "CALIBRATION_FAILURE",
        "PERIOD_DRIFT",
        "RISK_ADJUSTED_DROP",
        "VARIANT_FRAGILITY",
        "TOP_WINNER_RISK",
        "EXPOSURE_CAPACITY",
        "SYNTHETIC_DATA_FOR_PROMOTION",
        "FORWARD_SHADOW_MISSING",
        "JUDGMENT_REVIEW_REQUIRED",
      ],
    });

    const categories = result.steps.map((step) => step.category);
    expect(categories).toContain("benchmark");
    expect(categories).toContain("walk_forward");
    expect(categories).toContain("strategy_edge");
    expect(categories).toContain("parameter_stability");
    expect(categories).toContain("concentration");
    expect(categories).toContain("capacity");
    expect(categories).toContain("data_reliability");
    expect(categories).toContain("live_signal");
    expect(categories).toContain("judgement");
    expect(result.steps.find((step) => step.category === "other")?.severity).toBe("medium");
    expect(result.steps.find((step) => step.category === "capacity")?.severity).toBe("high");
  });

  it("falls back cleanly for sparse optional diagnostics", () => {
    const result = planReadinessRemediation({
      calibration: {
        rawConfidence: 55,
      },
      trust: {
        blockers: [{}],
      },
    });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      category: "other",
      reason: "Trust Governor blocks increased participation.",
      severity: "medium",
      sourceIds: ["trust-0"],
    });
  });
});
