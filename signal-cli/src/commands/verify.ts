/**
 * SIGNAL Local Verification System — Verify Command (v19)
 *
 * Validates: phase chain integrity, artifact hashes,
 * checkpoint validity, replay consistency.
 * Writes PHASE_CHAIN_PROOF on success/failure.
 * Writes FAILURE_PROOF on any error.
 *
 * Exit: 0 = valid, 1 = invalid
 */

import { recomputePhaseHash } from "../core/hashChain.js";
import { PROOF_TYPES, writeProof } from "../proofs/proofWriter.js";
import { readState, stateExists } from "../state/stateStore.js";
import type { SignalError } from "../state/types.js";
import { verifyState } from "../verifier/verifier.js";

/**
 * Execute the `signal verify` command.
 * Returns true if valid, false if invalid.
 * Prints results to stdout.
 * Writes PHASE_CHAIN_PROOF artifact.
 */
export function executeVerify(root: string = process.cwd()): boolean {
  if (!stateExists(root)) {
    console.error(
      "SIGNAL: No .signal/state.json found. Run `signal init` first.",
    );
    writeProof(
      PROOF_TYPES.PHASE_CHAIN_PROOF,
      "FAIL",
      [],
      false,
      { reason: "No state file found" },
      root,
    );
    return false;
  }

  const state = readState(root);

  if (state.phases.length === 0) {
    console.log("SIGNAL: State is empty (no phases). Valid by definition.");
    writeProof(
      PROOF_TYPES.PHASE_CHAIN_PROOF,
      "PASS",
      [],
      true,
      { reason: "Empty state is valid by definition" },
      root,
    );
    return true;
  }

  console.log(`SIGNAL: Verifying ${state.phases.length} phase(s)...`);

  const result = verifyState(state);

  // Collect hashes for proof
  const storedHashes = state.phases.map((p) => p.hash);
  const recomputedHashes = state.phases.map((p) => recomputePhaseHash(p));

  if (result.valid) {
    console.log(
      `SIGNAL: ✓ All ${state.phases.length} phase(s) verified successfully.`,
    );

    // Write PHASE_CHAIN_PROOF
    const proofPath = writeProof(
      PROOF_TYPES.PHASE_CHAIN_PROOF,
      "PASS",
      storedHashes,
      true,
      {
        phaseCount: state.phases.length,
        recomputedHashes,
        errorCount: 0,
      },
      root,
    );
    console.log(`  Proof: ${proofPath}`);
    return true;
  }

  console.error("SIGNAL: ✗ Verification FAILED!");
  console.error("");

  for (const error of result.errors) {
    console.error(error.toString());
    console.error("");
  }

  console.error(`Total errors: ${result.errors.length}`);

  // Write PHASE_CHAIN_PROOF (failed)
  const proofPath = writeProof(
    PROOF_TYPES.PHASE_CHAIN_PROOF,
    "FAIL",
    storedHashes,
    false,
    {
      phaseCount: state.phases.length,
      recomputedHashes,
      errorCount: result.errors.length,
      errors: result.errors.map((e: SignalError) => ({
        code: e.code,
        phase: e.phase,
        message: e.message,
        expected: e.expected,
        actual: e.actual,
      })),
    },
    root,
  );
  console.error(`  Proof: ${proofPath}`);

  // Write FAILURE_PROOF for each error
  for (const error of result.errors) {
    writeProof(
      PROOF_TYPES.FAILURE_PROOF,
      "FAIL",
      [],
      false,
      {
        errorCode: error.code,
        phase: error.phase,
        message: error.message,
        expected: error.expected,
        actual: error.actual,
      },
      root,
    );
  }

  return false;
}
