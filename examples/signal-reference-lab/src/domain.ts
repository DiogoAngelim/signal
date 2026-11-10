import { assessDecisionEvidence, type DecisionAssessment } from "@signal/decision";
export type RequestStatus = "received" | "assessed" | "approved" | "rejected" | "executed" | "reviewed";
export type Evidence = { id: string; description: string; source: string; confidence: number; observedAt: string; verified: boolean };
export type CaseRequest = { id: string; tenantId: string; title: string; description: string; status: RequestStatus; createdAt: string; evidence: Evidence[]; assessment?: Assessment; decision?: Decision; outcome?: Outcome };
export type Assessment = { recommendation: "approve" | "reject" | "investigate"; confidence: number; risk: number; rationale: string; evidenceIds: string[]; assessedAt: string; signalAssessment: DecisionAssessment };
export type Decision = { id: string; result: "approved" | "rejected"; rationale: string; actor: string; decidedAt: string };
export type Outcome = { id: string; result: "success" | "failure" | "partial" | "unknown"; notes: string; recordedAt: string };
export type LabEvent = { id: string; name: string; requestId: string; tenantId: string; occurredAt: string; payload: Record<string, unknown> };

export function assess(request: CaseRequest, now = new Date()): Assessment {
  const verified = request.evidence.filter((item) => item.verified);
  const signalAssessment = assessDecisionEvidence({
    decisionId: `decision:${request.id}`,
    createdAt: now.toISOString(),
    desiredConfidence: 80,
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
      calibration: 60,
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
  const recommendation = verified.length < 2 || signalAssessment.governance.blockers.length > 0 || confidence < 0.7
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
    signalAssessment
  };
}
