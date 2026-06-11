import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const MODEL_LIFECYCLE_STATES = [
  "RESEARCH",
  "CANDIDATE",
  "SHADOW",
  "SMALL_LIVE",
  "PRODUCTION",
  "WATCHLIST",
  "REDUCED",
  "RETIRED",
] as const;

export type ModelLifecycleState = (typeof MODEL_LIFECYCLE_STATES)[number];

export interface ModelWindow {
  start: string;
  end: string;
}

export interface ModelMetadata {
  model_id: string;
  parent_model_id: string | null;
  training_window: ModelWindow;
  validation_window: ModelWindow;
  regime_scope: string;
  feature_hash: string;
  parameter_hash: string;
  objective_function: string;
  number_of_tested_variants: number;
  lifecycle_state: ModelLifecycleState;
}

export interface ModelLifecycleRecord extends ModelMetadata {
  registered_at: string;
  updated_at: string;
}

export interface EvaluationMetrics {
  expectancy_r: number;
  rolling_expectancy_r: number;
  profit_factor_after_costs: number;
  max_drawdown: number;
  average_winner_r: number;
  average_loser_r: number;
  top_1_profit_dependency: number;
  top_3_profit_dependency: number;
  result_without_top_1: number;
  result_without_top_3: number;
  slippage_sensitivity: number;
  live_vs_backtest_decay: number;
}

export interface MetricGateFailure {
  gate: string;
  metric: keyof EvaluationMetrics | "number_of_tested_variants";
  actual: number;
  threshold: number;
  message: string;
}

export interface PromotionGateResult {
  passed: boolean;
  failures: MetricGateFailure[];
}

export interface RetirementRuleResult {
  should_retire: boolean;
  target_state: Extract<
    ModelLifecycleState,
    "WATCHLIST" | "REDUCED" | "RETIRED"
  >;
  failures: MetricGateFailure[];
}

export interface ModelLifecycleAuditLogEntry {
  audit_id: string;
  model_id: string;
  timestamp: string;
  old_state: ModelLifecycleState;
  new_state: ModelLifecycleState;
  metrics_snapshot: EvaluationMetrics;
  reason: string;
}

export interface PromotionRules {
  min_expectancy_r: number;
  min_rolling_expectancy_r: number;
  min_profit_factor_after_costs: number;
  max_drawdown: number;
  min_average_winner_r: number;
  max_average_loser_r: number;
  max_top_1_profit_dependency: number;
  max_top_3_profit_dependency: number;
  min_result_without_top_1: number;
  min_result_without_top_3: number;
  max_slippage_sensitivity: number;
  max_live_vs_backtest_decay: number;
  min_tested_variants: number;
}

export interface RetirementRules {
  min_expectancy_r: number;
  min_rolling_expectancy_r: number;
  min_profit_factor_after_costs: number;
  max_drawdown: number;
  max_top_1_profit_dependency: number;
  max_top_3_profit_dependency: number;
  min_result_without_top_1: number;
  min_result_without_top_3: number;
  max_slippage_sensitivity: number;
  max_live_vs_backtest_decay: number;
  target_state: Extract<
    ModelLifecycleState,
    "WATCHLIST" | "REDUCED" | "RETIRED"
  >;
}

export interface ModelLifecycleConfig {
  state_machine: Record<ModelLifecycleState, ModelLifecycleState[]>;
  promotion_rules: PromotionRules;
  retirement_rules: RetirementRules;
}

export interface ModelLifecycleStore {
  register(record: ModelLifecycleRecord): void;
  get(modelId: string): ModelLifecycleRecord | null;
  list(): ModelLifecycleRecord[];
  replace(record: ModelLifecycleRecord): void;
  appendAudit(entry: ModelLifecycleAuditLogEntry): void;
  auditLog(modelId?: string): ModelLifecycleAuditLogEntry[];
}

