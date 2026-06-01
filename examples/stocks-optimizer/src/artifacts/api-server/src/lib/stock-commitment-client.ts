import {
  evaluateCommitment,
  type CommitmentConstraint,
  type CommitmentDecision,
  type CommitmentPolicyName,
  type CommitmentRecommendation,
  type CommitmentResult,
  type CommitmentStrategyName,
} from "@signal/commitment";

export type StocksCommitmentIntent = "trading" | "investing";
export type StocksRiskPreference = "conservative" | "balanced" | "aggressive";

export type StocksCommitmentProfile = {
  availableCapital: number;
  intent: StocksCommitmentIntent;
  riskPreference: StocksRiskPreference;
  trustOverride?: number;
  maxSinglePositionPct?: number;
  maxPortfolioCommitmentPct?: number;
};

export type StocksCommitmentExecutionPlanRow = {
  symbol: string;
  action: "Buy" | "Sell" | "Watch" | "Blocked";
  price: number | null;
  commitmentAmount: number;
  allocationPct: number;
  estimatedUnits: number | null;
  mode: CommitmentRecommendation["mode"];
  score: CommitmentRecommendation["score"] | null;
  reasons: string[];
  limitedBy: string[];
  invalidationTriggers: string[];
  monitoringMetrics: string[];
  warnings: string[];
};

export type StocksCommitmentPayload = {
  source: "signal.commitment";
  operation: "commitment.evaluate.v1";
  input: StocksCommitmentProfile & {
    market: string;
    policy: CommitmentPolicyName;
    strategy: CommitmentStrategyName;
  };
  result: CommitmentResult;
  summary: {
    status: CommitmentResult["status"];
    mode: CommitmentResult["mode"];
    policy: CommitmentResult["policy"];
    strategy: CommitmentResult["strategy"];
    availableCapital: number;
    totalRecommended: number;
    uncommittedCapital: number;
    normalizedCommitment: number;
    recommendedCount: number;
    largestPosition: StocksCommitmentExecutionPlanRow | null;
    weakestRecommendation: StocksCommitmentExecutionPlanRow | null;
    biggestRisk: StocksCommitmentExecutionPlanRow | null;
    monitorFirst: string | null;
    limitedBy: string[];
    why: string[];
    warnings: string[];
  };
  executionPlan: StocksCommitmentExecutionPlanRow[];
  diagnostics: {
    decisionCount: number;
    eligibleTargets: string[];
    blockedBy: string[];
    cappedBy: string[];
    deterministic: true;
    recomputeKey: string;
  };
};

type BuildStocksCommitmentInput = {
  market: string;
  signals: Array<Record<string, any>>;
  summary?: Record<string, any> | null;
  regime?: Record<string, any> | null;
  profile: StocksCommitmentProfile;
  now?: string;
};

export function commitmentProfileFromRequest(
  req: { query?: Record<string, any>; body?: Record<string, any> },
  defaults: { availableCapital?: number } = {},
): StocksCommitmentProfile {
  const source = {
    ...(req.query ?? {}),
    ...(isRecord(req.body?.commitment) ? req.body.commitment : {}),
    ...(isRecord(req.body?.investor) ? req.body.investor : {}),
  };

  const availableCapital = Math.max(
    0,
    roundCurrency(
      firstFiniteNumber(
        source.availableCapital,
        source.capital,
        source.commitmentCapital,
        req.body?.availableCapital,
        defaults.availableCapital,
        1000,
      ) ?? 1000,
    ),
  );
  const intent = normalizeIntent(source.intent ?? source.horizon ?? source.mode);
  const riskPreference = normalizeRiskPreference(source.riskPreference ?? source.risk);
  const trustOverride = normalizeOptionalPct(
    firstFiniteNumber(source.trustOverride, source.userTrustOverride, source.trust),
  );
  const maxSinglePositionPct = normalizeOptionalPctNumber(
    firstFiniteNumber(source.maxSinglePositionPct, source.maxPositionPct, source.singlePositionCapPct),
  );
  const maxPortfolioCommitmentPct = normalizeOptionalPctNumber(
    firstFiniteNumber(source.maxPortfolioCommitmentPct, source.maxPortfolioPct, source.portfolioCapPct),
  );

  return {
    availableCapital,
    intent,
    riskPreference,
    ...(trustOverride != null ? { trustOverride } : {}),
    ...(maxSinglePositionPct != null ? { maxSinglePositionPct } : {}),
    ...(maxPortfolioCommitmentPct != null ? { maxPortfolioCommitmentPct } : {}),
  };
}

