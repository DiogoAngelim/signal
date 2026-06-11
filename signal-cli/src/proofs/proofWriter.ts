/**
 * SIGNAL Local Verification System — Proof Writer (v19)
 *
 * Every command MUST generate a proof artifact under:
 *   .signal/proofs/<command-type>/
 *
 * Proof format:
 * {
 *   "type": "string",
 *   "timestamp": "NOT_ALLOWED_IN_HASH_LOGIC",
 *   "result": "PASS | FAIL",
 *   "hashes": [],
 *   "valid": true,
 *   "details": {}
 * }
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deterministicStringify, hashValue } from "../core/hashChain.js";

// ─── Proof Types ────────────────────────────────────────────────────────────

export const PROOF_TYPES = {
  PHASE_CHAIN_PROOF: "PHASE_CHAIN_PROOF",
  REPLAY_PROOF: "REPLAY_PROOF",
  FAILURE_PROOF: "FAILURE_PROOF",
  AUDIT_PROOF: "AUDIT_PROOF",
  INIT_PROOF: "INIT_PROOF",
  TEST_PROOF: "TEST_PROOF",
  BUILD_PROOF: "BUILD_PROOF",
} as const;

export type ProofType = (typeof PROOF_TYPES)[keyof typeof PROOF_TYPES];

// ─── Proof Structure ────────────────────────────────────────────────────────

export interface Proof {
  readonly type: ProofType;
  readonly timestamp: "NOT_ALLOWED_IN_HASH_LOGIC";
  readonly result: "PASS" | "FAIL";
  readonly hashes: readonly string[];
  readonly valid: boolean;
  readonly details: Record<string, unknown>;
}

// ─── Proof Directory ───────────────────────────────────────────────────────

function getProofsDir(root: string): string {
  return join(root, ".signal", "proofs");
}

function getProofTypeDir(root: string, type: string): string {
  return join(getProofsDir(root), type);
}

/**
 * Ensure the proof directory structure exists.
 */
function ensureProofDir(root: string, type: string): string {
  const dir = getProofTypeDir(root, type);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Proof Hashing ──────────────────────────────────────────────────────────

/**
 * Compute a deterministic hash of the proof content.
 * This hash is derived ONLY from: type, result, hashes, valid, details.
 * The timestamp field is explicitly excluded from hash computation.
 */
function computeProofHash(proof: Proof): string {
  const hashInput = {
    type: proof.type,
    result: proof.result,
    hashes: proof.hashes,
    valid: proof.valid,
    details: proof.details,
  };
  return hashValue(hashInput);
}

// ─── Write Proof ────────────────────────────────────────────────────────────

/**
 * Write a proof artifact to disk.
 * File is named deterministically based on its content hash.
 * Returns the path to the written proof file.
 */
export function writeProof(
  type: ProofType,
  result: "PASS" | "FAIL",
  hashes: readonly string[],
  valid: boolean,
  details: Record<string, unknown>,
  root: string = process.cwd(),
): string {
  const proof: Proof = {
    type,
    timestamp: "NOT_ALLOWED_IN_HASH_LOGIC",
    result,
    hashes: [...hashes],
    valid,
    details,
  };

  const proofHash = computeProofHash(proof);
  const dir = ensureProofDir(root, type);

  // Use the proof hash as filename for deterministic identification
  const filename = `${proofHash}.json`;
  const filePath = join(dir, filename);

  writeFileSync(filePath, `${deterministicStringify(proof)}\n`, "utf8");

  return filePath;
}

/**
 * Write a failure proof for any error condition.
 */
export function writeFailureProof(
  errorCode: string,
  phase: number,
  message: string,
  expected?: string,
  actual?: string,
  root: string = process.cwd(),
): string {
  const details: Record<string, unknown> = {
    errorCode,
    phase,
    message,
  };

  if (expected !== undefined) {
    details.expected = expected;
  }
  if (actual !== undefined) {
    details.actual = actual;
  }

  return writeProof(
    PROOF_TYPES.FAILURE_PROOF,
    "FAIL",
    [],
    false,
    details,
    root,
  );
}

/**
 * List all proof files of a given type.
 */
export function listProofs(
  type: string,
  root: string = process.cwd(),
): string[] {
  const dir = getProofTypeDir(root, type);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}
