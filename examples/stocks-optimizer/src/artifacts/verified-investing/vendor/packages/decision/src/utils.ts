import type {
  CoherenceConflictSeverity,
  DecisionModuleInputs,
  DecisionModuleName,
  ModuleStateInput,
  NormalizedModuleState,
} from "./types";
import { DECISION_MODULES } from "./types";

export function clamp(value: number, min = 0, max = 100): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

export function asScore(value: unknown, fallback = 50): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return clamp(fallback);
  if (numeric >= 0 && numeric <= 1) return clamp(numeric * 100);
  return clamp(numeric);
}

export function average(values: readonly number[], fallback = 50): number {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  return Math.sqrt(
    average(
      values.map((value) => (value - avg) ** 2),
      0,
    ),
  );
}

export function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function severityWeight(severity: CoherenceConflictSeverity): number {
  if (severity === "critical") return 22;
  if (severity === "high") return 15;
  if (severity === "medium") return 9;
  return 5;
}

export function normalizeModuleInputs(
  input: DecisionModuleInputs,
): Partial<Record<DecisionModuleName, NormalizedModuleState>> {
  const normalized: Partial<Record<DecisionModuleName, NormalizedModuleState>> =
    {};

  for (const module of DECISION_MODULES) {
    const raw = input[module];
    if (raw === undefined) continue;
    normalized[module] = normalizeModule(module, raw);
  }

  return normalized;
}

export function normalizeModule(
  module: DecisionModuleName,
  raw: ModuleStateInput,
): NormalizedModuleState {
  if (typeof raw === "number") {
    const score = asScore(raw);
    return {
      module,
      score,
      confidence: score,
      risk: 100 - score,
      uncertainty: 100 - score,
      allowed: score >= 40,
      reasons: [],
    };
  }

  const score = asScore(raw.score ?? raw.confidence ?? raw.trust, 50);
  const risk = asScore(raw.risk, 100 - score);
  const uncertainty = asScore(raw.uncertainty, 100 - score);
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map((reason) => String(reason)).filter(Boolean)
    : raw.explanation
      ? [String(raw.explanation)]
      : [];

  return {
    module,
    score,
    confidence: asScore(raw.confidence, score),
    risk,
    uncertainty,
    allowed: raw.allowed ?? score >= 40,
    reasons,
    ...(raw.status === undefined ? {} : { status: raw.status }),
    ...(raw.metadata === undefined ? {} : { metadata: raw.metadata }),
  };
}

export function moduleScore(
  modules: Partial<Record<DecisionModuleName, NormalizedModuleState>>,
  module: DecisionModuleName,
  fallback = 50,
): number {
  return modules[module]?.score ?? fallback;
}

export function nowIso(clock?: () => Date): string {
  return (clock ?? (() => new Date()))().toISOString();
}

export function stableId(prefix: string, seed: string | undefined): string {
  const suffix = seed?.trim() || "default";
  return `${prefix}:${suffix}`;
}
