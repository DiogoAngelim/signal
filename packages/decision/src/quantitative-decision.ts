/**
 * Explicit, risk-aware decision analysis in a caller-defined common utility unit.
 * This opt-in module does not reinterpret Signal's legacy heuristic scores as
 * probabilities or replace an application's authorization/approval policy.
 */

export type ProbabilityEvidence = "subjective" | "estimated" | "externally_validated";

export interface QuantitativeState {
  id: string;
  /** Caller-supplied probability, not calibrated by Signal. */
  probability: number;
}

export interface StatePayoff {
  stateId: string;
  /** State-contingent gross payoff in the model's common unit. */
  amount: number;
}

export interface QuantitativeAction {
  id: string;
  payoffs: readonly StatePayoff[];
  /** Certain, time-zero costs, in the same unit as payoffs. */
  upfrontCost?: number;
  opportunityCost?: number;
  /** Hard exclusion by the calling domain; never overridden by optimization. */
  prohibited?: boolean;
}

export interface QuantitativeRiskPolicy {
  /** Hard minimum of net payoff over all modeled states. */
  minimumWorstCase?: number;
  /** Hard minimum mean of the worst `tailMass` probability of outcomes. */
  minimumLowerTailMean?: number;
  /** Fraction of the probability distribution constituting the lower tail. */
  tailMass?: number;
  /** Explicit penalty per unit of expected-minus-tail payoff; default 0. */
  downsidePenalty?: number;
}

export interface QuantitativeDecisionModel {
  modelVersion: string;
  unit: string;
  /** Provenance is a *declaration*, not independent statistical verification. */
  probabilityEvidence: ProbabilityEvidence;
  states: readonly QuantitativeState[];
  actions: readonly QuantitativeAction[];
  /** Optional common discount applied to future payoffs, never to time-zero costs. */
  annualDiscountRate?: number;
  payoffHorizonYears?: number;
  riskPolicy?: QuantitativeRiskPolicy;
}

export interface QuantitativeActionResult {
  actionId: string;
  feasible: boolean;
  blockers: string[];
  expectedUtility: number;
  worstCaseUtility: number;
  bestCaseUtility: number;
  lowerTailMean: number;
  /** True statewise regret relative to the best FEASIBLE action in each state. */
  expectedRegret: number | null;
  worstCaseRegret: number | null;
  /** Objective used for ranking: EU - explicit penalty * (EU - lower-tail mean). */
  objectiveValue: number;
}

export interface QuantitativeDecisionResult {
  modelVersion: string;
  unit: string;
  probabilityEvidence: ProbabilityEvidence;
  status: "recommended" | "no_feasible_action";
  recommendedActionId: string | null;
  actions: QuantitativeActionResult[];
  /** Risk-neutral value of perfect state information, before its acquisition cost. */
  expectedValueOfPerfectInformation: number | null;
  /** Not an outcome-calibrated probability or evidence of real-world superiority. */
  limitation: string;
}

export interface InformationObservation {
  id: string;
  /** P(observation | state); sum over observations must be 1 for every state. */
  likelihoods: readonly { stateId: string; probability: number }[];
}

export interface InformationValueResult {
  grossValue: number | null;
  acquisitionCost: number;
  netValue: number | null;
  expectedValueOfPerfectInformation: number | null;
  observationProbabilities: { id: string; probability: number }[];
  /** Risk-neutral Bayesian preposterior value, with unchanged feasible actions. */
  interpretation: string;
}

export interface ProbabilityStressCase {
  id: string;
  probabilities: readonly { stateId: string; probability: number }[];
}

export interface ProbabilityStressResult {
  baselineActionId: string | null;
  cases: { id: string; recommendedActionId: string | null; changed: boolean }[];
  stableAcrossSuppliedCases: boolean;
  interpretation: string;
}

const MAX_STATES = 100;
const MAX_ACTIONS = 100;
const PROBABILITY_TOLERANCE = 1e-8;

