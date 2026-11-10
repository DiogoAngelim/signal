import { assessDecisionEvidence, type DecisionAssessment, type DecisionOutcomeReview } from "@signal/decision";
import { evaluateCommitment, type CommitmentResult } from "@signal/commitment";
import { resolveSemanticState, type SemanticStateResult } from "@signal/semantic-state";
export type RequestStatus = "received" | "assessed" | "approved" | "rejected" | "executed" | "reviewed";
export type Evidence = { id: string; description: string; source: string; confidence: number; observedAt: string; verified: boolean };
export type CaseRequest = { id: string; tenantId: string; title: string; description: string; status: RequestStatus; createdAt: string; evidence: Evidence[]; assessment?: Assessment; decision?: Decision; action?: CaseAction; outcome?: Outcome };
export type Assessment = { recommendation: "approve" | "reject" | "investigate"; confidence: number; risk: number; rationale: string; evidenceIds: string[]; assessedAt: string; signalAssessment: DecisionAssessment; commitment: CommitmentResult; semanticState: SemanticStateResult };
export type Decision = { id: string; result: "approved" | "rejected"; rationale: string; actor: string; decidedAt: string };
export type CaseAction = { id: string; kind: string; executedBy: string; executedAt: string; result: "completed" | "failed" };
export type Outcome = { id: string; result: "success" | "failure" | "partial" | "unknown"; notes: string; recordedAt: string; learningReview: DecisionOutcomeReview };
export type LabEvent = { id: string; name: string; requestId: string; tenantId: string; occurredAt: string; payload: Record<string, unknown> };

export function assess(request: CaseRequest, now = new Date()): Assessment {
  const verified = request.evidence.filter((item) => item.verified);
  const signalAssessment = assessDecisionEvidence({
    decisionId: `decision:${request.id}`,
    createdAt: now.toISOString(),
    desiredConfidence: 80,
    importance: 60,
    optionality: 75,
    resilience: 75,
    reversibility: "high",
    reasoningSummary: `Assessment for request ${request.id}: ${request.title}`,
    evidence: request.evidence.map((item) => ({
      evidenceId: item.id,
      label: item.description,
      summary: `Source: ${item.source}; verified: ${item.verified}`,
      direction: item.verified ? "supporting" : "neutral",
      quality: Math.round(item.confidence * 100),
      reliability: Math.round(item.confidence * 100),
      freshness: 90,
      independence: 75,
      replication: item.verified ? 70 : 20,
      calibration: 90,
      traceability: 90,
      strength: Math.round(item.confidence * 100),
      source: item.source,
      observedAt: item.observedAt,
      verifiedAt: item.verified ? item.observedAt : undefined
    })),
    unknowns: request.evidence.filter((item) => !item.verified).map((item) => ({ label: `Unverified: ${item.description}` }))
  });
  const confidence = signalAssessment.confidence.capped / 100;
  const risk = Math.max(0, Math.min(1, 1 - signalAssessment.evidenceQuality.quality / 100));
  const commitment = evaluateCommitment({
    decision: { id: request.id, confidence, trust: 0.85, risk, expectedUtility: 1 - risk, requestedCommitment: 0.5 },
    resource: { id: "case-capacity", available: 1, requested: 0.5, maximum: 1 },
    trust: { userTrust: 0.85, systemConfidence: confidence, historicalReliability: 0.75 },
    constraints: verified.length < 2 ? [{ id: "verified-evidence-minimum", label: "At least two verified evidence sources", type: "hard", severity: "high", passed: false }] : [],
    now: now.toISOString()
  });
  const semanticState = resolveSemanticState({
    dimensions: { stability: 1 - risk, volatility: risk, stress: risk, uncertainty: 1 - confidence, coherence: signalAssessment.governance.score / 100, confidence }
  });
  const recommendation = verified.length < 2 || signalAssessment.governance.blockers.length > 0 || confidence < 0.7 || commitment.status !== "recommended"
    ? "investigate"
    : signalAssessment.stewardship.recommendation === "avoid" || signalAssessment.stewardship.recommendation === "reduce"
      ? "reject"
      : "approve";
  return {
    recommendation,
    confidence,
    risk,
    rationale: signalAssessment.explanation.join(" "),
    evidenceIds: verified.map((item) => item.id),
    assessedAt: now.toISOString(),
    signalAssessment,
    commitment,
    semanticState
  };
}
