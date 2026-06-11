/**
 * SIGNAL Boot-Time Contract Enforcement Lock (v4.1 — 10/10 Hardened)
 *
 * Deterministic contract enforcement that guarantees reproducible state
 * verification across environments, CI, and future schema evolution.
 *
 * HARD GUARANTEES:
 * ❌ no JSON.stringify in contract logic (uses deterministicStringify)
 * ❌ no filesystem ordering reliance
 * ❌ no timestamps anywhere in snapshot
 * ❌ no Math.random
 * ❌ no environment variables in hash path
 * ❌ no phase ordering reliance without explicit sort
 *
 * INVARIANT: Any snapshot construction not using projectCanonicalSnapshot
 * is a contract violation.
 */

import { existsSync, readFileSync } from "node:fs";
import { readState } from "../state/stateStore.js";
import { verifyState } from "../verifier/verifier.js";
import { replayPhases } from "../replay/replayEngine.js";
import {
  deterministicStringify,
  sha256,
  recomputePhaseHash,
} from "../core/hashChain.js";
import {
  getStatePath,
  getContractSnapshotPath,
} from "../core/constants.js";
import type { PhaseState } from "../state/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContractVersion = 1;

export type ContractViolationCode =
  | "STATE_MISSING"
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_INVALID"
  | "VERSION_MISMATCH"
  | "VERIFY_FAIL"
  | "REPLAY_FAIL"
  | "SCHEMA_MISMATCH"
  | "CONTENT_MISMATCH";

export type ContractGateResult =
  | { ok: true }
  | {
      ok: false;
      reason: ContractViolationCode;
      expectedHash?: string;
      actualHash?: string;
      details?: unknown;
    };

export interface CanonicalSnapshot {
  version: ContractVersion;
  hashChain: {
    phases: string[];
  };
  verifyResult: {
    valid: boolean;
    errorCount: number;
  };
  replayResult: {
    valid: boolean;
    mismatchCount: number;
  };
}

// ─── Canonical Projection (SINGLE SOURCE OF TRUTH) ──────────────────────────

/**
 * Project a canonical snapshot from state, verify, and replay results.
 *
 * This is the ONE canonical projection function used everywhere:
 * - init.ts (snapshot creation)
 * - contractGate.ts (snapshot verification)
 * - future CI test layer
 *
 * Any snapshot construction not using this function is a contract violation.
 *
 * Determinism guarantees:
 * - Phases are filtered (no null/undefined) and sorted by phase number
 * - Only deterministic fields are extracted from verifyResult and replayResult
 * - No timestamps, no random values, no environment-dependent data
 */
export function projectCanonicalSnapshot(input: {
  version: ContractVersion;
  state: { phases: readonly PhaseState[] };
  verifyResult: { valid: boolean; errors?: readonly unknown[] };
  replayResult: { valid: boolean; mismatches?: readonly unknown[] };
  recomputePhaseHash: (p: PhaseState) => string;
}): CanonicalSnapshot {
  // 🔴 Mandatory determinism guard: filter + sort phases
  const normalizedPhases = [...input.state.phases]
    .filter(Boolean)
    .sort((a, b) => a.phase - b.phase);

  const phases = normalizedPhases.map(input.recomputePhaseHash);

  return {
    version: input.version,
    hashChain: { phases },
    verifyResult: {
      valid: input.verifyResult.valid,
      errorCount: input.verifyResult.errors?.length ?? 0,
    },
    replayResult: {
      valid: input.replayResult.valid,
      mismatchCount: input.replayResult.mismatches?.length ?? 0,
    },
  };
}

// ─── Contract Enforcement ───────────────────────────────────────────────────

/**
 * Assert contract integrity at boot time.
 *
 * Execution order (strict, 11 steps):
 * 1. Check state file exists (explicit — no ambiguity with empty state)
 * 2. Load state
 * 3. Load snapshot file
 * 4. Validate version (early, before any computation)
 * 5. Validate schema (structure-level)
 * 6. Run verifyState
 * 7. Run replayPhases
 * 8. Normalize + sort phases
 * 9. Project canonical snapshot
 * 10. Compare (structural + hash — two-stage)
 * 11. Return ok/fail
 */
export function assertContractIntegrity(
  root: string = process.cwd(),
): ContractGateResult {
  // Step 1: Explicit state file existence check
  // empty state ≠ missing state — this is the deterministic bootstrap boundary
  if (!existsSync(getStatePath(root))) {
    return { ok: false, reason: "STATE_MISSING" };
  }

  // Step 2: Load state
  const state = readState(root);

  // Step 3: Load snapshot file
  const snapshotPath = getContractSnapshotPath(root);
  if (!existsSync(snapshotPath)) {
    return { ok: false, reason: "SNAPSHOT_MISSING" };
  }

  let snapshotRaw: unknown;
  try {
    snapshotRaw = JSON.parse(readFileSync(snapshotPath, "utf8"));
  } catch {
    return { ok: false, reason: "SNAPSHOT_INVALID" };
  }

  if (!snapshotRaw || typeof snapshotRaw !== "object") {
    return { ok: false, reason: "SNAPSHOT_INVALID" };
  }

  // Step 4: Version enforcement (early, before any computation)
  const rawRecord = snapshotRaw as Record<string, unknown>;
  if (rawRecord["version"] !== 1) {
    return { ok: false, reason: "VERSION_MISMATCH" };
  }

  // Step 5: Schema validation (structure-level divergence)
  if (
    rawRecord["hashChain"] == null ||
    typeof rawRecord["hashChain"] !== "object" ||
    rawRecord["verifyResult"] == null ||
    typeof rawRecord["verifyResult"] !== "object"
  ) {
    return { ok: false, reason: "SCHEMA_MISMATCH" };
  }

  // Step 6: Run verifyState
  const verifyResult = verifyState(state);
  if (!verifyResult.valid) {
    return { ok: false, reason: "VERIFY_FAIL" };
  }

  // Step 7: Run replayPhases
  const replayResult = replayPhases(state, 0, state.phases.length - 1);
  if (!replayResult.valid) {
    return { ok: false, reason: "REPLAY_FAIL" };
  }

  // Step 8-9: Normalize + sort phases, project canonical snapshot
  const computed = projectCanonicalSnapshot({
    version: 1,
    state,
    verifyResult,
    replayResult,
    recomputePhaseHash,
  });

  // Step 10: Two-stage comparison (structural + hash)
  // Stage 1: Structural equivalence
  const storedStr = deterministicStringify(snapshotRaw);
  const computedStr = deterministicStringify(computed);

  // Stage 2: Hash equivalence
  const expectedHash = sha256(storedStr);
  const actualHash = sha256(computedStr);

  if (storedStr !== computedStr || expectedHash !== actualHash) {
    return {
      ok: false,
      reason: "CONTENT_MISMATCH",
      expectedHash,
      actualHash,
    };
  }

  // Step 11: All checks passed
  return { ok: true };
}

// ─── Should-Enforce Policy ──────────────────────────────────────────────────

/**
 * Determine if a command should enforce the contract gate.
 * Init and help are exempt — all other commands require contract integrity.
 */
export function shouldEnforceContract(cmd: string): boolean {
  const normalized = cmd.toLowerCase().replace(/^-+/, "");
  return normalized !== "init" && normalized !== "help";
}