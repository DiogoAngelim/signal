import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

    assert.equal(result.module, "signal.readiness-remediation-planner");
    assert.equal(result.executionGate, "review");
    assert.equal(result.status, "review");
    assert.equal(result.targetStage, "Limited live");
    assert.equal(result.steps[0]?.category, "robustness");
    assert.equal(result.steps.filter((step) => step.category === "robustness").length, 1);
    assert.match(result.steps[0]?.reason ?? "", /execution threshold/i);
    assert.match(result.steps[0]?.unlocks.join(" ") ?? "", /independent periods/i);
    assert.ok(result.blockers.length > 0);
    assert.ok(result.totalExpectedTrustLift > 0);
    assert.deepEqual(
      {
        inputGateCount: result.audit.inputGateCount,
        failedGateCount: result.audit.failedGateCount,
        failureFlagCount: result.audit.failureFlagCount,
      },
      {
        inputGateCount: 3,
        failedGateCount: 2,
        failureFlagCount: 3,
      },
    );
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

    assert.equal(result.executionGate, "blocked");
    assert.equal(result.status, "blocked");
    assert.ok(result.steps.map((step) => step.category).includes("calibration"));
    assert.ok(result.steps.map((step) => step.category).includes("capacity"));
    assert.equal(result.steps.find((step) => step.category === "calibration")?.severity, "high");
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

    assert.match(unstable.steps[0]?.reason ?? "", /outcomes are unstable/i);
    assert.equal(poor.steps[0]?.severity, "medium");
    assert.match(poor.steps[0]?.reason ?? "", /quality does not support/i);
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

    assert.ok(calibration?.sourceIds.includes("calibration"));
    assert.equal(calibration?.metrics.currentScore, 50);
    assert.equal(robustness?.metrics.currentScore, 44);
    assert.equal(robustness?.severity, "high");
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

    assert.equal(result.steps[0]?.category, "robustness");
    assert.equal(result.steps[0]?.expectedTrustLift, result.steps[1]?.expectedTrustLift);
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

    assert.equal(result.status, "ready");
    assert.equal(result.executionGate, "open");
    assert.deepEqual(result.steps, []);
    assert.equal(result.topAction, "No remediation required");
    assert.equal(result.summary, "No readiness remediation is required.");
  });

  it("returns a ready plan when diagnostics are omitted", () => {
    const result = planReadinessRemediation();

    assert.equal(result.status, "ready");
    assert.equal(result.executionGate, "open");
    assert.equal(result.audit.inputGateCount, 0);
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

    assert.equal(result.executionGate, "open");
    assert.equal(result.status, "watch");
    assert.equal(result.steps.find((step) => step.category === "agency")?.status, "watch");
    assert.equal(result.steps.find((step) => step.category === "judgement")?.status, "review");
    assert.equal(result.steps.find((step) => step.category === "capacity")?.status, "review");
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
    assert.equal(result.executionGate, "blocked");
    assert.equal(result.status, "blocked");
    assert.ok(categories.includes("data_reliability"));
    assert.ok(categories.includes("live_signal"));
    assert.ok(categories.includes("risk_control"));
    assert.ok(categories.includes("belief"));
    assert.ok(categories.includes("judgement"));
    assert.ok(categories.includes("agency"));
    assert.ok(categories.includes("other"));
    assert.equal(result.steps.find((step) => step.category === "other")?.metrics.currentScore, 10);
    assert.equal(result.steps.find((step) => step.category === "capacity")?.severity, "low");
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
    assert.ok(categories.includes("benchmark"));
    assert.ok(categories.includes("walk_forward"));
    assert.ok(categories.includes("strategy_edge"));
    assert.ok(categories.includes("parameter_stability"));
    assert.ok(categories.includes("concentration"));
    assert.ok(categories.includes("capacity"));
    assert.ok(categories.includes("data_reliability"));
    assert.ok(categories.includes("live_signal"));
    assert.ok(categories.includes("judgement"));
    assert.equal(result.steps.find((step) => step.category === "other")?.severity, "medium");
    assert.equal(result.steps.find((step) => step.category === "capacity")?.severity, "high");
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

    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0]?.category, "other");
    assert.equal(result.steps[0]?.reason, "Trust Governor blocks increased participation.");
    assert.equal(result.steps[0]?.severity, "medium");
    assert.deepEqual(result.steps[0]?.sourceIds, ["trust-0"]);
  });
});