export function buildStocksCommitment(input: BuildStocksCommitmentInput): StocksCommitmentPayload {
  const policy = policyFor(input.profile);
  const strategy = strategyFor(input.profile);
  const decisions = input.signals
    .map((signal) => decisionFromSignal(signal, input.profile))
    .filter((decision): decision is CommitmentDecision => decision != null);
  const globalConstraints = globalCommitmentConstraints(input);
  const portfolioMaximum =
    input.profile.maxPortfolioCommitmentPct == null
      ? undefined
      : roundCurrency(input.profile.availableCapital * (input.profile.maxPortfolioCommitmentPct / 100));

  const result = evaluateCommitment({
    decisions,
    resource: {
      id: `${input.market}:investor-capital`,
      available: input.profile.availableCapital,
      requested: input.profile.availableCapital,
      ...(portfolioMaximum != null ? { maximum: portfolioMaximum } : {}),
    },
    trust:
      input.profile.trustOverride == null
        ? undefined
        : {
            userTrust: input.profile.trustOverride,
            systemConfidence: input.profile.trustOverride,
            historicalReliability: input.profile.trustOverride,
          },
    constraints: globalConstraints,
    policy,
    strategy,
    now: input.now,
    seed: `${input.market}:${input.profile.intent}:${input.profile.riskPreference}`,
    metadata: {
      client: "stocks-optimizer",
      market: input.market,
      intent: input.profile.intent,
      riskPreference: input.profile.riskPreference,
    },
  });
  const executionPlan = buildExecutionPlan(input.signals, result);

  return {
    source: "signal.commitment",
    operation: "commitment.evaluate.v1",
    input: {
      ...input.profile,
      market: input.market,
      policy,
      strategy: result.strategy,
    },
    result,
    summary: summarizeCommitment(result, executionPlan, input.profile.availableCapital),
    executionPlan,
    diagnostics: {
      decisionCount: decisions.length,
      eligibleTargets: result.audit.eligibleTargets,
      blockedBy: result.audit.blockedBy,
      cappedBy: result.audit.cappedBy,
      deterministic: true,
      recomputeKey: [
        input.market,
        input.profile.availableCapital,
        input.profile.intent,
        input.profile.riskPreference,
        input.profile.trustOverride ?? "auto",
        input.profile.maxSinglePositionPct ?? "auto",
        input.profile.maxPortfolioCommitmentPct ?? "auto",
        decisions.map((decision) => decision.id).join(","),
      ].join(":"),
    },
  };
}

