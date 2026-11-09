import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuditChainEntry } from "./audit-chain";
import {
  signAuditCheckpoint,
  verifyAuditCheckpoint,
  verifyCheckpointAgainstChain,
} from "./audit-checkpoint";

describe("signed audit checkpoints", () => {
  const keys = generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

  it("signs and verifies a checkpoint against a valid chain", () => {
    const first = createAuditChainEntry(null, {
      operationName: "invoice.issue.v1",
      operationKind: "mutation",
      messageId: "message-1",
      outcome: "completed",
    });
    const second = createAuditChainEntry(first, {
      operationName: "invoice.issue.v1",
      operationKind: "mutation",
      messageId: "message-2",
      outcome: "completed",
    });
    const checkpoint = signAuditCheckpoint(
      [first, second],
      { keyId: "audit-2026-q4", privateKey },
      "2026-11-09T00:00:00.000Z",
    );

    expect(verifyAuditCheckpoint(checkpoint, publicKey, "audit-2026-q4")).toBe(true);
    expect(verifyCheckpointAgainstChain(checkpoint, [first, second])).toBe(true);
    expect(verifyCheckpointAgainstChain(checkpoint, [first])).toBe(false);
  });

  it("rejects signature, key identity, and checkpoint tampering", () => {
    const entry = createAuditChainEntry(null, {
      operationName: "operation.v1",
      operationKind: "query",
      messageId: "message-1",
      outcome: "completed",
    });
    const checkpoint = signAuditCheckpoint(
      [entry],
      { keyId: "key-a", privateKey },
      "2026-11-09T00:00:00.000Z",
    );

    expect(verifyAuditCheckpoint(checkpoint, publicKey, "key-b")).toBe(false);
    expect(verifyAuditCheckpoint(
      { ...checkpoint, chainHeadHash: "0".repeat(64) },
      publicKey,
      "key-a",
    )).toBe(false);
    expect(verifyAuditCheckpoint(
      { ...checkpoint, signature: "invalid" },
      publicKey,
      "key-a",
    )).toBe(false);
  });

  it("refuses to sign an invalid chain", () => {
    expect(() => signAuditCheckpoint(
      [{ sequence: 1 } as never],
      { keyId: "key-a", privateKey },
    )).toThrow("Cannot checkpoint an invalid audit chain.");
  });
});
