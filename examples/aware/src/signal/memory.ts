import {
  createDecisionRecord,
  type CoherenceAssessment
} from "@signal/decision";
import {
  createInMemoryDecisionMemoryStore,
  type DecisionMemoryStore,
  type DecisionReview
} from "@signal/decision-memory";
import type { Briefing, BriefingReviewInput, BriefingReviewResult, SafetyObservation } from "../contracts.js";

export const AWARE_MEMORY_APP_ID = "aware";
export const AWARE_MEMORY_DOMAIN = "public-safety-guidance";

export type AwareDecisionMemory = {
  store: DecisionMemoryStore;
  recordBriefing(input: {
    briefing: Briefing;
    observations: readonly SafetyObservation[];
  }): Promise<string>;
  recordReview(input: BriefingReviewInput): Promise<BriefingReviewResult>;
};

export function createAwareDecisionMemory(store: DecisionMemoryStore = createInMemoryDecisionMemoryStore()): AwareDecisionMemory {
  return {
    store,
    async recordBriefing(input) {
      const decisionId = memoryDecisionId(input.briefing.id);
      const record = createDecisionRecord({
        decisionId,
        source: AWARE_MEMORY_APP_ID,
        appId: AWARE_MEMORY_APP_ID,
        domain: AWARE_MEMORY_DOMAIN,
        timestamp: input.briefing.generatedAt,
        version: "v1",
        observation: {
          briefingId: input.briefing.id,
          regionId: input.briefing.region.id,
          attentionLevel: input.briefing.attentionLevel,
          observations: input.observations.map((observation) => ({
            id: observation.id,
            category: observation.category,
            signal: observation.signal,
            severity: observation.severity,
            sourceId: observation.source.id,
            degraded: observation.degraded
          }))
        },
        coherence: coherenceFromBriefing(input.briefing),
        action: input.briefing.items.map((item) => ({
          itemId: item.id,
          primaryAction: item.primaryAction,
          attentionLevel: item.attentionLevel
        })),
        humanSummary: input.briefing.summary,
        retentionTier: "hot"
      });
      await store.saveDecisionRecord(record);
      return decisionId;
    },
    async recordReview(input) {
      const now = new Date().toISOString();
      const review: DecisionReview = {
        reviewId: `aware-review-${smallHash(`${input.briefingId}:${now}:${input.whatHappened ?? ""}`)}`,
        decisionId: memoryDecisionId(input.briefingId),
        appId: AWARE_MEMORY_APP_ID,
        domain: AWARE_MEMORY_DOMAIN,
        timestamp: now,
        correlationId: `aware-review:${input.briefingId}`,
        version: "v1",
        source: AWARE_MEMORY_APP_ID,
        reviewedAt: now,
        classification: input.classification ?? "inconclusive",
        whatWasRecommended: `Review for briefing ${input.briefingId}.`,
        whyRecommended: "Aware generated a regional public-safety briefing from normalized evidence.",
        whatHappened: input.whatHappened ?? "No outcome was supplied.",
        lesson: input.lesson ?? "Keep the lesson provisional until more reviewed outcomes arrive.",
        confidenceAdjustment: 0,
        trustAdjustment: 0,
        metadata: {
          scope: "examples/aware"
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
  return `aware-decision-${briefingId}`;
}

function coherenceFromBriefing(briefing: Briefing): CoherenceAssessment {
  const rank = { normal: 92, notice: 78, warning: 66, urgency: 54, emergency: 48 }[briefing.attentionLevel];
  const actionScale = { normal: 0.1, notice: 0.25, warning: 0.5, urgency: 0.75, emergency: 0.9 }[briefing.attentionLevel];
  return {
    score: rank,
    status: briefing.degraded ? "tension" : briefing.attentionLevel === "emergency" ? "unstable" : "stable",
    contradictions: briefing.degraded
      ? [{
          conflictId: `${briefing.id}:degraded`,
          modules: ["discovery", "judgment"],
          severity: "medium",
          description: "Some evidence sources were unavailable.",
          recommendation: "Keep guidance cautious and show source limitations."
        }]
      : [],
    consensusLevel: briefing.degraded ? 68 : 82,
    actionAllowed: true,
    actionScale,
    trustAdjustment: briefing.degraded ? -4 : 0,
    agencyAdjustment: actionScale * 10,
    confidenceAdjustment: briefing.degraded ? -8 : 0,
    explanation: [
      "Decision memory records the briefing as a public-safety guidance decision.",
      "The record keeps evidence, trust, constraints, commitment, and action traceable for this example."
    ]
  };
}

function smallHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, "0").slice(0, 8);
}
