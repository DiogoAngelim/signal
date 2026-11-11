/**
 * StoragePort — persistence contracts used by the Signal runtime.
 *
 * Idempotency alone does not make event delivery durable. Mutations that emit
 * events and require durable replay must use TransactionalStoragePort together
 * with OutboxPort, implemented by the same transactional storage boundary.
 */
import type {
  SignalEnvelope,
  SignalErrorEnvelope,
  SignalResultMeta,
} from "@signal/protocol";

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
  reservationToken?: string;
  reservationExpiresAt?: string;
}

export interface IdempotencyReservation {
  state: "reserved" | "replayed" | "conflict" | "inflight";
  record?: IdempotencyRecord;
}

export interface CompleteMutationInput {
  operationName: string;
  idempotencyKey: string;
  payloadFingerprint: string;
  reservationToken: string;
  result: unknown;
  resultMeta?: SignalResultMeta;
  messageId?: string;
}

export interface TransactionalStoragePort {
  /**
   * Atomically persist the completed idempotency result and every emitted
   * event in the same durable transaction. Implementations must roll back
   * both writes if either fails.
   */
  completeWithEvents(
    input: CompleteMutationInput & { events: readonly SignalEnvelope[] },
  ): Promise<void>;
}

export interface OutboxRecord {
  id: string;
  envelope: SignalEnvelope;
  attempts: number;
  createdAt: string;
  /** Unique fencing token for this specific lease generation. */
  leaseToken: string;
}

export interface OutboxStats {
  pending: number;
  processing: number;
  delivered: number;
  deadLettered: number;
  oldestPendingAgeMs: number | null;
}

export interface OutboxPort {
  /** Return bounded-cardinality queue health counts and oldest pending age. */
  getStats(): Promise<OutboxStats>;
  /** Claim a bounded batch, including expired leases, without double-claiming. */
  claimBatch(input: {
    workerId: string;
    limit: number;
    leaseMs: number;
  }): Promise<OutboxRecord[]>;
  /** Extend a live lease without changing its fencing token. */
  renewLease(input: {
    id: string;
    workerId: string;
    leaseToken: string;
    leaseMs: number;
  }): Promise<boolean>;
  /** Acknowledge only when the caller still owns the lease. */
  acknowledge(input: {
    id: string;
    workerId: string;
    leaseToken: string;
  }): Promise<boolean>;
  /** Reschedule or dead-letter a failed delivery, guarded by lease ownership. */
  retry(input: {
    id: string;
    workerId: string;
    leaseToken: string;
    availableAt: string;
    error: string;
    maxAttempts: number;
  }): Promise<"scheduled" | "dead-lettered" | "lease-lost">;
}

export interface StoragePort {
  reserve(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    leaseMs?: number;
  }): Promise<IdempotencyReservation>;
  renewReservation(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    reservationToken: string;
    leaseMs: number;
  }): Promise<boolean>;
  complete(input: CompleteMutationInput): Promise<void>;
  fail(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    reservationToken: string;
    error: SignalErrorEnvelope;
  }): Promise<void>;
}
