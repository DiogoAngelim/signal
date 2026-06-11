import { clamp, mean } from "../math/statistics";

export type TrustState = {
  score: number;
  status: "untrusted" | "provisional" | "trusted" | "highly_trusted";
  reasons: string[];
};

export type PermissionState = {
  allowed: boolean;
  level: "blocked" | "review_required" | "limited" | "approved";
  reasons: string[];
};

export type CapacityState = {
  maxExposure: number;
  mode: "none" | "micro" | "reduced" | "normal" | "expanded";
  reasons: string[];
};

export type UrgencyState = {
  score: number;
  mode: "none" | "wait" | "monitor" | "act_soon" | "act_now";
  reasons: string[];
};

export type DecisionRestriction = {
  id: string;
  label: string;
  reason: string;
  severity?: "low" | "medium" | "high" | "critical" | string;
  blocksAction?: boolean;
  requiresReview?: boolean;
  maxExposure?: number;
  unlockCondition?: string;
  metadata?: Record<string, unknown>;
};

export type DecisionCondition = {
  id: string;
  description: string;
  source?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
};

export type DecisionStateInput = {
  confidence?: number | null;
  risk?: number | null;
  opportunity?: number | null;
  trust?: Partial<TrustState> | number | null;
  permission?: Partial<PermissionState> | null;
  capacity?: Partial<CapacityState> | number | null;
  urgency?: Partial<UrgencyState> | number | null;
  restrictions?: DecisionRestriction[];
  blockers?: string[];
  warnings?: string[];
  trustGovernor?: {
    trustScore?: number;
    confidenceCap?: number;
    allowsNewExposure?: boolean;
    requiresReview?: boolean;
    participationMode?: string;
    maxExposure?: number;
    primaryBlocker?: string;
    blockers?: Array<{
      id?: string;
      label?: string;
      reason?: string;
      severity?: string;
      unlockCriteria?: string[];
    }>;
    reasons?: string[];
  } | null;
  calibration?: {
    status?: string;
    trustworthiness?: number;
    calibratedConfidence?: number;
    warnings?: string[];
    explanation?: string;
  } | null;
  readiness?: {
    blocked?: boolean;
    readinessScore?: number;
    score?: number;
    maxPositionPct?: number;
    stage?: string;
    failureFlags?: string[];
    reasons?: string[];
  } | null;
  agency?: {
    recommendation?: string;
    trustPct?: number;
    trust?: number;
    blockedActions?: number | string[];
    reasons?: string[];
  } | null;
  survivalMemory?: {
    status?: string;
    recommendation?: string;
    maxExposurePct?: number;
    survivalConfidence?: number;
    reasons?: string[];
    mainWarnings?: string[];
  } | null;
  executionQuality?: {
    score?: number;
    status?: string;
    timingUrgency?: number;
    blockers?: string[];
    warnings?: string[];
  } | null;
};

export type SeparatedDecisionStates = {
  trust: TrustState;
  permission: PermissionState;
  capacity: CapacityState;
  urgency: UrgencyState;
  audit: {
    trustInputs: number[];
    hardBlockers: string[];
    reviewReasons: string[];
    capacityInputs: number[];
    urgencyInputs: number[];
  };
};

export function evaluateDecisionStates(
  input: DecisionStateInput = {},
): SeparatedDecisionStates {
  const trust = trustStateFor(input);
  const permission = permissionStateFor(input, trust);
  const capacity = capacityStateFor(input, permission);
  const urgency = urgencyStateFor(input, permission);

  return {
    trust,
    permission,
    capacity,
    urgency,
    audit: {
      trustInputs: trustInputsFor(input),
      hardBlockers: hardBlockersFor(input),
      reviewReasons: reviewReasonsFor(input, trust),
      capacityInputs: capacityInputsFor(input),
      urgencyInputs: urgencyInputsFor(input),
    },
  };
}

export const separateDecisionStates = evaluateDecisionStates;