export interface ShadowModeResult<TInput, TDecision> {
  input: TInput;
  production: {
    model_id: string;
    decision: TDecision;
    send_orders: true;
  };
  shadow: {
    model_id: string;
    decision: TDecision;
    send_orders: false;
  };
}

export interface MetricCalculationInput {
  trade_results_r: number[];
  rolling_window?: number;
  costs_r_per_trade?: number;
  slippage_r_per_trade?: number;
  high_slippage_results_r?: number[];
  live_expectancy_r?: number;
  backtest_expectancy_r?: number;
}

const LIVE_STATES = new Set<ModelLifecycleState>([
  "SMALL_LIVE",
  "PRODUCTION",
  "REDUCED",
]);
const PROMOTION_TARGET_STATES = new Set<ModelLifecycleState>([
  "SHADOW",
  "SMALL_LIVE",
  "PRODUCTION",
]);

export const DEFAULT_MODEL_LIFECYCLE_CONFIG: ModelLifecycleConfig = deepFreeze({
  state_machine: {
    RESEARCH: ["CANDIDATE", "RETIRED"],
    CANDIDATE: ["SHADOW", "WATCHLIST", "RETIRED"],
    SHADOW: ["SMALL_LIVE", "WATCHLIST", "RETIRED"],
    SMALL_LIVE: ["PRODUCTION", "WATCHLIST", "REDUCED", "RETIRED"],
    PRODUCTION: ["WATCHLIST", "REDUCED", "RETIRED"],
    WATCHLIST: ["SHADOW", "REDUCED", "RETIRED"],
    REDUCED: ["PRODUCTION", "WATCHLIST", "RETIRED"],
    RETIRED: [],
  },
  promotion_rules: {
    min_expectancy_r: 0,
    min_rolling_expectancy_r: 0,
    min_profit_factor_after_costs: 1.1,
    max_drawdown: 8,
    min_average_winner_r: 0,
    max_average_loser_r: 2,
    max_top_1_profit_dependency: 0.35,
    max_top_3_profit_dependency: 0.6,
    min_result_without_top_1: 0,
    min_result_without_top_3: 0,
    max_slippage_sensitivity: 0.2,
    max_live_vs_backtest_decay: 0.35,
    min_tested_variants: 1,
  },
  retirement_rules: {
    min_expectancy_r: 0,
    min_rolling_expectancy_r: 0,
    min_profit_factor_after_costs: 1,
    max_drawdown: 12,
    max_top_1_profit_dependency: 0.55,
    max_top_3_profit_dependency: 0.8,
    min_result_without_top_1: -1,
    min_result_without_top_3: -2,
    max_slippage_sensitivity: 0.35,
    max_live_vs_backtest_decay: 0.5,
    target_state: "RETIRED",
  },
});

export class InMemoryModelLifecycleStore implements ModelLifecycleStore {
  private records = new Map<string, ModelLifecycleRecord>();
  private auditEntries: ModelLifecycleAuditLogEntry[] = [];

  register(record: ModelLifecycleRecord): void {
    if (this.records.has(record.model_id)) {
      throw new Error(`Model ${record.model_id} is already registered`);
    }
    this.records.set(record.model_id, freezeRecord(record));
  }

  get(modelId: string): ModelLifecycleRecord | null {
    const record = this.records.get(modelId);
    return record ? freezeRecord(record) : null;
  }

  list(): ModelLifecycleRecord[] {
    return Array.from(this.records.values()).map(freezeRecord);
  }

  replace(record: ModelLifecycleRecord): void {
    if (!this.records.has(record.model_id)) {
      throw new Error(`Model ${record.model_id} is not registered`);
    }
    this.records.set(record.model_id, freezeRecord(record));
  }

  appendAudit(entry: ModelLifecycleAuditLogEntry): void {
    this.auditEntries.push(freezeAuditEntry(entry));
  }

  auditLog(modelId?: string): ModelLifecycleAuditLogEntry[] {
    return this.auditEntries
      .filter((entry) => !modelId || entry.model_id === modelId)
      .map(freezeAuditEntry);
  }
}

