/**
 * replay.ts — Deterministic replay validation
 *
 * Reruns the same input through the engine, rebuilds the trace,
 * and compares against the original trace.
 * FAILS immediately on any mismatch: missing step, different hash,
 * or different ordering. No fallback.
 */

import {
  type StepDef,
  type StepTrace,
  type TraceResult,
  traceExecution,
} from "./trace.js";

export interface ReplayResult {
  pass: boolean;
  originalFingerprint: string;
  replayFingerprint: string;
  stepComparisons: StepComparison[];
  error?: string;
}

export interface StepComparison {
  step: string;
  match: boolean;
  originalInputHash?: string;
  originalOutputHash?: string;
  replayInputHash?: string;
  replayOutputHash?: string;
  mismatchReason?: string;
}

/**
 * Compare two traces step-by-step.
 * Hard stop on any mismatch — no fallback, no partial pass.
 */
export function compareTraces(
  original: TraceResult,
  replay: TraceResult,
): ReplayResult {
  const stepComparisons: StepComparison[] = [];

  // Check step count
  if (original.steps.length !== replay.steps.length) {
    return {
      pass: false,
      originalFingerprint: original.fingerprint,
      replayFingerprint: replay.fingerprint,
      stepComparisons: [],
      error: `Step count mismatch: original=${original.steps.length}, replay=${replay.steps.length}`,
    };
  }

  // Compare each step
  for (let i = 0; i < original.steps.length; i++) {
    const origStep = original.steps[i];
    const replayStep = replay.steps[i];

    const comparison: StepComparison = {
      step: origStep.step,
      match: false,
      originalInputHash: origStep.inputHash,
      originalOutputHash: origStep.outputHash,
      replayInputHash: replayStep.inputHash,
      replayOutputHash: replayStep.outputHash,
    };

    // Check step name
    if (origStep.step !== replayStep.step) {
      comparison.mismatchReason = `Step name mismatch at index ${i}: "${origStep.step}" vs "${replayStep.step}"`;
      stepComparisons.push(comparison);
      continue;
    }

    // Check input hash
    if (origStep.inputHash !== replayStep.inputHash) {
      comparison.mismatchReason = `Input hash mismatch at step "${origStep.step}"`;
      stepComparisons.push(comparison);
      continue;
    }

    // Check output hash
    if (origStep.outputHash !== replayStep.outputHash) {
      comparison.mismatchReason = `Output hash mismatch at step "${origStep.step}"`;
      stepComparisons.push(comparison);
      continue;
    }

    comparison.match = true;
    stepComparisons.push(comparison);
  }

  // Check overall fingerprint
  const fingerprintMatch = original.fingerprint === replay.fingerprint;
  const allStepsMatch = stepComparisons.every((c) => c.match);

  const pass = fingerprintMatch && allStepsMatch;

  let error: string | undefined;
  if (!pass) {
    const failures = stepComparisons.filter((c) => !c.match);
    if (!fingerprintMatch) {
      error = `Fingerprint mismatch: ${original.fingerprint} vs ${replay.fingerprint}`;
    } else if (failures.length > 0) {
      error = failures.map((f) => f.mismatchReason).join("; ");
    }
  }

  return {
    pass,
    originalFingerprint: original.fingerprint,
    replayFingerprint: replay.fingerprint,
    stepComparisons,
    error,
  };
}

/**
 * Replay the engine execution with the same input and steps,
 * then compare against the original trace.
 * Hard stop: any mismatch = immediate failure.
 */
export function replayAndValidate(
  originalTrace: TraceResult,
  steps: StepDef[],
  input: unknown,
): ReplayResult {
  // Rebuild the trace from the same input
  const replayTrace = traceExecution(steps, input);

  // Compare — hard stop on any mismatch
  return compareTraces(originalTrace, replayTrace);
}
