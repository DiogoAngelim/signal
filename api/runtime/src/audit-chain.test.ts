import { describe, expect, it } from "vitest";
import { createAuditChainEntry, verifyChain } from "./audit-chain";

describe("audit chain verification", () => {
  it("verifies a correctly linked sequence", () => {
    const first = createAuditChainEntry(null, {
      operationName: "payment.capture.v1",
      operationKind: "mutation",
      messageId: "message-1",
      outcome: "completed",
    });
    const second = createAuditChainEntry(first, {
      operationName: "payment.capture.v1",
      operationKind: "mutation",
      messageId: "message-2",
      outcome: "replayed",
    });
    expect(verifyChain([first, second])).toBe(true);
  });

  it("rejects a sequence gap even when an entry hash is internally consistent", () => {
    const first = createAuditChainEntry(null, {
      operationName: "operation.v1",
      operationKind: "mutation",
      messageId: "message-1",
      outcome: "completed",
    });
    const second = createAuditChainEntry(first, {
      operationName: "operation.v1",
      operationKind: "mutation",
      messageId: "message-2",
      outcome: "completed",
    });
    expect(verifyChain([{ ...first, sequence: 4 }, second])).toBe(false);
  });

  it("rejects malformed hashes, timestamps, and tampered fields", () => {
    const entry = createAuditChainEntry(null, {
      operationName: "operation.v1",
      operationKind: "query",
      messageId: "message-1",
      outcome: "completed",
    });
    expect(verifyChain([{ ...entry, hash: "not-a-hash" }])).toBe(false);
    expect(verifyChain([{ ...entry, timestamp: "not-a-date" }])).toBe(false);
    expect(verifyChain([{ ...entry, operationName: "changed" }])).toBe(false);
  });

  it("treats an empty chain as valid", () => {
    expect(verifyChain([])).toBe(true);
  });
});
