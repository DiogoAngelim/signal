import {
  createDecisionRecord,
  type CoherenceAssessment
} from "@signal/decision";
import {
  createInMemoryDecisionMemoryStore,
  type DecisionMemoryStore,
  type DecisionReview
} from "@signal/decision-memory";
import type {
  MaritimeBriefing,
  MaritimeObservation,
  MaritimeReviewInput,
  MaritimeReviewResult
} from "../contracts.js";

export const MARITIME_MEMORY_APP_ID = "maritime-aware";
export const MARITIME_MEMORY_DOMAIN = "maritime-guidance";

export type MaritimeDecisionMemory = {
  store: DecisionMemoryStore;
  recordBriefing(input: {
    briefing: MaritimeBriefing;
    observations: readonly MaritimeObservation[];
  }): Promise<string>;
  recordReview(input: MaritimeReviewInput): Promise<MaritimeReviewResult>;
};

export function createMaritimeDecisionMemory(
  store: DecisionMemoryStore = createInMemoryDecisionMemoryStore()
): MaritimeDecisionMemory {
  return {
    store,
    async recordBriefing(input) {
      const decisionId = memoryDecisionId(input.briefing.id);
      const record = createDecisionRecord({
        decisionId,
        source: MARITIME_MEMORY_APP_ID,
        appId: MARITIME_MEMORY_APP_ID,
        domain: MARITIME_MEMORY_DOMAIN,
        timestamp: input.briefing.generatedAt,
        version: "v1",
        observation: {
          briefingId: input.briefing.id,
          areaId: input.briefing.area.id,
          areaType: input.briefing.area.type,
          guidanceLevel: input.briefing.guidanceLevel,
          risks: input.briefing.risks.map((risk) => ({
            id: risk.id,
            whatMatters: risk.whatMatters,
            threat: risk.threat,
            severity: risk.severity,
            confidence: risk.confidence,
            freshness: risk.freshness
          })),
          observations: input.observations.map((observation) => ({
            id: observation.id,
            category: observation.category,
            signal: observation.signal,
            severity: observation.severity,
            confidence: observation.confidence,
            sourceId: observation.source.id,
            degraded: observation.degraded
          }))
        },
        coherence: coherenceFromBriefing(input.briefing),
        action: {
          suggested: input.briefing.whatYouCanDo,
          watchNext: input.briefing.watchNext,
          remainsUnclear: input.briefing.remainsUnclear
        },
        humanSummary: input.briefing.summary,
        retentionTier: "hot"
      });
      await store.saveDecisionRecord(record);
      return decisionId;
    },
    async recordReview(input) {
      const now = new Date().toISOString();
      const classification = mapReviewClassification(input.classification);
      const review: DecisionReview = {
        reviewId: `maritime-review-${smallHash(`${input.briefingId}:${now}:${input.whatHappened ?? ""}`)}`,
        decisionId: memoryDecisionId(input.briefingId),
        appId: MARITIME_MEMORY_APP_ID,
        domain: MARITIME_MEMORY_DOMAIN,
        timestamp: now,
        correlationId: `maritime-review:${input.briefingId}`,
        version: "v1",
        source: MARITIME_MEMORY_APP_ID,
        reviewedAt: now,
        classification,
        whatWasRecommended: `Review for maritime guide ${input.briefingId}.`,
        whyRecommended: "Maritime Aware generated guidance from normalized maritime evidence, confidence, and uncertainty.",
        whatHappened: input.whatHappened ?? "No outcome was supplied.",
        lesson: input.lesson ?? "Keep this lesson provisional until more reviewed outcomes arrive.",
        confidenceAdjustment: input.classification === "too_confident" ? -5 : input.classification === "useful" ? 2 : 0,
        trustAdjustment: input.classification === "missed_context" ? -4 : input.classification === "useful" ? 2 : 0,
        metadata: {
          scope: "examples/maritime-aware",
          maritimeClassification: input.classification ?? "inconclusive"
        }
      };
      await store.saveDecisionReview(review);
      return {
        reviewId: review.reviewId,
        briefingId: input.briefingId,
        recordedAt: review.reviewedAt,
        status: "recorded",
        memoryRecordId: review.decisionId
      };
    }
  };
}

export function memoryDecisionId(briefingId: string): string {
  return `maritime-decision-${briefingId}`;
}

function coherenceFromBriefing(briefing: MaritimeBriefing): CoherenceAssessment {
  const score = briefing.degraded
    ? 58
    : { steady: 92, notice: 82, watch: 72, act: 62, urgent: 52 }[briefing.guidanceLevel];
  const actionScale = { steady: 0.1, notice: 0.25, watch: 0.45, act: 0.7, urgent: 0.9 }[briefing.guidanceLevel];
  return {
    score,
    status: briefing.degraded ? "tension" : briefing.guidanceLevel === "urgent" ? "unstable" : "stable",
    contradictions: briefing.degraded
      ? [{
          conflictId: `${briefing.id}:degraded`,
          modules: ["discovery", "judgment"],
          severity: "medium",
          description: "Some maritime evidence was stale, degraded, or unavailable.",
          recommendation: "Keep confidence visible and guidance cautious."
        }]
      : [],
    consensusLevel: briefing.degraded ? 62 : 82,
    actionAllowed: true,
    actionScale,
    trustAdjustment: briefing.degraded ? -4 : 0,
    agencyAdjustment: actionScale * 10,
    confidenceAdjustment: briefing.degraded ? -8 : 0,
    explanation: [
      "Decision memory records maritime guidance as a judgment, not as vessel tracking.",
      "The record keeps evidence, uncertainty, suggested action, and watch-next traceable."
    ]
  };
}

function mapReviewClassification(value: MaritimeReviewInput["classification"]): DecisionReview["classification"] {
  if (value === "useful") return "correct";
  if (value === "too_cautious") return "early";
  if (value === "too_confident" || value === "missed_context") return "wrong";
  return "inconclusive";
}

function smallHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, "0").slice(0, 8);
}
