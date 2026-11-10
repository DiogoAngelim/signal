/**
 * Immutable audit chain for Signal execution evidence.
 *
 * A valid chain proves internal consistency against the supplied first entry;
 * it does not prove that storage is immutable or that the supplied genesis is
 * an independently trusted checkpoint.
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

export function computeEntryHash(entry: Omit<AuditChainEntry, "hash">): string {
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
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Verify one entry's schema and content hash without requiring its chain context. */
export function verifyAuditChainEntry(entry: AuditChainEntry): boolean {
  if (
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence < 0 ||
    typeof entry.timestamp !== "string" ||
    !Number.isFinite(Date.parse(entry.timestamp)) ||
    typeof entry.operationName !== "string" ||
    entry.operationName.length === 0 ||
    typeof entry.operationKind !== "string" ||
    entry.operationKind.length === 0 ||
    typeof entry.messageId !== "string" ||
    entry.messageId.length === 0 ||
    !["completed", "replayed", "failed"].includes(entry.outcome) ||
    !SHA256_PATTERN.test(entry.previousHash) ||
    !SHA256_PATTERN.test(entry.hash) ||
    (entry.payloadFingerprint !== undefined &&
      !SHA256_PATTERN.test(entry.payloadFingerprint))
  ) {
    return false;
  }
  const { hash: _hash, ...content } = entry;
  return entry.hash === computeEntryHash(content);
}

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
  return { ...partial, hash: computeEntryHash(partial) };
}

export function verifyChain(entries: readonly AuditChainEntry[]): boolean {
  if (entries.length === 0) return true;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) return false;

    if (
      !Number.isSafeInteger(entry.sequence) ||
      entry.sequence !== index ||
      typeof entry.timestamp !== "string" ||
      !Number.isFinite(Date.parse(entry.timestamp)) ||
      typeof entry.operationName !== "string" ||
      entry.operationName.length === 0 ||
      typeof entry.operationKind !== "string" ||
      entry.operationKind.length === 0 ||
      typeof entry.messageId !== "string" ||
      entry.messageId.length === 0 ||
      !["completed", "replayed", "failed"].includes(entry.outcome) ||
      !SHA256_PATTERN.test(entry.previousHash) ||
      !SHA256_PATTERN.test(entry.hash) ||
      (entry.payloadFingerprint !== undefined &&
        !SHA256_PATTERN.test(entry.payloadFingerprint))
    ) {
      return false;
    }

    const expectedPreviousHash =
      index === 0 ? GENESIS_HASH : entries[index - 1]?.hash;
    if (entry.previousHash !== expectedPreviousHash) return false;

    const { hash: _hash, ...content } = entry;
    if (entry.hash !== computeEntryHash(content)) return false;
  }

  return true;
}