export class ModelLifecycleRegistry {
  private auditCounter = 0;

  constructor(
    private readonly config: ModelLifecycleConfig = DEFAULT_MODEL_LIFECYCLE_CONFIG,
    private readonly store: ModelLifecycleStore = new InMemoryModelLifecycleStore(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  registerModel(metadata: ModelMetadata): ModelLifecycleRecord {
    assertState(metadata.lifecycle_state);
    if (!metadata.model_id.trim()) {
      throw new Error("model_id is required");
    }
    if (!metadata.feature_hash.trim()) {
      throw new Error("feature_hash is required");
    }
    if (!metadata.parameter_hash.trim()) {
      throw new Error("parameter_hash is required");
    }

    const now = this.nowIso();
    const record = freezeRecord({
      ...metadata,
      parent_model_id: metadata.parent_model_id ?? null,
      registered_at: now,
      updated_at: now,
    });
    this.store.register(record);

    return record;
  }

  getModel(modelId: string): ModelLifecycleRecord | null {
    return this.store.get(modelId);
  }

  listModels(): ModelLifecycleRecord[] {
    return this.store.list();
  }

  getAuditLog(modelId?: string): ModelLifecycleAuditLogEntry[] {
    return this.store.auditLog(modelId);
  }

  evaluatePromotionGates(
    metrics: EvaluationMetrics,
    metadata: Pick<ModelMetadata, "number_of_tested_variants">,
  ): PromotionGateResult {
    return evaluatePromotionGates(
      metrics,
      metadata,
      this.config.promotion_rules,
    );
  }

  evaluateRetirementRules(metrics: EvaluationMetrics): RetirementRuleResult {
    return evaluateRetirementRules(metrics, this.config.retirement_rules);
  }

  transitionModel(input: {
    model_id: string;
    new_state: ModelLifecycleState;
    metrics_snapshot: EvaluationMetrics;
    reason: string;
  }): ModelLifecycleRecord {
    const record = this.requireModel(input.model_id);
    assertState(input.new_state);
    if (record.lifecycle_state === "RETIRED") {
      throw new Error("Retired models cannot transition to a new state");
    }
    if (record.lifecycle_state === input.new_state) {
      throw new Error(`Model ${record.model_id} is already ${input.new_state}`);
    }
    if (
      !isAllowedTransition(record.lifecycle_state, input.new_state, this.config)
    ) {
      throw new Error(
        `Transition ${record.lifecycle_state} -> ${input.new_state} is not allowed`,
      );
    }

    if (PROMOTION_TARGET_STATES.has(input.new_state)) {
      const gates = this.evaluatePromotionGates(input.metrics_snapshot, record);
      if (!gates.passed) {
        throw new Error(formatGateFailure("Promotion blocked", gates.failures));
      }
    }

    return this.commitTransition(
      record,
      input.new_state,
      input.metrics_snapshot,
      input.reason,
    );
  }

  promoteToProduction(input: {
    candidate_model_id: string;
    metrics_snapshot: EvaluationMetrics;
    reason: string;
  }): ModelLifecycleRecord {
    const candidate = this.requireModel(input.candidate_model_id);
    const gates = this.evaluatePromotionGates(
      input.metrics_snapshot,
      candidate,
    );
    if (!gates.passed) {
      throw new Error(
        formatGateFailure("Production promotion blocked", gates.failures),
      );
    }
    if (
      !isAllowedTransition(candidate.lifecycle_state, "PRODUCTION", this.config)
    ) {
      throw new Error(
        `Transition ${candidate.lifecycle_state} -> PRODUCTION is not allowed`,
      );
    }

    const existingProduction = this.store
      .list()
      .find(
        (model) =>
          model.model_id !== candidate.model_id &&
          model.regime_scope === candidate.regime_scope &&
          model.lifecycle_state === "PRODUCTION",
      );

    if (existingProduction) {
      this.commitTransition(
        existingProduction,
        "WATCHLIST",
        input.metrics_snapshot,
        `Superseded by ${candidate.model_id}: ${input.reason}`,
      );
    }

    return this.commitTransition(
      candidate,
      "PRODUCTION",
      input.metrics_snapshot,
      input.reason,
    );
  }

  applyRetirementRules(input: {
    model_id: string;
    metrics_snapshot: EvaluationMetrics;
    reason: string;
  }): ModelLifecycleRecord | null {
    const record = this.requireModel(input.model_id);
    const result = this.evaluateRetirementRules(input.metrics_snapshot);
    if (!result.should_retire) {
      return null;
    }
    if (
      !isAllowedTransition(
        record.lifecycle_state,
        result.target_state,
        this.config,
      )
    ) {
      throw new Error(
        `Transition ${record.lifecycle_state} -> ${result.target_state} is not allowed`,
      );
    }
    return this.commitTransition(
      record,
      result.target_state,
      input.metrics_snapshot,
      `${input.reason}: ${result.failures.map((failure) => failure.message).join("; ")}`,
    );
  }

  canOpenNewTrades(modelId: string): boolean {
    const record = this.requireModel(modelId);
    return LIVE_STATES.has(record.lifecycle_state);
  }

  assertCanOpenNewTrades(modelId: string): void {
    const record = this.requireModel(modelId);
    if (!LIVE_STATES.has(record.lifecycle_state)) {
      throw new Error(
        `Model ${record.model_id} in ${record.lifecycle_state} cannot open new trades`,
      );
    }
  }

  async runShadowMode<TInput, TDecision>(input: {
    production_model_id: string;
    shadow_model_id: string;
    payload: TInput;
    production_decide: (payload: TInput) => Promise<TDecision> | TDecision;
    shadow_decide: (payload: TInput) => Promise<TDecision> | TDecision;
    record?: (
      result: ShadowModeResult<TInput, TDecision>,
    ) => Promise<void> | void;
  }): Promise<ShadowModeResult<TInput, TDecision>> {
    this.assertCanOpenNewTrades(input.production_model_id);
    const shadow = this.requireModel(input.shadow_model_id);
    if (shadow.lifecycle_state !== "SHADOW") {
      throw new Error(
        `Model ${shadow.model_id} must be SHADOW to run beside production`,
      );
    }

    const [productionDecision, shadowDecision] = await Promise.all([
      input.production_decide(input.payload),
      input.shadow_decide(input.payload),
    ]);

    const result: ShadowModeResult<TInput, TDecision> = {
      input: input.payload,
      production: {
        model_id: input.production_model_id,
        decision: productionDecision,
        send_orders: true,
      },
      shadow: {
        model_id: input.shadow_model_id,
        decision: shadowDecision,
        send_orders: false,
      },
    };
    await input.record?.(result);
    return result;
  }

  private requireModel(modelId: string): ModelLifecycleRecord {
    const record = this.store.get(modelId);
    if (!record) {
      throw new Error(`Model ${modelId} is not registered`);
    }
    return record;
  }

  private commitTransition(
    record: ModelLifecycleRecord,
    newState: ModelLifecycleState,
    metricsSnapshot: EvaluationMetrics,
    reason: string,
  ): ModelLifecycleRecord {
    const updated = freezeRecord({
      ...record,
      lifecycle_state: newState,
      updated_at: this.nowIso(),
    });
    this.store.replace(updated);
    this.store.appendAudit({
      audit_id: `audit-${++this.auditCounter}`,
      model_id: record.model_id,
      timestamp: this.nowIso(),
      old_state: record.lifecycle_state,
      new_state: newState,
      metrics_snapshot: freezeMetrics(metricsSnapshot),
      reason,
    });
    return updated;
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}

export function loadModelLifecycleConfig(
  configPath = process.env.MODEL_LIFECYCLE_CONFIG ??
    path.resolve(process.cwd(), "config.yaml"),
): ModelLifecycleConfig {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_MODEL_LIFECYCLE_CONFIG;
  }

  const parsed = parseYaml(fs.readFileSync(configPath, "utf8")) as {
    model_lifecycle?: Partial<ModelLifecycleConfig>;
  } | null;
  return normalizeConfig(parsed?.model_lifecycle ?? {});
}

export function evaluatePromotionGates(
  metrics: EvaluationMetrics,
  metadata: Pick<ModelMetadata, "number_of_tested_variants">,
  rules: PromotionRules = DEFAULT_MODEL_LIFECYCLE_CONFIG.promotion_rules,
): PromotionGateResult {
  const failures: MetricGateFailure[] = [];
  const minExpectancy = Math.max(0, rules.min_expectancy_r);

  minGate(
    failures,
    "positive_out_of_sample_expectancy",
    "expectancy_r",
    metrics.expectancy_r,
    minExpectancy,
  );
  minGate(
    failures,
    "rolling_expectancy",
    "rolling_expectancy_r",
    metrics.rolling_expectancy_r,
    rules.min_rolling_expectancy_r,
  );
  minGate(
    failures,
    "profit_factor_after_costs",
    "profit_factor_after_costs",
    metrics.profit_factor_after_costs,
    rules.min_profit_factor_after_costs,
  );
  maxGate(
    failures,
    "max_drawdown",
    "max_drawdown",
    metrics.max_drawdown,
    rules.max_drawdown,
  );
  minGate(
    failures,
    "average_winner_r",
    "average_winner_r",
    metrics.average_winner_r,
    rules.min_average_winner_r,
  );
  maxGate(
    failures,
    "average_loser_r",
    "average_loser_r",
    Math.abs(metrics.average_loser_r),
    rules.max_average_loser_r,
  );
  maxGate(
    failures,
    "top_1_profit_dependency",
    "top_1_profit_dependency",
    metrics.top_1_profit_dependency,
    rules.max_top_1_profit_dependency,
  );
  maxGate(
    failures,
    "top_3_profit_dependency",
    "top_3_profit_dependency",
    metrics.top_3_profit_dependency,
    rules.max_top_3_profit_dependency,
  );
  minGate(
    failures,
    "result_without_top_1",
    "result_without_top_1",
    metrics.result_without_top_1,
    rules.min_result_without_top_1,
  );
  minGate(
    failures,
    "result_without_top_3",
    "result_without_top_3",
    metrics.result_without_top_3,
    rules.min_result_without_top_3,
  );
  maxGate(
    failures,
    "slippage_sensitivity",
    "slippage_sensitivity",
    metrics.slippage_sensitivity,
    rules.max_slippage_sensitivity,
  );
  maxGate(
    failures,
    "live_vs_backtest_decay",
    "live_vs_backtest_decay",
    metrics.live_vs_backtest_decay,
    rules.max_live_vs_backtest_decay,
  );
  minGate(
    failures,
    "tested_variants",
    "number_of_tested_variants",
    metadata.number_of_tested_variants,
    rules.min_tested_variants,
  );

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function evaluateRetirementRules(
  metrics: EvaluationMetrics,
  rules: RetirementRules = DEFAULT_MODEL_LIFECYCLE_CONFIG.retirement_rules,
): RetirementRuleResult {
  const failures: MetricGateFailure[] = [];

  retirementMinTrigger(
    failures,
    "expectancy_r",
    metrics.expectancy_r,
    rules.min_expectancy_r,
  );
  retirementMinTrigger(
    failures,
    "rolling_expectancy_r",
    metrics.rolling_expectancy_r,
    rules.min_rolling_expectancy_r,
  );
  retirementMinTrigger(
    failures,
    "profit_factor_after_costs",
    metrics.profit_factor_after_costs,
    rules.min_profit_factor_after_costs,
  );
  retirementMaxTrigger(
    failures,
    "max_drawdown",
    metrics.max_drawdown,
    rules.max_drawdown,
  );
  retirementMaxTrigger(
    failures,
    "top_1_profit_dependency",
    metrics.top_1_profit_dependency,
    rules.max_top_1_profit_dependency,
  );
  retirementMaxTrigger(
    failures,
    "top_3_profit_dependency",
    metrics.top_3_profit_dependency,
    rules.max_top_3_profit_dependency,
  );
  retirementMinTrigger(
    failures,
    "result_without_top_1",
    metrics.result_without_top_1,
    rules.min_result_without_top_1,
  );
  retirementMinTrigger(
    failures,
    "result_without_top_3",
    metrics.result_without_top_3,
    rules.min_result_without_top_3,
  );
  retirementMaxTrigger(
    failures,
    "slippage_sensitivity",
    metrics.slippage_sensitivity,
    rules.max_slippage_sensitivity,
  );
  retirementMaxTrigger(
    failures,
    "live_vs_backtest_decay",
    metrics.live_vs_backtest_decay,
    rules.max_live_vs_backtest_decay,
  );

  return {
    should_retire: failures.length > 0,
    target_state: rules.target_state,
    failures,
  };
}

export function calculateEvaluationMetrics(
  input: MetricCalculationInput,
): EvaluationMetrics {
  const costs = input.costs_r_per_trade ?? 0;
  const baseTrades = input.trade_results_r
    .map((value) => Number(value) - costs)
    .filter((value) => Number.isFinite(value));
  const slippage = input.slippage_r_per_trade ?? 0;
  const slippageTrades = input.high_slippage_results_r
    ? input.high_slippage_results_r.map((value) => Number(value) - costs)
    : baseTrades.map((value) => value - slippage);
  const rollingWindow = Math.max(1, Math.floor(input.rolling_window ?? 20));
  const rollingTrades = baseTrades.slice(-rollingWindow);
  const winners = baseTrades.filter((value) => value > 0);
  const losers = baseTrades.filter((value) => value < 0);
  const grossWins = winners.reduce((sum, value) => sum + value, 0);
  const grossLosses = Math.abs(losers.reduce((sum, value) => sum + value, 0));
  const expectancy = mean(baseTrades);
  const slippageExpectancy = mean(slippageTrades);
  const backtestExpectancy = input.backtest_expectancy_r ?? expectancy;
  const liveExpectancy = input.live_expectancy_r ?? expectancy;

  return {
    expectancy_r: round(expectancy),
    rolling_expectancy_r: round(mean(rollingTrades)),
    profit_factor_after_costs: round(
      grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0,
    ),
    max_drawdown: round(maxDrawdownR(baseTrades)),
    average_winner_r: round(mean(winners)),
    average_loser_r: round(mean(losers)),
    ...calculateOutlierDependenceMetrics(baseTrades),
    slippage_sensitivity: round(Math.max(0, expectancy - slippageExpectancy)),
    live_vs_backtest_decay: round(
      backtestExpectancy > 0
        ? Math.max(
            0,
            (backtestExpectancy - liveExpectancy) / backtestExpectancy,
          )
        : 0,
    ),
  };
}

export function calculateOutlierDependenceMetrics(
  tradeResultsR: number[],
): Pick<
  EvaluationMetrics,
  | "top_1_profit_dependency"
  | "top_3_profit_dependency"
  | "result_without_top_1"
  | "result_without_top_3"
> {
  const trades = tradeResultsR
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const total = trades.reduce((sum, value) => sum + value, 0);
  const winners = trades.filter((value) => value > 0).sort((a, b) => b - a);
  const top1 = winners.slice(0, 1).reduce((sum, value) => sum + value, 0);
  const top3 = winners.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const denominator = Math.max(Math.abs(total), 1e-9);

  return {
    top_1_profit_dependency: round(top1 / denominator),
    top_3_profit_dependency: round(top3 / denominator),
    result_without_top_1: round(total - top1),
    result_without_top_3: round(total - top3),
  };
}

export function isAllowedTransition(
  oldState: ModelLifecycleState,
  newState: ModelLifecycleState,
  config: ModelLifecycleConfig = DEFAULT_MODEL_LIFECYCLE_CONFIG,
): boolean {
  assertState(oldState);
  assertState(newState);
  return config.state_machine[oldState]?.includes(newState) ?? false;
}

function normalizeConfig(
  input: Partial<ModelLifecycleConfig>,
): ModelLifecycleConfig {
  return deepFreeze({
    state_machine: normalizeStateMachine(input.state_machine),
    promotion_rules: {
      ...DEFAULT_MODEL_LIFECYCLE_CONFIG.promotion_rules,
      ...(input.promotion_rules ?? {}),
    },
    retirement_rules: {
      ...DEFAULT_MODEL_LIFECYCLE_CONFIG.retirement_rules,
      ...(input.retirement_rules ?? {}),
    },
  });
}

function normalizeStateMachine(
  input:
    | Partial<Record<ModelLifecycleState, ModelLifecycleState[]>>
    | undefined,
): Record<ModelLifecycleState, ModelLifecycleState[]> {
  const merged = {
    ...DEFAULT_MODEL_LIFECYCLE_CONFIG.state_machine,
    ...(input ?? {}),
  };

  for (const state of MODEL_LIFECYCLE_STATES) {
    assertState(state);
    merged[state] = (merged[state] ?? []).map((candidate) => {
      assertState(candidate);
      return candidate;
    });
  }

  return merged;
}

function assertState(state: string): asserts state is ModelLifecycleState {
  if (!MODEL_LIFECYCLE_STATES.includes(state as ModelLifecycleState)) {
    throw new Error(`Unknown model lifecycle state: ${state}`);
  }
}

function minGate(
  failures: MetricGateFailure[],
  gate: string,
  metric: MetricGateFailure["metric"],
  actual: number,
  threshold: number,
): void {
  if (actual < threshold) {
    failures.push({
      gate,
      metric,
      actual,
      threshold,
      message: `${String(metric)} ${actual} is below required ${threshold}`,
    });
  }
}

function maxGate(
  failures: MetricGateFailure[],
  gate: string,
  metric: keyof EvaluationMetrics,
  actual: number,
  threshold: number,
): void {
  if (actual > threshold) {
    failures.push({
      gate,
      metric,
      actual,
      threshold,
      message: `${metric} ${actual} exceeds allowed ${threshold}`,
    });
  }
}

function retirementMinTrigger(
  failures: MetricGateFailure[],
  metric: keyof EvaluationMetrics,
  actual: number,
  threshold: number,
): void {
  if (actual < threshold) {
    failures.push({
      gate: `retirement_${metric}`,
      metric,
      actual,
      threshold,
      message: `${metric} ${actual} fell below retirement threshold ${threshold}`,
    });
  }
}

function retirementMaxTrigger(
  failures: MetricGateFailure[],
  metric: keyof EvaluationMetrics,
  actual: number,
  threshold: number,
): void {
  if (actual > threshold) {
    failures.push({
      gate: `retirement_${metric}`,
      metric,
      actual,
      threshold,
      message: `${metric} ${actual} exceeded retirement threshold ${threshold}`,
    });
  }
}

function formatGateFailure(
  prefix: string,
  failures: MetricGateFailure[],
): string {
  return `${prefix}: ${failures.map((failure) => failure.message).join("; ")}`;
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function maxDrawdownR(values: number[]): number {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return maxDrawdown;
}

function round(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(6));
}

function freezeRecord(record: ModelLifecycleRecord): ModelLifecycleRecord {
  return deepFreeze({
    ...record,
    training_window: { ...record.training_window },
    validation_window: { ...record.validation_window },
  });
}

function freezeAuditEntry(
  entry: ModelLifecycleAuditLogEntry,
): ModelLifecycleAuditLogEntry {
  return deepFreeze({
    ...entry,
    metrics_snapshot: freezeMetrics(entry.metrics_snapshot),
  });
}

function freezeMetrics(metrics: EvaluationMetrics): EvaluationMetrics {
  return deepFreeze({ ...metrics });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }
  return value;
}
