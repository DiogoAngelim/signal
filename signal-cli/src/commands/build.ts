/**
 * SIGNAL Local Verification System — Build Command (v19)
 *
 * Flow:
 * 1. Verify
 * 2. Run build command
 * 3. Hash outputs
 * 4. Verify again
 * 5. Fail if drift detected
 * 6. Write BUILD_PROOF / AUDIT_PROOF
 */

import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { executeVerify } from "./verify.js";
import { readState, addPhase } from "../state/stateStore.js";
import {
  createPhaseState,
  hashValue,
  hashDirectory,
  getPreviousHash,
} from "../core/hashChain.js";
import { DEFAULT_BUILD_COMMAND, GENESIS_HASH } from "../core/constants.js";
import { writeProof, PROOF_TYPES } from "../proofs/proofWriter.js";
import type { ExecutionTrace } from "../state/types.js";

/**
 * Execute the `signal build` command.
 * Wraps build execution with verification before and after,
 * and hashes build outputs.
 * Writes BUILD_PROOF / AUDIT_PROOF on completion.
 */
export function executeBuild(
  buildCommand: string = DEFAULT_BUILD_COMMAND,
  outputDir: string = "dist",
  root: string = process.cwd(),
): boolean {
  console.log("SIGNAL: Running build wrapper...");
  console.log("");

  // Step 1: Pre-verification
  console.log("SIGNAL: [1/4] Running pre-build verification...");
  const preVerify = executeVerify(root);
  if (!preVerify) {
    console.error("SIGNAL: ✗ Pre-build verification failed. Aborting build.");
    writeProof(
      PROOF_TYPES.BUILD_PROOF,
      "FAIL",
      [],
      false,
      { reason: "Pre-build verification failed", step: "pre-verify" },
      root,
    );
    return false;
  }
  console.log("");

  // Capture pre-build state
  const preState = readState(root);
  const preLastHash = preState.phases.length > 0
    ? preState.phases[preState.phases.length - 1]!.hash
    : GENESIS_HASH;

  // Step 2: Run build command
  console.log(`SIGNAL: [2/4] Running build command: ${buildCommand}`);
  let buildPassed = true;
  try {
    execSync(buildCommand, {
      cwd: root,
      stdio: "inherit",
      timeout: 600_000, // 10 minute timeout
    });
    console.log("SIGNAL: Build command completed.");
  } catch (err) {
    console.error("SIGNAL: ✗ Build command failed.");
    console.error(String(err));
    buildPassed = false;
  }
  console.log("");

  if (!buildPassed) {
    writeProof(
      PROOF_TYPES.BUILD_PROOF,
      "FAIL",
      [],
      false,
      { reason: "Build command failed", step: "build-execution" },
      root,
    );
    writeProof(
      PROOF_TYPES.FAILURE_PROOF,
      "FAIL",
      [],
      false,
      { errorCode: "BUILD_FAILED", phase: -1, message: "Build command exited with non-zero code" },
      root,
    );
    return false;
  }

  // Step 3: Hash build outputs
  console.log("SIGNAL: [3/4] Hashing build outputs...");
  const fullOutputPath = resolve(root, outputDir);
  let buildOutputHash: string;

  if (existsSync(fullOutputPath) && statSync(fullOutputPath).isDirectory()) {
    buildOutputHash = hashDirectory(fullOutputPath);
    console.log(`  Build output hash (${outputDir}/): ${buildOutputHash}`);
  } else {
    buildOutputHash = hashValue({ buildCompleted: true, outputDir });
    console.log(`  No ${outputDir}/ directory found. Using completion hash.`);
  }

  // Create a build phase entry
  const buildTrace: ExecutionTrace = {
    command: buildCommand,
    inputs: [outputDir],
    phaseInputsHash: hashValue({ buildCommand, outputDir }),
    environment: {
      node: process.version,
      platform: process.platform,
    },
  };

  const previousHash = getPreviousHash(preState.phases);
  const nextPhaseNumber = preState.phases.length;

  const buildPhase = createPhaseState(
    nextPhaseNumber,
    hashValue({ buildOutputHash, outputDir }),
    [buildOutputHash],
    previousHash,
    buildTrace,
    "COMPLETE",
  );

  // Add the build phase to state
  addPhase(buildPhase, root);
  console.log(`  Recorded build phase ${buildPhase.phase}`);
  console.log("");

  // Step 4: Post-verification
  console.log("SIGNAL: [4/4] Running post-build verification...");
  const postVerify = executeVerify(root);
  if (!postVerify) {
    console.error("SIGNAL: ✗ Post-build verification failed. State drift detected!");
    writeProof(
      PROOF_TYPES.BUILD_PROOF,
      "FAIL",
      [],
      false,
      { reason: "Post-build verification failed", step: "post-verify" },
      root,
    );
    return false;
  }

  // Write BUILD_PROOF (success)
  const proofPath = writeProof(
    PROOF_TYPES.BUILD_PROOF,
    "PASS",
    [buildOutputHash],
    true,
    {
      preVerify: true,
      buildPassed: true,
      postVerify: true,
      buildOutputHash,
      outputDir,
      phaseNumber: buildPhase.phase,
    },
    root,
  );

  // Write AUDIT_PROOF (success)
  const auditProofPath = writeProof(
    PROOF_TYPES.AUDIT_PROOF,
    "PASS",
    [preLastHash, buildPhase.hash],
    true,
    {
      preVerify: true,
      buildPassed: true,
      postVerify: true,
      noDrift: true,
      buildCommand,
      outputDir,
    },
    root,
  );

  console.log("");
  console.log("SIGNAL: ✓ Build wrapper completed successfully.");
  console.log(`  Proof: ${proofPath}`);
  console.log(`  Audit: ${auditProofPath}`);
  return true;
}