function trustStateFor(input: DecisionStateInput): TrustState {
  if (
    typeof input.trust === "object" &&
    input.trust?.status &&
    input.trust.score != null
  ) {
    return {
      score: roundScore(input.trust.score),
      status: input.trust.status,
      reasons: unique(
        input.trust.reasons ?? ["Trust was supplied explicitly."],
      ),
    };
  }

  const explicit =
    typeof input.trust === "number" ? optionalScore(input.trust) : null;
  const values = trustInputsFor(input);
  const score = roundScore(explicit ?? (values.length ? mean(values) : 35));
  const reasons = unique([
    explicit != null ? "Trust was supplied explicitly." : "",
    input.trustGovernor?.trustScore != null
      ? "Trust governor supplied historical reliability."
      : "",
    input.calibration?.trustworthiness != null
      ? "Calibration supplied outcome reliability."
      : "",
    input.survivalMemory?.survivalConfidence != null
      ? "Survival memory supplied state reliability."
      : "",
    values.length
      ? ""
      : "Trust defaults low until reliability evidence is available.",
    ...(input.trustGovernor?.reasons ?? []),
  ]);

  return {
    score,
    status:
      score >= 88
        ? "highly_trusted"
        : score >= 72
          ? "trusted"
          : score >= 50
            ? "provisional"
            : "untrusted",
    reasons,
  };
}

function permissionStateFor(
  input: DecisionStateInput,
  trust: TrustState,
): PermissionState {
  if (input.permission?.level) {
    return {
      allowed: input.permission.allowed ?? input.permission.level !== "blocked",
      level: input.permission.level,
      reasons: unique(
        input.permission.reasons ?? ["Permission was supplied explicitly."],
      ),
    };
  }

  const hardBlockers = hardBlockersFor(input);
  const reviewReasons = reviewReasonsFor(input, trust);
  const allowed = hardBlockers.length === 0;
  const limited =
    allowed &&
    (trust.status === "provisional" ||
      normalized(input.trustGovernor?.participationMode).includes("micro") ||
      normalized(input.trustGovernor?.participationMode).includes("limited") ||
      input.executionQuality?.status === "poor");
  const level = !allowed
    ? "blocked"
    : reviewReasons.length
      ? "review_required"
      : limited
        ? "limited"
        : "approved";
  const reasons = unique([
    ...hardBlockers,
    ...reviewReasons,
    limited
      ? "Permission is limited because reliability or execution quality has not cleared normal participation."
      : "",
    !hardBlockers.length && !reviewReasons.length && !limited
      ? "No permission blockers are active."
      : "",
  ]);

  return { allowed, level, reasons };
}

function capacityStateFor(
  input: DecisionStateInput,
  permission: PermissionState,
): CapacityState {
  if (
    typeof input.capacity === "object" &&
    input.capacity?.mode &&
    input.capacity.maxExposure != null
  ) {
    return {
      maxExposure: roundExposure(input.capacity.maxExposure),
      mode: input.capacity.mode,
      reasons: unique(
        input.capacity.reasons ?? ["Capacity was supplied explicitly."],
      ),
    };
  }

  const explicit =
    typeof input.capacity === "number"
      ? optionalNonNegative(input.capacity)
      : null;
  const values = capacityInputsFor(input);
  const restricted = restrictionCapacity(input.restrictions ?? []);
  const rawCapacity = explicit ?? (values.length ? Math.min(...values) : 0);
  const maxExposure = permission.allowed
    ? roundExposure(Math.min(rawCapacity, restricted))
    : 0;
  const mode =
    maxExposure <= 0
      ? "none"
      : maxExposure <= 1.5
        ? "micro"
        : maxExposure < 10
          ? "reduced"
          : maxExposure <= 25
            ? "normal"
            : "expanded";
  const reasons = unique([
    explicit != null ? "Capacity was supplied explicitly." : "",
    input.trustGovernor?.maxExposure != null
      ? "Trust governor capped exposure capacity."
      : "",
    input.readiness?.maxPositionPct != null
      ? "Readiness supplied maximum position capacity."
      : "",
    input.survivalMemory?.maxExposurePct != null
      ? "Survival memory supplied exposure capacity."
      : "",
    restricted < Number.POSITIVE_INFINITY
      ? "Restrictions capped exposure capacity."
      : "",
    permission.allowed ? "" : "Capacity is zero because permission is blocked.",
    !values.length && explicit == null
      ? "Capacity defaults to zero until sizing evidence is available."
      : "",
  ]);

  return { maxExposure, mode, reasons };
}

