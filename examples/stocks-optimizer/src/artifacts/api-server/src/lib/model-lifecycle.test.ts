import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MODEL_LIFECYCLE_CONFIG,
  InMemoryModelLifecycleStore,
  ModelLifecycleRegistry,
  calculateOutlierDependenceMetrics,
  evaluatePromotionGates,
  evaluateRetirementRules,
  isAllowedTransition,
  type EvaluationMetrics,
  type ModelLifecycleConfig,
  type ModelMetadata,
} from "./model-lifecycle";

const passingMetrics: EvaluationMetrics = {
  expectancy_r: 0.22,
  rolling_expectancy_r: 0.12,
  profit_factor_after_costs: 1.8,
  max_drawdown: 3.2,
  average_winner_r: 0.7,
  average_loser_r: -0.35,
  top_1_profit_dependency: 0.22,
  top_3_profit_dependency: 0.41,
  result_without_top_1: 1.6,
  result_without_top_3: 0.9,
  slippage_sensitivity: 0.05,
  live_vs_backtest_decay: 0.12,
};

function metadata(
  model_id: string,
  lifecycle_state: ModelMetadata["lifecycle_state"],
  overrides: Partial<ModelMetadata> = {},
): ModelMetadata {
  return {
    model_id,
    parent_model_id: null,
    training_window: { start: "2025-01-01", end: "2025-06-30" },
    validation_window: { start: "2025-07-01", end: "2025-09-30" },
    regime_scope: "GLOBAL",
    feature_hash: "feature:abc",
    parameter_hash: "params:def",
    objective_function: "expectancy_r_after_costs",
    number_of_tested_variants: 12,
    lifecycle_state,
    ...overrides,
  };
}

function registry(config: ModelLifecycleConfig = DEFAULT_MODEL_LIFECYCLE_CONFIG) {
  return new ModelLifecycleRegistry(
    config,
    new InMemoryModelLifecycleStore(),
    () => new Date("2026-05-21T12:00:00.000Z"),
  );
}

test("state machine blocks direct RESEARCH to PRODUCTION", () => {
  assert.equal(isAllowedTransition("RESEARCH", "PRODUCTION"), false);
  const subject = registry();
  subject.registerModel(metadata("research-v1", "RESEARCH"));

  assert.throws(
    () =>
      subject.transitionModel({
        model_id: "research-v1",
        new_state: "PRODUCTION",
        metrics_snapshot: passingMetrics,
        reason: "skip the line",
      }),
    /RESEARCH -> PRODUCTION is not allowed/,
  );
});

test("promotion gates block negative out-of-sample expectancy", () => {
  const metrics = { ...passingMetrics, expectancy_r: -0.01 };
  const result = evaluatePromotionGates(metrics, { number_of_tested_variants: 12 });

  assert.equal(result.passed, false);
  assert.equal(result.failures.some((failure) => failure.metric === "expectancy_r"), true);
});

test("promotion gates block top winner collapse", () => {
  const metrics = {
    ...passingMetrics,
    top_1_profit_dependency: 0.8,
    top_3_profit_dependency: 0.92,
    result_without_top_1: -0.4,
    result_without_top_3: -1.2,
  };
  const result = evaluatePromotionGates(metrics, { number_of_tested_variants: 12 });

  assert.equal(result.passed, false);
  assert.equal(result.failures.some((failure) => failure.metric === "result_without_top_1"), true);
  assert.equal(result.failures.some((failure) => failure.metric === "result_without_top_3"), true);
});

test("retirement rules trigger on live decay and drawdown breaches", () => {
  const metrics = {
    ...passingMetrics,
    max_drawdown: 20,
    live_vs_backtest_decay: 0.7,
  };
  const result = evaluateRetirementRules(metrics);

  assert.equal(result.should_retire, true);
  assert.equal(result.target_state, "RETIRED");
  assert.equal(result.failures.some((failure) => failure.metric === "max_drawdown"), true);
  assert.equal(result.failures.some((failure) => failure.metric === "live_vs_backtest_decay"), true);
});

test("retired models cannot open new trades or transition again", () => {
  const subject = registry();
  subject.registerModel(metadata("prod-v1", "PRODUCTION"));
  subject.transitionModel({
    model_id: "prod-v1",
    new_state: "RETIRED",
    metrics_snapshot: passingMetrics,
    reason: "operator retirement",
  });

  assert.equal(subject.canOpenNewTrades("prod-v1"), false);
  assert.throws(() => subject.assertCanOpenNewTrades("prod-v1"), /cannot open new trades/);
  assert.throws(
    () =>
      subject.transitionModel({
        model_id: "prod-v1",
        new_state: "WATCHLIST",
        metrics_snapshot: passingMetrics,
        reason: "reactivate",
      }),
    /Retired models cannot transition/,
  );
});

test("production remains unchanged when candidate fails gates", () => {
  const subject = registry();
  subject.registerModel(metadata("prod-v1", "PRODUCTION"));
  subject.registerModel(metadata("candidate-v2", "SMALL_LIVE", { parent_model_id: "prod-v1" }));

  assert.throws(
    () =>
      subject.promoteToProduction({
        candidate_model_id: "candidate-v2",
        metrics_snapshot: { ...passingMetrics, expectancy_r: -0.05 },
        reason: "failed validation",
      }),
    /Production promotion blocked/,
  );

  assert.equal(subject.getModel("prod-v1")?.lifecycle_state, "PRODUCTION");
  assert.equal(subject.getModel("candidate-v2")?.lifecycle_state, "SMALL_LIVE");
  assert.equal(subject.getAuditLog().length, 0);
});

test("production switches only after candidate passes all gates", () => {
  const subject = registry();
  subject.registerModel(metadata("prod-v1", "PRODUCTION"));
  subject.registerModel(metadata("candidate-v2", "SMALL_LIVE", { parent_model_id: "prod-v1" }));

  subject.promoteToProduction({
    candidate_model_id: "candidate-v2",
    metrics_snapshot: passingMetrics,
    reason: "passed governance gates",
  });

  assert.equal(subject.getModel("prod-v1")?.lifecycle_state, "WATCHLIST");
  assert.equal(subject.getModel("candidate-v2")?.lifecycle_state, "PRODUCTION");
  assert.equal(subject.getAuditLog().length, 2);
});

test("shadow mode runs beside production without order routing", async () => {
  const subject = registry();
  subject.registerModel(metadata("prod-v1", "PRODUCTION"));
  subject.registerModel(metadata("candidate-v2", "SHADOW"));
  const observed: unknown[] = [];

  const result = await subject.runShadowMode({
    production_model_id: "prod-v1",
    shadow_model_id: "candidate-v2",
    payload: { symbol: "AAPL" },
    production_decide: () => ({ action: "Buy" }),
    shadow_decide: () => ({ action: "Sell" }),
    record: (entry) => {
      observed.push(entry);
    },
  });

  assert.equal(result.production.send_orders, true);
  assert.equal(result.shadow.send_orders, false);
  assert.deepEqual(result.production.decision, { action: "Buy" });
  assert.deepEqual(result.shadow.decision, { action: "Sell" });
  assert.equal(observed.length, 1);
});

test("outlier dependence metrics remove top one and top three winners", () => {
  const metrics = calculateOutlierDependenceMetrics([5, 1, -1, -1, -1]);

  assert.equal(metrics.result_without_top_1, -2);
  assert.equal(metrics.result_without_top_3, -3);
  assert.equal(metrics.top_1_profit_dependency, 1.666667);
  assert.equal(metrics.top_3_profit_dependency, 2);
});
