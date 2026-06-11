/**
 * SIGNAL Local Verification System — Type Definitions
 * All interfaces, enums, and type contracts for the CLI.
 */

// ─── Error Taxonomy (v17 #6) ───────────────────────────────────────────────

export enum SignalErrorCode {
  INVALID_HASH = "INVALID_HASH",
  MISSING_ARTIFACT = "MISSING_ARTIFACT",
  CHAIN_BREAK = "CHAIN_BREAK",
  REPLAY_MISMATCH = "REPLAY_MISMATCH",
  CHECKPOINT_INVALID = "CHECKPOINT_INVALID",
  PHASE_OUT_OF_ORDER = "PHASE_OUT_OF_ORDER",
}

export class SignalError extends Error {
  constructor(
    public readonly code: SignalErrorCode,
    public readonly phase: number,
    message: string,
    public readonly expected?: string,
    public readonly actual?: string,
  ) {
    super(message);
    this.name = "SignalError";
  }

  override toString(): string {
    let out = `[${this.code}] Phase ${this.phase}\n  ${this.message}`;
    if (this.expected !== undefined) {
      out += `\n  Expected: ${this.expected}`;
    }
    if (this.actual !== undefined) {
      out += `\n  Actual:   ${this.actual}`;
    }
    return out;
  }
}

// ─── Execution Trace (v17 #4) ───────────────────────────────────────────────

export interface ExecutionTraceEnvironment {
  readonly node: string;
  readonly platform: string;
}

export interface ExecutionTrace {
  readonly command: string;
  readonly inputs: readonly string[];
  readonly phaseInputsHash: string;
  readonly environment: ExecutionTraceEnvironment;
}

// ─── Phase State ────────────────────────────────────────────────────────────

export interface PhaseState {
  readonly phase: number;
  readonly hash: string;
  readonly previousHash: string;
  readonly inputStateHash: string;
  readonly artifactHashes: readonly string[];
  readonly executionTrace: ExecutionTrace;
  readonly status: "COMPLETE" | "FAILED" | "PENDING";
}

// ─── State File ─────────────────────────────────────────────────────────────

export interface SignalState {
  readonly version: number;
  readonly phases: readonly PhaseState[];
}

// ─── Hash Log Entry ─────────────────────────────────────────────────────────

export interface HashLogEntry {
  readonly phase: number;
  readonly timestamp: string;
  readonly hash: string;
  readonly operation: string;
}

// ─── Hashes File ─────────────────────────────────────────────────────────────

export interface SignalHashes {
  readonly entries: Record<string, string>;
}

// ─── Replay Result ──────────────────────────────────────────────────────────

export interface ReplayMismatch {
  readonly phase: number;
  readonly storedHash: string;
  readonly recomputedHash: string;
}

export interface ReplayResult {
  readonly valid: boolean;
  readonly mismatches: readonly ReplayMismatch[];
}

// ─── Checkpoint Import (v17 #5) ─────────────────────────────────────────────

export interface HardeningCheckpoint {
  readonly phase: number;
  readonly status: string;
  readonly validation: {
    readonly schemaValid: boolean;
    readonly filesPresent: boolean;
    readonly criteriaSatisfied: boolean;
  };
  readonly artifacts: readonly string[];
  readonly blockingIssues: readonly unknown[];
  readonly evidence: readonly string[];
}

// ─── Verify Result ──────────────────────────────────────────────────────────

export interface VerifyResult {
  readonly valid: boolean;
  readonly errors: readonly SignalError[];
}
