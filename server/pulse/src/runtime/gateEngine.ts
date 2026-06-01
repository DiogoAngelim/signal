import { type FrameStatus, type Profile, ReasonCode } from "../domain";

export type GateResult = {
  status: FrameStatus;
  reasonCodes: ReasonCode[];
};

export class GateEngine {
  evaluate(
    profile: Profile,
    confidence: number,
    scores: Record<string, number>,
    freshnessMs: number,
    missingRequiredCount: number,
    totalRequired: number,
  ): GateResult {
    const reasonCodes: ReasonCode[] = [];
    let status: FrameStatus = "eligible";

    if (missingRequiredCount > 0) {
      reasonCodes.push(ReasonCode.FEATURE_MISSING);
      if (missingRequiredCount < totalRequired) {
        status = "degraded";
        reasonCodes.push(ReasonCode.DEGRADED_PARTIAL_INPUT);
      } else {
        status = "rejected";
      }
    }

    const expired = freshnessMs > profile.freshnessPolicy.maxAgeMs;
    if (expired) {
      reasonCodes.push(ReasonCode.FRESHNESS_EXPIRED);
      if (profile.freshnessPolicy.onExpired === "reject") {
        status = "rejected";
      } else if (status !== "rejected") {
        status = "degraded";
      }
    }

    if (
      typeof profile.gate.minConfidence === "number" &&
      confidence < profile.gate.minConfidence
    ) {
      reasonCodes.push(ReasonCode.LOW_CONFIDENCE);
      status = "rejected";
    }

    if (profile.gate.minScores && missingRequiredCount === 0) {
      for (const [scoreKey, minValue] of Object.entries(
        profile.gate.minScores,
      )) {
        const score = scores[scoreKey] ?? 0;
        if (score < minValue) {
          reasonCodes.push(ReasonCode.SCORE_BELOW_THRESHOLD);
          status = "rejected";
          break;
        }
      }
    }

    if (status === "eligible") {
      reasonCodes.push(ReasonCode.ELIGIBLE);
    }

    return { status, reasonCodes };
  }
}
