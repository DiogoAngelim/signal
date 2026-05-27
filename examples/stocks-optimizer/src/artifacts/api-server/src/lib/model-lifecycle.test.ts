import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_MODEL_LIFECYCLE_CONFIG,
  InMemoryModelLifecycleStore,
  ModelLifecycleRegistry,
  calculateEvaluationMetrics,
  calculateOutlierDependenceMetrics,
  evaluatePromotionGates,
  evaluateRetirementRules,
  isAllowedTransition,
  loadModelLifecycleConfig,
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
  assert.equal(isAllowedTransition("RESEARCH", "CANDIDATE"), true);
  assert.equal(
    isAllowedTransition("RESEARCH", "CANDIDATE", {
      ...DEFAULT_MODEL_LIFECYCLE_CONFIG,
      state_machine: {} as ModelLifecycleConfig["state_machine"],
    }),
    false,
  );
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

test("default registry constructor wires defaults", () => {
  const subject = new ModelLifecycleRegistry();
  const record = subject.registerModel(metadata("default-v1", "SMALL_LIVE"));

  assert.equal(record.lifecycle_state, "SMALL_LIVE");
  assert.equal(subject.canOpenNewTrades("default-v1"), true);
  assert.equal(subject.evaluatePromotionGates(passingMetrics, record).passed, true);
  assert.equal(subject.evaluateRetirementRules(passingMetrics).should_retire, false);
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
    slippage_sensitivity: 0.5,
    live_vs_backtest_decay: 0.7,
  };
  const result = evaluateRetirementRules(metrics);

  assert.equal(result.should_retire, true);
  assert.equal(result.target_state, "RETIRED");
  assert.equal(result.failures.some((failure) => failure.metric === "max_drawdown"), true);
  assert.equal(result.failures.some((failure) => failure.metric === "slippage_sensitivity"), true);
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

test("store rejects duplicate and unknown records while returning immutable copies", () => {
  const store = new InMemoryModelLifecycleStore();
  const record = registry().registerModel(metadata("candidate-v1", "CANDIDATE"));

  store.register(record);
  assert.throws(() => store.register(record), /already registered/);
  assert.throws(() => store.replace({ ...record, model_id: "missing" }), /not registered/);
  assert.equal(store.get("missing"), null);
  assert.equal(store.list().length, 1);
  assert.throws(() => {
    (store.get("candidate-v1") as ModelMetadata).feature_hash = "mutated";
  }, /read only|not extensible|Cannot assign/);
});

test("registration validates required identifiers and normalizes null parent", () => {
  const subject = registry();

  assert.throws(() => subject.registerModel(metadata("", "RESEARCH")), /model_id is required/);
  assert.throws(() => subject.registerModel(metadata("bad-feature", "RESEARCH", { feature_hash: " " })), /feature_hash is required/);
  assert.throws(() => subject.registerModel(metadata("bad-params", "RESEARCH", { parameter_hash: " " })), /parameter_hash is required/);

  const record = subject.registerModel(metadata("research-v2", "RESEARCH", { parent_model_id: undefined as unknown as null }));
  assert.equal(record.parent_model_id, null);
  assert.equal(record.registered_at, "2026-05-21T12:00:00.000Z");
  assert.equal(subject.listModels().length, 1);
});

test("transition validates unknown, duplicate, promotion gate, and missing-model paths", () => {
  const subject = registry();
  subject.registerModel(metadata("candidate-v1", "CANDIDATE", { number_of_tested_variants: 0 }));

  assert.throws(() => isAllowedTransition("BOGUS" as never, "RETIRED"), /Unknown model lifecycle state/);
  assert.throws(
    () =>
      subject.transitionModel({
        model_id: "missing",
        new_state: "RETIRED",
        metrics_snapshot: passingMetrics,
        reason: "missing",
      }),
    /not registered/,
  );
  assert.throws(
    () =>
      subject.transitionModel({
        model_id: "candidate-v1",
        new_state: "CANDIDATE",
        metrics_snapshot: passingMetrics,
        reason: "same",
      }),
    /already CANDIDATE/,
  );
  assert.throws(
    () =>
      subject.transitionModel({
        model_id: "candidate-v1",
        new_state: "SHADOW",
        metrics_snapshot: passingMetrics,
        reason: "not enough variants",
      }),
    /number_of_tested_variants 0 is below required 1/,
  );
});

test("retirement rules return null when metrics remain healthy and throw on illegal targets", () => {
  const subject = registry();
  subject.registerModel(metadata("research-v1", "RESEARCH"));

  assert.equal(
    subject.applyRetirementRules({
      model_id: "research-v1",
      metrics_snapshot: passingMetrics,
      reason: "healthy",
    }),
    null,
  );

  const badTarget = registry({
    ...DEFAULT_MODEL_LIFECYCLE_CONFIG,
    retirement_rules: {
      ...DEFAULT_MODEL_LIFECYCLE_CONFIG.retirement_rules,
      target_state: "REDUCED",
    },
  });
  badTarget.registerModel(metadata("candidate-v1", "CANDIDATE"));
  assert.throws(
    () =>
      badTarget.applyRetirementRules({
        model_id: "candidate-v1",
        metrics_snapshot: { ...passingMetrics, max_drawdown: 20 },
        reason: "bad target",
      }),
    /CANDIDATE -> REDUCED is not allowed/,
  );

  const production = registry();
  production.registerModel(metadata("prod-retire", "PRODUCTION"));
  const retired = production.applyRetirementRules({
    model_id: "prod-retire",
    metrics_snapshot: { ...passingMetrics, expectancy_r: -0.2, rolling_expectancy_r: -0.1 },
    reason: "live rules",
  });
  assert.equal(retired?.lifecycle_state, "RETIRED");
  assert.match(production.getAuditLog("prod-retire")[0].reason, /expectancy_r -0.2 fell below/);
});

test("shadow mode requires live production and shadow-state candidate", async () => {
  const subject = registry();
  subject.registerModel(metadata("watch-v1", "WATCHLIST"));
  subject.registerModel(metadata("candidate-v1", "CANDIDATE"));

  await assert.rejects(
    () =>
      subject.runShadowMode({
        production_model_id: "watch-v1",
        shadow_model_id: "candidate-v1",
        payload: { symbol: "MSFT" },
        production_decide: () => ({ action: "Hold" }),
        shadow_decide: () => ({ action: "Buy" }),
      }),
    /cannot open new trades/,
  );

  subject.registerModel(metadata("prod-v2", "PRODUCTION"));
  await assert.rejects(
    () =>
      subject.runShadowMode({
        production_model_id: "prod-v2",
        shadow_model_id: "candidate-v1",
        payload: { symbol: "MSFT" },
        production_decide: async () => ({ action: "Hold" }),
        shadow_decide: async () => ({ action: "Buy" }),
      }),
    /must be SHADOW/,
  );
});

test("promotion without incumbent production and illegal production transition are handled", () => {
  const subject = registry();
  subject.registerModel(metadata("small-v1", "SMALL_LIVE"));

  assert.equal(
    subject.promoteToProduction({
      candidate_model_id: "small-v1",
      metrics_snapshot: passingMetrics,
      reason: "first production",
    }).lifecycle_state,
    "PRODUCTION",
  );

  const illegal = registry();
  illegal.registerModel(metadata("shadow-v1", "SHADOW"));
  assert.throws(
    () =>
      illegal.promoteToProduction({
        candidate_model_id: "shadow-v1",
        metrics_snapshot: passingMetrics,
        reason: "too early",
      }),
    /SHADOW -> PRODUCTION is not allowed/,
  );
});

test("evaluation metrics cover empty, losing, winning, and slippage inputs", () => {
  assert.deepEqual(calculateEvaluationMetrics({ trade_results_r: [] }), {
    expectancy_r: 0,
    rolling_expectancy_r: 0,
    profit_factor_after_costs: 0,
    max_drawdown: 0,
    average_winner_r: 0,
    average_loser_r: 0,
    top_1_profit_dependency: 0,
    top_3_profit_dependency: 0,
    result_without_top_1: 0,
    result_without_top_3: 0,
    slippage_sensitivity: 0,
    live_vs_backtest_decay: 0,
  });

  const metrics = calculateEvaluationMetrics({
    trade_results_r: [2, -1, 3, Number.NaN],
    rolling_window: 2.8,
    costs_r_per_trade: 0.1,
    slippage_r_per_trade: 0.2,
    high_slippage_results_r: [1.5, -1.2, 2.5],
    live_expectancy_r: 0.5,
    backtest_expectancy_r: 1,
  });

  assert.equal(metrics.profit_factor_after_costs, 4.363636);
  assert.equal(metrics.rolling_expectancy_r, 0.9);
  assert.equal(metrics.slippage_sensitivity, 0.4);
  assert.equal(metrics.live_vs_backtest_decay, 0.5);
  assert.equal(calculateEvaluationMetrics({ trade_results_r: [1, 2] }).profit_factor_after_costs, 99);
  assert.equal(calculateEvaluationMetrics({ trade_results_r: [Number.POSITIVE_INFINITY] }).expectancy_r, 0);
  assert.equal(
    calculateEvaluationMetrics({
      trade_results_r: [1],
      backtest_expectancy_r: Number.POSITIVE_INFINITY,
      live_expectancy_r: 0,
    }).live_vs_backtest_decay,
    0,
  );
});

test("config loader falls back to defaults and normalizes yaml overrides", () => {
  assert.equal(loadModelLifecycleConfig(path.join(os.tmpdir(), "missing-model-lifecycle.yaml")), DEFAULT_MODEL_LIFECYCLE_CONFIG);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "model-lifecycle-"));
  const file = path.join(dir, "config.yaml");
  fs.writeFileSync(
    file,
    [
      "model_lifecycle:",
      "  state_machine:",
      "    RESEARCH: [CANDIDATE, RETIRED]",
      "  promotion_rules:",
      "    min_expectancy_r: -1",
      "    min_tested_variants: 3",
      "  retirement_rules:",
      "    target_state: WATCHLIST",
    ].join("\n"),
  );

  const config = loadModelLifecycleConfig(file);
  assert.equal(config.promotion_rules.min_expectancy_r, -1);
  assert.equal(config.promotion_rules.min_tested_variants, 3);
  assert.equal(config.retirement_rules.target_state, "WATCHLIST");
  assert.equal(isAllowedTransition("RESEARCH", "RETIRED", config), true);

  const badFile = path.join(dir, "bad.yaml");
  fs.writeFileSync(badFile, "model_lifecycle:\n  state_machine:\n    RESEARCH: [NOPE]\n");
  assert.throws(() => loadModelLifecycleConfig(badFile), /Unknown model lifecycle state/);

  const emptyConfigFile = path.join(dir, "empty.yaml");
  fs.writeFileSync(emptyConfigFile, "{}\n");
  assert.equal(loadModelLifecycleConfig(emptyConfigFile).promotion_rules.min_tested_variants, 1);

  const partialConfigFile = path.join(dir, "partial.yaml");
  fs.writeFileSync(partialConfigFile, "model_lifecycle:\n  state_machine:\n    WATCHLIST: []\n");
  const partial = loadModelLifecycleConfig(partialConfigFile);
  assert.equal(partial.promotion_rules.min_tested_variants, 1);
  assert.equal(partial.retirement_rules.target_state, "RETIRED");
  assert.equal(isAllowedTransition("WATCHLIST", "SHADOW", partial), false);

  const nullStateFile = path.join(dir, "null-state.yaml");
  fs.writeFileSync(nullStateFile, "model_lifecycle:\n  state_machine:\n    WATCHLIST:\n");
  assert.deepEqual(loadModelLifecycleConfig(nullStateFile).state_machine.WATCHLIST, []);

  const previous = process.env.MODEL_LIFECYCLE_CONFIG;
  process.env.MODEL_LIFECYCLE_CONFIG = file;
  assert.equal(loadModelLifecycleConfig().promotion_rules.min_tested_variants, 3);
  if (previous == null) {
    delete process.env.MODEL_LIFECYCLE_CONFIG;
  } else {
    process.env.MODEL_LIFECYCLE_CONFIG = previous;
  }

  const cwd = process.cwd();
  const defaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "model-lifecycle-default-"));
  process.chdir(defaultDir);
  try {
    assert.equal(loadModelLifecycleConfig(), DEFAULT_MODEL_LIFECYCLE_CONFIG);
  } finally {
    process.chdir(cwd);
  }
});
