/* c8 ignore next: tsx sourcemaps emit a phantom branch for this import binding. */
import { clamp, numeric } from "../math/statistics";

export type ReadinessRemediationCategory =
  | "calibration"
  | "robustness"
  | "benchmark"
  | "walk_forward"
  | "strategy_edge"
  | "parameter_stability"
  | "concentration"
  | "data_reliability"
  | "live_signal"
  | "risk_control"
  | "capacity"
  | "belief"
  | "judgement"
  | "agency"
  | "other";

export type ReadinessRemediationSeverity = "low" | "medium" | "high" | "critical";
export type ReadinessRemediationStatus = "ready" | "watch" | "review" | "blocked";

export type ReadinessRemediationGate = {
  id: string;
  label?: string;
  category?: ReadinessRemediationCategory;
  passed?: boolean;
  score?: number;
  severity?: ReadinessRemediationSeverity;
  reason?: string;
  value?: string | number | null;
  targetScore?: number;
  evidenceRequired?: string[];
  unlockCriteria?: string[];
};

export type ReadinessRemediationInput = {
  gates?: ReadinessRemediationGate[];
  failureFlags?: string[];
  calibration?: {
    status?: string;
    sampleSize?: number;
    rawConfidence?: number;
    calibratedConfidence?: number;
    trustworthiness?: number;
    warnings?: string[];
  } | null;
  robustness?: {
    overfitRisk?: number;
    overfitRiskPct?: number;
    deploymentReadiness?: number;
    deploymentReadinessScore?: number;
    safetyGate?: string;
    robustnessScore?: number;
  } | null;
  trust?: {
    trustScore?: number;
    confidenceCap?: number;
    participationMode?: string;
    primaryBlocker?: string;
    blockers?: Array<{
      id?: string;
      label?: string;
      severity?: string;
      reason?: string;
      unlockCriteria?: string[];
    }>;
    unlockCriteria?: string[];
  } | null;
  context?: {
    readinessScore?: number;
    maxConfidence?: number;
    currentStage?: string;
    targetStage?: string;
    allowsNewExposure?: boolean;
  } | null;
};

export type ReadinessRemediationStep = {
  id: string;
  category: ReadinessRemediationCategory;
  title: string;
  priority: number;
  severity: ReadinessRemediationSeverity;
  status: Exclude<ReadinessRemediationStatus, "ready">;
  expectedTrustLift: number;
  effort: "low" | "medium" | "high";
  reason: string;
  evidenceRequired: string[];
  unlocks: string[];
  sourceIds: string[];
  metrics: {
    currentScore: number | null;
    targetScore: number;
    deficit: number;
  };
};

export type ReadinessRemediationPlan = {
  module: "signal.readiness-remediation-planner";
  name: "Readiness Remediation Planner";
  status: ReadinessRemediationStatus;
  summary: string;
  topAction: string;
  totalExpectedTrustLift: number;
  executionGate: "open" | "review" | "blocked";
  targetStage?: string;
  steps: ReadinessRemediationStep[];
  blockers: string[];
  audit: {
    inputGateCount: number;
    failedGateCount: number;
    failureFlagCount: number;
    formulas: string[];
  };
};

type Candidate = {
  id: string;
  category: ReadinessRemediationCategory;
  title: string;
  severity: ReadinessRemediationSeverity;
  reason: string;
  currentScore: number | null;
  targetScore: number;
  evidenceRequired: string[];
  unlocks: string[];
  sourceId: string;
  trustPrimary: boolean;
};

