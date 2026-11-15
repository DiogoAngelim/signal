/**
 * Read-only post-hoc explanation of the actual native decision permission.
 * This NEVER grants permission, retries a veto or changes a scoring threshold.
 * A native allowance still is NOT consent, tenant authorization or approval to act.
 */
import type { DecisionPipelineResult } from "./types";

export type NativeVetoReason =
  | "coherence_denied"
  | "simulation_wait"
  | "simulation_block"
  | "wisdom_wait"
  | "wisdom_avoid"
  | "stewardship_wait"
  | "stewardship_avoid"
  | "governance_blockers"
  | "zero_effective_scale";

export interface NativePermissionDiagnosis {
  nativeActionAllowed: boolean;
  nativeActionScale: number;
  /** An allowed partial-scale proposal is not automatically a full-size operation. */
  permissionClass: "denied" | "partial" | "full";
  vetoReasons: NativeVetoReason[];
  coherenceScore: number;
  simulationRecommendation: DecisionPipelineResult["simulationRecommendation"];
  wisdomDecision: DecisionPipelineResult["wisdomDecision"];
  simulationSelectedVariant: string | null;
  simulationSelectedCompositeScore: number | null;
  simulationBestNonWaitCompositeScore: number | null;
  simulationNonWaitScoreGap: number | null;
  explicitGovernanceBlockerCount: number;
  nativePermissionIsDomainAuthorization: false;
}

const score = (path: {
  expectedOutcomeScore: number;
  survivalScore: number;
  regretScore: number;
}): number =>
  path.expectedOutcomeScore * 0.45 +
  path.survivalScore * 0.4 -
  path.regretScore * 0.15;

/**
 * Explains the native result without reconstructing or weakening its authority.
 * Throws on an inconsistent result instead of treating corrupt data as permission.
 */
export function diagnoseNativeDecisionPermission(
  result: DecisionPipelineResult,
): NativePermissionDiagnosis {
  if (
    !result ||
    !result.record?.coherence ||
    !result.record.simulation ||
    !result.record.wisdom ||
    typeof result.actionAllowed !== "boolean" ||
    !Number.isFinite(result.actionScale) ||
    result.actionScale < 0 ||
    result.actionScale > 1
  ) {
    throw new Error("Complete, finite native decision result is required.");
  }
  if (result.actionAllowed !== (result.actionScale > 0)) {
    throw new Error("Inconsistent native allowance and effective action scale.");
  }
  if (!result.actionAllowed && result.record.action !== undefined) {
    throw new Error("Denied native decision must not carry a proposed action.");
  }
  if (
    result.record.simulation.recommendedAction !== result.simulationRecommendation ||
    result.record.wisdom.decision !== result.wisdomDecision
  ) {
    throw new Error("Native decision and stored simulation/wisdom disagree.");
  }
  const coherence = result.record.coherence;
  const stewardship = result.record.assessment?.stewardship.recommendation;
  const governanceBlockers =
    result.record.assessment?.governance.blockers.length ?? 0;
  const vetoReasons: NativeVetoReason[] = [];
  if (!coherence.actionAllowed) vetoReasons.push("coherence_denied");
  if (result.simulationRecommendation === "wait")
    vetoReasons.push("simulation_wait");
  if (result.simulationRecommendation === "block")
    vetoReasons.push("simulation_block");
  if (result.wisdomDecision === "wait") vetoReasons.push("wisdom_wait");
  if (result.wisdomDecision === "avoid") vetoReasons.push("wisdom_avoid");
  if (stewardship === "wait") vetoReasons.push("stewardship_wait");
  if (stewardship === "avoid") vetoReasons.push("stewardship_avoid");
  if (governanceBlockers > 0) vetoReasons.push("governance_blockers");
  if (!result.actionAllowed && vetoReasons.length === 0)
    vetoReasons.push("zero_effective_scale");
  if (result.actionAllowed && vetoReasons.length > 0) {
    throw new Error("Native permission contradicts a hard wait/block reason.");
  }
  const simulation = result.record.simulation;
  const selected = simulation.pathComparisons.find(
    (path) => path.actionVariant === simulation.actionVariant,
  );
  if (!selected) throw new Error("Native chosen simulation path is missing.");
  const nonWait = simulation.pathComparisons
    .filter((path) => !/wait|block/i.test(path.actionVariant))
    .map(score);
  const alternative = nonWait.length ? Math.max(...nonWait) : null;
  const selectedComposite = score(selected);
  return {
    nativeActionAllowed: result.actionAllowed,
    nativeActionScale: result.actionScale,
    permissionClass: !result.actionAllowed
      ? "denied"
      : result.actionScale === 1
        ? "full"
        : "partial",
    vetoReasons,
    coherenceScore: result.coherenceScore,
    simulationRecommendation: result.simulationRecommendation,
    wisdomDecision: result.wisdomDecision,
    simulationSelectedVariant: simulation.actionVariant,
    simulationSelectedCompositeScore: selectedComposite,
    simulationBestNonWaitCompositeScore: alternative,
    simulationNonWaitScoreGap:
      alternative === null ? null : selectedComposite - alternative,
    explicitGovernanceBlockerCount: governanceBlockers,
    nativePermissionIsDomainAuthorization: false,
  };
}
