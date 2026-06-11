export const SIGNAL_PIPELINE_STAGES = [
  "RAW_DATA",
  "FEATURE_EXTRACTION",
  "INDICATOR_CALCULATION",
  "SIGNAL_GENERATION",
  "PERCEPTION_ALIGNMENT",
  "RISK_FILTERING",
  "CONFIDENCE_SCORING",
  "POSITION_SIZING",
  "PARTICIPATION_GATING",
  "FINAL_DECISION",
  "BACKTEST_INCLUSION",
  "TRADE_EXECUTION_SIMULATION",
] as const;

export type SignalPipelineStage = (typeof SIGNAL_PIPELINE_STAGES)[number];

export type DiagnosticRuntimeMode =
  | "MODE_RAW_TECHNICAL"
  | "MODE_TECHNICAL_PLUS_RISK"
  | "MODE_FULL_PERCEPTION";

export type PipelineAuditEvent = {
  asset: string;
  timestamp: number | string;
  stage: SignalPipelineStage;
  passed: boolean;
  score?: number | null;
  threshold?: number | string | null;
  reason: string;
  metadata?: Record<string, unknown>;
};

export type StageSurvivalRow = {
  stage: SignalPipelineStage;
  reached: number;
  passed: number;
  rejected: number;
  survivalPct: number;
  attritionPct: number;
  cumulativePassed: number;
  cumulativeSurvivalPct: number;
  dominantReason: string | null;
  reasons: Array<{ reason: string; count: number; pct: number }>;
};

export type StageSurvivalAnalytics = {
  universeSize: number;
  stages: StageSurvivalRow[];
  bottleneck: StageSurvivalRow | null;
  dominantRejectionStage: SignalPipelineStage | null;
  warnings: string[];
};

