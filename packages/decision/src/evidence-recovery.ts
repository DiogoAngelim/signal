/**
 * Advisory-only route out of indefinite native abstention.
 * Evidence collection is NEVER execution authorization. Expected information
 * value comes from caller-declared likelihoods, not observed causal benefit.
 */
import {
  evaluateInformationValue,
  type InformationObservation,
  type QuantitativeDecisionModel,
} from "./quantitative-decision";
import { diagnoseNativeDecisionPermission } from "./permission-diagnostics";
import type { DecisionPipelineResult } from "./types";

export interface EvidenceRecoveryRequest {
  nativeDecision: DecisionPipelineResult;
  economicModel: QuantitativeDecisionModel;
  potentialObservations: readonly InformationObservation[];
  /** Caller-declared acquisition/review cost in economicModel.unit. */
  acquisitionCost: number;
}

export interface EvidenceRecoveryAdvice {
  status: "consider_human_evidence_review" | "remain_paused" | "not_needed_for_native_permission";
  nativePermissionClass: "denied" | "partial" | "full";
  evidenceQuestion: string | null;
  riskNeutralGrossInformationValue: number | null;
  riskNeutralNetInformationValue: number | null;
  acquisitionCost: number;
  monetaryUnit: string;
  decisionGateChanged: false;
  automatedCollectionPermitted: false;
  humanReviewRequired: true;
  limitations: string[];
}

/**
 * Only suggest reviewing the cost of additional independent information.
 * "Consider" is not an order to acquire data or an authorization to act.
 */
export function adviseEvidenceRecovery(
  request: EvidenceRecoveryRequest,
): EvidenceRecoveryAdvice {
  const native = diagnoseNativeDecisionPermission(request.nativeDecision);
  const information = evaluateInformationValue(
    request.economicModel,
    request.potentialObservations,
    request.acquisitionCost,
  );
  const question =
    request.nativeDecision.record.assessment?.nextBestEvidence.question ?? null;
  const shouldConsider =
    native.permissionClass !== "full" &&
    question !== null &&
    information.netValue !== null &&
    information.netValue > 0;
  return {
    status: native.permissionClass === "full"
      ? "not_needed_for_native_permission"
      : shouldConsider
        ? "consider_human_evidence_review"
        : "remain_paused",
    nativePermissionClass: native.permissionClass,
    evidenceQuestion: question,
    riskNeutralGrossInformationValue: information.grossValue,
    riskNeutralNetInformationValue: information.netValue,
    acquisitionCost: information.acquisitionCost,
    monetaryUnit: request.economicModel.unit,
    decisionGateChanged: false,
    automatedCollectionPermitted: false,
    humanReviewRequired: true,
    limitations: [
      "The native permission and zero/partial-scale veto are unchanged. Human-reviewed evidence acquisition cannot authorize an action.",
      "The question is derived from the caller's assessment. Its source relevance, independence and feasibility are not verified here.",
      "Gross/net information values use caller-supplied likelihoods, state probabilities and costs, not measured business returns.",
      "Information value is risk-neutral and conditional on fixed model constraints; no causal outcome or statistical superiority is established.",
      "Repeated assessment after genuinely obtaining new evidence must run the full unmodified native gate again, with current source provenance and domain authorization.",
    ],
  };
}
