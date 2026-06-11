/**
 * SIGNAL Local Verification System — Audit Command (v19)
 *
 * Runs full verification suite:
 * 1. verify → chain integrity
 * 2. replay full range → replay integrity
 * 3. Validate invariants
 * 4. Generate: CHAIN_PROOF, REPLAY_PROOF, AUDIT_PROOF
 * 5. Compute deterministic score (100 if valid, else 0)
 */

import { recomputePhaseHash } from "../core/hashChain.js";
import { PROOF_TYPES, writeProof } from "../proofs/proofWriter.js";
import { replayPhases } from "../replay/replayEngine.js";
import { readState, stateExists } from "../state/stateStore.js";
import type { SignalError } from "../state/types.js";
import { verifyState } from "../verifier/verifier.js";

/**
 * Execute the `signal audit` command.
 * Full verification + replay + proof generation.
 */
export function executeAudit(root: string = process.cwd()): boolean {
  if (!stateExists(root)) {
    console.error(
      "SIGNAL: No .signal/state.json found. Run `signal init` first.",
    );
    writeProof(
      PROOF_TYPES.AUDIT_PROOF,
      "FAIL",
      [],
      false,
      { reason: "No state file found" },
      root,
    );
    return false;
  }

  const state = readState(root);
  console.log(`SIGNAL: Auditing ${state.phases.length} phase(s)...`);
  console.log("");

  // Step 1: Verify chain integrity
  console.log("SIGNAL: [1/3] Running chain verification...");
  const verifyResult = verifyState(state);
  const chainValid = verifyResult.valid;

  if (chainValid) {
    console.log("  ✓ Chain integrity: VALID");
  } else {
    console.log("  ✗ Chain integrity: INVALID");
    for (const err of verifyResult.errors) {
      console.log(`    ${err.toString()}`);
    }
  }

  // Write PHASE_CHAIN_PROOF
  const chainHashes = state.phases.map((p) => p.hash);
  const chainRecomputed = state.phases.map((p) => recomputePhaseHash(p));
  const chainProofPath = writeProof(
    PROOF_TYPES.PHASE_CHAIN_PROOF,
    chainValid ? "PASS" : "FAIL",
    chainHashes,
    chainValid,
    {
      phaseCount: state.phases.length,
      recomputedHashes: chainRecomputed,
      errorCount: verifyResult.errors.length,
      errors: verifyResult.errors.map((e: SignalError) => ({
        code: e.code,
        phase: e.phase,
        message: e.message,
      })),
    },
    root,
  );
  console.log(`  Proof: ${chainProofPath}`);
  console.log("");

  // Step 2: Replay full range
  console.log("SIGNAL: [2/3] Running full replay...");
  const replayResult = replayPhases(state, 0, state.phases.length - 1);
  const replayValid = replayResult.valid;

  if (replayValid) {
    console.log("  ✓ Replay integrity: VALID");
  } else {
    console.log("  ✗ Replay integrity: INVALID");
    for (const m of replayResult.mismatches) {
      console.log(
        `    Phase ${m.phase}: stored=${m.storedHash}, recomputed=${m.recomputedHash}`,
      );
    }
  }

  // Write REPLAY_PROOF
  const replayProofPath = writeProof(
    PROOF_TYPES.REPLAY_PROOF,
    replayValid ? "PASS" : "FAIL",
    state.phases.map((p) => p.hash),
    replayValid,
    {
      from: 0,
      to: state.phases.length - 1,
      mismatchCount: replayResult.mismatches.length,
      mismatches: replayResult.mismatches.map((m) => ({
        phase: m.phase,
        storedHash: m.storedHash,
        recomputedHash: m.recomputedHash,
      })),
    },
    root,
  );
  console.log(`  Proof: ${replayProofPath}`);
  console.log("");

  // Step 3: Validate invariants + compute deterministic score
  console.log("SIGNAL: [3/3] Validating invariants...");

  const invariants: Record<string, boolean> = {};

  // Invariant 1: state[i].previousHash === state[i-1].hash
  let chainInvariant = true;
  for (let i = 0; i < state.phases.length; i++) {
    const phase = state.phases[i];
    if (!phase) continue;
    const expectedPrev =
      i === 0
        ? "0000000000000000000000000000000000000000000000000000000000000000"
        : state.phases[i - 1]?.hash;
    if (phase.previousHash !== expectedPrev) {
      chainInvariant = false;
      break;
    }
  }
  invariants.chainLinkage = chainInvariant;

  // Invariant 2: all hashes recomputed must match stored values
  invariants.hashRecomputation = chainValid;

  // Invariant 3: replay produces identical results
  invariants.replayConsistency = replayValid;

  const allInvariantsHold = Object.values(invariants).every(Boolean);
  const deterministicScore = allInvariantsHold ? 100 : 0;

  if (allInvariantsHold) {
    console.log("  ✓ All invariants hold");
  } else {
    console.log("  ✗ Invariant violations detected:");
    for (const [name, holds] of Object.entries(invariants)) {
      console.log(`    ${name}: ${holds ? "PASS" : "FAIL"}`);
    }
  }

  // Write AUDIT_PROOF
  const overallValid = chainValid && replayValid && allInvariantsHold;
  const auditProofPath = writeProof(
    PROOF_TYPES.AUDIT_PROOF,
    overallValid ? "PASS" : "FAIL",
    [...chainHashes],
    overallValid,
    {
      chainValid,
      replayValid,
      invariants,
      deterministicScore,
      phaseCount: state.phases.length,
    },
    root,
  );
  console.log(`  Proof: ${auditProofPath}`);
  console.log("");

  // Summary
  console.log("SIGNAL: Audit Summary");
  console.log(`  Chain integrity:    ${chainValid ? "PASS" : "FAIL"}`);
  console.log(`  Replay integrity:  ${replayValid ? "PASS" : "FAIL"}`);
  console.log(`  Invariants:         ${allInvariantsHold ? "PASS" : "FAIL"}`);
  console.log(`  Deterministic score: ${deterministicScore}`);
  console.log(`  Overall:            ${overallValid ? "PASS" : "FAIL"}`);

  if (!overallValid) {
    // Write failure proof
    writeProof(
      PROOF_TYPES.FAILURE_PROOF,
      "FAIL",
      [],
      false,
      {
        errorCode: "AUDIT_FAILED",
        phase: -1,
        message: "Audit detected one or more failures",
        chainValid,
        replayValid,
        invariants,
      },
      root,
    );
  }

  return overallValid;
}