export function annotateSignalsWithCommitment(
  signals: Array<Record<string, any>>,
  commitment: StocksCommitmentPayload,
): Array<Record<string, any>> {
  const rows = new Map(commitment.executionPlan.map((row) => [row.symbol, row]));
  const recommendations = new Map(
    commitment.result.recommendations.map((recommendation) => [recommendation.targetId, recommendation]),
  );

  return signals.map((signal) => {
    const symbol = normalizeSymbol(signal.symbol ?? signal.ticker);
    const row = rows.get(symbol);
    const recommendation = recommendations.get(symbol);
    if (!row) return signal;

    const sizingReasons = uniqueStrings([
      `Signal Commitment ${commitment.result.status}: ${row.action} ${formatCurrency(row.commitmentAmount)}.`,
      ...row.reasons,
      ...arrayOfStrings(signal.sizingReasons),
    ]).slice(0, 8);

    return {
      ...signal,
      suggestedExposure: row.allocationPct,
      maxPositionPct: Math.max(row.allocationPct, numeric(signal.maxPositionPct, row.allocationPct)),
      allocationAction: row.action,
      signalStatus:
        row.action === "Buy"
          ? "confirmed"
          : row.action === "Blocked"
            ? "blocked"
            : signal.signalStatus ?? "provided",
      sizingMode: commitmentModeToSizingMode(row.mode),
      sizingReasons,
      sizingResult: {
        ...(isRecord(signal.sizingResult) ? signal.sizingResult : {}),
        commitment: {
          source: commitment.source,
          amount: row.commitmentAmount,
          allocationPct: row.allocationPct,
          mode: row.mode,
          status: commitment.result.status,
          limitedBy: row.limitedBy,
        },
      },
      commitment: {
        source: commitment.source,
        operation: commitment.operation,
        amount: row.commitmentAmount,
        allocationPct: row.allocationPct,
        mode: row.mode,
        status: commitment.result.status,
        action: row.action,
        score: row.score,
        reasons: row.reasons,
        limitedBy: row.limitedBy,
        invalidationTriggers: row.invalidationTriggers,
        monitoringMetrics: row.monitoringMetrics,
        recommendation,
      },
    };
  });
}

function decisionFromSignal(
  signal: Record<string, any>,
  profile: StocksCommitmentProfile,
): CommitmentDecision | null {
  const symbol = normalizeSymbol(signal.symbol ?? signal.ticker);
  if (!symbol) return null;

  const confidence = ratio(firstFiniteNumber(signal.calibratedConfidence, signal.signalConfidence, signal.setupQuality, 0) ?? 0);
  const trust = ratio(
    profile.trustOverride ??
      firstFiniteNumber(
        signal.trustGovernor?.trustScore,
        signal.judgement?.trust,
        signal.judgement?.reliability,
        signal.belief?.confidence,
        signal.setupQuality,
        0,
      ) ??
      0,
  );
  const risk = ratio(firstFiniteNumber(signal.riskPressure, signal.judgement?.risk, 50) ?? 50);
  const expectedUtility = ratio(
    firstFiniteNumber(
      signal.expectedUtility,
      signal.viabilityResult?.expectedBenefit,
      signal.expectedMove == null
        ? undefined
        : 50 + Math.max(-10, Math.min(10, Number(signal.expectedMove))) * 3,
      signal.setupQuality,
      50,
    ) ?? 50,
  );
  const suggestedExposurePct = Math.max(
    0,
    firstFiniteNumber(signal.suggestedExposure, signal.maxPositionPct, 0) ?? 0,
  );
  const overrideMaxPct = profile.maxSinglePositionPct;
  const maxSinglePct = Math.max(
    0,
    Math.min(
      overrideMaxPct ?? Number.POSITIVE_INFINITY,
      firstFiniteNumber(signal.maxPositionPct, suggestedExposurePct, 5.5) ?? 5.5,
    ),
  );
  const maxCommitmentPct =
    suggestedExposurePct > 0
      ? Math.min(maxSinglePct || suggestedExposurePct, suggestedExposurePct)
      : maxSinglePct;
  const constraints = commitmentConstraintsForSignal(signal, symbol, profile, maxCommitmentPct);

  return {
    id: symbol,
    label: String(signal.name ?? signal.label ?? symbol),
    confidence,
    trust,
    userTrust: profile.trustOverride ?? trust,
    systemConfidence: confidence,
    historicalReliability: trust,
    risk,
    expectedUtility,
    requestedCommitment: roundCurrency(profile.availableCapital * (suggestedExposurePct / 100)),
    maxCommitment: roundCurrency(profile.availableCapital * (maxCommitmentPct / 100)),
    outcomeSeries: outcomeSeriesFromSignal(signal),
    constraints,
    metadata: {
      action: signal.signalAction ?? signal.allocationAction,
      price: firstFiniteNumber(signal.price, signal.last, signal.close),
      setupQuality: signal.setupQuality,
      riskPressure: signal.riskPressure,
      sourceSuggestedExposurePct: suggestedExposurePct,
    },
  };
}

