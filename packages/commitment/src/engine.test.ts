import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_COMMITMENT_POLICIES,
  type CommitmentEvaluateInput,
  commitmentEvaluateInputSchema,
  commitmentEvaluateResultSchema,
  evaluateCommitment,
  listCommitmentOperations,
  registerCommitmentOperations,
  resolveCommitmentPolicy,
} from ".";

type Fixture = {
  name: string;
  input: CommitmentEvaluateInput;
  expectations: {
    status: string;
    strategy: string;
    totalRecommended: number;
    normalizedCommitment: number;
    createdAt?: string;
    limitedBy: string[];
    cappedBy: string[];
    recommendations: Array<{
      targetId: string;
      amount: number;
      normalizedCommitment: number;
      weight: number;
      mode: string;
    }>;
  };
};

const fixturesDir = path.resolve(
  __dirname,
  "../../../spec/contracts/fixtures/commitment",
);

function loadFixtures(): Fixture[] {
  return readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(
      (file) =>
        JSON.parse(
          readFileSync(path.join(fixturesDir, file), "utf8"),
        ) as Fixture,
    );
}

describe("evaluateCommitment fixtures", () => {
  for (const fixture of loadFixtures()) {
    it(`matches golden fixture ${fixture.name}`, () => {
      const result = evaluateCommitment(fixture.input);

      expect(result.module).toBe("signal.commitment");
      expect(result.operation).toBe("commitment.evaluate.v1");
      expect(result.status).toBe(fixture.expectations.status);
      expect(result.strategy).toBe(fixture.expectations.strategy);
      expect(result.totalRecommended).toBe(
        fixture.expectations.totalRecommended,
      );
      expect(result.normalizedCommitment).toBe(
        fixture.expectations.normalizedCommitment,
      );
      expect(result.limitedBy).toEqual(fixture.expectations.limitedBy);
      expect(result.audit.cappedBy).toEqual(fixture.expectations.cappedBy);
      expect(
        result.recommendations.map(
          ({ targetId, amount, normalizedCommitment, weight, mode }) => ({
            targetId,
            amount,
            normalizedCommitment,
            weight,
            mode,
          }),
        ),
      ).toEqual(fixture.expectations.recommendations);
      if (fixture.expectations.createdAt) {
        expect(result.audit.createdAt).toBe(fixture.expectations.createdAt);
      }
      expect(result.invalidation.triggers.length).toBeGreaterThan(0);
      expect(result.monitoringPlan.events).toContain("commitment.invalidated");
      expect(result.audit.deterministic).toBe(true);
    });
  }
});

