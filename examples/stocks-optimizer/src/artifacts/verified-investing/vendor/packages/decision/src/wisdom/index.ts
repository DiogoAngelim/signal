import type { WisdomAssessment, WisdomInput } from "../types";
import { asScore, clamp } from "../utils";

export function assessWisdom(input: WisdomInput = {}): WisdomAssessment {
  const expectedReward = asScore(input.expectedReward, 55);
  const downsideRisk = asScore(input.downsideRisk, 45);
  const irreversibleRisk = asScore(input.irreversibleRisk, downsideRisk);
  const survivalPriority = asScore(input.survivalPriority, 80);
  const longTermAlignment = asScore(input.longTermAlignment, expectedReward);
  const shortTermTemptation = asScore(
    input.shortTermTemptation,
    expectedReward,
  );
  const uncertainty = asScore(input.uncertainty, 100 - expectedReward);
  const confidence = asScore(input.confidence, expectedReward);
  const survivalDrag =
    Math.max(downsideRisk, irreversibleRisk) * (survivalPriority / 100);
  const score = clamp(
    longTermAlignment * 0.35 +
      confidence * 0.2 +
      expectedReward * 0.2 +
      (100 - survivalDrag) * 0.25 -
      uncertainty * 0.12,
  );
  const decision = wisdomDecision({
    score,
    downsideRisk,
    irreversibleRisk,
    survivalPriority,
    confidence,
    shortTermTemptation,
    longTermAlignment,
  });

  return {
    score: Math.round(score),
    irreversibleRisk: Math.round(irreversibleRisk),
    survivalPriority: Math.round(survivalPriority),
    longTermAlignment: Math.round(longTermAlignment),
    shortTermTemptation: Math.round(shortTermTemptation),
    decision,
    reason: wisdomReasons(decision, {
      expectedReward,
      downsideRisk,
      irreversibleRisk,
      survivalPriority,
      longTermAlignment,
      shortTermTemptation,
      uncertainty,
      confidence,
    }),
  };
}

function wisdomDecision(input: {
  score: number;
  downsideRisk: number;
  irreversibleRisk: number;
  survivalPriority: number;
  confidence: number;
  shortTermTemptation: number;
  longTermAlignment: number;
}): WisdomAssessment["decision"] {
  if (input.irreversibleRisk >= 72 && input.confidence < 72) return "avoid";
  if (input.downsideRisk >= 82 && input.survivalPriority >= 70) return "avoid";
  if (input.shortTermTemptation - input.longTermAlignment >= 24) return "wait";
  if (input.score >= 76 && input.downsideRisk < 58) return "proceed";
  if (input.score >= 58 && input.downsideRisk < 76) return "proceed-small";
  return "wait";
}

function wisdomReasons(
  decision: WisdomAssessment["decision"],
  input: {
    expectedReward: number;
    downsideRisk: number;
    irreversibleRisk: number;
    survivalPriority: number;
    longTermAlignment: number;
    shortTermTemptation: number;
    uncertainty: number;
    confidence: number;
  },
): string[] {
  const reasons = ["Long-term survival outranks short-term opportunity."];
  if (input.irreversibleRisk >= 72)
    reasons.push(
      "Irreversible risk is high, so confidence must be exceptional before acting.",
    );
  if (input.downsideRisk >= 70)
    reasons.push("The downside could dominate the upside.");
  if (input.shortTermTemptation > input.longTermAlignment)
    reasons.push("Short-term temptation is stronger than long-term alignment.");
  if (decision === "proceed")
    reasons.push(
      "Reward, alignment, and survivability are strong enough to proceed.",
    );
  if (decision === "proceed-small")
    reasons.push(
      "The idea may be useful, but the safer expression is smaller.",
    );
  if (decision === "wait")
    reasons.push("Waiting preserves optionality while uncertainty clears.");
  if (decision === "avoid")
    reasons.push(
      "Avoiding action protects the system from a non-survivable path.",
    );
  return reasons;
}