export type ScoreDiagnosticSample = {
  asset: string;
  rawScore: number | null;
  normalizedScore: number | null;
  postFilterScore: number | null;
  finalConfidenceScore: number | null;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ScoreNormalizationDiagnostic = {
  sampleCount: number;
  finiteFinalCount: number;
  rawRange: number | null;
  normalizedRange: number | null;
  postFilterRange: number | null;
  finalRange: number | null;
  midpointCollapsePct: number;
  fallbackCollapsePct: number;
  nanFallbackPct: number;
  clampedPct: number;
  saturationPct: number;
  warnings: string[];
  samples: ScoreDiagnosticSample[];
};

export type GateDependencyGraph = Record<string, string[]>;

export type RecursiveGateDiagnostic = {
  hasCycle: boolean;
  cycles: string[][];
  warnings: string[];
};

export type SuppressionCascadeDiagnostic = {
  analytics: StageSurvivalAnalytics;
  eliminatedBySingleLayer: boolean;
  eliminatingStage: SignalPipelineStage | null;
  warnings: string[];
};

export type DeadlockDiagnostic = {
  deadlocked: boolean;
  cycles: string[][];
  bottleneck: SignalPipelineStage | null;
  warnings: string[];
  suggestedResolution: string[];
};

type AuditLogger = Pick<Console, "debug" | "log" | "warn">;

export class SignalPipelineAuditTrail {
  private readonly memory: PipelineAuditEvent[] = [];
  private readonly enabled: boolean;
  private readonly debugMode: boolean;
  private readonly persistent: boolean;
  private readonly maxEvents: number;
  private readonly logger: AuditLogger;

  constructor(
    options: {
      enabled?: boolean;
      debug?: boolean;
      persistent?: boolean;
      maxEvents?: number;
      logger?: AuditLogger;
    } = {},
  ) {
    this.enabled =
      options.enabled === true ||
      options.debug === true ||
      options.persistent === true;
    this.debugMode = options.debug === true;
    this.persistent = options.persistent === true || this.debugMode;
    this.maxEvents = Math.max(0, Math.floor(options.maxEvents ?? 5_000));
    this.logger = options.logger ?? console;
  }

  emit(event: PipelineAuditEvent): PipelineAuditEvent | null {
    if (!this.enabled) return null;

    const normalized = normalizeAuditEvent(event);

    if (this.persistent && this.maxEvents > 0) {
      this.memory.push(normalized);
      this.memory.splice(0, Math.max(0, this.memory.length - this.maxEvents));
    }

    if (this.debugMode) {
      this.logger.debug(
        JSON.stringify({ type: "signal.pipeline.audit", ...normalized }),
      );
    }

    return normalized;
  }

  stage(
    input: Omit<PipelineAuditEvent, "timestamp"> & {
      timestamp?: number | string;
    },
  ): PipelineAuditEvent | null {
    return this.emit({
      ...input,
      timestamp: input.timestamp ?? Date.now(),
    });
  }

  events(): PipelineAuditEvent[] {
    return this.memory.slice();
  }

  byAsset(asset: string): PipelineAuditEvent[] {
    const normalized = normalizeAsset(asset);
    return this.memory.filter(
      (event) => normalizeAsset(event.asset) === normalized,
    );
  }

  clear() {
    this.memory.splice(0, this.memory.length);
  }
}

export class SuppressionCascadeInspector {
  inspect(
    events: PipelineAuditEvent[],
    assets?: string[],
  ): SuppressionCascadeDiagnostic {
    const analytics = buildStageSurvivalAnalytics(events, assets);
    const eliminatingStage =
      analytics.stages.find((stage) => stage.reached > 0 && stage.passed === 0)
        ?.stage ?? null;

    const eliminatedBySingleLayer = Boolean(eliminatingStage);
    const warnings = [...analytics.warnings];

    if (eliminatedBySingleLayer && eliminatingStage) {
      warnings.push(
        `Single-layer suppression detected at ${eliminatingStage}.`,
      );
    }

    return {
      analytics,
      eliminatedBySingleLayer,
      eliminatingStage,
      warnings,
    };
  }
}

export class RecursiveGateDetector {
  detect(dependencies: GateDependencyGraph): RecursiveGateDiagnostic {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const active = new Set<string>();
    const stack: string[] = [];

    const visit = (node: string) => {
      if (active.has(node)) {
        const start = stack.indexOf(node);
        if (start >= 0) {
          const cycle = [...stack.slice(start), node];
          const key = cycle.join(">");
          if (!cycles.some((existing) => existing.join(">") === key)) {
            cycles.push(cycle);
          }
        }
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      active.add(node);
      stack.push(node);

      for (const dependency of dependencies[node] ?? []) {
        visit(dependency);
      }

      stack.pop();
      active.delete(node);
    };

    for (const node of Object.keys(dependencies)) {
      visit(node);
    }

    return {
      hasCycle: cycles.length > 0,
      cycles,
      warnings: cycles.map(
        (cycle) => `Recursive gate cycle detected: ${cycle.join(" -> ")}.`,
      ),
    };
  }
}

export class DeadlockAnalyzer {
  analyze(input: {
    events: PipelineAuditEvent[];
    assets?: string[];
    dependencies?: GateDependencyGraph;
  }): DeadlockDiagnostic {
    const suppression = new SuppressionCascadeInspector().inspect(
      input.events,
      input.assets,
    );
    const recursive = new RecursiveGateDetector().detect(
      input.dependencies ?? {},
    );
    const bottleneck = suppression.analytics.bottleneck?.stage ?? null;
    const warnings = [...suppression.warnings, ...recursive.warnings];
    const deadlocked =
      recursive.hasCycle || suppression.eliminatedBySingleLayer;

    const suggestedResolution = [
      recursive.hasCycle
        ? "Break recursive gating by making one gate depend on observable market evidence instead of downstream confirmations."
        : "",
      suppression.eliminatedBySingleLayer && suppression.eliminatingStage
        ? `Inspect thresholds and rejection reasons at ${suppression.eliminatingStage} before changing upstream scoring.`
        : "",
      bottleneck && bottleneck !== suppression.eliminatingStage
        ? `Review ${bottleneck} because it is the largest attrition point.`
        : "",
    ].filter(Boolean);

    return {
      deadlocked,
      cycles: recursive.cycles,
      bottleneck,
      warnings,
      suggestedResolution,
    };
  }
}

export class ScoreNormalizationDiagnostics {
  analyze(samples: ScoreDiagnosticSample[]): ScoreNormalizationDiagnostic {
    const finiteFinals = finiteValues(
      samples.map((sample) => sample.finalConfidenceScore),
    );
    const finiteRaw = finiteValues(samples.map((sample) => sample.rawScore));
    const finiteNormalized = finiteValues(
      samples.map((sample) => sample.normalizedScore),
    );
    const finitePostFilter = finiteValues(
      samples.map((sample) => sample.postFilterScore),
    );
    const midpointCount = samples.filter((sample) => {
      const score = finiteOrNull(sample.finalConfidenceScore);
      return score != null && score >= 49 && score <= 53;
    }).length;
    const fallbackCount = samples.filter((sample) => {
      const reason = String(
        sample.reason ?? sample.metadata?.reason ?? "",
      ).toLowerCase();
      const score = finiteOrNull(sample.finalConfidenceScore);
      return (
        reason.includes("fallback") ||
        reason.includes("nan") ||
        (score != null && score >= 50 && score <= 52)
      );
    }).length;
    const nanFallbackCount = samples.filter((sample) => {
      const reason = String(
        sample.reason ?? sample.metadata?.reason ?? "",
      ).toLowerCase();
      return (
        reason.includes("nan") ||
        [
          sample.rawScore,
          sample.normalizedScore,
          sample.postFilterScore,
          sample.finalConfidenceScore,
        ].some((value) => value == null || !Number.isFinite(Number(value)))
      );
    }).length;
    const clampedCount = samples.filter((sample) => {
      const score = finiteOrNull(sample.finalConfidenceScore);
      return score != null && (score <= 1 || score >= 99);
    }).length;
    const saturationCount = samples.filter((sample) => {
      const score = finiteOrNull(sample.normalizedScore);
      return score != null && (score <= 5 || score >= 95);
    }).length;

    const sampleCount = samples.length;
    const midpointCollapsePct = pct(midpointCount, sampleCount);
    const fallbackCollapsePct = pct(fallbackCount, sampleCount);
    const nanFallbackPct = pct(nanFallbackCount, sampleCount);
    const clampedPct = pct(clampedCount, sampleCount);
    const saturationPct = pct(saturationCount, sampleCount);
    const rawRange = rangeOrNull(finiteRaw);
    const normalizedRange = rangeOrNull(finiteNormalized);
    const postFilterRange = rangeOrNull(finitePostFilter);
    const finalRange = rangeOrNull(finiteFinals);
    const warnings: string[] = [];

    if (midpointCollapsePct >= 75) {
      warnings.push(
        `${Math.round(midpointCollapsePct)}% of assets collapsed into the 49-53 confidence range.`,
      );
    }

    if (fallbackCollapsePct >= 50) {
      warnings.push(
        `${Math.round(fallbackCollapsePct)}% of assets appear to use fallback confidence values.`,
      );
    }

    if (nanFallbackPct >= 10) {
      warnings.push(
        `${Math.round(nanFallbackPct)}% of score samples contain NaN/null fallback evidence.`,
      );
    }

    if (
      rawRange != null &&
      rawRange > 10 &&
      normalizedRange != null &&
      normalizedRange < 2
    ) {
      warnings.push(
        "Raw score dispersion exists, but normalization compresses scores into a very narrow band.",
      );
    }

    if (finalRange != null && finalRange < 3 && finiteFinals.length >= 5) {
      warnings.push(
        "Final confidence scores have low dispersion; check denominator floors and midpoint defaults.",
      );
    }

    if (clampedPct >= 25) {
      warnings.push(
        `${Math.round(clampedPct)}% of final confidence values are hard-clamped near 0 or 100.`,
      );
    }

    if (saturationPct >= 25) {
      warnings.push(
        `${Math.round(saturationPct)}% of normalized scores are saturated near bounds.`,
      );
    }

    return {
      sampleCount,
      finiteFinalCount: finiteFinals.length,
      rawRange,
      normalizedRange,
      postFilterRange,
      finalRange,
      midpointCollapsePct,
      fallbackCollapsePct,
      nanFallbackPct,
      clampedPct,
      saturationPct,
      warnings,
      samples: samples.slice(),
    };
  }
}

export function buildStageSurvivalAnalytics(
  events: PipelineAuditEvent[],
  assets?: string[],
): StageSurvivalAnalytics {
  const normalizedEvents = events.map(normalizeAuditEvent);
  const explicitAssets = new Set(
    (assets ?? []).map(normalizeAsset).filter(Boolean),
  );
  const allAssets = new Set([
    ...explicitAssets,
    ...normalizedEvents
      .map((event) => normalizeAsset(event.asset))
      .filter(Boolean),
  ]);
  const universeSize = allAssets.size;
  const stages: StageSurvivalRow[] = [];
  let cumulative = universeSize;

  for (const stage of SIGNAL_PIPELINE_STAGES) {
    const stageEvents = normalizedEvents.filter(
      (event) => event.stage === stage,
    );
    const reachedAssets = new Set(
      stageEvents.map((event) => normalizeAsset(event.asset)).filter(Boolean),
    );
    const passedAssets = new Set(
      stageEvents
        .filter((event) => event.passed)
        .map((event) => normalizeAsset(event.asset))
        .filter(Boolean),
    );
    const rejectedEvents = stageEvents.filter((event) => !event.passed);
    const reached = stageEvents.length ? reachedAssets.size : cumulative;
    const passed = stageEvents.length ? passedAssets.size : reached;
    const rejected = Math.max(0, reached - passed);
    const reasons = summarizeReasons(
      rejectedEvents,
      Math.max(1, rejectedEvents.length),
    );
    const row: StageSurvivalRow = {
      stage,
      reached,
      passed,
      rejected,
      survivalPct: pct(passed, reached),
      attritionPct: pct(rejected, reached),
      cumulativePassed: passed,
      cumulativeSurvivalPct: pct(passed, universeSize),
      dominantReason: reasons[0]?.reason ?? null,
      reasons,
    };

    stages.push(row);
    cumulative = passed;
  }

  const bottleneck =
    stages
      .filter((stage) => stage.reached > 0 && stage.rejected > 0)
      .sort(
        (a, b) => b.attritionPct - a.attritionPct || b.rejected - a.rejected,
      )[0] ?? null;
  const dominantRejectionStage =
    bottleneck && bottleneck.rejected > 0 ? bottleneck.stage : null;
  const warnings: string[] = [];

  if (bottleneck && bottleneck.reached > 0 && bottleneck.passed === 0) {
    warnings.push(
      `${bottleneck.stage} eliminated every candidate that reached it.`,
    );
  }

  if (bottleneck && bottleneck.attritionPct >= 80 && bottleneck.rejected > 0) {
    warnings.push(
      `${bottleneck.stage} rejected ${Math.round(bottleneck.attritionPct)}% of reached candidates.`,
    );
  }

  return {
    universeSize,
    stages,
    bottleneck,
    dominantRejectionStage,
    warnings,
  };
}

function normalizeAuditEvent(event: PipelineAuditEvent): PipelineAuditEvent {
  return {
    ...event,
    asset: normalizeAsset(event.asset) || "UNKNOWN",
    timestamp: event.timestamp ?? Date.now(),
    score: finiteOrNull(event.score),
    threshold: event.threshold ?? null,
    reason: String(event.reason || (event.passed ? "passed" : "rejected")),
    metadata: event.metadata ?? {},
  };
}

function summarizeReasons(events: PipelineAuditEvent[], denominator: number) {
  const counts = new Map<string, number>();

  for (const event of events) {
    const reason = event.reason || "Rejected";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count, pct: pct(count, denominator) }))
    .sort((a, b) => b.count - a.count);
}

function normalizeAsset(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function finiteValues(values: Array<number | null | undefined>) {
  return values
    .map((value) => finiteOrNull(value))
    .filter((value): value is number => value != null);
}

function finiteOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rangeOrNull(values: number[]) {
  if (!values.length) return null;
  return Math.max(...values) - Math.min(...values);
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}
