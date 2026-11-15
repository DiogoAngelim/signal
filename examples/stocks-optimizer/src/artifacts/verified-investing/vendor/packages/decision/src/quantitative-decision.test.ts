import { describe, expect, it } from "vitest";
import {
  evaluateQuantitativeDecision,
  evaluateInformationValue,
  stressTestProbabilityCases,
  type QuantitativeDecisionModel,
} from "./quantitative-decision";

const binary: QuantitativeDecisionModel = {
  modelVersion: "economic-fixture-v1",
  unit: "USD net present value",
  probabilityEvidence: "subjective",
  states: [
    { id: "up", probability: 0.5 },
    { id: "down", probability: 0.5 },
  ],
  actions: [
    { id: "invest", payoffs: [
      { stateId: "up", amount: 100 },
      { stateId: "down", amount: -100 },
    ] },
    { id: "hold", payoffs: [
      { stateId: "up", amount: 0 },
      { stateId: "down", amount: 0 },
    ] },
  ],
};

describe("quantitative decisions", () => {
  it("computes statewise regret and perfect information value without heuristics", () => {
    const result = evaluateQuantitativeDecision(binary);
    expect(result.recommendedActionId).toBe("invest"); // deterministic tie break
    expect(result.expectedValueOfPerfectInformation).toBe(50);
    expect(result.actions[0].expectedUtility).toBe(0);
    expect(result.actions[0].expectedRegret).toBe(50);
    expect(result.actions[0].worstCaseRegret).toBe(100);
    expect(result.actions[1].expectedRegret).toBe(50);
  });

  it("can report nonzero regret in a single scenario", () => {
    const result = evaluateQuantitativeDecision({
      ...binary,
      states: [{ id: "up", probability: 1 }],
      actions: [
        { id: "bad", payoffs: [{ stateId: "up", amount: 10 }] },
        { id: "good", payoffs: [{ stateId: "up", amount: 20 }] },
      ],
    });
    expect(result.actions[0].expectedRegret).toBe(10);
    expect(result.actions[1].expectedRegret).toBe(0);
    expect(result.expectedValueOfPerfectInformation).toBe(0);
  });

  it("computes exact lower-tail mean and enforces hard risk constraints", () => {
    const result = evaluateQuantitativeDecision({
      ...binary,
      riskPolicy: { tailMass: 0.25, minimumWorstCase: -50 },
    });
    expect(result.actions[0].lowerTailMean).toBe(-100);
    expect(result.actions[0].feasible).toBe(false);
    expect(result.actions[0].blockers).toContain("minimum_worst_case");
    expect(result.recommendedActionId).toBe("hold");
    expect(result.expectedValueOfPerfectInformation).toBe(0);
  });

  it("never promotes prohibited actions even under perfect information", () => {
    const result = evaluateQuantitativeDecision({
      ...binary,
      actions: binary.actions.map((action) => ({ ...action, prohibited: true })),
    });
    expect(result.status).toBe("no_feasible_action");
    expect(result.recommendedActionId).toBeNull();
    expect(result.expectedValueOfPerfectInformation).toBeNull();
  });

  it("accounts for explicit time-zero and opportunity costs and discounting", () => {
    const result = evaluateQuantitativeDecision({
      ...binary,
      annualDiscountRate: 0.1,
      payoffHorizonYears: 1,
      states: [{ id: "up", probability: 1 }],
      actions: [{
        id: "invest",
        upfrontCost: 10,
        opportunityCost: 5,
        payoffs: [{ stateId: "up", amount: 110 }],
      }],
    });
    expect(result.actions[0].expectedUtility).toBeCloseTo(85);
  });

  it("computes Bayesian EVSI, never exceeding EVPI before acquisition costs", () => {
    const perfect = evaluateInformationValue(binary, [
      { id: "positive", likelihoods: [
        { stateId: "up", probability: 1 }, { stateId: "down", probability: 0 },
      ] },
      { id: "negative", likelihoods: [
        { stateId: "up", probability: 0 }, { stateId: "down", probability: 1 },
      ] },
    ], 10);
    expect(perfect.grossValue).toBe(50);
    expect(perfect.netValue).toBe(40);
    expect(perfect.expectedValueOfPerfectInformation).toBe(50);
    const noInformation = evaluateInformationValue(binary, [
      { id: "same", likelihoods: [
        { stateId: "up", probability: 1 }, { stateId: "down", probability: 1 },
      ] },
    ], 10);
    expect(noInformation.grossValue).toBe(0);
    expect(noInformation.netValue).toBe(-10);
  });

  it("rejects invented probability mass, duplicate states, invalid likelihoods and NaN", () => {
    expect(() => evaluateQuantitativeDecision({
      ...binary, states: binary.states.map((s) => ({ ...s, probability: 0.3 })),
    })).toThrow(/sum to one/);
    expect(() => evaluateQuantitativeDecision({
      ...binary, states: [{ id: "up", probability: 0.5 }, { id: "up", probability: 0.5 }],
    })).toThrow(/unique/);
    expect(() => evaluateQuantitativeDecision({
      ...binary, actions: [{ id: "invalid", payoffs: [
        { stateId: "up", amount: NaN }, { stateId: "down", amount: 0 },
      ] }],
    })).toThrow(/finite/);
    expect(() => evaluateInformationValue(binary, [{ id: "obs", likelihoods: [
      { stateId: "up", probability: 0.4 }, { stateId: "down", probability: 1 },
    ] }])).toThrow(/sum to one/);
  });

  it("reports stress-case stability honestly, including adverse reversals", () => {
    const results = stressTestProbabilityCases(binary, [
      { id: "higher-up", probabilities: [
        { stateId: "up", probability: 0.9 }, { stateId: "down", probability: 0.1 },
      ] },
      { id: "lower-up", probabilities: [
        { stateId: "up", probability: 0.1 }, { stateId: "down", probability: 0.9 },
      ] },
    ]);
    expect(results.stableAcrossSuppliedCases).toBe(false);
    expect(results.cases[0].changed).toBe(false);
    expect(results.cases[1].recommendedActionId).toBe("hold");
  });
});