const CATEGORY_DEFAULTS: Record<ReadinessRemediationCategory, {
  title: string;
  baseLift: number;
  effort: ReadinessRemediationStep["effort"];
  targetScore: number;
  evidenceRequired: string[];
  unlocks: string[];
}> = {
  calibration: {
    title: "Stabilize calibration outcomes",
    baseLift: 18,
    effort: "medium",
    targetScore: 75,
    evidenceRequired: ["Closed outcomes from similar states", "Calibration warnings trend"],
    unlocks: ["Review gate can relax once calibrated outcomes are stable."],
  },
  robustness: {
    title: "Reduce robustness overfit risk",
    baseLift: 20,
    effort: "high",
    targetScore: 70,
    evidenceRequired: ["Overfit risk", "Deployment readiness", "Independent validation windows"],
    unlocks: ["Trust Governor can move beyond exits-only when robustness risk clears."],
  },
  benchmark: {
    title: "Rebuild benchmark edge",
    baseLift: 16,
    effort: "high",
    targetScore: 70,
    evidenceRequired: ["Strategy return after costs", "Best baseline return", "Benchmark margin"],
    unlocks: ["Readiness can pass benchmark comparison."],
  },
  walk_forward: {
    title: "Stabilize walk-forward results",
    baseLift: 14,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Chronological test windows", "Weakest period", "Best-period contribution"],
    unlocks: ["Readiness can trust performance outside one period."],
  },
  strategy_edge: {
    title: "Improve risk-adjusted strategy edge",
    baseLift: 13,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Risk-adjusted return", "Positive returns", "Trade sample"],
    unlocks: ["Model confidence cap can rise when edge clears threshold."],
  },
  parameter_stability: {
    title: "Improve parameter stability",
    baseLift: 12,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Nearby parameter variants", "Variant pass rate", "Benchmark survival rate"],
    unlocks: ["Readiness can trust the selected configuration."],
  },
  concentration: {
    title: "Reduce return concentration",
    baseLift: 11,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Top-trade contribution", "Top-period contribution", "Median outcome"],
    unlocks: ["Readiness can trust that returns are not dominated by outliers."],
  },
  data_reliability: {
    title: "Restore data reliability",
    baseLift: 22,
    effort: "low",
    targetScore: 90,
    evidenceRequired: ["Fresh synchronized data", "Coverage audit", "Rejected record count"],
    unlocks: ["Any trust decision can use the current data snapshot."],
  },
  live_signal: {
    title: "Collect live signal evidence",
    baseLift: 10,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Forward shadow observations", "Live signal match", "Average forward return"],
    unlocks: ["Readiness can advance from shadow evidence to live review."],
  },
  risk_control: {
    title: "Reduce risk pressure",
    baseLift: 13,
    effort: "medium",
    targetScore: 75,
    evidenceRequired: ["Drawdown", "Loss clustering", "Tail-risk diagnostics"],
    unlocks: ["Risk gates can allow small participation again."],
  },
  capacity: {
    title: "Restore trusted capacity",
    baseLift: 9,
    effort: "low",
    targetScore: 60,
    evidenceRequired: ["Trusted max exposure", "Sizing constraints", "Available capacity"],
    unlocks: ["Sizing can consider non-zero review allocations."],
  },
  belief: {
    title: "Strengthen belief evidence",
    baseLift: 8,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Supporting evidence", "Contradictory evidence", "Evidence agreement"],
    unlocks: ["Belief can move from weak or uncertain toward justified."],
  },
  judgement: {
    title: "Improve similar-state judgement",
    baseLift: 8,
    effort: "medium",
    targetScore: 70,
    evidenceRequired: ["Similar historical samples", "Outcome stability", "Overfit risk"],
    unlocks: ["Judgement can support rather than review-gate the decision."],
  },
  agency: {
    title: "Clear agency review",
    baseLift: 7,
    effort: "low",
    targetScore: 70,
    evidenceRequired: ["Policy traces", "Blocked action reasons", "Approval state"],
    unlocks: ["Agency can approve commitment decisions."],
  },
  other: {
    title: "Resolve uncategorized readiness blocker",
    baseLift: 5,
    effort: "medium",
    targetScore: 65,
    evidenceRequired: ["Blocking evidence", "Owner diagnosis"],
    unlocks: ["Readiness can be reassessed after the blocker is classified."],
  },
};

const SEVERITY_WEIGHT: Record<ReadinessRemediationSeverity, number> = {
  low: 2,
  medium: 5,
  high: 9,
  critical: 14,
};

