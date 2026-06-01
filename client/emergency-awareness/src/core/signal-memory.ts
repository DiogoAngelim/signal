import {
  createDecisionMemoryContractAdapter,
  type CalibrationQueryContractResult,
  type DecisionMemoryStore,
  type MemoryScope as SignalMemoryScope,
  type SimilarityQueryContractResult
} from "@signal/decision-memory";
import type { MemoryGateway, MemoryScope, RiskZone } from "./types";
import { CLIMATE_RISK_DOMAIN, EMERGENCY_AWARENESS_APP_ID } from "./types";

export function createSignalDecisionMemoryGateway(store: DecisionMemoryStore): MemoryGateway {
  const adapter = createDecisionMemoryContractAdapter(store);
  return {
    async recordDecision(input) {
      await adapter.recordDecision({
        scope: toSignalScope(input.scope),
        correlationId: input.zone.correlationId,
        observation: {
          place: {
            id: input.place.id,
            label: input.place.label,
            precisionLabel: input.place.precisionLabel
          },
          forecast: {
            provider: input.forecast.provider,
            source: input.forecast.source,
            freshness: input.forecast.freshness,
            summary: input.forecast.summary
          },
          concern: zonePayload(input.zone)
        },
        modules: {
          awareness: {
            score: input.zone.confidence,
            risk: input.zone.riskScore,
            uncertainty: 100 - input.zone.confidence,
            reasons: [input.zone.reason]
          },
          judgment: {
            score: Math.max(0, 100 - input.zone.riskScore),
            confidence: input.zone.confidence,
            risk: input.zone.riskScore,
            reasons: [input.zone.recommendedAction]
          },
          calibration: {
            score: input.zone.confidence,
            confidence: input.zone.confidence,
            uncertainty: input.zone.missingInformation.length ? 70 : 100 - input.zone.confidence
          },
          memory: {
            score: 100,
            confidence: input.zone.confidence,
            reasons: ["Scoped to Signal Memory contracts."]
          }
        },
        action: {
          concernState: input.zone.riskState,
          recommendedAction: input.zone.recommendedAction
        },
        humanSummary: `${input.zone.riskState}: ${input.zone.reason}`,
        retentionTier: input.zone.riskState === "Act carefully" ? "hot" : "warm"
      });
    },
    async querySimilarity(input) {
      const result = await adapter.querySimilarity({
        scope: toSignalScope(input.scope),
        current: {
          regimeSnapshotId: `current:${input.scope.decisionId}`,
          appId: EMERGENCY_AWARENESS_APP_ID,
          domain: CLIMATE_RISK_DOMAIN,
          decisionId: input.scope.decisionId,
          correlationId: input.zone.correlationId,
          version: "v1",
          source: EMERGENCY_AWARENESS_APP_ID,
          marketCategory: CLIMATE_RISK_DOMAIN,
          venue: input.place.label,
          timestamp: input.scope.timestamp,
          marketHealth: Math.max(0, 100 - input.zone.riskScore),
          riskState: input.zone.riskState,
          trust: input.zone.confidence,
          confidence: input.zone.confidence,
          readiness: Math.max(0, 100 - input.zone.riskScore),
          exposureGuidance: input.zone.riskScore / 100,
          opportunityDensity: input.forecast.summary.maxPrecipitationProbabilityPercent,
          finalRecommendation: input.zone.recommendedAction,
          metadata: {
            signalMemory: {
              scope: toSignalScope(input.scope),
              correlationId: input.zone.correlationId,
              version: "v1",
              recordKind: "Similarity"
            }
          }
        },
        limit: 6,
        threshold: 0.55
      });
      return similarityResult(result);
    },
    async queryCalibration(input) {
      const result = await adapter.queryCalibration({ scope: toSignalScope(input.scope), limit: 100 });
      return calibrationResult(result);
    }
  };
}

export function toSignalScope(scope: MemoryScope): SignalMemoryScope {
  return {
    appId: EMERGENCY_AWARENESS_APP_ID,
    domain: CLIMATE_RISK_DOMAIN,
    decisionId: scope.decisionId,
    timestamp: scope.timestamp
  };
}

function zonePayload(zone: RiskZone) {
  return {
    id: zone.id,
    riskState: zone.riskState,
    riskScore: zone.riskScore,
    confidence: zone.confidence,
    freshness: zone.freshness,
    reason: zone.reason,
    recommendedAction: zone.recommendedAction,
    missingInformation: zone.missingInformation,
    warnings: zone.warnings
  };
}

function similarityResult(result: SimilarityQueryContractResult) {
  return {
    similarCases: result.similarCases.map((entry) => ({
      decisionId: entry.decisionId,
      outcomeSummary: entry.outcomeSummary,
      lessonReferences: entry.lessonReferences
    })),
    outcomeDistribution: result.outcomeDistribution,
    lessonReferences: result.lessonReferences
  };
}

function calibrationResult(result: CalibrationQueryContractResult) {
  return {
    confidenceAccuracy: result.confidenceAccuracy,
    overconfidence: result.overconfidence,
    underconfidence: result.underconfidence,
    historicalCalibration: result.historicalCalibration
  };
}
