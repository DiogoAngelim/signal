/**
 * SIGNAL Local Verification System — Test Command (v19)
 *
 * Flow:
 * 1. Run signal verify
 * 2. If pass → run test command
 * 3. Rerun signal verify
 * 4. Fail if mismatch
 * 5. Write AUDIT_PROOF
 */

import { execSync } from "node:child_process";
import { DEFAULT_TEST_COMMAND, GENESIS_HASH } from "../core/constants.js";
import { PROOF_TYPES, writeProof } from "../proofs/proofWriter.js";
import { readState } from "../state/stateStore.js";
import { executeVerify } from "./verify.js";

/**
 * Execute the `signal test` command.
 * Wraps test execution with verification before and after.
 * Writes AUDIT_PROOF on completion.
 */
export function executeTest(
  testCommand: string = DEFAULT_TEST_COMMAND,
  root: string = process.cwd(),
): boolean {
  console.log("SIGNAL: Running test wrapper...");
  console.log("");

  // Step 1: Pre-verification
  console.log("SIGNAL: [1/3] Running pre-test verification...");
  const preVerify = executeVerify(root);
  if (!preVerify) {
    console.error("SIGNAL: ✗ Pre-test verification failed. Aborting test run.");
    writeProof(
      PROOF_TYPES.TEST_PROOF,
      "FAIL",
      [],
      false,
      { reason: "Pre-test verification failed", step: "pre-verify" },
      root,
    );
    return false;
  }
  console.log("");

  // Capture pre-test state hash
  const preState = readState(root);
  const preLastHash =
    preState.phases.length > 0
      ? preState.phases[preState.phases.length - 1]?.hash
      : GENESIS_HASH;

  // Step 2: Run test command
  console.log(`SIGNAL: [2/3] Running test command: ${testCommand}`);
  let testPassed = true;
  try {
    execSync(testCommand, {
      cwd: root,
      stdio: "inherit",
      timeout: 300_000, // 5 minute timeout
    });
    console.log("SIGNAL: Test command completed.");
  } catch (err) {
    console.error("SIGNAL: ✗ Test command failed.");
    console.error(String(err));
    testPassed = false;
  }
  console.log("");

  if (!testPassed) {
    writeProof(
      PROOF_TYPES.TEST_PROOF,
      "FAIL",
      [],
      false,
      { reason: "Test command failed", step: "test-execution" },
      root,
    );
    writeProof(
      PROOF_TYPES.FAILURE_PROOF,
      "FAIL",
      [],
      false,
      {
        errorCode: "TEST_FAILED",
        phase: -1,
        message: "Test command exited with non-zero code",
      },
      root,
    );
    return false;
  }

  // Step 3: Post-verification
  console.log("SIGNAL: [3/3] Running post-test verification...");
  const postVerify = executeVerify(root);
  if (!postVerify) {
    console.error(
      "SIGNAL: ✗ Post-test verification failed. State drift detected!",
    );
    writeProof(
      PROOF_TYPES.TEST_PROOF,
      "FAIL",
      [],
      false,
      { reason: "Post-test verification failed", step: "post-verify" },
      root,
    );
    return false;
  }

  // Verify state hasn't drifted
  const postState = readState(root);
  const postLastHash =
    postState.phases.length > 0
      ? postState.phases[postState.phases.length - 1]?.hash
      : GENESIS_HASH;

  if (preLastHash !== postLastHash) {
    console.error("SIGNAL: ✗ State drift detected after test execution!");
    console.error(`  Pre-test last hash:  ${preLastHash}`);
    console.error(`  Post-test last hash: ${postLastHash}`);
    writeProof(
      PROOF_TYPES.TEST_PROOF,
      "FAIL",
      [preLastHash, postLastHash],
      false,
      {
        reason: "State drift detected after test execution",
        step: "drift-check",
        preLastHash,
        postLastHash,
      },
      root,
    );
    writeProof(
      PROOF_TYPES.FAILURE_PROOF,
      "FAIL",
      [],
      false,
      {
        errorCode: "STATE_DRIFT",
        phase: -1,
        message: "State changed after test execution",
        expected: preLastHash,
        actual: postLastHash,
      },
      root,
    );
    return false;
  }

  // Write AUDIT_PROOF (success)
  const proofPath = writeProof(
    PROOF_TYPES.AUDIT_PROOF,
    "PASS",
    [preLastHash],
    true,
    {
      preVerify: true,
      testPassed: true,
      postVerify: true,
      noDrift: true,
      testCommand,
    },
    root,
  );

  console.log("");
  console.log("SIGNAL: ✓ Test wrapper completed successfully. No state drift.");
  console.log(`  Proof: ${proofPath}`);
  return true;
}