export function planReadinessRemediation(input: ReadinessRemediationInput = {}): ReadinessRemediationPlan {
  const gates = Array.isArray(input.gates) ? input.gates : [];
  const flags = Array.isArray(input.failureFlags) ? input.failureFlags.filter(Boolean) : [];
  const candidates = [
    ...gates.flatMap(gateCandidate),
    ...flags.map(flagCandidate),
    ...trustCandidates(input.trust),
    ...calibrationCandidates(input.calibration),
    ...robustnessCandidates(input.robustness),
    ...contextCandidates(input.context),
  ];
  const steps = mergeCandidates(candidates)
    .map(candidateToStep)
    .sort(compareSteps)
    .map((step, index) => ({ ...step, priority: index + 1 }));
  const failedGateCount = gates.filter((gate) => gate.passed === false).length;
  const totalExpectedTrustLift = round(clamp(steps.slice(0, 4).reduce((sum, step) => sum + step.expectedTrustLift, 0)));
  const executionGate = executionGateFor(steps, input.trust?.participationMode, input.context?.allowsNewExposure);
  const status = statusFor(steps, executionGate);
  const blockers = steps
    .filter((step) => step.status === "blocked" || step.severity === "high" || step.severity === "critical")
    .map((step) => step.reason)
    .slice(0, 6);
  const topAction = steps[0]?.title ?? "No remediation required";

  return {
    module: "signal.readiness-remediation-planner",
    name: "Readiness Remediation Planner",
    status,
    summary: summaryFor(status, steps, totalExpectedTrustLift),
    topAction,
    totalExpectedTrustLift,
    executionGate,
    ...(input.context?.targetStage ? { targetStage: String(input.context.targetStage) } : {}),
    steps,
    blockers,
    audit: {
      inputGateCount: gates.length,
      failedGateCount,
      failureFlagCount: flags.length,
      formulas: [
        "candidate severity comes from failed gates, failure flags, calibration, robustness, trust blockers, and capacity context",
        "expectedTrustLift = category base lift + severity weight + score deficit / 5 + primary trust blocker bonus",
        "priority sorts by blocked status, expected trust lift, severity, and stable category order",
      ],
    },
  };
}

export const planReadinessRemediationSteps = planReadinessRemediation;

function gateCandidate(gate: ReadinessRemediationGate): Candidate[] {
  const passed = gate.passed === true || normalizedSeverity(gate.severity) === "low" && numeric(gate.score, 100) >= numeric(gate.targetScore, 70);
  if (passed) return [];

  const category = gate.category ?? categoryFromText(`${gate.id} ${gate.label ?? ""}`);
  const defaults = CATEGORY_DEFAULTS[category];
  const currentScore = finiteOrNull(gate.score);
  const targetScore = numeric(gate.targetScore, defaults.targetScore);

  return [{
    id: `gate:${gate.id}`,
    category,
    title: defaults.title,
    severity: gate.severity ?? severityFromScore(currentScore, targetScore),
    reason: gate.reason || `${gate.label ?? gate.id} has not cleared the readiness threshold.`,
    currentScore,
    targetScore,
    evidenceRequired: gate.evidenceRequired ?? defaults.evidenceRequired,
    unlocks: gate.unlockCriteria ?? defaults.unlocks,
    sourceId: gate.id,
    trustPrimary: false,
  }];
}

function flagCandidate(flag: string): Candidate {
  const category = categoryFromText(flag);
  const defaults = CATEGORY_DEFAULTS[category];
  const severity = /DATA|EXECUTION_BLOCKED|BLOCK|ROBUSTNESS|BENCHMARK/.test(normalizedCode(flag)) ? "high" : "medium";

  return {
    id: `flag:${normalizedCode(flag)}`,
    category,
    title: defaults.title,
    severity,
    reason: reasonForFlag(flag, defaults.title),
    currentScore: null,
    targetScore: defaults.targetScore,
    evidenceRequired: defaults.evidenceRequired,
    unlocks: defaults.unlocks,
    sourceId: normalizedCode(flag),
    trustPrimary: false,
  };
}

function trustCandidates(trust: ReadinessRemediationInput["trust"]): Candidate[] {
  if (!trust) return [];

  const primary = String(trust.primaryBlocker ?? "");
  const blockers = Array.isArray(trust.blockers) ? trust.blockers : [];

  return blockers.map((item, index) => {
    const category = categoryFromText(`${item.id ?? ""} ${item.label ?? ""} ${item.reason ?? ""}`);
    const defaults = CATEGORY_DEFAULTS[category];
    const id = String(item.id ?? `trust-${index}`);

    return {
      id: `trust:${id}`,
      category,
      title: defaults.title,
      severity: normalizedSeverity(item.severity),
      reason: item.reason || item.label || "Trust Governor blocks increased participation.",
      currentScore: finiteOrNull(trust.trustScore),
      targetScore: defaults.targetScore,
      evidenceRequired: defaults.evidenceRequired,
      unlocks: item.unlockCriteria ?? trust.unlockCriteria ?? defaults.unlocks,
      sourceId: id,
      trustPrimary: id === primary || normalizedCode(id) === normalizedCode(primary),
    };
  });
}

