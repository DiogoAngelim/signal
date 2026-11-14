import { describe, expect, it } from "vitest";
import { evaluateDecision } from "./pipeline";
import { diagnoseNativeDecisionPermission } from "./permission-diagnostics";

const MODULES = [
  "discovery", "judgment", "purpose", "need", "trust", "reflection",
  "recovery", "memory", "learning", "calibration", "identity", "awareness", "agency",
] as const;

function evaluate(score: number) {
  return evaluateDecision({
    decisionId: `permission-diagnostic-${score}`,
    createdAt: "2026-11-14T00:00:00.000Z",
    observation: { synthetic: true },
    action: { operation: "synthetic-only" },
    modules: Object.fromEntries(MODULES.map((module) => [module, score])),
    prediction: {
      currentScore: score,
      expectedReward: score,
      expectedRisk: 100 - score,
      uncertainty: 100 - score,
      purposeAlignment: score,
      needAlignment: score,
      confidence: score,
    },
    wisdom: {
      expectedReward: score,
      downsideRisk: 100 - score,
      irreversibleRisk: 30,
      survivalPriority: 80,
      longTermAlignment: score,
      shortTermTemptation: score,
      uncertainty: 100 - score,
      confidence: score,
    },
  });
}

describe("read-only native veto diagnosis", () => {
  it("reports the actual simulation wait without ever authorizing action", () => {
    let waited = 0;
    for (let s = 25; s <= 95; s += 5) {
      const native = evaluate(s);
      const d = diagnoseNativeDecisionPermission(native);
      expect(d.nativeActionAllowed).toBe(native.actionAllowed);
      expect(d.nativeActionScale).toBe(native.actionScale);
      expect(d.nativePermissionIsDomainAuthorization).toBe(false);
      expect(d.simulationSelectedVariant).toBe(native.record.simulation?.actionVariant);
      expect(Number.isFinite(d.simulationSelectedCompositeScore)).toBe(true);
      if (native.simulationRecommendation === "wait") {
        waited++;
        expect(d.vetoReasons).toContain("simulation_wait");
        expect(d.permissionClass).toBe("denied");
      }
      if (!native.actionAllowed) expect(d.vetoReasons.length).toBeGreaterThan(0);
      if (native.actionAllowed && native.actionScale < 1)
        expect(d.permissionClass).toBe("partial");
    }
    expect(waited).toBeGreaterThan(0);
  });

  it("rejects zero-scale permission and a stored action on denial", () => {
    const r = evaluate(75);
    expect(() => diagnoseNativeDecisionPermission({
      ...r, actionAllowed: true, actionScale: 0,
    })).toThrow(/Inconsistent native allowance/);
    if (!r.actionAllowed) {
      expect(() => diagnoseNativeDecisionPermission({
        ...r,
        record: { ...r.record, action: { forbidden: true } },
      })).toThrow(/must not carry/);
    }
  });

  it("is deterministic, immutable and never retunes scores", () => {
    const r = evaluate(85);
    const before = JSON.stringify(r);
    const a = diagnoseNativeDecisionPermission(r);
    const b = diagnoseNativeDecisionPermission(r);
    expect(a).toEqual(b);
    expect(JSON.stringify(r)).toEqual(before);
  });
});
