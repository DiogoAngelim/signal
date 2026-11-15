import { describe, expect, it } from "vitest";
import { assessDecisionEvidence } from "../index";

describe("evidence lineage", () => {
  it("does not count copied or derived evidence as independent sources", () => {
    const result = assessDecisionEvidence({
      createdAt: "2026-06-01T00:00:00.000Z",
      evidence: [
        {
          evidenceId: "evidence:primary",
          label: "Primary source",
          sourceRef: { sourceId: "source:primary" },
          independence: 100,
        },
        {
          evidenceId: "evidence:copy",
          label: "Copied report",
          sourceRef: { sourceId: "source:copy" },
          derivedFromEvidenceIds: ["evidence:primary"],
          independence: 100,
        },
        {
          evidenceId: "evidence:independent",
          label: "Independent source",
          sourceRef: { sourceId: "source:independent" },
          independence: 100,
        },
      ],
    });

    expect(result.evidenceQuality.lineage?.status).toBe("complete");
    expect(result.evidenceQuality.lineage?.independentSourceCount).toBe(2);
    expect(result.evidenceQuality.lineage?.sourceDiversityScore).toBe(67);
    expect(result.evidenceQuality.lineage?.rootSourceIdsByEvidence["evidence:copy"]).toEqual([
      "source:primary",
    ]);
    expect(result.evidenceQuality.independence).toBe(67);
  });

  it("marks missing source dependencies as incomplete", () => {
    const result = assessDecisionEvidence({
      createdAt: "2026-06-01T00:00:00.000Z",
      evidence: [
        {
          evidenceId: "evidence:derived",
          label: "Derived report",
          sourceRef: { sourceId: "source:report" },
          derivedFromEvidenceIds: ["evidence:missing"],
        },
      ],
    });

    expect(result.evidenceQuality.lineage?.status).toBe("incomplete");
    expect(result.evidenceQuality.lineage?.missingDependencies).toEqual([
      "evidence:derived->evidence:missing",
    ]);
    expect(result.governance.warnings).toContain(
      "Evidence lineage is incomplete; source independence is not fully established.",
    );
  });

  it("detects cycles and duplicate evidence identifiers", () => {
    const cyclic = assessDecisionEvidence({
      createdAt: "2026-06-01T00:00:00.000Z",
      evidence: [
        {
          evidenceId: "evidence:a",
          label: "A",
          sourceRef: { sourceId: "source:a" },
          derivedFromEvidenceIds: ["evidence:b"],
        },
        {
          evidenceId: "evidence:b",
          label: "B",
          sourceRef: { sourceId: "source:b" },
          derivedFromEvidenceIds: ["evidence:a"],
        },
      ],
    });
    const duplicated = assessDecisionEvidence({
      createdAt: "2026-06-01T00:00:00.000Z",
      evidence: [
        { evidenceId: "evidence:same", label: "First", sourceRef: { sourceId: "source:a" } },
        { evidenceId: "evidence:same", label: "Second", sourceRef: { sourceId: "source:b" } },
      ],
    });

    expect(cyclic.evidenceQuality.lineage?.status).toBe("invalid");
    expect(cyclic.evidenceQuality.lineage?.cycles).toHaveLength(1);
    expect(cyclic.governance.blockers).toContain(
      "Evidence lineage contains duplicate identifiers or cycles.",
    );
    expect(duplicated.evidenceQuality.lineage?.duplicateEvidenceIds).toEqual([
      "evidence:same",
    ]);
  });
});