/** Expected utility, statewise regret, discrete lower-tail risk and hard constraints. */
export function evaluateQuantitativeDecision(
  model: QuantitativeDecisionModel,
): QuantitativeDecisionResult {
  validateModel(model);
  const stateIds = model.states.map((state) => state.id);
  const probabilities = model.states.map((state) => state.probability);
  const discount = discountFactor(model);
  const net = model.actions.map((action) => {
    const values = stateIds.map((id) => {
      const payoff = action.payoffs.find((item) => item.stateId === id);
      if (!payoff) throw new Error(`Missing payoff for state ${id}.`);
      return payoff.amount * discount - (action.upfrontCost ?? 0) - (action.opportunityCost ?? 0);
    });
    return values;
  });
  const tailMass = model.riskPolicy?.tailMass ?? 0.1;
  const results: QuantitativeActionResult[] = model.actions.map((action, index) => {
    const values = net[index];
    const expectedUtility = dot(probabilities, values);
    const worstCaseUtility = Math.min(...values);
    const bestCaseUtility = Math.max(...values);
    const lowerTailMean = lowerTailAverage(values, probabilities, tailMass);
    const blockers: string[] = [];
    if (action.prohibited) blockers.push("action_prohibited");
    if (
      model.riskPolicy?.minimumWorstCase !== undefined &&
      worstCaseUtility < model.riskPolicy.minimumWorstCase
    ) blockers.push("minimum_worst_case");
    if (
      model.riskPolicy?.minimumLowerTailMean !== undefined &&
      lowerTailMean < model.riskPolicy.minimumLowerTailMean
    ) blockers.push("minimum_lower_tail_mean");
    const penalty = model.riskPolicy?.downsidePenalty ?? 0;
    return {
      actionId: action.id,
      feasible: blockers.length === 0,
      blockers,
      expectedUtility,
      worstCaseUtility,
      bestCaseUtility,
      lowerTailMean,
      expectedRegret: null,
      worstCaseRegret: null,
      objectiveValue: expectedUtility - penalty * Math.max(0, expectedUtility - lowerTailMean),
    };
  });
  const feasible = results.map((result, index) => ({ result, index }))
    .filter((entry) => entry.result.feasible);
  if (feasible.length === 0) {
    return {
      modelVersion: model.modelVersion,
      unit: model.unit,
      probabilityEvidence: model.probabilityEvidence,
      status: "no_feasible_action",
      recommendedActionId: null,
      actions: results,
      expectedValueOfPerfectInformation: null,
      limitation: LIMITATION,
    };
  }
  const bestByState = stateIds.map((_, stateIndex) =>
    Math.max(...feasible.map(({ index }) => net[index][stateIndex])),
  );
  for (const { result, index } of feasible) {
    const regrets = stateIds.map((_, stateIndex) =>
      Math.max(0, bestByState[stateIndex] - net[index][stateIndex]),
    );
    result.expectedRegret = dot(probabilities, regrets);
    result.worstCaseRegret = Math.max(...regrets);
  }
  const ranked = [...feasible].sort((a, b) =>
    b.result.objectiveValue - a.result.objectiveValue || a.index - b.index,
  );
  const riskNeutralBest = Math.max(...feasible.map(({ result }) => result.expectedUtility));
  const evpi = Math.max(0, dot(probabilities, bestByState) - riskNeutralBest);
  return {
    modelVersion: model.modelVersion,
    unit: model.unit,
    probabilityEvidence: model.probabilityEvidence,
    status: "recommended",
    recommendedActionId: ranked[0].result.actionId,
    actions: results,
    expectedValueOfPerfectInformation: evpi,
    limitation: LIMITATION,
  };
}

/**
 * Risk-neutral EVSI using caller-supplied P(observation | state). The best
 * action may change after observing information; no empirical likelihood is
 * inferred. Hard risk-policy constraints remain fixed before observation.
 */
