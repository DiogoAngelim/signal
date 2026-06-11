export type SizingMode =
  | "none"
  | "micro"
  | "small"
  | "normal"
  | "large"
  | "maxSafe";

export type SizingDecision = "blocked" | "deferred" | "allowed";

export type SizingConstraint = {
  id: string;
  label?: string;
  type: "hard" | "soft";
  passed: boolean;
  severity?: "low" | "medium" | "high" | "critical";
  reason?: string;
};

export type SizingInput = {
  targetRef: string;
  actionRef?: string;
  decisionRef?: string;

  confidence: number;
  risk: number;
  utility?: number;

  availableCapacity?: number;
  requestedCapacity?: number;
  minCapacity?: number;
  maxCapacity?: number;

  constraints?: SizingConstraint[];
  context?: Record<string, unknown>;
};

export type SizingResult = {
  decision: SizingDecision;
  mode: SizingMode;
  size: number;
  normalizedSize: number;
  confidence: number;
  risk: number;
  reasons: string[];
  constraints: SizingConstraint[];
  audit: {
    cappedBy?: string[];
    blockedBy?: string[];
    requestedCapacity?: number;
    availableCapacity?: number;
    maxCapacity?: number;
  };
};

type NormalizedCapacity = {
  value: number | undefined;
  specified: boolean;
};

const CONSTRAINT_REDUCTION: Record<
  NonNullable<SizingConstraint["severity"]>,
  number
> = {
  low: 0.9,
  medium: 0.75,
  high: 0.55,
  critical: 0.35,
};

const HARD_NON_BLOCKING_REDUCTION: Record<
  NonNullable<SizingConstraint["severity"]>,
  number
> = {
  low: 0.8,
  medium: 0.6,
  high: 0,
  critical: 0,
};

