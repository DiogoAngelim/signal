import { describe, expect, it } from "vitest";
import { evaluateDecisionStates } from "./engine";

describe("decision state separation", () => {
  it("keeps trust, permission, capacity, and urgency independent", () => {
    const states = evaluateDecisionStates({
      confidence: 91,
      opportunity: 88,
      risk: 30,
      trust: { score: 84, status: "trusted", reasons: ["Stable outcomes."] },
      permission: { allowed: false, level: "blocked", reasons: ["Manual policy lock."] },
      capacity: { maxExposure: 12, mode: "normal", reasons: ["Sizing is normal."] },
      urgency: { score: 90, mode: "act_now", reasons: ["Window is closing."] },
    });

    expect(states.trust.status).toBe("trusted");
    expect(states.permission.allowed).toBe(false);
    expect(states.capacity.mode).toBe("normal");
    expect(states.urgency.mode).toBe("act_now");
  });

  it("handles low trust with high opportunity without granting permission", () => {
    const states = evaluateDecisionStates({
      opportunity: 94,
      risk: 25,
      trustGovernor: {
        trustScore: 42,
        allowsNewExposure: true,
        maxExposure: 8,
        requiresReview: true,
      },
    });

    expect(states.trust.status).toBe("untrusted");
    expect(states.permission.level).toBe("review_required");
    expect(states.capacity.mode).toBe("reduced");
    expect(states.urgency.score).toBeGreaterThan(70);
  });

  it("keeps high trust from expanding low capacity", () => {
    const states = evaluateDecisionStates({
      trust: 92,
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      trustGovernor: { maxExposure: 1 },
      readiness: { maxPositionPct: 12 },
    });

    expect(states.trust.status).toBe("highly_trusted");
    expect(states.capacity.maxExposure).toBe(1);
    expect(states.capacity.mode).toBe("micro");
  });

  it("zeros capacity and urgency when hard blockers exist", () => {
    const states = evaluateDecisionStates({
      trustGovernor: { trustScore: 78, allowsNewExposure: false, maxExposure: 10 },
      executionQuality: { status: "blocked", timingUrgency: 90, blockers: ["Data stale."] },
    });

    expect(states.permission.level).toBe("blocked");
    expect(states.capacity.maxExposure).toBe(0);
    expect(states.urgency.mode).toBe("none");
    expect(states.audit.hardBlockers).toContain("Trust governor does not allow new exposure.");
  });

  it("distinguishes approved, limited, normal, expanded, and urgent computed states", () => {
    const approved = evaluateDecisionStates({
      trust: 82,
      capacity: 14,
      urgency: 64,
      opportunity: 72,
      risk: 24,
    });
    const limited = evaluateDecisionStates({
      trust: 64,
      capacity: 8,
      executionQuality: { status: "poor", timingUrgency: 48 },
    });
    const expanded = evaluateDecisionStates({
      trust: 95,
      capacity: 30,
      urgency: 90,
    });

    expect(approved.permission.level).toBe("approved");
    expect(approved.capacity.mode).toBe("normal");
    expect(approved.urgency.mode).toBe("act_soon");
    expect(limited.permission.level).toBe("limited");
    expect(limited.capacity.mode).toBe("reduced");
    expect(expanded.capacity.mode).toBe("expanded");
    expect(expanded.urgency.mode).toBe("act_now");
  });
});