export function evaluateInformationValue(
  model: QuantitativeDecisionModel,
  observations: readonly InformationObservation[],
  acquisitionCost = 0,
): InformationValueResult {
  const base = evaluateQuantitativeDecision(model);
  assertFinite(acquisitionCost, "acquisitionCost");
  if (acquisitionCost < 0) throw new Error("acquisitionCost must be non-negative.");
  if (!observations.length || observations.length > 100) {
    throw new Error("observations must contain 1 to 100 observations.");
  }
  uniqueIds(observations, "observation");
  const stateIds = model.states.map((state) => state.id);
  for (const observation of observations) {
    validateStateProbabilities(observation.likelihoods, stateIds, false);
  }
  for (const id of stateIds) {
    const total = observations.reduce((sum, observation) =>
      sum + (observation.likelihoods.find((x) => x.stateId === id)?.probability ?? 0), 0);
    if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
      throw new Error(`Observation likelihoods for state ${id} must sum to one.`);
    }
  }
  if (base.status === "no_feasible_action") {
    return {
      grossValue: null, acquisitionCost, netValue: null,
      expectedValueOfPerfectInformation: null,
      observationProbabilities: [],
      interpretation: "No feasible action; information does not authorize prohibited behavior.",
    };
  }
  const discount = discountFactor(model);
  const feasible = model.actions.filter((_, index) => base.actions[index].feasible);
  const netPayoff = (action: QuantitativeAction, stateId: string) => {
    const payoff = action.payoffs.find((x) => x.stateId === stateId);
    if (!payoff) throw new Error(`Missing payoff for state ${stateId}.`);
    return payoff.amount * discount - (action.upfrontCost ?? 0) - (action.opportunityCost ?? 0);
  };
  const observationProbabilities = observations.map((observation) => ({
    id: observation.id,
    probability: model.states.reduce((sum, state) =>
      sum + state.probability * observation.likelihoods.find((x) => x.stateId === state.id)!.probability, 0),
  }));
  const preposterior = observations.reduce((sum, observation) => {
    const conditionalJointUtility = feasible.map((action) =>
      model.states.reduce((inner, state) => inner + state.probability *
        observation.likelihoods.find((x) => x.stateId === state.id)!.probability *
        netPayoff(action, state.id), 0),
    );
    return sum + Math.max(...conditionalJointUtility);
  }, 0);
  const priorBest = Math.max(...base.actions.filter((a) => a.feasible)
    .map((a) => a.expectedUtility));
  const grossValue = Math.max(0, preposterior - priorBest);
  return {
    grossValue,
    acquisitionCost,
    netValue: grossValue - acquisitionCost,
    expectedValueOfPerfectInformation: base.expectedValueOfPerfectInformation,
    observationProbabilities,
    interpretation: "Risk-neutral Bayesian EVSI from declared likelihoods; not an empirical validation of signal quality or a causal outcome claim.",
  };
}

/** Only verifies stability over explicitly supplied distributions, never all uncertainty. */
export function stressTestProbabilityCases(
  model: QuantitativeDecisionModel,
  cases: readonly ProbabilityStressCase[],
): ProbabilityStressResult {
  const baseline = evaluateQuantitativeDecision(model);
  if (cases.length > 100) throw new Error("At most 100 stress cases are supported.");
  uniqueIds(cases, "stress case");
  const stateIds = model.states.map((state) => state.id);
  const evaluated = cases.map((item) => {
    validateStateProbabilities(item.probabilities, stateIds, true);
    const probabilities = new Map(item.probabilities.map((x) => [x.stateId, x.probability]));
    const changedModel = {
      ...model,
      states: model.states.map((state) => ({
        ...state, probability: probabilities.get(state.id)!,
      })),
    };
    const recommendedActionId = evaluateQuantitativeDecision(changedModel).recommendedActionId;
    return {
      id: item.id,
      recommendedActionId,
      changed: recommendedActionId !== baseline.recommendedActionId,
    };
  });
  return {
    baselineActionId: baseline.recommendedActionId,
    cases: evaluated,
    stableAcrossSuppliedCases: evaluated.every((item) => !item.changed),
    interpretation: "Stability is evaluated only on listed probability cases, not a proof of global robustness.",
  };
}

const LIMITATION = "Model-based utility, regret and information values depend on caller-supplied states, payoffs, costs and probabilities. They do not establish calibration, causal effects or real-world performance.";

