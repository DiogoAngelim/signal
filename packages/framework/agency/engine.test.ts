import { describe, expect, it } from "vitest";
import { type AgencyInput, authorize, commit } from "./engine";

function decision(
  overrides: AgencyInput["decision"] = {},
): AgencyInput["decision"] {
  return {
    id: "decision-1",
    type: "generic-action",
    confidence: 82,
    uncertainty: 18,
    risk: 20,
    impact: 30,
    ...overrides,
  };
}

describe("authorize", () => {
  it("approves a decision when authority, constraints, reflection, and readiness pass", () => {
    const result = authorize({
      decision: decision({ impact: undefined, expectedValue: 30 }),
      reflection: { reflectionScore: 88, recommendedConfidenceCap: 95 },
      authority: { level: "operator" },
      requiredAuthority: "observer",
      constraints: [
        { id: "quality", type: "quality-requirement", value: 90, limit: 70 },
        { id: "budget", type: "resource-budget", value: 20, limit: 50 },
      ],
      reviewPolicy: { mode: "fully autonomous" },
      execution: { readiness: 90 },
      thresholds: { minAgencyScore: 50 },
    });

    expect(result.status).toBe("approved");
    expect(result.agencyScore).toBeGreaterThan(80);
    expect(result.commitmentConfidence).toBeGreaterThan(80);
    expect(result.executionReadiness).toBe(90);
    expect(result.constraintEvaluation.passed).toBe(true);
    expect(result.reviewRequirement.required).toBe(false);
  });

  it("uses calibrated confidence instead of raw confidence", () => {
    const result = authorize({
      decision: decision({ confidence: 90, uncertainty: undefined }),
      calibration: {
        rawConfidence: 90,
        calibratedConfidence: 45,
        trustworthiness: 42,
        warnings: ["poor calibration"],
      },
      authority: "autonomous",
      thresholds: { minDecisionConfidence: 60 },
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("deferred");
    expect(result.rawConfidence).toBe(90);
    expect(result.calibratedConfidence).toBe(45);
    expect(result.trustworthiness).toBe(42);
    expect(result.agency).toMatchObject({
      action: "deferred",
      rawConfidence: 90,
      calibratedConfidence: 45,
      trustworthiness: 42,
      calibrationWarnings: ["poor calibration"],
    });
    expect(result.reasons).toContain(
      "Agency became more conservative because calibrated confidence is materially below raw confidence.",
    );
  });

  it("denies when authority is below the required level", () => {
    const result = authorize({
      decision: decision(),
      authority: "observer",
      requiredAuthority: "supervisor",
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("denied");
    expect(result.authorityEvaluation.sufficient).toBe(false);
    expect(result.reasons).toContain("Agency denied commitment.");
  });

  it("defers when no decision exists", () => {
    const result = authorize({
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("deferred");
    expect(result.audit.statusResolution).toContain(
      "No decision was supplied.",
    );
  });

  it("supports escalation for insufficient authority", () => {
    const result = authorize({
      decision: decision(),
      authority: "operator",
      requiredAuthority: "autonomous",
      statusOnInsufficientAuthority: "escalated",
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("escalated");
    expect(result.reasons).toContain("Agency escalated commitment.");
  });

  it("requires human review for always-review policy", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      requiredAuthority: "operator",
      reviewPolicy: { mode: "always review", reason: "Manual checkpoint." },
    });

    expect(result.status).toBe("requires-review");
    expect(result.reviewRequirement.required).toBe(true);
    expect(result.reviewRequirement.reason).toBe("Manual checkpoint.");
  });

  it("requires review above threshold and when confidence is low", () => {
    const aboveThreshold = authorize({
      decision: decision({ impact: 95 }),
      authority: "autonomous",
      reviewPolicy: {
        mode: "review above threshold",
        threshold: 80,
        statusWhenRequired: "escalated",
      },
    });
    const lowConfidence = authorize({
      decision: decision({ confidence: 30 }),
      authority: "autonomous",
      reviewPolicy: {
        mode: "review when confidence is low",
        confidenceThreshold: 50,
      },
    });

    expect(aboveThreshold.status).toBe("escalated");
    expect(lowConfidence.status).toBe("requires-review");
  });

  it("denies on hard constraint violation", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      constraints: [
        {
          id: "risk",
          type: "risk-budget",
          value: 90,
          limit: 40,
          severity: "critical",
        },
      ],
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("denied");
    expect(result.constraintEvaluation.violations[0]?.id).toBe("risk");
    expect(result.executionReadiness).toBeLessThanOrEqual(35);
  });

  it("detects rate-limit violations and limits non-hard failures", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      constraints: [
        {
          id: "rate",
          type: "rate-limit",
          value: 12,
          limit: 10,
          severity: "medium",
          hard: false,
        },
      ],
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("limited");
    expect(result.constraintEvaluation.passed).toBe(false);
    expect(result.reasons).toContain(
      "Agency limited commitment due to non-hard constraints.",
    );
  });

  it("defers when uncertainty or reflection thresholds fail", () => {
    const uncertain = authorize({
      decision: decision({ uncertainty: 85 }),
      reflection: { reflectionScore: 80 },
      authority: "autonomous",
      thresholds: { maxUncertainty: 50 },
      reviewPolicy: { mode: "fully-autonomous" },
    });
    const lowReflection = authorize({
      decision: decision(),
      reflection: { reflectionScore: 20 },
      authority: "autonomous",
      thresholds: { minReflectionScore: 50 },
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(uncertain.status).toBe("deferred");
    expect(lowReflection.status).toBe("deferred");
  });

  it("supports autonomous approval and custom authority levels", () => {
    const result = commit({
      decision: decision({ confidence: 0.91, uncertainty: 0.05 }),
      authority: { level: "agentic", score: 95 },
      requiredAuthority: "agentic",
      authorityModel: { agentic: 90 },
      reviewPolicy: { mode: "autonomous" },
      execution: { readiness: 0.93 },
    });

    expect(result.status).toBe("approved");
    expect(result.authorityEvaluation.providedLevel).toBe("agentic");
    expect(result.executionReadiness).toBe(93);
  });

  it("supports custom authority arrays and numeric required authority", () => {
    const result = authorize({
      decision: decision(),
      authority: { level: "lead" },
      requiredAuthority: 60,
      authorityModel: [{ level: "lead", score: 65 }],
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("approved");
    expect(result.authorityEvaluation.requiredScore).toBe(60);
  });

  it("supports empty and unknown authority fallbacks", () => {
    const observerless = authorize({
      decision: decision(),
      authority: { score: 100 },
      requiredAuthority: "none",
      reviewPolicy: { mode: "fully-autonomous" },
    });
    const unknown = authorize({
      decision: decision(),
      authority: "temporary-reviewer",
      requiredAuthority: "none",
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(observerless.status).toBe("approved");
    expect(observerless.authorityEvaluation.providedLevel).toBe("none");
    expect(observerless.authorityEvaluation.score).toBe(100);
    expect(unknown.status).toBe("approved");
    expect(unknown.authorityEvaluation.providedScore).toBe(0);
  });

  it("supports custom constraint policies and rollback status", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      constraints: [
        {
          id: "integrity",
          type: "custom",
          passed: false,
          severity: "critical",
          statusOnViolation: "rollback",
          reason: "Integrity guard failed.",
        },
      ],
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("rollback");
    expect(result.reasons).toContain("Agency requested rollback.");
  });

  it("supports explicit rollback requests", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      execution: { rollbackRequested: true },
    });

    expect(result.status).toBe("rollback");
    expect(result.audit.statusResolution).toContain(
      "Execution requested rollback.",
    );
  });

  it("evaluates generic constraint operators and min/max", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      constraints: [
        { id: "lt", value: 4, limit: 5, operator: "<" },
        { id: "lte", value: 5, limit: 5, operator: "<=" },
        { id: "gt", value: 6, limit: 5, operator: ">" },
        { id: "gte", value: 5, limit: 5, operator: ">=" },
        { id: "eq", value: 5, limit: 5, operator: "==" },
        { id: "neq", value: 4, limit: 5, operator: "!=" },
        { id: "range", value: 7, min: 5, max: 10 },
        {
          id: "unknown-operator",
          value: 4,
          limit: 5,
          operator: "approximately" as never,
        },
        { id: "explicit", passed: true, severity: "strange" },
      ],
    });

    expect(result.status).toBe("approved");
    expect(
      result.constraintEvaluation.constraints.every(
        (constraint) => constraint.passed,
      ),
    ).toBe(true);
  });

  it("limits decisions when soft min and max constraints fail", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      constraints: [
        { id: "floor", value: 2, min: 5, severity: "low", hard: false },
        { id: "ceiling", value: 12, max: 10, severity: "medium", hard: false },
      ],
    });

    expect(result.status).toBe("limited");
    expect(
      result.constraintEvaluation.violations.map((violation) => violation.id),
    ).toEqual(["floor", "ceiling"]);
  });

  it("covers high and critical non-hard constraint scoring", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      constraints: [
        {
          id: "high-soft",
          value: 12,
          limit: 10,
          severity: "high",
          hard: false,
        },
        {
          id: "critical-soft",
          value: 12,
          limit: 10,
          severity: "critical",
          hard: false,
        },
      ],
    });

    expect(result.status).toBe("limited");
    expect(
      result.constraintEvaluation.constraints.find(
        (item) => item.id === "high-soft",
      )?.score,
    ).toBe(35);
    expect(
      result.constraintEvaluation.constraints.find(
        (item) => item.id === "critical-soft",
      )?.score,
    ).toBe(10);
  });

  it("denies high-severity hard violations with the default constraint status", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      constraints: [
        { id: "hard-high", value: 12, limit: 10, severity: "high", hard: true },
      ],
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("denied");
    expect(result.constraintEvaluation.constraints[0]?.score).toBe(0);
  });

  it("handles malformed constraints safely", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      constraints: [{ id: "", type: "custom", severity: "low", hard: false }],
    });

    expect(result.status).toBe("limited");
    expect(result.constraintEvaluation.constraints[0]?.id).toBe("constraint");
  });

  it("handles null runtime constraints as an empty constraint list", () => {
    const result = authorize({
      decision: decision(),
      authority: "autonomous",
      constraints: null as never,
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("approved");
    expect(result.constraintEvaluation.constraints).toEqual([]);
  });

  it("defers when execution readiness or agency score are insufficient", () => {
    const notReady = authorize({
      decision: decision(),
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      execution: { readiness: 0 },
    });
    const lowScore = authorize({
      decision: decision(),
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      thresholds: { minAgencyScore: 99 },
    });

    expect(notReady.status).toBe("deferred");
    expect(lowScore.status).toBe("deferred");
    expect(lowScore.audit.statusResolution).toContain(
      "Execution readiness or agency score is insufficient.",
    );
  });

  it("requires review for uncertainty and default review policies", () => {
    const uncertainty = authorize({
      decision: decision({ uncertainty: 80 }),
      authority: "autonomous",
      reviewPolicy: { mode: "high uncertainty", uncertaintyThreshold: 50 },
    });
    const defaultLowConfidence = authorize({
      decision: decision({ confidence: 40 }),
      reflection: { reflectionScore: 90 },
      authority: "autonomous",
      reviewPolicy: { mode: "default", confidenceThreshold: 50 },
    });
    const defaultLowReflection = authorize({
      decision: decision(),
      reflection: { reflectionScore: 40 },
      authority: "autonomous",
      reviewPolicy: { mode: "default" },
    });

    expect(uncertainty.status).toBe("requires-review");
    expect(uncertainty.reviewRequirement.mode).toBe(
      "review-when-uncertainty-high",
    );
    expect(defaultLowConfidence.status).toBe("requires-review");
    expect(defaultLowReflection.status).toBe("requires-review");
  });

  it("defers low-confidence decisions with the default low-confidence status", () => {
    const result = authorize({
      decision: decision({ confidence: 20 }),
      authority: "autonomous",
      thresholds: { minDecisionConfidence: 40 },
      reviewPolicy: { mode: "fully-autonomous" },
    });

    expect(result.status).toBe("deferred");
    expect(result.audit.statusResolution).toContain(
      "Decision confidence is below threshold.",
    );
  });

  it("can use custom low-confidence status and blocked execution", () => {
    const result = authorize({
      decision: decision({ confidence: 20 }),
      authority: "autonomous",
      thresholds: { minDecisionConfidence: 40 },
      statusOnLowConfidence: "needs-more-evidence",
      reviewPolicy: { mode: "fully-autonomous" },
      execution: { blocked: true, reasons: ["Executor is offline."] },
    });

    expect(result.status).toBe("needs-more-evidence");
    expect(result.executionReadiness).toBe(0);
    expect(result.reasons).toContain("Executor is offline.");
  });
});
