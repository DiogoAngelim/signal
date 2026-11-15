import { sign, verify } from "node:crypto";
import { stableStringify } from "./hash";
import { verifyChain, type AuditChainEntry } from "./audit-chain";

export interface SignedAuditCheckpoint {
  readonly version: 1;
  readonly keyId: string;
  readonly sequence: number;
  readonly chainHeadHash: string;
  readonly createdAt: string;
  readonly signature: string;
}

export interface AuditCheckpointSigningKey {
  readonly keyId: string;
  readonly privateKey: string | Buffer;
}

export function signAuditCheckpoint(
  entries: readonly AuditChainEntry[],
  key: AuditCheckpointSigningKey,
  createdAt = new Date().toISOString(),
): SignedAuditCheckpoint {
  if (!key.keyId.trim()) throw new Error("keyId is required.");
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("createdAt must be a valid timestamp.");
  }
  if (!verifyChain(entries)) {
    throw new Error("Cannot checkpoint an invalid audit chain.");
  }
  const last = entries.at(-1);
  const unsigned = {
    version: 1 as const,
    keyId: key.keyId,
    sequence: last?.sequence ?? -1,
    chainHeadHash: last?.hash ?? "0".repeat(64),
    createdAt,
  };
  const signature = sign(
    null,
    Buffer.from(stableStringify(unsigned)),
    key.privateKey,
  ).toString("base64url");
  return { ...unsigned, signature };
}

export function verifyAuditCheckpoint(
  checkpoint: SignedAuditCheckpoint,
  publicKey: string | Buffer,
  expectedKeyId: string,
): boolean {
  if (
    checkpoint.version !== 1 ||
    checkpoint.keyId !== expectedKeyId ||
    !Number.isSafeInteger(checkpoint.sequence) ||
    checkpoint.sequence < -1 ||
    !/^[a-f0-9]{64}$/.test(checkpoint.chainHeadHash) ||
    !Number.isFinite(Date.parse(checkpoint.createdAt)) ||
    typeof checkpoint.signature !== "string" ||
    checkpoint.signature.length === 0
  ) {
    return false;
  }
  const { signature, ...unsigned } = checkpoint;
  try {
    return verify(
      null,
      Buffer.from(stableStringify(unsigned)),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}

export function verifyCheckpointAgainstChain(
  checkpoint: SignedAuditCheckpoint,
  entries: readonly AuditChainEntry[],
): boolean {
  if (!verifyChain(entries)) return false;
  if (checkpoint.sequence === -1) {
    return entries.length === 0 && checkpoint.chainHeadHash === "0".repeat(64);
  }
  const entry = entries[checkpoint.sequence];
  return !!entry && entry.hash === checkpoint.chainHeadHash;
}