function commitmentConstraintsForSignal(
  signal: Record<string, any>,
  targetId: string,
  profile: StocksCommitmentProfile,
  maxCommitmentPct: number,
): CommitmentConstraint[] {
  const action = String(signal.signalAction ?? signal.allocationAction ?? "Hold");
  const actionAllowed = signal.actionAllowed !== false;
  const constraints: CommitmentConstraint[] = arrayOfRecords(signal.sizingConstraints).map((constraint) => ({
    id: String(constraint.id ?? `${targetId}-constraint`),
    label: stringOr(constraint.label, constraint.id, "Signal constraint"),
    targetId,
    type: String(constraint.type ?? "").toLowerCase() === "hard" ? "hard" as const : "soft" as const,
    severity: normalizeSeverity(constraint.severity),
    passed: constraint.passed !== false,
    reason: stringOr(constraint.reason, constraint.label, undefined),
  }));

  constraints.push({
    id: `${targetId}-action-must-be-buy`,
    label: "Action permission",
    targetId,
    type: "hard",
    severity: "high",
    passed: action.toLowerCase() === "buy",
    reason: "Only Buy signals can receive new capital commitment.",
  });

  constraints.push({
    id: `${targetId}-decision-action-allowed`,
    label: "Decision action allowed",
    targetId,
    type: "hard",
    severity: "high",
    passed: actionAllowed,
    reason: "Signal decision intelligence did not allow action.",
  });

  if (maxCommitmentPct > 0) {
    constraints.push({
      id: `${targetId}-target-cap`,
      label: "Target cap",
      targetId,
      type: "soft",
      severity: "low",
      passed: true,
      maxCommitmentRatio: maxCommitmentPct / 100,
      reason: `Target commitment is capped at ${round(maxCommitmentPct, 2)}% of available capital.`,
    });
  }

  if (profile.maxSinglePositionPct != null) {
    constraints.push({
      id: `${targetId}-investor-single-position-cap`,
      label: "Investor single-position cap",
      targetId,
      type: "soft",
      severity: "medium",
      passed: true,
      maxCommitmentRatio: profile.maxSinglePositionPct / 100,
      reason: `Investor override caps a single position at ${round(profile.maxSinglePositionPct, 2)}%.`,
    });
  }

  return constraints;
}

function globalCommitmentConstraints(input: BuildStocksCommitmentInput): CommitmentConstraint[] {
  const summary = input.summary ?? {};
  const readiness = isRecord(summary.strategyReadiness) ? summary.strategyReadiness : {};
  const trustGovernor = isRecord(summary.trustGovernor) ? summary.trustGovernor : {};
  const constraints: CommitmentConstraint[] = [];

  if (
    summary.promotionBlocked === true ||
    readiness.blocked === true ||
    summary.automaticFailureDetected === true ||
    trustGovernor.allowsNewExposure === false
  ) {
    constraints.push({
      id: "strategy-readiness-global-block",
      label: "Strategy readiness",
      type: "hard",
      severity: "high",
      passed: false,
      reason: stringOr(
        trustGovernor.blockers?.[0]?.reason,
        summary.readinessLabel,
        "Strategy readiness blocks new exposure.",
      ),
    });
  }

  if (input.profile.maxPortfolioCommitmentPct != null) {
    constraints.push({
      id: "investor-portfolio-commitment-cap",
      label: "Investor portfolio cap",
      type: "soft",
      severity: "medium",
      passed: true,
      maxCommitmentRatio: input.profile.maxPortfolioCommitmentPct / 100,
      reason: `Investor override caps total commitment at ${round(input.profile.maxPortfolioCommitmentPct, 2)}%.`,
    });
  }

  return constraints;
}

