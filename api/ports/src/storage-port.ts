/**
 * StoragePort — Abstraction for idempotency persistence and state storage.
 *
 * Handles:
 * - Idempotency record lifecycle (reserve → complete/fail)
 * - Replay-safe state persistence
 *
 * Rules:
 * - Implementations must be idempotent for the same key+fingerprint
 * - No business logic — pure storage
 * - Must support deterministic replay (same key → same result)
 */
import type { SignalErrorEnvelope, SignalResultMeta } from "@signal/protocol";

/**
 * Idempotency record for tracking operation execution state.
 */
export interface IdempotencyRecord {
  operationName: string;
  idempotencyKey: string;
  payloadFingerprint: string;
  status: "pending" | "completed" | "failed";
  result?: unknown;
  resultMeta?: SignalResultMeta;
  error?: SignalErrorEnvelope;
  createdAt: string;
  updatedAt: string;
  messageId?: string;
}

/**
 * Result of attempting to reserve an idempotency slot.
 */
export interface IdempotencyReservation {
  state: "reserved" | "replayed" | "conflict" | "inflight";
  record?: IdempotencyRecord;
}

/**
 * Storage port for idempotency enforcement and persistence.
 * Runtime enforces idempotency at the entry boundary via this port.
 */
export interface StoragePort {
  /**
   * Reserve an idempotency slot for the given operation.
   * Returns the reservation state:
   * - "reserved": first execution, proceed
   * - "replayed": previously completed, return cached result
   * - "conflict": fingerprint mismatch, reject
   * - "inflight": currently executing, reject
   */
  reserve(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
  }): Promise<IdempotencyReservation>;

  /**
   * Mark an idempotency slot as successfully completed.
   */
  complete(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    result: unknown;
    resultMeta?: SignalResultMeta;
    messageId?: string;
  }): Promise<void>;

  /**
   * Mark an idempotency slot as failed.
   */
  fail(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    error: SignalErrorEnvelope;
  }): Promise<void>;
}