function calibrationCandidates(calibration: ReadinessRemediationInput["calibration"]): Candidate[] {
  if (!calibration) return [];

  const status = normalizedCode(calibration.status ?? "");
  const warnings = (calibration.warnings ?? []).map(normalizedCode);
  const needsReview =
    status.includes("UNSTABLE") ||
    status.includes("POOR") ||
    status.includes("INSUFFICIENT") ||
    warnings.some((warning) => warning.includes("UNSTABLE") || warning.includes("OVERCONFIDENCE") || warning.includes("POOR"));

  if (!needsReview) return [];

  const raw = finiteOrNull(calibration.rawConfidence);
  const calibrated = finiteOrNull(calibration.calibratedConfidence);
  const gap = raw != null && calibrated != null ? Math.max(0, raw - calibrated) : 0;
  const severity: ReadinessRemediationSeverity = status.includes("INSUFFICIENT")
    ? "medium"
    : gap >= 20 || status.includes("UNSTABLE")
      ? "high"
      : "medium";
  const defaults = CATEGORY_DEFAULTS.calibration;

  return [{
    id: `calibration:${status || "warnings"}`,
    category: "calibration",
    title: defaults.title,
    severity,
    reason: status.includes("UNSTABLE")
      ? "Calibration has samples, but outcomes are unstable."
      : status.includes("INSUFFICIENT")
        ? "Calibration history is not deep enough yet."
        : "Calibration quality does not support higher trust yet.",
    currentScore: finiteOrNull(calibration.trustworthiness ?? calibrated),
    targetScore: defaults.targetScore,
    evidenceRequired: defaults.evidenceRequired,
    unlocks: defaults.unlocks,
    sourceId: status || "calibration",
    trustPrimary: false,
  }];
}

function robustnessCandidates(robustness: ReadinessRemediationInput["robustness"]): Candidate[] {
  if (!robustness) return [];

  const overfitRisk = finiteOrNull(robustness.overfitRisk ?? robustness.overfitRiskPct);
  const deploymentReadiness = finiteOrNull(robustness.deploymentReadiness ?? robustness.deploymentReadinessScore);
  const safetyGate = normalizedCode(robustness.safetyGate ?? "");
  const blocked = safetyGate.includes("BLOCK");
  const risky = blocked || (overfitRisk != null && overfitRisk > 30) || (deploymentReadiness != null && deploymentReadiness < 60);

  if (!risky) return [];

  const defaults = CATEGORY_DEFAULTS.robustness;

  return [{
    id: "robustness:overfit",
    category: "robustness",
    title: defaults.title,
    severity: blocked || (overfitRisk != null && overfitRisk > 60) ? "critical" : "high",
    reason: blocked
      ? "Robustness safety gate blocks execution."
      : "Robustness overfit risk is above the execution threshold.",
    currentScore: overfitRisk == null ? finiteOrNull(robustness.robustnessScore) : clamp(100 - overfitRisk),
    targetScore: defaults.targetScore,
    evidenceRequired: defaults.evidenceRequired,
    unlocks: defaults.unlocks,
    sourceId: "robustness",
    trustPrimary: false,
  }];
}

function contextCandidates(context: ReadinessRemediationInput["context"]): Candidate[] {
  if (!context) return [];

  const maxConfidence = finiteOrNull(context.maxConfidence);
  const readinessScore = finiteOrNull(context.readinessScore);
  const confidenceBlocked = maxConfidence != null && maxConfidence < 50;
  const readinessBlocked = readinessScore != null && readinessScore < 50;

  if (!confidenceBlocked && !readinessBlocked && context.allowsNewExposure !== false) return [];

  const category: ReadinessRemediationCategory = context.allowsNewExposure === false ? "capacity" : "strategy_edge";
  const defaults = CATEGORY_DEFAULTS[category];

  return [{
    id: `context:${category}`,
    category,
    title: defaults.title,
    severity: confidenceBlocked || readinessBlocked ? "medium" : "high",
    reason: context.allowsNewExposure === false
      ? "The current state does not allow new exposure."
      : "Readiness or confidence is below the review threshold.",
    currentScore: readinessScore ?? maxConfidence,
    targetScore: defaults.targetScore,
    evidenceRequired: defaults.evidenceRequired,
    unlocks: defaults.unlocks,
    sourceId: category,
    trustPrimary: false,
  }];
}