function validateModel(model: QuantitativeDecisionModel): void {
  if (!model.modelVersion?.trim() || !model.unit?.trim()) {
    throw new Error("modelVersion and unit must be non-empty.");
  }
  if (!["subjective", "estimated", "externally_validated"].includes(model.probabilityEvidence)) {
    throw new Error("probabilityEvidence must declare the source of probabilities.");
  }
  if (!model.states.length || model.states.length > MAX_STATES) {
    throw new Error(`states must contain 1 to ${MAX_STATES} items.`);
  }
  if (!model.actions.length || model.actions.length > MAX_ACTIONS) {
    throw new Error(`actions must contain 1 to ${MAX_ACTIONS} items.`);
  }
  uniqueIds(model.states, "state");
  uniqueIds(model.actions, "action");
  validateStateProbabilities(model.states, model.states.map((state) => state.id), true);
  const ids = model.states.map((state) => state.id);
  for (const action of model.actions) {
    if (action.prohibited !== undefined && typeof action.prohibited !== "boolean") {
      throw new Error(`action ${action.id} prohibited must be boolean.`);
    }
    if (action.payoffs.length !== ids.length) {
      throw new Error(`action ${action.id} must specify exactly one payoff per state.`);
    }
    const unique = new Set<string>();
    for (const payoff of action.payoffs) {
      if (!ids.includes(payoff.stateId) || unique.has(payoff.stateId)) {
        throw new Error(`Invalid or duplicate state payoff for action ${action.id}.`);
      }
      unique.add(payoff.stateId);
      assertFinite(payoff.amount, `payoff ${action.id}/${payoff.stateId}`);
    }
    for (const cost of ["upfrontCost", "opportunityCost"] as const) {
      const value = action[cost] ?? 0;
      assertFinite(value, `${cost} of action ${action.id}`);
      if (value < 0) throw new Error(`${cost} cannot be negative.`);
    }
  }
  const rate = model.annualDiscountRate ?? 0;
  const horizon = model.payoffHorizonYears ?? 0;
  assertFinite(rate, "annualDiscountRate");
  assertFinite(horizon, "payoffHorizonYears");
  if (rate <= -1 || horizon < 0 || horizon > 100) {
    throw new Error("Discount rate must exceed -1 and horizon must be in [0,100].");
  }
  const policy = model.riskPolicy;
  if (policy) {
    for (const name of ["minimumWorstCase", "minimumLowerTailMean", "downsidePenalty", "tailMass"] as const) {
      const value = policy[name];
      if (value !== undefined) assertFinite(value, name);
    }
    const mass = policy.tailMass ?? 0.1;
    if (mass <= 0 || mass > 1) throw new Error("tailMass must be in (0,1].");
    if ((policy.downsidePenalty ?? 0) < 0) throw new Error("downsidePenalty must be non-negative.");
  }
}

function validateStateProbabilities(
  entries: readonly { stateId?: string; id?: string; probability: number }[],
  ids: readonly string[],
  sumToOne: boolean,
): void {
  if (entries.length !== ids.length) throw new Error("Probability vector must cover every state once.");
  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    const id = entry.stateId ?? entry.id;
    if (!id || !ids.includes(id) || seen.has(id)) throw new Error("Missing, foreign or duplicate state probability.");
    seen.add(id);
    assertFinite(entry.probability, `probability of ${id}`);
    if (entry.probability < 0 || entry.probability > 1) throw new Error("probabilities must be in [0,1].");
    total += entry.probability;
  }
  if (sumToOne && Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
    throw new Error("State probabilities must sum to one.");
  }
}

function uniqueIds(entries: readonly { id: string }[], name: string): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id)) {
      throw new Error(`${name} IDs must be unique, non-empty strings.`);
    }
    ids.add(entry.id);
  }
}

function assertFinite(value: number, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function discountFactor(model: QuantitativeDecisionModel): number {
  const factor = (1 + (model.annualDiscountRate ?? 0)) ** -(model.payoffHorizonYears ?? 0);
  if (!Number.isFinite(factor)) throw new Error("Discount factor is not finite.");
  return factor;
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

/** Exact mean of the worst `mass` probability of a finite discrete distribution. */
function lowerTailAverage(values: readonly number[], probabilities: readonly number[], mass: number): number {
  const ordered = values.map((value, index) => ({ value, p: probabilities[index] }))
    .sort((a, b) => a.value - b.value);
  let remaining = mass;
  let total = 0;
  for (const { value, p } of ordered) {
    const used = Math.min(p, remaining);
    total += used * value;
    remaining -= used;
    if (remaining <= PROBABILITY_TOLERANCE) break;
  }
  return total / mass;
}