export function sizeDecision(input: SizingInput): SizingResult {
  const reasons: string[] = [];
  const cappedBy: string[] = [];
  const blockedBy: string[] = [];
  const constraints = normalizeConstraints(input.constraints);
  const confidence = normalizeRatio(input.confidence, "Confidence", 0, reasons);
  const risk = normalizeRatio(input.risk, "Risk", 1, reasons);
  const utility =
    input.utility == null
      ? undefined
      : normalizeRatio(input.utility, "Utility", 0.5, reasons);
  const requestedCapacity = normalizeCapacity(
    input.requestedCapacity,
    "Requested capacity",
    reasons,
  );
  const availableCapacity = normalizeCapacity(
    input.availableCapacity,
    "Available capacity",
    reasons,
  );
  const minCapacity = normalizeCapacity(
    input.minCapacity,
    "Minimum capacity",
    reasons,
  );
  const maxCapacity = normalizeCapacity(
    input.maxCapacity,
    "Maximum capacity",
    reasons,
  );
  const audit = buildAudit(
    requestedCapacity.value,
    availableCapacity.value,
    maxCapacity.value,
  );
  const blockingConstraints = constraints.filter(
    (constraint) =>
      constraint.type === "hard" &&
      !constraint.passed &&
      (constraint.severity === "high" || constraint.severity === "critical"),
  );

  if (blockingConstraints.length > 0) {
    for (const constraint of blockingConstraints) {
      blockedBy.push(constraint.id);
      reasons.push(`Blocked by ${constraintName(constraint)}.`);
      if (constraint.reason) reasons.push(constraint.reason);
    }

    return {
      decision: "blocked",
      mode: "none",
      size: 0,
      normalizedSize: 0,
      confidence,
      risk,
      reasons: unique(reasons),
      constraints,
      audit: {
        ...audit,
        blockedBy,
      },
    };
  }

  let normalizedSize = confidence * (1 - risk);

  if (confidence <= 0) {
    reasons.push("Confidence is zero; sizing starts at zero.");
  } else if (confidence < 0.35) {
    reasons.push(
      `Confidence ${formatPercent(confidence)} is low; sizing is conservative.`,
    );
  } else if (confidence < 0.6) {
    reasons.push(
      `Confidence ${formatPercent(confidence)} is moderate; sizing remains limited.`,
    );
  } else {
    reasons.push(`Confidence ${formatPercent(confidence)} supports sizing.`);
  }

  if (risk >= 1) {
    reasons.push("Risk is at maximum; sizing starts at zero.");
  } else if (risk > 0.75) {
    reasons.push(`Risk ${formatPercent(risk)} is high; sizing is reduced.`);
  } else if (risk > 0.45) {
    reasons.push(
      `Risk ${formatPercent(risk)} is moderate; sizing is controlled.`,
    );
  } else {
    reasons.push(`Risk ${formatPercent(risk)} is controlled.`);
  }

  if (utility != null) {
    const utilityMultiplier = 0.8 + utility * 0.4;
    normalizedSize *= utilityMultiplier;
    if (utility < 0.4)
      reasons.push(`Utility ${formatPercent(utility)} reduces sizing.`);
    if (utility > 0.7)
      reasons.push(`Utility ${formatPercent(utility)} supports sizing.`);
  }

  const failedNonBlocking = constraints.filter(
    (constraint) => !constraint.passed,
  );
  for (const constraint of failedNonBlocking) {
    const severity = constraint.severity as NonNullable<
      SizingConstraint["severity"]
    >;
    const factor =
      constraint.type === "hard"
        ? HARD_NON_BLOCKING_REDUCTION[severity]
        : CONSTRAINT_REDUCTION[severity];
    normalizedSize *= factor;
    reasons.push(
      `${constraintName(constraint)} failed with ${severity} severity; sizing reduced.`,
    );
    if (constraint.reason) reasons.push(constraint.reason);
  }

  if (constraints.length > 0 && failedNonBlocking.length === 0) {
    reasons.push("All sizing constraints passed.");
  }

  if (confidence >= 0.75 && risk <= 0.35 && failedNonBlocking.length === 0) {
    normalizedSize *= 1.15;
    reasons.push(
      "Strong confidence and controlled risk support increased sizing.",
    );
  }

  normalizedSize = clampUnit(normalizedSize);

  const basis = capacityBasis(
    availableCapacity,
    requestedCapacity,
    maxCapacity,
  );
  if (basis <= 0) {
    reasons.push("Available sizing capacity is zero.");
    return finalize({
      decision: "deferred",
      size: 0,
      normalizedSize: 0,
      confidence,
      risk,
      reasons,
      constraints,
      audit,
      cappedBy,
    });
  }

  let size = normalizedSize * basis;
  size = applyCap(
    "requestedCapacity",
    requestedCapacity.value,
    size,
    cappedBy,
    reasons,
  );
  size = applyCap("maxCapacity", maxCapacity.value, size, cappedBy, reasons);
  size = applyCap(
    "availableCapacity",
    availableCapacity.value,
    size,
    cappedBy,
    reasons,
  );

  if (
    minCapacity.value != null &&
    minCapacity.value > 0 &&
    normalizedSize > 0 &&
    size > 0 &&
    size < minCapacity.value
  ) {
    const upperCap = smallestDefined(
      requestedCapacity.value,
      maxCapacity.value,
      availableCapacity.value,
    );
    if (minCapacity.value <= upperCap) {
      size = minCapacity.value;
      reasons.push(
        `Raised to minimum capacity ${formatNumber(minCapacity.value)}.`,
      );
    } else {
      reasons.push(
        `Minimum capacity ${formatNumber(minCapacity.value)} could not be met within caps.`,
      );
    }
  }

  size = Math.max(0, size);
  const finalNormalizedSize = clampUnit(size / basis);

  if (finalNormalizedSize === 0) {
    reasons.push(
      "No capacity committed after confidence, risk, constraints, and caps.",
    );
  }

  return finalize({
    decision: finalNormalizedSize > 0 ? "allowed" : "deferred",
    size: round(size),
    normalizedSize: finalNormalizedSize,
    confidence,
    risk,
    reasons,
    constraints,
    audit,
    cappedBy,
  });
}