function mergeCandidates(candidates: Candidate[]): Candidate[] {
  const merged = new Map<ReadinessRemediationCategory, Candidate>();

  for (const candidate of candidates) {
    const existing = merged.get(candidate.category);

    if (!existing) {
      merged.set(candidate.category, candidate);
      continue;
    }

    merged.set(candidate.category, {
      ...existing,
      severity: strongerSeverity(existing.severity, candidate.severity),
      reason: existing.trustPrimary ? existing.reason : candidate.trustPrimary ? candidate.reason : existing.reason,
      currentScore: lowerNullable(existing.currentScore, candidate.currentScore),
      targetScore: Math.max(existing.targetScore, candidate.targetScore),
      evidenceRequired: unique([...existing.evidenceRequired, ...candidate.evidenceRequired]),
      unlocks: unique([...existing.unlocks, ...candidate.unlocks]),
      sourceId: unique([existing.sourceId, candidate.sourceId]).join(","),
      trustPrimary: existing.trustPrimary || candidate.trustPrimary,
    });
  }

  return Array.from(merged.values());
}

function candidateToStep(candidate: Candidate): ReadinessRemediationStep {
  const defaults = CATEGORY_DEFAULTS[candidate.category];
  const deficit = candidate.currentScore == null ? 20 : Math.max(0, candidate.targetScore - candidate.currentScore);
  const expectedTrustLift = round(clamp(defaults.baseLift + SEVERITY_WEIGHT[candidate.severity] + deficit / 5 + (candidate.trustPrimary ? 6 : 0), 1, 35));

  return {
    id: `remediate:${candidate.category}`,
    category: candidate.category,
    title: candidate.title,
    priority: 0,
    severity: candidate.severity,
    status: candidate.severity === "critical" || candidate.severity === "high"
      ? "blocked"
      : candidate.severity === "medium"
        ? "review"
        : "watch",
    expectedTrustLift,
    effort: defaults.effort,
    reason: candidate.reason,
    evidenceRequired: unique(candidate.evidenceRequired),
    unlocks: unique(candidate.unlocks),
    sourceIds: candidate.sourceId.split(",").filter(Boolean),
    metrics: {
      currentScore: candidate.currentScore,
      targetScore: candidate.targetScore,
      deficit: round(deficit),
    },
  };
}

function compareSteps(left: ReadinessRemediationStep, right: ReadinessRemediationStep) {
  const statusDelta = statusRank(right.status) - statusRank(left.status);
  if (statusDelta !== 0) return statusDelta;

  const liftDelta = right.expectedTrustLift - left.expectedTrustLift;
  if (liftDelta !== 0) return liftDelta;

  const severityDelta = SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity];
  if (severityDelta !== 0) return severityDelta;

  return categoryRank(left.category) - categoryRank(right.category);
}

function executionGateFor(
  steps: ReadinessRemediationStep[],
  participationMode: string | undefined,
  allowsNewExposure: boolean | undefined,
): ReadinessRemediationPlan["executionGate"] {
  const mode = normalizedCode(participationMode ?? "");
  if (allowsNewExposure === false || mode.includes("BLOCKED") || steps.some((step) => step.severity === "critical")) {
    return "blocked";
  }
  if (mode.includes("EXITS_ONLY") || mode.includes("PAPER") || steps.some((step) => step.status === "blocked")) {
    return "review";
  }
  return "open";
}

function statusFor(steps: ReadinessRemediationStep[], gate: ReadinessRemediationPlan["executionGate"]): ReadinessRemediationStatus {
  if (!steps.length) return "ready";
  if (gate === "blocked") return "blocked";
  if (gate === "review") return "review";
  return "watch";
}

function summaryFor(status: ReadinessRemediationStatus, steps: ReadinessRemediationStep[], lift: number) {
  if (status === "ready") return "No readiness remediation is required.";
  const first = steps[0];
  return `${first.title} is the highest-impact remediation step, with an estimated trust lift of ${lift.toFixed(1)} points across the top priorities.`;
}

