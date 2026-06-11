/**
 * SIGNAL Local Verification System — Replay Command (v19)
 *
 * Recomputes phase hashes in range and compares with stored state.
 * Writes REPLAY_PROOF on success/failure.
 * Writes FAILURE_PROOF on any mismatch.
 */

import { PROOF_TYPES, writeProof } from "../proofs/proofWriter.js";
import { replayPhases } from "../replay/replayEngine.js";
import { readState, stateExists } from "../state/stateStore.js";

export interface ReplayOptions {
  from: number;
  to: number;
}

/**
 * Execute the `signal replay` command.
 * Recomputes hashes for phases in range [from, to] and compares.
 * Returns true if all match, false if any mismatch.
 */
export function executeReplay(
  options: ReplayOptions = { from: 0, to: -1 },
  root: string = process.cwd(),
): boolean {
  if (!stateExists(root)) {
    console.error(
      "SIGNAL: No .signal/state.json found. Run `signal init` first.",
    );
    writeProof(
      PROOF_TYPES.REPLAY_PROOF,
      "FAIL",
      [],
      false,
      { reason: "No state file found" },
      root,
    );
    return false;
  }

  const state = readState(root);
  const lastPhase = state.phases.length - 1;
  const from = options.from;
  const to = options.to === -1 ? lastPhase : options.to;

  console.log(`SIGNAL: Replaying phases ${from} to ${to}...`);

  if (from < 0 || to > lastPhase) {
    console.error(`SIGNAL: Invalid range. Valid phases: 0 to ${lastPhase}`);
    writeProof(
      PROOF_TYPES.REPLAY_PROOF,
      "FAIL",
      [],
      false,
      { reason: `Invalid range: ${from}-${to}, valid: 0-${lastPhase}` },
      root,
    );
    return false;
  }

  const result = replayPhases(state, from, to);

  if (result.valid) {
    console.log("REPLAY: All phases verified — no mismatches detected.");

    // Write REPLAY_PROOF (pass)
    const proofPath = writeProof(
      PROOF_TYPES.REPLAY_PROOF,
      "PASS",
      state.phases.slice(from, to + 1).map((p) => p.hash),
      true,
      {
        from,
        to,
        phaseCount: to - from + 1,
        mismatchCount: 0,
      },
      root,
    );
    console.log(`  Proof: ${proofPath}`);
    return true;
  }

  console.error("REPLAY: ✗ Mismatches detected!");
  for (const m of result.mismatches) {
    console.error(`  Phase ${m.phase}:`);
    console.error(`    Stored:     ${m.storedHash}`);
    console.error(`    Recomputed: ${m.recomputedHash}`);
  }

  // Write REPLAY_PROOF (fail)
  const proofPath = writeProof(
    PROOF_TYPES.REPLAY_PROOF,
    "FAIL",
    state.phases.slice(from, to + 1).map((p) => p.hash),
    false,
    {
      from,
      to,
      phaseCount: to - from + 1,
      mismatchCount: result.mismatches.length,
      mismatches: result.mismatches.map((m) => ({
        phase: m.phase,
        storedHash: m.storedHash,
        recomputedHash: m.recomputedHash,
      })),
    },
    root,
  );
  console.error(`  Proof: ${proofPath}`);

  // Write FAILURE_PROOF for each mismatch
  for (const m of result.mismatches) {
    writeProof(
      PROOF_TYPES.FAILURE_PROOF,
      "FAIL",
      [],
      false,
      {
        errorCode: "REPLAY_MISMATCH",
        phase: m.phase,
        message: "Replay hash does not match stored hash",
        expected: m.storedHash,
        actual: m.recomputedHash,
      },
      root,
    );
  }

  return false;
}
