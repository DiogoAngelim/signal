/**
 * Immutable audit chain for Signal execution evidence.
 * Each entry is hash-chained to the previous entry, providing
 * tamper-evidence for the execution audit trail.
 */

import { createHash } from "node:crypto";
import { stableStringify } from "./hash";

export interface AuditChainEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly operationName: string;
  readonly operationKind: string;
  readonly messageId: string;
  readonly outcome: "completed" | "replayed" | "failed";
  readonly idempotencyKey?: string;
  readonly payloadFingerprint?: string;
  readonly previousHash: string;
  readonly hash: string;
}

export function computeEntryHash(
  entry: Omit<AuditChainEntry, "hash">,
): string {
  const content = stableStringify({
    sequence: entry.sequence,
    timestamp: entry.timestamp,
    operationName: entry.operationName,
    operationKind: entry.operationKind,
    messageId: entry.messageId,
    outcome: entry.outcome,
    idempotencyKey: entry.idempotencyKey,
    payloadFingerprint: entry.payloadFingerprint,
    previousHash: entry.previousHash,
  });
  return createHash("sha256").update(content).digest("hex");
}

const GENESIS_HASH = "0".repeat(64);

export function createAuditChainEntry(
  previousEntry: AuditChainEntry | null,
  input: {
    operationName: string;
    operationKind: string;
    messageId: string;
    outcome: "completed" | "replayed" | "failed";
    idempotencyKey?: string;
    payloadFingerprint?: string;
  },
): AuditChainEntry {
  const sequence = previousEntry ? previousEntry.sequence + 1 : 0;
  const previousHash = previousEntry ? previousEntry.hash : GENESIS_HASH;

  const partial: Omit<AuditChainEntry, "hash"> = {
    sequence,
    timestamp: new Date().toISOString(),
    operationName: input.operationName,
    operationKind: input.operationKind,
    messageId: input.messageId,
    outcome: input.outcome,
    idempotencyKey: input.idempotencyKey,
    payloadFingerprint: input.payloadFingerprint,
    previousHash,
  };

  const hash = computeEntryHash(partial);
  return { ...partial, hash };
}

export function verifyChain(entries: AuditChainEntry[]): boolean {
  if (entries.length === 0) return true;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const expectedPreviousHash = i === 0 ? GENESIS_HASH : entries[i - 1]!.hash;

    if (entry.previousHash !== expectedPreviousHash) return false;

    const expectedHash = computeEntryHash({
      sequence: entry.sequence,
      timestamp: entry.timestamp,
      operationName: entry.operationName,
      operationKind: entry.operationKind,
      messageId: entry.messageId,
      outcome: entry.outcome,
      idempotencyKey: entry.idempotencyKey,
      payloadFingerprint: entry.payloadFingerprint,
      previousHash: entry.previousHash,
    });

    if (entry.hash !== expectedHash) return false;
  }

  return true;
}