function finalize(args: {
  decision: SizingDecision;
  size: number;
  normalizedSize: number;
  confidence: number;
  risk: number;
  reasons: string[];
  constraints: SizingConstraint[];
  audit: SizingResult["audit"];
  cappedBy: string[];
}): SizingResult {
  return {
    decision: args.decision,
    mode: modeFor(args.normalizedSize),
    size: round(args.size),
    normalizedSize: round(clampUnit(args.normalizedSize)),
    confidence: args.confidence,
    risk: args.risk,
    reasons: unique(args.reasons),
    constraints: args.constraints,
    audit: {
      ...args.audit,
      ...(args.cappedBy.length ? { cappedBy: unique(args.cappedBy) } : {}),
    },
  };
}

function normalizeConstraints(
  constraints: SizingInput["constraints"],
): SizingConstraint[] {
  if (!Array.isArray(constraints)) return [];
  return constraints.map((constraint, index) => ({
    id: String(constraint.id || `constraint-${index + 1}`),
    label: constraint.label,
    type: constraint.type === "hard" ? "hard" : "soft",
    passed: Boolean(constraint.passed),
    severity: normalizeSeverity(constraint.severity),
    reason: constraint.reason,
  }));
}

function normalizeSeverity(
  severity: SizingConstraint["severity"],
): NonNullable<SizingConstraint["severity"]> {
  return severity === "low" ||
    severity === "medium" ||
    severity === "high" ||
    severity === "critical"
    ? severity
    : "medium";
}

function normalizeRatio(
  value: unknown,
  label: string,
  fallback: number,
  reasons: string[],
) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    reasons.push(
      `${label} was missing or invalid; using ${formatPercent(fallback)}.`,
    );
    return fallback;
  }

  const scaled = Math.abs(numberValue) > 1 ? numberValue / 100 : numberValue;
  const clamped = clampUnit(scaled);
  if (clamped !== scaled) {
    reasons.push(
      `${label} was outside 0-100%; clamped to ${formatPercent(clamped)}.`,
    );
  }

  return clamped;
}

function normalizeCapacity(
  value: unknown,
  label: string,
  reasons: string[],
): NormalizedCapacity {
  if (value == null) return { value: undefined, specified: false };
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    reasons.push(`${label} was invalid and ignored.`);
    return { value: undefined, specified: true };
  }
  if (numberValue < 0) {
    reasons.push(`${label} was below zero; using 0.`);
    return { value: 0, specified: true };
  }
  return { value: numberValue, specified: true };
}

function buildAudit(
  requestedCapacity: number | undefined,
  availableCapacity: number | undefined,
  maxCapacity: number | undefined,
): SizingResult["audit"] {
  return {
    ...(requestedCapacity != null ? { requestedCapacity } : {}),
    ...(availableCapacity != null ? { availableCapacity } : {}),
    ...(maxCapacity != null ? { maxCapacity } : {}),
  };
}

function capacityBasis(
  availableCapacity: NormalizedCapacity,
  requestedCapacity: NormalizedCapacity,
  maxCapacity: NormalizedCapacity,
) {
  const capacities = [availableCapacity, requestedCapacity, maxCapacity]
    .filter((capacity) => capacity.specified)
    .map((capacity) => capacity.value ?? 0);
  if (capacities.length > 0) return Math.max(...capacities);
  return 1;
}

function applyCap(
  name: "requestedCapacity" | "availableCapacity" | "maxCapacity",
  cap: number | undefined,
  size: number,
  cappedBy: string[],
  reasons: string[],
) {
  if (cap == null || size <= cap) return size;
  cappedBy.push(name);
  reasons.push(`Capped by ${name} at ${formatNumber(cap)}.`);
  return cap;
}

function smallestDefined(...values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value != null);
  return defined.length ? Math.min(...defined) : Number.POSITIVE_INFINITY;
}

function constraintName(constraint: SizingConstraint) {
  return constraint.label
    ? `${constraint.label} (${constraint.id})`
    : constraint.id;
}

function modeFor(normalizedSize: number): SizingMode {
  if (normalizedSize <= 0) return "none";
  if (normalizedSize <= 0.05) return "micro";
  if (normalizedSize <= 0.15) return "small";
  if (normalizedSize <= 0.4) return "normal";
  if (normalizedSize <= 0.7) return "large";
  return "maxSafe";
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number) {
  return Number(value.toFixed(6));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
