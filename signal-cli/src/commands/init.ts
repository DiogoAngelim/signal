/**
 * SIGNAL Local Verification System — Init Command
 *
 * Creates .signal/ structure and imports hardening checkpoints.
 * v17 #5: Phase import adapter — strict validation boundary.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { GENESIS_HASH, getHardeningDir } from "../core/constants.js";
import {
  createPhaseState,
  getPreviousHash,
  hashFile,
  hashValue,
} from "../core/hashChain.js";
import { PROOF_TYPES, writeProof } from "../proofs/proofWriter.js";
import {
  getPhases,
  initSignalDir,
  readState,
  writeState,
} from "../state/stateStore.js";
import type {
  ExecutionTrace,
  HardeningCheckpoint,
  PhaseState,
} from "../state/types.js";
import { SignalError, SignalErrorCode } from "../state/types.js";

/**
 * Validate a hardening checkpoint per v17 #5.
 * A valid checkpoint MUST contain:
 * - phase (number)
 * - status === "COMPLETE"
 * - artifacts (array)
 * If ANY field missing → reject phase.
 */
function validateCheckpoint(
  raw: unknown,
  dirName: string,
): { valid: boolean; checkpoint?: HardeningCheckpoint; error?: string } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: `Not an object in ${dirName}` };
  }

  const cp = raw as Record<string, unknown>;

  // Required: phase (number)
  if (typeof cp.phase !== "number") {
    return { valid: false, error: `Missing or invalid 'phase' in ${dirName}` };
  }

  // Required: status === "COMPLETE"
  if (cp.status !== "COMPLETE") {
    return {
      valid: false,
      error: `Status is '${String(cp.status)}', expected 'COMPLETE' in ${dirName}`,
    };
  }

  // Required: artifacts (array)
  if (!Array.isArray(cp.artifacts)) {
    return { valid: false, error: `Missing 'artifacts' array in ${dirName}` };
  }

  return {
    valid: true,
    checkpoint: {
      phase: cp.phase as number,
      status: cp.status as string,
      validation: cp.validation as HardeningCheckpoint["validation"],
      artifacts: cp.artifacts as string[],
      blockingIssues: Array.isArray(cp.blockingIssues)
        ? (cp.blockingIssues as unknown[])
        : [],
      evidence: Array.isArray(cp.evidence) ? (cp.evidence as string[]) : [],
    },
  };
}

/**
 * Build an execution trace for an imported checkpoint.
 * v17 #4: No timestamps, no randomness.
 */
function buildImportTrace(
  checkpoint: HardeningCheckpoint,
  artifactHashes: string[],
): ExecutionTrace {
  return {
    command: "signal-init-import",
    inputs: [...checkpoint.artifacts],
    phaseInputsHash: hashValue(checkpoint.artifacts),
    environment: {
      node: process.version,
      platform: process.platform,
    },
  };
}

/**
 * Import hardening checkpoints into the signal state.
 * Scans hardening/phase-XX/ directories for PHASE_CHECKPOINT.json files.
 */
function importHardeningCheckpoints(root: string): {
  imported: number;
  rejected: string[];
  phases: PhaseState[];
} {
  const hardeningDir = getHardeningDir(root);
  const rejected: string[] = [];
  const phases: PhaseState[] = [];

  if (!existsSync(hardeningDir)) {
    return { imported: 0, rejected: [], phases: [] };
  }

  // Find all phase directories
  const entries = readdirSync(hardeningDir).sort();
  const phaseDirs = entries.filter((e) => /^phase-\d+$/.test(e));

  for (const dirName of phaseDirs) {
    const checkpointPath = join(hardeningDir, dirName, "PHASE_CHECKPOINT.json");

    if (!existsSync(checkpointPath)) {
      rejected.push(`${dirName}: No PHASE_CHECKPOINT.json found`);
      continue;
    }

    try {
      const raw = JSON.parse(readFileSync(checkpointPath, "utf8"));
      const result = validateCheckpoint(raw, dirName);

      if (!result.valid || !result.checkpoint) {
        rejected.push(`${dirName}: ${result.error}`);
        continue;
      }

      const checkpoint = result.checkpoint;

      // Compute artifact hashes from actual files
      const artifactHashes: string[] = [];
      for (const artifact of checkpoint.artifacts) {
        const artifactPath = resolve(root, artifact);
        if (existsSync(artifactPath)) {
          artifactHashes.push(hashFile(artifactPath));
        } else {
          // Use the artifact path as a hash input if file doesn't exist
          artifactHashes.push(hashValue(artifact));
        }
      }

      // Build execution trace
      const trace = buildImportTrace(checkpoint, artifactHashes);

      // Compute previous hash
      const previousHash =
        phases.length === 0 ? GENESIS_HASH : phases[phases.length - 1]?.hash;

      // Compute input state hash from checkpoint data
      const inputStateHash = hashValue({
        validation: checkpoint.validation,
        evidence: checkpoint.evidence,
      });

      // Create the phase state
      const phaseState = createPhaseState(
        checkpoint.phase,
        inputStateHash,
        artifactHashes,
        previousHash,
        trace,
        "COMPLETE",
      );

      phases.push(phaseState);
    } catch (err) {
      rejected.push(`${dirName}: Failed to parse — ${String(err)}`);
    }
  }

  return {
    imported: phases.length,
    rejected,
    phases,
  };
}

/**
 * Execute the `signal init` command.
 */
export function executeInit(root: string = process.cwd()): void {
  console.log("SIGNAL: Initializing local verification system...");

  // Create .signal/ directory structure
  initSignalDir(root);

  console.log("  Created .signal/ directory");

  // Import hardening checkpoints
  const result = importHardeningCheckpoints(root);

  if (result.phases.length > 0) {
    // Write imported phases to state
    const state = readState(root);
    const existingPhases = [...state.phases];

    // Only add phases that don't already exist
    const newPhases = result.phases.filter(
      (np) => !existingPhases.some((ep) => ep.phase === np.phase),
    );

    if (newPhases.length > 0) {
      // Re-chain: we need to rebuild the chain if we're adding phases
      // For init, we replace all phases with the imported ones
      const allPhases = [...result.phases];
      writeState({ ...state, phases: allPhases }, root);
      console.log(`  Imported ${result.imported} hardening checkpoints`);
    } else {
      console.log(
        `  No new checkpoints to import (state already has ${existingPhases.length} phases)`,
      );
    }
  } else {
    console.log("  No hardening checkpoints found to import");
  }

  if (result.rejected.length > 0) {
    console.log("");
    console.log("  Rejected checkpoints:");
    for (const r of result.rejected) {
      console.log(`    - ${r}`);
    }

    // Write FAILURE_PROOF for rejected checkpoints
    for (const r of result.rejected) {
      writeProof(
        PROOF_TYPES.FAILURE_PROOF,
        "FAIL",
        [],
        false,
        {
          errorCode: "CHECKPOINT_INVALID",
          phase: -1,
          message: `Checkpoint rejected: ${r}`,
        },
        root,
      );
    }
  }

  // Write INIT_PROOF
  const phaseHashes = result.phases.map((p) => p.hash);
  const initValid = result.rejected.length === 0;
  const proofPath = writeProof(
    PROOF_TYPES.INIT_PROOF,
    initValid ? "PASS" : "FAIL",
    phaseHashes,
    initValid,
    {
      importedPhases: result.imported,
      rejectedCount: result.rejected.length,
      rejected: result.rejected,
    },
    root,
  );

  console.log("");
  console.log("SIGNAL: Initialization complete.");
  console.log(`  Proof: ${proofPath}`);
}
