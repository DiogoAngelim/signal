import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXAMPLE_ALERTS,
  createExampleStore,
  evaluateAlert,
  replayCapturedDecision,
  reviewLaterOutcome,
  storeDecision,
  validateAlert,
} from "../src";
import type { SecurityAlert } from "../src";

const decisionAt = "2025-02-10T10:00:00.000Z";

describe("AI-assisted security alert triage example", () => {
  it("validates a complete alert and rejects malformed or out-of-range input", () => {
    assert.deepEqual(validateAlert(EXAMPLE_ALERTS[0]), EXAMPLE_ALERTS[0]);
    assert.throws(() => validateAlert(null), /must be an object/);
    assert.throws(
      () => validateAlert({ ...EXAMPLE_ALERTS[0], severity: "urgent" }),
      /severity/,
    );
    assert.throws(
      () => validateAlert({ ...EXAMPLE_ALERTS[0], assetCriticality: 101 }),
      /0 to 100/,
    );
    assert.throws(
      () =>
        validateAlert({
          ...EXAMPLE_ALERTS[0],
          signals: [
            {
              ...EXAMPLE_ALERTS[0].signals[0],
              reliability: Number.NaN,
            },
          ],
        }),
      /0 to 100/,
    );
    assert.throws(
      () => validateAlert({ ...EXAMPLE_ALERTS[0], observedAt: "not-a-date" }),
      /valid date-time/,
    );
    assert.throws(
      () =>
        validateAlert({
          ...EXAMPLE_ALERTS[0],
          observedAt: "2025-02-30T09:14:00Z",
        }),
      /valid date-time/,
    );
    assert.throws(
      () => validateAlert({ ...EXAMPLE_ALERTS[0], observedAt: "2025" }),
      /valid date-time/,
    );
    assert.throws(
      () =>
        validateAlert({
          ...EXAMPLE_ALERTS[0],
          signals: [EXAMPLE_ALERTS[0].signals[0], EXAMPLE_ALERTS[0].signals[0]],
        }),
      /duplicate id/,
    );
    assert.throws(
      () => evaluateAlert(EXAMPLE_ALERTS[0], "not-a-date"),
      /capturedAt/,
    );
  });

  it("makes materially different decisions for corroborated, uncorroborated, and low-risk alerts", () => {
    const confirmed = evaluateAlert(EXAMPLE_ALERTS[0], decisionAt);
    const unconfirmed = evaluateAlert(EXAMPLE_ALERTS[1], decisionAt);
    const lowRisk = evaluateAlert(EXAMPLE_ALERTS[2], decisionAt);

    assert.equal(confirmed.priority, "escalate");
    assert.equal(unconfirmed.priority, "analyst-review");
    assert.equal(lowRisk.priority, "monitor");
    assert.equal(
      new Set([confirmed.priority, unconfirmed.priority, lowRisk.priority])
        .size,
      3,
    );
    assert.equal(confirmed.record.action, undefined);
  });

  it("requires three distinct qualified sources under the stricter policy", () => {
    const twoSourceAlert: SecurityAlert = {
      ...EXAMPLE_ALERTS[0],
      signals: EXAMPLE_ALERTS[0].signals.slice(0, 2),
    };

    const decision = evaluateAlert(twoSourceAlert, decisionAt);

    assert.equal(decision.priority, "analyst-review");
    assert.match(
      decision.rationale,
      /requires 3 independent high-quality supporting sources/i,
    );
  });

  it("does not count two indicators from the same source as corroboration", () => {
    const base = EXAMPLE_ALERTS[0];
    const sameSourceAlert: SecurityAlert = {
      ...base,
      signals: base.signals.map((signal) => ({
        ...signal,
        source: "one-shared-source",
      })),
    };

    const decision = evaluateAlert(sameSourceAlert, decisionAt);

    assert.equal(decision.priority, "analyst-review");
    assert.match(decision.rationale, /only 1 qualified/i);
  });

  it("requires every evidence dimension to pass before a source qualifies", () => {
    const base = EXAMPLE_ALERTS[0];
    for (const dimension of [
      "quality",
      "reliability",
      "freshness",
      "independence",
      "traceability",
    ] as const) {
      const degraded: SecurityAlert = {
        ...base,
        signals: base.signals.map((signal, index) =>
          index === 0 ? { ...signal, [dimension]: 0 } : signal,
        ),
      };
      const decision = evaluateAlert(degraded, decisionAt);
      assert.equal(decision.priority, "analyst-review", dimension);
      assert.match(decision.rationale, /only 2 qualified/i);
    }
  });

  it("never lets a high heuristic score alone trigger escalation", () => {
    const alert = structuredClone(EXAMPLE_ALERTS[1]);
    const decision = evaluateAlert(alert, decisionAt);

    assert.ok(decision.snapshot.estimator.score >= 90);
    assert.equal(decision.priority, "analyst-review");
    assert.match(decision.rationale, /not an escalation trigger/i);
    assert.ok(
      decision.assessment.evidence.some(
        (item) =>
          item.evidenceId === "model:risk-estimate" &&
          item.direction === "neutral",
      ),
    );
  });

  it("holds weak, missing, and conflicting evidence for analyst review", () => {
    const noEvidence = evaluateAlert(EXAMPLE_ALERTS[1], decisionAt);
    assert.equal(noEvidence.priority, "analyst-review");
    assert.ok(noEvidence.assessment.unknowns.length > 0);

    const baseWeak = EXAMPLE_ALERTS[0];
    const weakAlert: SecurityAlert = {
      ...baseWeak,
      signals: baseWeak.signals.map((signal, index) =>
        index === 0
          ? {
              ...signal,
              quality: 35,
              reliability: 40,
              independence: 30,
            }
          : signal,
      ),
    };
    const weak = evaluateAlert(weakAlert, decisionAt);
    assert.equal(weak.priority, "analyst-review");
    assert.match(weak.rationale, /only 2 qualified/i);

    const baseConflicting = EXAMPLE_ALERTS[0];
    const conflictingAlert: SecurityAlert = {
      ...baseConflicting,
      signals: [
        ...baseConflicting.signals,
        {
          id: "change-window",
          observedAt: "2025-02-10T09:14:45.000Z",
          source: "change-management",
          summary:
            "An approved maintenance window explains the process activity.",
          direction: "contradicting",
          quality: 82,
          reliability: 85,
          freshness: 90,
          independence: 90,
          traceability: 100,
        },
      ],
    };
    const conflicting = evaluateAlert(conflictingAlert, decisionAt);
    assert.equal(conflicting.priority, "analyst-review");
    assert.ok(
      conflicting.rationale.includes(
        "An approved maintenance window explains the process activity.",
      ),
    );
    assert.ok(
      conflicting.assessment.journal.contradictionsPresent.includes(
        "An approved maintenance window explains the process activity.",
      ),
    );
  });

  it("repeats the same assessment and uses Signal's replay comparison", () => {
    const first = evaluateAlert(EXAMPLE_ALERTS[0], decisionAt);
    const second = evaluateAlert(EXAMPLE_ALERTS[0], decisionAt);

    assert.deepEqual(second, first);
    const replay = replayCapturedDecision(first);
    assert.equal(replay.result, "same-result");
    assert.equal(replay.signalComparison.replayResult, "same-decision");
    assert.equal(
      first.record.assessment?.journal.decisionId,
      first.record.decisionId,
    );
  });

  it("keeps rationale, journal, and accountability tied to captured evidence", () => {
    const decision = evaluateAlert(EXAMPLE_ALERTS[0], decisionAt);
    const journal = decision.assessment.journal;
    const evidenceIds = decision.assessment.evidence.map(
      (item) => item.evidenceId,
    );

    assert.deepEqual(journal.evidenceUsed, evidenceIds);
    assert.deepEqual(journal.traceability?.missingEvidenceReferences, []);
    assert.ok(decision.rationale.includes("endpoint-process"));
    assert.ok(decision.rationale.includes("identity-session"));
    assert.equal(decision.record.humanSummary, decision.rationale);
    assert.ok(
      decision.record.accountability?.supportingEvidence.includes(
        "Endpoint telemetry recorded an unsigned process spawning a shell.",
      ),
    );
    assert.equal(decision.record.accountability?.actionTaken, false);
  });

  it("uses Signal's in-memory record store without claiming durable persistence", () => {
    const store = createExampleStore();
    const decision = evaluateAlert(EXAMPLE_ALERTS[0], decisionAt);

    storeDecision(store, decision);

    assert.deepEqual(store.get(decision.record.decisionId), decision.record);
    assert.equal(store.list().length, 1);
    assert.equal(
      store.replay(decision.record.decisionId, decision.record.coherence)
        ?.replayResult,
      "same-decision",
    );
  });

  it("reviews later outcomes separately and cannot feed them into triage replay", () => {
    const decision = evaluateAlert(EXAMPLE_ALERTS[1], decisionAt);
    const originalRecord = structuredClone(decision.record);
    const review = reviewLaterOutcome(decision, {
      reviewedAt: "2025-02-11T10:00:00.000Z",
      whatHappened: "Analyst confirmed the alert was benign maintenance.",
      why: "The host was covered by an approved maintenance change.",
      evidence: [
        {
          evidenceId: "change-ticket",
          label: "Approved maintenance record",
          role: "mattered",
        },
      ],
      lessons: ["Require change-calendar context for this alert family."],
    });

    assert.equal(review.decisionId, decision.record.decisionId);
    assert.deepEqual(decision.record, originalRecord);
    assert.equal(replayCapturedDecision(decision).result, "same-result");
    assert.equal("outcome" in decision.snapshot, false);
    assert.equal("outcome" in decision.record, false);
    assert.ok(review.whatHappened.includes("benign maintenance"));
    assert.throws(
      () =>
        reviewLaterOutcome(decision, {
          decisionId: "security-alert:some-other-alert",
          reviewedAt: "2025-02-11T10:00:00.000Z",
          whatHappened: "Wrong decision id",
        }),
      /does not match/,
    );
  });
});
