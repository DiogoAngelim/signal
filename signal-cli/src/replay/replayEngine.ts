/**
 * SIGNAL Local Verification System — Replay Engine
 *
 * Rebuilds execution history by recomputing hashes from phase 0..N.
 * Compares recomputed hashes with stored state.
 * Reports mismatches.
 */

import type { PhaseState, SignalState, ReplayResult, ReplayMismatch } from "../state/types.js";
import { recomputePhaseHash, computePhaseHash } from "../core/hashChain.js";
import { GENESIS_HASH } from "../core/constants.js";

/**
 * Replay phases from `from` to `to` (inclusive).
 * Recomputes each phase hash deterministically and compares with stored state.
 *
 * Returns a ReplayResult with:
 * - valid: true if all recomputed hashes match stored hashes
 * - mismatches: list of phases where recomputed hash differs from stored hash
 */
export function replayPhases(
  state: SignalState,
  from: number = 0,
  to: number = state.phases.length - 1,
): ReplayResult {
  const mismatches: ReplayMismatch[] = [];
  const phases = state.phases;

  // Clamp range
  const start = Math.max(0, from);
  const end = Math.min(phases.length - 1, to);

  if (start > end || phases.length === 0) {
    return { valid: true, mismatches: [] };
  }

  for (let i = start; i <= end; i++) {
    const phase = phases[i]!;

    // Recompute the phase hash from its stored data
    const recomputedHash = recomputePhaseHash(phase);

    if (recomputedHash !== phase.hash) {
      mismatches.push({
        phase: phase.phase,
        storedHash: phase.hash,
        recomputedHash,
      });
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Full replay from phase 0 to the last phase.
 * This is the most thorough check — it verifies that the entire
 * chain can be reconstructed deterministically.
 */
export function replayFull(state: SignalState): ReplayResult {
  return replayPhases(state, 0, state.phases.length - 1);
}

/**
 * Replay and also verify chain integrity.
 * This checks that recomputing the chain from scratch produces
 * the same sequence of hashes, including previousHash linkage.
 */
export function replayWithChainValidation(state: SignalState): ReplayResult {
  const mismatches: ReplayMismatch[] = [];
  const phases = state.phases;

  if (phases.length === 0) {
    return { valid: true, mismatches: [] };
  }

  // Track the expected previous hash as we walk the chain
  let expectedPreviousHash: string = GENESIS_HASH;

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;

    // Check chain linkage
    if (phase.previousHash !== expectedPreviousHash) {
      mismatches.push({
        phase: phase.phase,
        storedHash: phase.hash,
        recomputedHash: `chain-break: expected previousHash=${expectedPreviousHash}, got=${phase.previousHash}`,
      });
    }

    // Recompute this phase's hash
    const recomputedHash = recomputePhaseHash(phase);

    if (recomputedHash !== phase.hash) {
      mismatches.push({
        phase: phase.phase,
        storedHash: phase.hash,
        recomputedHash,
      });
    }

    // Advance the chain
    expectedPreviousHash = phase.hash;
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Format a ReplayResult for human-readable output.
 */
export function formatReplayResult(result: ReplayResult): string {
  if (result.valid) {
    return "REPLAY: All phases verified — no mismatches detected.";
  }

  const lines: string[] = [
    "REPLAY: Mismatches detected!",
    "",
  ];

  for (const m of result.mismatches) {
    lines.push(`  Phase ${m.phase}:`);
    lines.push(`    Stored:      ${m.storedHash}`);
    lines.push(`    Recomputed:  ${m.recomputedHash}`);
    lines.push("");
  }

  lines.push(`Total mismatches: ${result.mismatches.length}`);

  return lines.join("\n");
}