function urgencyStateFor(
  input: DecisionStateInput,
  permission: PermissionState,
): UrgencyState {
  if (
    typeof input.urgency === "object" &&
    input.urgency?.mode &&
    input.urgency.score != null
  ) {
    return {
      score: roundScore(input.urgency.score),
      mode: input.urgency.mode,
      reasons: unique(
        input.urgency.reasons ?? ["Urgency was supplied explicitly."],
      ),
    };
  }

  const explicit =
    typeof input.urgency === "number" ? optionalScore(input.urgency) : null;
  const values = urgencyInputsFor(input);
  const score = permission.allowed
    ? roundScore(explicit ?? (values.length ? mean(values) : 25))
    : 0;
  const mode =
    score <= 0
      ? "none"
      : score < 35
        ? "wait"
        : score < 60
          ? "monitor"
          : score < 82
            ? "act_soon"
            : "act_now";
  const reasons = unique([
    explicit != null ? "Urgency was supplied explicitly." : "",
    input.executionQuality?.timingUrgency != null
      ? "Execution quality supplied timing urgency."
      : "",
    input.opportunity != null
      ? "Opportunity pressure contributed to urgency."
      : "",
    input.risk != null ? "Risk pressure reduced urgency." : "",
    permission.allowed ? "" : "Urgency is zero because permission is blocked.",
  ]);

  return { score, mode, reasons };
}

function trustInputsFor(input: DecisionStateInput) {
  return [
    optionalScore(input.trustGovernor?.trustScore),
    optionalScore(input.calibration?.trustworthiness),
    optionalScore(input.agency?.trustPct ?? input.agency?.trust),
    optionalScore(input.survivalMemory?.survivalConfidence),
  ].filter((value): value is number => value != null);
}

function hardBlockersFor(input: DecisionStateInput) {
  return unique([
    input.trustGovernor?.allowsNewExposure === false
      ? "Trust governor does not allow new exposure."
      : "",
    input.readiness?.blocked ? "Readiness is blocked." : "",
    input.executionQuality?.status === "blocked"
      ? "Execution quality is blocked."
      : "",
    normalized(input.survivalMemory?.recommendation) === "wait"
      ? "Survival memory requires waiting."
      : "",
    ...toStringArray(input.blockers),
    ...toStringArray(
      input.restrictions
        ?.filter(
          (restriction) =>
            restriction.blocksAction || restriction.severity === "critical",
        )
        .map((restriction) => restriction.reason),
    ),
  ]);
}

function reviewReasonsFor(input: DecisionStateInput, trust: TrustState) {
  const calibrationStatus = normalized(input.calibration?.status);
  return unique([
    input.trustGovernor?.requiresReview
      ? "Trust governor requires review."
      : "",
    trust.status === "untrusted" ? "Trust is untrusted." : "",
    calibrationStatus.includes("insufficient") ||
    calibrationStatus.includes("unstable") ||
    calibrationStatus.includes("poor")
      ? (input.calibration?.explanation ?? "Calibration requires review.")
      : "",
    input.agency?.recommendation &&
    normalized(input.agency.recommendation).includes("review")
      ? "Agency requires review."
      : "",
    ...toStringArray(input.warnings),
    ...toStringArray(
      input.restrictions
        ?.filter((restriction) => restriction.requiresReview)
        .map((restriction) => restriction.reason),
    ),
  ]);
}

function capacityInputsFor(input: DecisionStateInput) {
  return [
    optionalNonNegative(input.trustGovernor?.maxExposure),
    optionalNonNegative(input.readiness?.maxPositionPct),
    optionalNonNegative(input.survivalMemory?.maxExposurePct),
  ].filter((value): value is number => value != null);
}

function urgencyInputsFor(input: DecisionStateInput) {
  const opportunity = optionalScore(input.opportunity);
  const risk = optionalScore(input.risk);
  const executionUrgency = optionalScore(input.executionQuality?.timingUrgency);
  return [
    executionUrgency,
    opportunity,
    risk == null ? null : 100 - risk,
  ].filter((value): value is number => value != null);
}

function restrictionCapacity(restrictions: DecisionRestriction[]) {
  const values = restrictions
    .map((restriction) => optionalNonNegative(restriction.maxExposure))
    .filter((value): value is number => value != null);
  return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
}

function optionalScore(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric) : null;
}

function optionalNonNegative(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function roundExposure(value: number) {
  return Number(Math.max(0, value).toFixed(2));
}

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
