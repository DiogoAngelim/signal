import type {
  OfficialAlert,
  PolicyDecision,
  PolicyDecisionType,
  RiskScore
} from "../types/index.js";
import { nowIso } from "../utils/time.js";

const POLICY_VERSION = "v1";

interface PolicyInput {
  regionId: string;
  risk?: RiskScore;
  alerts: OfficialAlert[];
  isDuplicate?: boolean;
  isCancellation?: boolean;
}

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const reasons: string[] = [];
  const topDrivers = input.risk?.compositeRisk.topDrivers ?? [];
  const compositeScore = input.risk?.compositeRisk.score ?? 0;
  const dataConfidence = input.risk?.dataConfidence ?? 0.6;
  const severeAlert = input.alerts.some(
    (alert) => alert.severity === "severe" || alert.severity === "extreme"
  );
  const moderateAlert = input.alerts.some((alert) => alert.severity === "moderate");

  if (input.isDuplicate) {
    return buildDecision("SUPPRESS_DUPLICATE", input.regionId, 0.2, [
      "Duplicate alert detected",
      "No material changes"
    ], topDrivers);
  }

  if (input.isCancellation) {
    return buildDecision("CANCEL", input.regionId, 0.7, ["Cancellation received"], topDrivers);
  }

  let decision: PolicyDecisionType = "NO_ACTION";

  if (compositeScore >= 0.85 && severeAlert) {
    decision = "ESCALATE";
    reasons.push("Critical composite risk", "Severe official alert active");
  } else if (compositeScore >= 0.7) {
    decision = severeAlert ? "ESCALATE" : "WARN";
    reasons.push("High composite risk");
  } else if (compositeScore >= 0.5) {
    decision = severeAlert ? "WARN" : "WATCH";
    reasons.push("Elevated composite risk");
  } else if (compositeScore >= 0.25) {
    decision = "WATCH";
    reasons.push("Guarded composite risk");
  } else if (severeAlert || moderateAlert) {
    decision = "WATCH";
    reasons.push("Official alert active");
  }

  const confidenceBoost = severeAlert ? 0.2 : moderateAlert ? 0.1 : 0;
  const confidence = Math.min(1, Math.max(0.1, dataConfidence + confidenceBoost));

  if (confidence < 0.5 && decision === "WARN") {
    decision = "WATCH";
    reasons.push("Lower confidence due to data staleness");
  }

  if (reasons.length === 0) {
    reasons.push("No significant hazards detected");
  }

  return buildDecision(decision, input.regionId, confidence, reasons, topDrivers);
}

function buildDecision(
  decision: PolicyDecisionType,
  regionId: string,
  confidence: number,
  reasons: string[],
  topDrivers: PolicyDecision["topDrivers"]
): PolicyDecision {
  return {
    decision,
    policyVersion: POLICY_VERSION,
    confidence,
    reasons,
    topDrivers,
    regionId,
    generatedAt: nowIso()
  };
}
