export type RequestStatus = "received" | "assessed" | "approved" | "rejected" | "executed" | "reviewed";
export type Evidence = { id: string; description: string; source: string; confidence: number; observedAt: string; verified: boolean };
export type CaseRequest = { id: string; tenantId: string; title: string; description: string; status: RequestStatus; createdAt: string; evidence: Evidence[]; assessment?: Assessment; decision?: Decision; outcome?: Outcome };
export type Assessment = { recommendation: "approve" | "reject" | "investigate"; confidence: number; risk: number; rationale: string; evidenceIds: string[]; assessedAt: string };
export type Decision = { id: string; result: "approved" | "rejected"; rationale: string; actor: string; decidedAt: string };
export type Outcome = { id: string; result: "success" | "failure" | "partial" | "unknown"; notes: string; recordedAt: string };
export type LabEvent = { id: string; name: string; requestId: string; tenantId: string; occurredAt: string; payload: Record<string, unknown> };

export function assess(request: CaseRequest, now = new Date()): Assessment {
  const verified = request.evidence.filter((item) => item.verified);
  const confidence = verified.length === 0 ? 0.25 : Math.min(0.95, verified.reduce((sum, item) => sum + item.confidence, 0) / verified.length);
  const risk = Math.min(1, Math.max(0, 0.65 - confidence * 0.45 + (request.evidence.length === 0 ? 0.25 : 0)));
  const recommendation = verified.length < 2 ? "investigate" : risk > 0.55 ? "reject" : "approve";
  return { recommendation, confidence, risk, rationale: verified.length < 2 ? "Insufficient independently verified evidence; gather more information before acting." : recommendation === "approve" ? "Evidence supports a controlled approval with residual risk documented." : "Evidence indicates risk above the configured decision threshold.", evidenceIds: verified.map((item) => item.id), assessedAt: now.toISOString() };
}
