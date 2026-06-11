import { clamp, mean } from "../math/statistics";
import type {
  DiagnosticsState,
  ExecutionReadinessState,
  RegimeState,
  SynchronizationState,
} from "../types";

export function evaluateExecutionReadiness(args: {
  perceptionScore: number;
  perceptionConfidence: number;
  agreement: number;
  regime: RegimeState;
  synchronization: SynchronizationState;
  diagnostics: DiagnosticsState;
}): ExecutionReadinessState {
  const contradictionPenalty = args.diagnostics.contradictions.reduce(
    (sum, item) => sum + item.readinessImpact,
    0,
  );
  const readinessScore = clamp(
    mean([
      args.perceptionScore,
      args.perceptionConfidence,
      args.agreement,
      args.regime.confidence * args.regime.modifiers.confidenceScale,
      args.synchronization.score,
      args.diagnostics.trust,
    ]) -
      contradictionPenalty * 0.18,
  );
  const executionSuitability = clamp(
    readinessScore - args.synchronization.reliabilityPenalty * 0.24,
  );
  const exposureCap = args.regime.modifiers.exposureCap;
  const riskAdjustedExposureSuggestion = clamp(
    (executionSuitability / 100) * exposureCap,
  );
  const confidenceAdjustedSizing = clamp(
    riskAdjustedExposureSuggestion * (args.diagnostics.trust / 100),
  );

  return {
    state: classify(
      readinessScore,
      args.diagnostics.trust,
      args.synchronization.score,
    ),
    readinessScore,
    executionSuitability,
    riskAdjustedExposureSuggestion,
    confidenceAdjustedSizing,
    rationale: [
      `Regime confidence ${args.regime.confidence.toFixed(0)} in ${args.regime.name}.`,
      `Synchronization reliability ${args.synchronization.score.toFixed(0)} with ${args.synchronization.reliabilityPenalty.toFixed(0)} penalty.`,
      `Trust ${args.diagnostics.trust.toFixed(0)} after ${args.diagnostics.contradictions.length} contradictions.`,
    ],
  };
}

function classify(
  score: number,
  trust: number,
  sync: number,
): ExecutionReadinessState["state"] {
  if (score < 25 || trust < 30 || sync < 28) return "Breaking";
  if (score < 38) return "Dormant";
  if (score < 50) return "Emerging";
  if (score < 64) return "Constructive";
  if (score < 78) return "Expanding";
  if (trust < 55) return "Fragile";
  return "Extended";
}
