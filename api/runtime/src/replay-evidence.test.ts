import { describe, expect, it } from "vitest";
import {
  ReplayDivergenceError,
  ReplayEvidenceCompatibilityError,
  createReplayEvidenceRecord,
  replayWithEvidence,
  verifyReplayEvidenceRecord,
} from "./replay-evidence";

const identity = {
  tenantId: "tenant-1",
  operationName: "decision.assess.v1",
  operationVersion: "1",
  handlerArtifactDigest: "a".repeat(64),
  policyVersion: "policy-2026-01",
};

function createRecord() {
  return createReplayEvidenceRecord({
    executionId: "execution-1",
    ...identity,
    canonicalInput: { amount: 5, currency: "USD" },
    externalReads: [{
      key: "fx-rate:USD:EUR",
      value: { rate: 0.9, source: "captured-provider" },
      observedAt: "2026-11-10T10:00:00.000Z",
    }],
    result: { converted: 4.5 },
    capturedAt: "2026-11-10T10:00:01.000Z",
  });
}

describe("replay evidence", () => {
  it("captures content fingerprints and immutable copies of inputs and external reads", () => {
    const input = { amount: 5 };
    const external = { rate: 0.9 };
    const record = createReplayEvidenceRecord({
      executionId: "immutable-copy",
      ...identity,
      canonicalInput: input,
      externalReads: [{
        key: "rate",
        value: external,
        observedAt: "2026-11-10T10:00:00.000Z",
      }],
      result: { converted: 4.5 },
    });
    input.amount = 99;
    external.rate = 0.1;

    expect(record.canonicalInput).toEqual({ amount: 5 });
    expect(record.externalReads[0]?.value).toEqual({ rate: 0.9 });
    expect(Object.isFrozen(record.canonicalInput)).toBe(true);
    expect(Object.isFrozen(record.externalReads[0]?.value)).toBe(true);
    expect(verifyReplayEvidenceRecord(record)).toBe(true);
  });

  it("replays against captured external reads and verifies the normalized result", async () => {
    const record = createRecord();
    const result = await replayWithEvidence(record, identity, (input, reads) => {
      const rate = reads.get("fx-rate:USD:EUR") as { rate: number };
      const amount = (input as { amount: number }).amount;
      return { converted: amount * rate.rate };
    });
    expect(result).toEqual({ converted: 4.5 });
  });

  it("rejects incompatible operation, handler, or policy versions", async () => {
    const record = createRecord();
    await expect(replayWithEvidence(record, {
      ...identity,
      handlerArtifactDigest: "b".repeat(64),
    }, () => ({ converted: 4.5 }))).rejects.toBeInstanceOf(ReplayEvidenceCompatibilityError);
  });

  it("rejects replay under a different tenant identity", async () => {
    await expect(replayWithEvidence(createRecord(), {
      ...identity,
      tenantId: "tenant-2",
    }, () => ({ converted: 4.5 }))).rejects.toBeInstanceOf(ReplayEvidenceCompatibilityError);
  });

  it("rejects result divergence", async () => {
    await expect(replayWithEvidence(createRecord(), identity, () => ({
      converted: 4.6,
    }))).rejects.toBeInstanceOf(ReplayDivergenceError);
  });

  it("rejects tampered input, result, and external-read snapshots", async () => {
    const record = createRecord();
    const tampered = {
      ...record,
      externalReads: [{
        ...record.externalReads[0]!,
        value: { rate: 0.1, source: "tampered" },
      }],
    };
    expect(verifyReplayEvidenceRecord(tampered)).toBe(false);
    expect(verifyReplayEvidenceRecord({
      ...record,
      tenantId: "tenant-forged",
    })).toBe(false);
    await expect(replayWithEvidence(tampered, identity, () => ({ converted: 4.5 })))
      .rejects.toThrow("failed structural or digest verification");
  });

  it("rejects duplicate external-read keys and invalid artifact digests", () => {
    expect(() => createReplayEvidenceRecord({
      executionId: "duplicate",
      ...identity,
      canonicalInput: {},
      externalReads: [
        { key: "same", value: 1, observedAt: "2026-11-10T10:00:00.000Z" },
        { key: "same", value: 2, observedAt: "2026-11-10T10:00:00.000Z" },
      ],
      result: null,
    })).toThrow("unique");
    expect(() => createReplayEvidenceRecord({
      executionId: "bad-digest",
      ...identity,
      handlerArtifactDigest: "not-a-digest",
      canonicalInput: {},
      externalReads: [],
      result: null,
    })).toThrow("SHA-256");
  });
});