function reasonForFlag(flag: string, fallbackTitle: string) {
  const code = normalizedCode(flag);
  if (code.includes("LOW_SHARPE")) return "Risk-adjusted return is below the readiness threshold.";
  if (code.includes("BENCHMARK")) return "The objective does not clear the benchmark margin.";
  if (code.includes("WALK_FORWARD")) return "Walk-forward outcomes are not stable enough.";
  if (code.includes("PARAMETER")) return "Nearby variants do not preserve the edge.";
  if (code.includes("OUTLIER") || code.includes("CONCENTRATION") || code.includes("TOP_WINNER")) return "Returns depend too heavily on concentrated winners or periods.";
  if (code.includes("ROBUSTNESS")) return "Robustness risk blocks higher trust.";
  if (code.includes("CALIBRATION")) return "Calibration does not support higher trust yet.";
  if (code.includes("DATA") || code.includes("SYNTHETIC")) return "Data quality is not reliable enough for promotion.";
  if (code.includes("LIVE_SIGNAL") || code.includes("FORWARD_SHADOW")) return "Live or forward evidence is not sufficient yet.";
  if (code.includes("DRAWDOWN") || code.includes("RISK")) return "Risk control is below threshold.";
  return `${fallbackTitle} is required before readiness can improve.`;
}

function categoryFromText(value: string): ReadinessRemediationCategory {
  const code = normalizedCode(value);
  if (code.includes("CALIBRATION")) return "calibration";
  if (code.includes("ROBUSTNESS") || code.includes("OVERFIT")) return "robustness";
  if (code.includes("BENCHMARK")) return "benchmark";
  if (code.includes("WALK_FORWARD") || code.includes("PERIOD")) return "walk_forward";
  if (code.includes("SHARPE") || code.includes("STRATEGY_EDGE") || code.includes("RISK_ADJUSTED")) return "strategy_edge";
  if (code.includes("PARAMETER") || code.includes("VARIANT")) return "parameter_stability";
  if (code.includes("OUTLIER") || code.includes("CONCENTRATION") || code.includes("TOP_WINNER")) return "concentration";
  if (code.includes("DATA") || code.includes("SYNTHETIC") || code.includes("STALE")) return "data_reliability";
  if (code.includes("LIVE_SIGNAL") || code.includes("FORWARD_SHADOW") || code.includes("SIGNAL_MATCH")) return "live_signal";
  if (code.includes("DRAWDOWN") || code.includes("RISK_CONTROL")) return "risk_control";
  if (code.includes("CAPACITY") || code.includes("EXPOSURE")) return "capacity";
  if (code.includes("BELIEF")) return "belief";
  if (code.includes("JUDGEMENT") || code.includes("JUDGMENT")) return "judgement";
  if (code.includes("AGENCY")) return "agency";
  return "other";
}

function normalizedSeverity(value: unknown): ReadinessRemediationSeverity {
  const text = String(value ?? "").toLowerCase();
  if (text === "critical") return "critical";
  if (text === "high" || text === "bad") return "high";
  if (text === "low" || text === "good") return "low";
  return "medium";
}

function severityFromScore(score: number | null, target: number): ReadinessRemediationSeverity {
  if (score == null) return "medium";
  const deficit = target - score;
  if (deficit >= 45) return "critical";
  if (deficit >= 20) return "high";
  if (deficit > 0) return "medium";
  return "low";
}

function strongerSeverity(left: ReadinessRemediationSeverity, right: ReadinessRemediationSeverity) {
  return SEVERITY_WEIGHT[right] > SEVERITY_WEIGHT[left] ? right : left;
}

function lowerNullable(left: number | null, right: number | null) {
  if (left == null) return right;
  if (right == null) return left;
  return Math.min(left, right);
}

function categoryRank(category: ReadinessRemediationCategory) {
  return Object.keys(CATEGORY_DEFAULTS).indexOf(category);
}

function statusRank(status: Exclude<ReadinessRemediationStatus, "ready">) {
  if (status === "blocked") return 3;
  if (status === "review") return 2;
  return 1;
}

function normalizedCode(value: unknown) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function finiteOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n) : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

/* c8 ignore next: tsx sourcemaps emit a phantom branch for this helper binding. */
const round = (value: number) => Number(value.toFixed(2));
