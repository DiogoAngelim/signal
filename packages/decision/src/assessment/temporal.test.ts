import { describe, expect, it } from "vitest";
import { assessDecisionEvidence } from "../index";

describe("evidence temporal validity", () => {
  const asOf = "2026-06-01T00:00:00.000Z";

  it("classifies current, expired, future, unknown, and stale evidence at an explicit as-of time", () => {
    const result = assessDecisionEvidence({
      createdAt: asOf,
      evidence: [
        {
          evidenceId: "evidence:current",
          label: "Current",
          validFrom: "2026-05-01T00:00:00.000Z",
          validUntil: "2026-07-01T00:00:00.000Z",
        },
        {
          evidenceId: "evidence:expired",
          label: "Expired",
          validUntil: "2026-05-31T23:59:59.000Z",
        },
        {
          evidenceId: "evidence:future",
          label: "Future",
          validFrom: "2026-06-02T00:00:00.000Z",
        },
        {
          evidenceId: "evidence:unknown",
          label: "Unknown validity",
        },
        {
          evidenceId: "evidence:stale",
          label: "Stale",
          observedAt: "2026-05-01T00:00:00.000Z",
          sourceRef: { sourceId: "source:stale", freshnessWindowMs: 60_000 },
        },
      ],
    });

    expect(result.evidenceQuality.temporal?.asOf).toBe(asOf);
    expect(result.evidenceQuality.temporal?.currentEvidenceIds).toContain(
      "evidence:current",
    );
    expect(result.evidenceQuality.temporal?.expiredEvidenceIds).toContain(
      "evidence:expired",
    );
    expect(result.evidenceQuality.temporal?.notYetValidEvidenceIds).toContain(
      "evidence:future",
    );
    expect(result.evidenceQuality.temporal?.unknownValidityEvidenceIds).toContain(
      "evidence:unknown",
    );
    expect(result.evidenceQuality.temporal?.staleEvidenceIds).toContain(
      "evidence:stale",
    );
  });

  it("rejects malformed timestamps and inverted validity intervals", () => {
    const result = assessDecisionEvidence({
      createdAt: asOf,
      evidence: [
        {
          evidenceId: "evidence:bad-date",
          label: "Bad date",
          validFrom: "not-a-date",
        },
        {
          evidenceId: "evidence:inverted",
          label: "Inverted interval",
          validFrom: "2026-07-01T00:00:00.000Z",
          validUntil: "2026-06-01T00:00:00.000Z",
        },
        {
          evidenceId: "evidence:future-observation",
          label: "Future observation",
          observedAt: "2026-06-02T00:00:00.000Z",
        },
      ],
    });

    expect(result.evidenceQuality.temporal?.invalidEvidenceIds).toEqual([
      "evidence:bad-date",
      "evidence:future-observation",
      "evidence:inverted",
    ]);
    expect(result.governance.blockers).toContain(
      "Evidence contains invalid temporal metadata.",
    );
  });

  it("produces identical temporal results for identical evidence and as-of time", () => {
    const input = {
      createdAt: asOf,
      evidence: [
        {
          evidenceId: "evidence:stable",
          label: "Stable",
          observedAt: "2026-05-31T00:00:00.000Z",
          validUntil: "2026-06-30T00:00:00.000Z",
          sourceRef: { sourceId: "source:stable", freshnessWindowMs: 172_800_000 },
        },
      ],
    };

    expect(
      assessDecisionEvidence(input).evidenceQuality.temporal,
    ).toEqual(assessDecisionEvidence(input).evidenceQuality.temporal);
  });
});