function buildExecutionPlan(
  signals: Array<Record<string, any>>,
  result: CommitmentResult,
): StocksCommitmentExecutionPlanRow[] {
  const recommendations = new Map(result.recommendations.map((entry) => [entry.targetId, entry]));
  const rows = signals
    .map((signal) => {
      const symbol = normalizeSymbol(signal.symbol ?? signal.ticker);
      if (!symbol) return null;
      const recommendation = recommendations.get(symbol);
      const amount = recommendation?.amount ?? 0;
      const price = firstFiniteNumber(signal.price, signal.last, signal.close) ?? null;
      const allocationPct = recommendation ? round(recommendation.normalizedCommitment * 100, 4) : 0;
      const action = executionActionFor(signal, recommendation, result);
      const targetInvalidations = result.invalidation.triggers
        .filter((trigger) => !trigger.targetId || trigger.targetId === symbol)
        .map((trigger) => trigger.condition);
      const targetMonitoring = result.monitoringPlan.metrics
        .filter((metric) => !metric.targetId || metric.targetId === symbol)
        .map((metric) => `${metric.id} ${metric.direction} ${round(metric.threshold * 100, 1)}%`);
      const warnings = uniqueStrings([
        ...(recommendation?.limitedBy ?? []),
        ...(action === "Blocked" ? result.limitedBy : []),
      ]);

      return {
        symbol,
        action,
        price,
        commitmentAmount: amount,
        allocationPct,
        estimatedUnits: price && price > 0 && amount > 0 ? Math.floor(amount / price) : null,
        mode: recommendation?.mode ?? "none",
        score: recommendation?.score ?? null,
        reasons: uniqueStrings(recommendation?.reasons ?? result.reasons).slice(0, 5),
        limitedBy: uniqueStrings(recommendation?.limitedBy ?? result.limitedBy),
        invalidationTriggers: uniqueStrings(targetInvalidations).slice(0, 4),
        monitoringMetrics: uniqueStrings(targetMonitoring).slice(0, 4),
        warnings: warnings.slice(0, 5),
      };
    })
    .filter((row): row is StocksCommitmentExecutionPlanRow => row != null);

  return rows.sort((a, b) => {
    if (b.commitmentAmount !== a.commitmentAmount) return b.commitmentAmount - a.commitmentAmount;
    if (a.action !== b.action) return actionRank(a.action) - actionRank(b.action);
    return a.symbol.localeCompare(b.symbol);
  });
}

function summarizeCommitment(
  result: CommitmentResult,
  executionPlan: StocksCommitmentExecutionPlanRow[],
  availableCapital: number,
): StocksCommitmentPayload["summary"] {
  const recommended = executionPlan.filter((row) => row.commitmentAmount > 0);
  const largestPosition = recommended[0] ?? null;
  const weakestRecommendation =
    recommended.length > 0
      ? recommended.reduce((weakest, row) =>
          (row.score?.quality ?? 1) < (weakest.score?.quality ?? 1) ? row : weakest,
        )
      : null;
  const biggestRisk =
    executionPlan.length > 0
      ? executionPlan.reduce((riskiest, row) =>
          (row.score?.risk ?? 0) > (riskiest.score?.risk ?? 0) ? row : riskiest,
        )
      : null;
  const monitorFirst =
    biggestRisk?.monitoringMetrics[0] ??
    result.monitoringPlan.futureChecks[0] ??
    null;

  return {
    status: result.status,
    mode: result.mode,
    policy: result.policy,
    strategy: result.strategy,
    availableCapital,
    totalRecommended: result.totalRecommended,
    uncommittedCapital: roundCurrency(Math.max(0, availableCapital - result.totalRecommended)),
    normalizedCommitment: result.normalizedCommitment,
    recommendedCount: recommended.length,
    largestPosition,
    weakestRecommendation,
    biggestRisk,
    monitorFirst,
    limitedBy: result.limitedBy,
    why: result.reasons.slice(0, 7),
    warnings: uniqueStrings([
      ...result.limitedBy.map((item) => `Limited by ${item}.`),
      ...result.audit.blockedBy.map((item) => `Blocked by ${item}.`),
      ...result.audit.cappedBy.map((item) => `Capped by ${item}.`),
    ]).slice(0, 7),
  };
}

