/**
 * SIGNAL Local Verification System — Hash Chain
 *
 * Implements:
 * - Strict JSON serialization with sorted keys (v17 #1)
 * - Canonical hash input form: phaseNumber + "|" + serializedPayload (v17 #2)
 * - File/directory hashing with ignore rules (v17 #3)
 * - Phase hash computation
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import type { ExecutionTrace, PhaseState } from "../state/types.js";
import { GENESIS_HASH, IGNORED_PATTERNS, IGNORED_EXTENSIONS } from "./constants.js";

// ─── Strict JSON Serialization (v17 #1) ─────────────────────────────────────

/**
 * Replacer function that sorts object keys lexicographically.
 * - undefined fields are removed (not serialized)
 * - null is preserved
 * - arrays preserve order
 * - no prototype properties included
 */
export function sortedKeysReplacer(
  key: string,
  value: unknown,
): unknown {
  if (value === undefined) {
    return undefined; // will be removed by JSON.stringify
  }
  if (value === null) {
    return null; // preserve null
  }
  if (Array.isArray(value)) {
    return value; // arrays preserve order
  }
  if (typeof value === "object") {
    // Sort keys lexicographically, exclude prototype properties
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) =>
      a.localeCompare(b),
    );
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        sorted[k] = v;
      }
    }
    return sorted;
  }
  return value;
}

/**
 * Deterministic JSON serialization.
 * UTF-8 encoding, sorted keys, undefined removed, null preserved.
 */
export function deterministicStringify(value: unknown): string {
  return JSON.stringify(value, sortedKeysReplacer);
}

// ─── SHA256 Hashing ─────────────────────────────────────────────────────────

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash any value using deterministic serialization + SHA256.
 */
export function hashValue(value: unknown): string {
  return sha256(deterministicStringify(value));
}

// ─── File Hashing (v17 #3) ──────────────────────────────────────────────────

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath, "utf8");
  return sha256(content);
}

/**
 * Check if a path segment should be ignored during directory traversal.
 */
function shouldIgnorePath(pathSegment: string, isFile: boolean): boolean {
  const lower = pathSegment.toLowerCase();

  for (const pattern of IGNORED_PATTERNS) {
    if (lower === pattern.toLowerCase()) {
      return true;
    }
    if (lower.includes(pattern.toLowerCase()) && pattern.startsWith(".")) {
      return true;
    }
  }

  if (isFile) {
    const ext = extname(pathSegment);
    if (IGNORED_EXTENSIONS.has(ext)) {
      return true;
    }
    // Ignore files ending with .map (e.g., *.js.map)
    if (pathSegment.endsWith(".map")) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively collect all file paths in a directory, sorted lexicographically.
 * Ignores: node_modules, dist, .git, *.map, logs/
 */
export function collectFilePaths(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];

  if (!statSync(dir).isDirectory()) {
    return results;
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  // Sort entries lexicographically for deterministic traversal
  entries.sort((a, b) => a.localeCompare(b));

  for (const entry of entries) {
    if (shouldIgnorePath(entry, false)) {
      continue;
    }

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const subPaths = collectFilePaths(fullPath, baseDir);
      results.push(...subPaths);
    } else if (stat.isFile()) {
      if (shouldIgnorePath(entry, true)) {
        continue;
      }
      const relPath = relative(baseDir, fullPath);
      results.push(relPath);
    }
  }

  return results;
}

/**
 * Hash a directory recursively.
 * Format: relativeFilePath + ":" + fileContent
 * All entries sorted lexicographically, concatenated, then SHA256.
 */
export function hashDirectory(dir: string): string {
  const filePaths = collectFilePaths(dir);
  // Already sorted by collectFilePaths

  const parts: string[] = [];
  for (const relPath of filePaths) {
    const fullPath = join(dir, relPath);
    const content = readFileSync(fullPath, "utf8");
    parts.push(`${relPath}:${content}`);
  }

  const concatenated = parts.join("\n");
  return sha256(concatenated);
}

// ─── Phase Hash Computation (v17 #2) ────────────────────────────────────────

/**
 * Compute the phase hash using canonical form:
 * phaseNumber + "|" + serializedPayload
 *
 * Where serializedPayload is the deterministic JSON of:
 * {
 *   inputStateHash,
 *   artifactHashes,
 *   previousPhaseHash,
 *   executionTrace
 * }
 */
export function computePhaseHash(
  phaseNumber: number,
  inputStateHash: string,
  artifactHashes: readonly string[],
  previousPhaseHash: string,
  executionTrace: ExecutionTrace,
): string {
  const payload = {
    inputStateHash,
    artifactHashes: [...artifactHashes].sort(),
    previousPhaseHash,
    executionTrace,
  };

  const serializedPayload = deterministicStringify(payload);
  const canonicalInput = `${phaseNumber}|${serializedPayload}`;

  return sha256(canonicalInput);
}

// ─── Phase State Construction ───────────────────────────────────────────────

/**
 * Create a PhaseState from its components, computing the hash.
 */
export function createPhaseState(
  phaseNumber: number,
  inputStateHash: string,
  artifactHashes: readonly string[],
  previousPhaseHash: string,
  executionTrace: ExecutionTrace,
  status: "COMPLETE" | "FAILED" | "PENDING" = "COMPLETE",
): PhaseState {
  const hash = computePhaseHash(
    phaseNumber,
    inputStateHash,
    artifactHashes,
    previousPhaseHash,
    executionTrace,
  );

  return {
    phase: phaseNumber,
    hash,
    previousHash: previousPhaseHash,
    inputStateHash,
    artifactHashes: [...artifactHashes].sort(),
    executionTrace,
    status,
  };
}

/**
 * Get the previous hash for a phase based on existing phases.
 */
export function getPreviousHash(phases: readonly PhaseState[]): string {
  if (phases.length === 0) {
    return GENESIS_HASH;
  }
  return phases[phases.length - 1]!.hash;
}

/**
 * Recompute a phase hash from its PhaseState (for verification).
 */
export function recomputePhaseHash(phase: PhaseState): string {
  return computePhaseHash(
    phase.phase,
    phase.inputStateHash,
    phase.artifactHashes,
    phase.previousHash,
    phase.executionTrace,
  );
}