import { describe, expect, it } from "vitest";
import { authorize } from "../agency/engine";
import { SignalFrameworkEngine } from "../core/engine";
import { MetricRegistry } from "../metrics/registry";
import { evaluatePruning } from "../pruning/engine";
import { evaluatePurpose } from "../purpose/engine";
import type { MetricInput, PerceptionLayerKey } from "../types";
import { evaluateDecisionQuality } from "../wisdom/engine";
import { HUMAN_NEEDS, evaluateMeaning } from "./engine";

describe("meaning interpretation", () => {
  it("transforms required negative and positive desires deterministically", () => {
    const cases = [
      [
        "I want to gamble everything.",
        -10,
        "excitement",
        "controlled exposure",
      ],
      ["I want revenge on the market.", -9, "control", "disciplined recovery"],
      [
        "I want to recover my losses quickly.",
        -7,
        "security",
        "confidence and capital",
      ],
      ["I want to get rich fast.", -6, "freedom", "financial freedom"],
      [
        "I want to never lose again.",
        -5,
        "safety",
        "uncertainty cannot be eliminated",
      ],
      ["I want steady progress.", 7, "stability", "consistent progress"],
      ["I want to become excellent.", 10, "mastery", "decision quality"],
      ["I want financial freedom.", 8, "freedom", "durable financial choices"],
      ["I want safety.", 6, "safety", "Protect what matters"],
      ["I want excitement.", 3, "excitement", "bounded exploration"],
      ["I want to stop feeling behind.", -5, "esteem", "steady progress"],
    ] as const;

    for (const [text, score, need, goal] of cases) {
      const first = evaluateMeaning({ text });
      const second = evaluateMeaning({ text });

      expect(first).toEqual(second);
      expect(first.gravityScore).toBe(score);
      expect(first.primaryNeed).toBe(need);
      expect(first.transformedGoal).toContain(goal);
      expect(first.transformedGoal.length).toBeGreaterThan(0);
      expect(HUMAN_NEEDS).toContain(first.primaryNeed);
      expect(
        first.secondaryNeeds.every((item) => HUMAN_NEEDS.includes(item)),
      ).toBe(true);
      expect(first.gravityScore).toBeGreaterThanOrEqual(-10);
      expect(first.gravityScore).toBeLessThanOrEqual(10);
    }
  });

  it("handles ambiguous, empty, contradictory, hostile, long, and unsupported inputs safely", () => {
    const empty = evaluateMeaning({ text: "" });
    const vague = evaluateMeaning({ text: "maybe something better" });
    const mixed = evaluateMeaning({
      text: "I want to grow aggressively but I do not want to blow up.",
    });
    const hostile = evaluateMeaning({ text: "I want to destroy them." });
    const long = evaluateMeaning({
      text: `I want steady progress. ${"safe ".repeat(1_000)}`,
    });
    const unsupported = evaluateMeaning({ text: "Quero recuperar rapido" });

    expect(empty.needConfidence).toBeLessThan(0.45);
    expect(vague.needConfidence).toBeLessThan(0.55);
    expect(mixed.gravityScore).toBe(5);
    expect(mixed.safetyConstraints.join(" ")).toMatch(/risk of ruin|survival/i);
    expect(hostile.purposeInputs.actionPermission).toBe("block");
    expect(long.transformedGoal).toBeTruthy();
    expect(unsupported.needConfidence).toBeLessThan(0.7);
  });

  it("generates purpose context, respectful explanations, and full trace fields", () => {
    const result = evaluateMeaning({
      text: "I want to recover my losses quickly.",
    });

    expect(result.explanation).not.toMatch(/bad|irrational|greedy|weak/i);
    expect(result.purposeInputs.literalDesireUnsafe).toBe(true);
    expect(result.purposeInputs.actionPermission).toBe("review");
    expect(result.safetyConstraints.length).toBeGreaterThan(0);
    expect(result.riskWarnings.length).toBeGreaterThan(0);
    expect(result.trace.detectedDesireTerms).toContain(
      "recover losses quickly",
    );
    expect(result.trace.detectedEmotionalMarkers).toContain("urgency");
    expect(result.trace.gravityFactors.length).toBeGreaterThan(0);
    expect(result.trace.transformationRuleUsed).toBe("loss-recovery-fast");
    expect(result.trace.missingContext).toContain("domain context");
  });
});

describe("meaning integration", () => {
  it("feeds Purpose and lowers confidence for unsafe literal desire", () => {
    const meaning = evaluateMeaning({
      text: "I want to recover my losses quickly.",
    });
    const purpose = evaluatePurpose({
      ambition: 85,
      meaning,
      currentPath: { alignment: 80, survivability: 80, progress: 65 },
    });

    expect(purpose.purposeStatement).toContain("Recover confidence");
    expect(purpose.warnings).toContain(
      "Meaning transformed an unsafe literal desire before Purpose alignment.",
    );
    expect(purpose.purposeConfidence).toBeLessThan(72);
  });

  it("feeds Wisdom, Pruning, and Agency safety gates", () => {
    const meaning = evaluateMeaning({ text: "I want to gamble everything." });
    const pruning = evaluatePruning({ meaning });
    const wisdom = evaluateDecisionQuality({ meaning, pruning });
    const agency = authorize({
      decision: { confidence: 95, uncertainty: 5, expectedValue: 95 },
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      pruning,
      meaning,
    });

    expect(pruning.candidates.map((item) => item.candidateId)).toContain(
      "meaning:literal-desire",
    );
    expect(pruning.survivalCriticalSignals).toContain(
      "meaning:safety-constraints",
    );
    expect(wisdom.sourceModules).toContain("meaning");
    expect(wisdom.recommendedAction).toBe("review");
    expect(agency.status).toBe("denied");
    expect(agency.meaningGate.action).toBe("block");
  });

  it("runs Meaning before Purpose in the framework snapshot", async () => {
    const engine = new SignalFrameworkEngine(registry());
    const snapshot = await engine.cycleOnce({
      id: "meaning-cycle",
      timestamp: 1_800_000_000_000,
      metrics: metrics(),
      meaning: { text: "I want to never lose again." },
      purpose: { ambition: 75 },
      agency: {
        authority: "autonomous",
        reviewPolicy: { mode: "fully-autonomous" },
      },
    });

    expect(snapshot.meaning?.gravityScore).toBe(-5);
    expect(snapshot.purpose?.warnings).toContain(
      "Meaning transformed an unsafe literal desire before Purpose alignment.",
    );
    expect(snapshot.events.map((event) => event.type)).toContain(
      "meaning.risky",
    );
  });
});

function registry() {
  const result = new MetricRegistry();
  for (const layer of [
    "survival",
    "emotion",
    "conviction",
    "harmony",
    "information",
    "intuition",
    "macroContext",
    "selfAwareness",
  ] as PerceptionLayerKey[]) {
    result.register({
      key: `${layer}Metric`,
      label: `${layer} metric`,
      description: `${layer} metric`,
      layerMappings: [{ layer, weight: 1 }],
    });
  }
  return result;
}

function metrics(): MetricInput[] {
  return [
    "survival",
    "emotion",
    "conviction",
    "harmony",
    "information",
    "intuition",
    "macroContext",
    "selfAwareness",
  ].map((layer) => ({
    key: `${layer}Metric`,
    value: layer === "survival" ? 82 : 72,
    confidence: 92,
    timestamp: 1_800_000_000_000,
  }));
}