function executionActionFor(
  signal: Record<string, any>,
  recommendation: CommitmentRecommendation | undefined,
  result: CommitmentResult,
): StocksCommitmentExecutionPlanRow["action"] {
  const signalAction = String(signal.signalAction ?? signal.allocationAction ?? "Hold").toLowerCase();
  if (signalAction === "sell") return "Sell";
  if ((recommendation?.amount ?? 0) > 0) return "Buy";
  if (signalAction === "buy" && (result.status === "blocked" || (recommendation?.limitedBy?.length ?? result.limitedBy.length) > 0)) {
    return "Blocked";
  }
  return "Watch";
}

function policyFor(profile: StocksCommitmentProfile): CommitmentPolicyName {
  if (profile.intent === "investing") {
    if (profile.riskPreference === "conservative") return "preservation";
    if (profile.riskPreference === "aggressive") return "aggressive";
    return "compounding";
  }

  if (profile.riskPreference === "conservative") return "conservative";
  if (profile.riskPreference === "aggressive") return "aggressive";
  return "balanced";
}

function strategyFor(profile: StocksCommitmentProfile): CommitmentStrategyName {
  if (profile.riskPreference === "conservative") return "constraint_first";
  return profile.intent === "investing" ? "risk_adjusted" : "constraint_first";
}

function commitmentModeToSizingMode(
  mode: CommitmentRecommendation["mode"],
): "none" | "micro" | "small" | "normal" | "large" | "maxSafe" {
  if (mode === "observe" || mode === "none") return "none";
  if (mode === "micro") return "micro";
  if (mode === "limited") return "small";
  if (mode === "normal") return "normal";
  if (mode === "elevated") return "large";
  return "maxSafe";
}

function normalizeIntent(value: unknown): StocksCommitmentIntent {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("trad")) return "trading";
  return "investing";
}

function normalizeRiskPreference(value: unknown): StocksRiskPreference {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["low", "safe", "defensive", "conservative", "preservation"].includes(normalized)) return "conservative";
  if (["high", "growth", "aggressive"].includes(normalized)) return "aggressive";
  return "balanced";
}

function normalizeSeverity(value: unknown): CommitmentConstraint["severity"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "medium";
}

function outcomeSeriesFromSignal(signal: Record<string, any>) {
  const history = Array.isArray(signal.history)
    ? signal.history
    : Array.isArray(signal.priceHistory)
      ? signal.priceHistory
      : [];
  const prices = history
    .map((point: any) => (isRecord(point) ? firstFiniteNumber(point.price, point.close, point.value) : firstFiniteNumber(point)))
    .filter((point): point is number => point != null && point > 0);
  const returns: number[] = [];
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1];
    const current = prices[index];
    if (previous && current) returns.push((current - previous) / previous);
  }
  return returns.length >= 2 ? returns.slice(-60) : undefined;
}

function normalizeOptionalPct(value: number | undefined) {
  if (value == null) return undefined;
  return Math.max(0, Math.min(1, Math.abs(value) > 1 ? value / 100 : value));
}

function normalizeOptionalPctNumber(value: number | undefined) {
  if (value == null) return undefined;
  const pct = Math.abs(value) > 1 ? value : value * 100;
  return Math.max(0, Math.min(100, pct));
}

function ratio(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(1, Math.abs(numericValue) > 1 ? numericValue / 100 : numericValue));
}

function numeric(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function arrayOfRecords(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, any> => isRecord(item))
    : [];
}

function isRecord(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stringOr(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return undefined;
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flat()
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function actionRank(action: StocksCommitmentExecutionPlanRow["action"]) {
  if (action === "Buy") return 0;
  if (action === "Sell") return 1;
  if (action === "Blocked") return 2;
  return 3;
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function roundCurrency(value: number) {
  return round(value, 2);
}

function formatCurrency(value: number) {
  return `$${roundCurrency(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
