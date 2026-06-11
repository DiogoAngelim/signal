/**
 * Signal Adapter — Validation Only
 *
 * This module validates signals from the signal engine (BLACK BOX).
 * It does NOT modify, reinterpret, or reweight any signal computation.
 *
 * Allowed actions ONLY:
 * - Enforce schema validation
 * - Log invalid signals
 * - Coerce types for safe consumption (no logic changes)
 */

import type { Signal, ValidatedSignal, SignalDirection } from "./types";

/**
 * Validate a raw signal from the signal engine.
 * Returns a ValidatedSignal if the signal passes schema checks,
 * or null if the signal is invalid (logged to stderr).
 *
 * IMPORTANT: This function does NOT modify signal logic.
 * It only ensures the signal conforms to the expected schema.
 */
export function validateSignal(raw: unknown): ValidatedSignal | null {
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    logInvalidSignal(raw, "signal is not an object");
    return null;
  }

  const record = raw as Record<string, unknown>;

  // Asset validation
  const asset = String(record.asset ?? record.symbol ?? record.ticker ?? "").trim();
  if (!asset) {
    logInvalidSignal(raw, "missing asset/symbol/ticker");
    return null;
  }

  // Direction validation
  const rawDirection = String(record.direction ?? record.signalAction ?? record.allocationAction ?? "flat").trim().toLowerCase();
  const direction = normalizeDirection(rawDirection);
  if (direction !== rawDirection) {
    warnings.push(`direction normalized from "${rawDirection}" to "${direction}"`);
  }

  // Strength validation
  const rawStrength = Number(record.strength ?? record.setupQuality ?? 0);
  const strength = Number.isFinite(rawStrength)
    ? rawStrength > 1
      ? clamp01(rawStrength / 100)  // 0-100 scale → normalize to 0-1
      : clamp01(rawStrength)         // already 0-1 scale
    : 0;
  if (!Number.isFinite(rawStrength)) {
    warnings.push(`strength is not finite: ${String(record.strength)}`);
  } else if (rawStrength > 1 && rawStrength <= 100) {
    warnings.push(`strength appears to be 0-100 scale, normalized to 0-1`);
  }

  // Confidence validation
  const rawConfidence = Number(record.confidence ?? record.signalConfidence ?? record.calibratedConfidence ?? 0);
  const confidence = Number.isFinite(rawConfidence)
    ? rawConfidence > 1
      ? clamp01(rawConfidence / 100)  // 0-100 scale → normalize to 0-1
      : clamp01(rawConfidence)         // already 0-1 scale
    : 0;
  if (!Number.isFinite(rawConfidence)) {
    warnings.push(`confidence is not finite: ${String(record.confidence)}`);
  } else if (rawConfidence > 1 && rawConfidence <= 100) {
    warnings.push(`confidence appears to be 0-100 scale, normalized to 0-1`);
  }

  // Timestamp validation
  const rawTimestamp = record.timestamp ?? record.updatedAt;
  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    const parsed = Date.parse(String(rawTimestamp ?? ""));
    if (!Number.isFinite(parsed)) {
      logInvalidSignal(raw, `invalid timestamp: ${String(rawTimestamp)}`);
      return null;
    }
    warnings.push(`timestamp parsed from ISO string`);
  }

  // Horizon validation (optional)
  const rawHorizon = record.horizon;
  const horizon = isValidHorizon(rawHorizon) ? rawHorizon : undefined;

  const validatedSignal: ValidatedSignal = {
    asset,
    direction,
    strength,
    confidence,
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    horizon,
    _validated: true,
    _validationWarnings: warnings,
  };

  return validatedSignal;
}

/**
 * Validate an array of raw signals, filtering out invalid ones.
 */
export function validateSignals(raws: unknown[]): ValidatedSignal[] {
  const validated: ValidatedSignal[] = [];
  for (const raw of raws) {
    const signal = validateSignal(raw);
    if (signal) validated.push(signal);
  }
  return validated;
}

/**
 * Convert a strategy signal (the existing format from the signal engine)
 * into the canonical Signal schema. This is a mapping adapter —
 * it does NOT change any signal logic.
 */
export function adaptStrategySignal(signal: Record<string, unknown>): ValidatedSignal | null {
  // Use direction field if available, otherwise map from action fields
  const rawDirection = signal.direction
    ? String(signal.direction)
    : mapActionToDirection(
        String(signal.allocationAction ?? signal.signalAction ?? "Hold").trim(),
      );

  return validateSignal({
    asset: signal.symbol ?? signal.ticker,
    direction: rawDirection,
    strength: signal.strength ?? signal.setupQuality ?? signal.trendQuality,
    confidence: signal.confidence ?? signal.calibratedConfidence ?? signal.signalConfidence,
    timestamp: signal.timestamp ?? signal.updatedAt,
    horizon: signal.horizon,
  });
}

/**
 * Batch-adapt strategy signals.
 */
export function adaptStrategySignals(signals: Record<string, unknown>[]): ValidatedSignal[] {
  return validateSignals(signals.map(adaptStrategySignal).filter(Boolean) as ValidatedSignal[]);
}

// ── Internal helpers ────────────────────────────────────────────────

function normalizeDirection(raw: string): SignalDirection {
  if (raw === "long" || raw === "buy") return "long";
  if (raw === "short" || raw === "sell") return "short";
  return "flat";
}

function mapActionToDirection(action: string): SignalDirection {
  const normalized = action.toLowerCase();
  if (normalized === "buy") return "long";
  if (normalized === "sell" || normalized === "exit") return "short";
  return "flat";
}

function isValidHorizon(value: unknown): value is "scalp" | "intraday" | "swing" {
  return value === "scalp" || value === "intraday" || value === "swing";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function logInvalidSignal(raw: unknown, reason: string) {
  console.warn("[signal-adapter] invalid signal rejected:", reason, {
    asset: (raw as any)?.asset ?? (raw as any)?.symbol ?? "unknown",
  });
}