describe("commitment policies", () => {
  it("defers empty inputs without hidden defaults that imply action", () => {
    const result = evaluateCommitment();

    expect(result.status).toBe("deferred");
    expect(result.limitedBy).toEqual(["missing_decision"]);
    expect(result.audit.createdAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("resolves built-in and custom policies without mutating built-ins", () => {
    const conservative = resolveCommitmentPolicy("conservative");
    const custom = resolveCommitmentPolicy({
      name: "custom",
      minConfidence: 0.1,
      sharpeLike: {
        rounds: 4,
        objectiveWeights: { returnWeight: 2 },
      },
    });

    expect(conservative.name).toBe("conservative");
    expect(custom.name).toBe("custom");
    expect(custom.minConfidence).toBe(0.1);
    expect(custom.sharpeLike.rounds).toBe(4);
    expect(custom.sharpeLike.objectiveWeights.returnWeight).toBe(2);
    expect(BUILT_IN_COMMITMENT_POLICIES.custom.minConfidence).toBe(0.55);
  });

  it("falls back to balanced for unknown policy names", () => {
    const policy = resolveCommitmentPolicy("unknown" as never);

    expect(policy.name).toBe("balanced");
  });

  it("uses normalized resource basis when no resource is supplied", () => {
    const result = evaluateCommitment({
      decision: { id: "normalized", confidence: 0.9, trust: 0.9, risk: 0.1 },
      policy: "balanced",
      strategy: "risk_adjusted",
    });

    expect(result.status).toBe("recommended");
    expect(result.audit.resourceBasis).toBe(1);
    expect(result.audit.assumptions).toContain(
      "No resource was supplied; using normalized resource basis 1.",
    );
  });

  it("handles resource maximums, minimums, and non-blocking hard constraints", () => {
    const capped = evaluateCommitment({
      decision: { id: "max", confidence: 1, trust: 1, risk: 0 },
      resource: { available: 1000, maximum: 100 },
      policy: "aggressive",
    });
    const raised = evaluateCommitment({
      decision: { id: "min", confidence: 0.56, trust: 0.56, risk: 0.5 },
      resource: { available: 1000, minimum: 200 },
      policy: "balanced",
    });
    const reduced = evaluateCommitment({
      decision: { id: "reduced", confidence: 0.9, trust: 0.9, risk: 0.2 },
      constraints: [
        { id: "hard-review", type: "hard", severity: "medium", passed: false },
      ],
      policy: "balanced",
    });

    expect(capped.audit.cappedBy).toContain("resource.maximum");
    expect(raised.audit.cappedBy).toContain("resource.minimum");
    expect(reduced.audit.reductions[0]).toMatchObject({
      id: "hard-review",
      factor: 0.5,
    });
  });

  it("can produce maximum mode under a permissive custom policy", () => {
    const result = evaluateCommitment({
      decision: {
        id: "max-mode",
        confidence: 1,
        trust: 1,
        risk: 0,
        expectedUtility: 1,
      },
      resource: { available: 100 },
      policy: {
        name: "custom",
        minConfidence: 0,
        minTrust: 0,
        maxCommitmentRatio: 1,
        maxSingleTargetRatio: 1,
        commitmentMultiplier: 1,
      },
    });

    expect(result.mode).toBe("maximum");
    expect(result.normalizedCommitment).toBe(1);
  });
});

describe("commitment strategies", () => {
  const decisions = [
    {
      id: "a",
      confidence: 0.8,
      trust: 0.8,
      risk: 0.2,
      outcomeSeries: [0.02, 0.018, 0.021, 0.019],
    },
    {
      id: "b",
      confidence: 0.75,
      trust: 0.78,
      risk: 0.3,
      outcomeSeries: [0.01, 0.012, 0.009, 0.011],
    },
  ];

  it("supports confidence, equal, and constraint-first strategy paths", () => {
    const equal = evaluateCommitment({
      decisions,
      strategy: "equal_weight",
      policy: "balanced",
    });
    const confidence = evaluateCommitment({
      decisions,
      strategy: "confidence_weighted",
      policy: "balanced",
    });
    const constrained = evaluateCommitment({
      decisions,
      strategy: "constraint_first",
      policy: "balanced",
      resource: { available: 1000 },
      constraints: [{ id: "small", targetId: "a", maxCommitmentRatio: 0.01 }],
    });

    expect(equal.recommendations[0]?.weight).toBeCloseTo(0.5, 4);
    expect(confidence.recommendations[0]?.weight).toBeGreaterThan(
      confidence.recommendations[1]?.weight ?? 0,
    );
    expect(constrained.recommendations[0]?.weight).toBeLessThan(0.1);
  });

  it("keeps sharpe-like deterministic across repeated evaluations", () => {
    const input = {
      decisions,
      strategy: "sharpe_like" as const,
      policy: {
        name: "custom" as const,
        sharpeLike: { rounds: 24, refinementPasses: 1, refinementPoolSize: 8 },
      },
      seed: "repeatable",
    };

    const first = evaluateCommitment(input);
    const second = evaluateCommitment(input);

    expect(first.recommendations).toEqual(second.recommendations);
    expect(first.audit.strategyScores).toEqual(second.audit.strategyScores);
  });

  it("covers sharpe-like objective variants and generated seeds", () => {
    const objectives = [
      "downside_adjusted",
      "drawdown_adjusted",
      "return",
      "reward_to_variability",
    ] as const;

    for (const objective of objectives) {
      const result = evaluateCommitment({
        decisions,
        strategy: "sharpe_like",
        policy: {
          name: "custom",
          sharpeLike: {
            objective,
            rounds: 8,
            refinementPasses: 0,
            refinementPoolSize: 1,
          },
        },
      });

      expect(result.status).toBe("recommended");
      expect(result.strategy).toBe("sharpe_like");
      expect(Object.keys(result.audit.strategyScores)).toEqual(["a", "b"]);
    }
  });

  it("blocks target-specific hard failures while allowing other eligible decisions", () => {
    const result = evaluateCommitment({
      decisions: [
        { id: "blocked-target", confidence: 0.9, trust: 0.9, risk: 0.1 },
        { id: "allowed-target", confidence: 0.9, trust: 0.9, risk: 0.1 },
      ],
      constraints: [
        {
          id: "target-rule",
          targetId: "blocked-target",
          type: "hard",
          severity: "high",
          passed: false,
        },
      ],
      policy: "balanced",
    });

    expect(result.status).toBe("recommended");
    expect(result.audit.eligibleTargets).toEqual(["allowed-target"]);
    expect(result.recommendations.map((item) => item.targetId)).toEqual([
      "allowed-target",
    ]);
  });
});

describe("commitment protocol operation", () => {
  it("lists and registers commitment.evaluate.v1", () => {
    const registered: unknown[] = [];
    const operations = registerCommitmentOperations({
      registerQuery(definition) {
        registered.push(definition);
      },
    });

    expect(listCommitmentOperations()).toEqual(operations);
    expect(operations[0]?.name).toBe("commitment.evaluate.v1");
    expect(registered).toHaveLength(1);
  });

  it("parses protocol input and result through structural schemas", () => {
    const input = commitmentEvaluateInputSchema.parse({
      decision: { id: "schema", confidence: 1, trust: 1, risk: 0 },
    });
    const result = commitmentEvaluateResultSchema.parse(
      evaluateCommitment(input),
    );

    expect(result.status).toBe("recommended");
    expect(() => commitmentEvaluateInputSchema.parse(null)).toThrow();
    expect(() => commitmentEvaluateResultSchema.parse({})).toThrow();
  });
});
