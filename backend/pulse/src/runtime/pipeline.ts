import { isValidDate, parseIsoDate } from "@digelim/12.signal";
import {
  type EvaluateFrameInput,
  type Frame,
  type Profile,
  ReasonCode,
} from "../domain";
import type { ConfidenceEngine } from "./confidenceEngine";
import type { ExplanationEngine } from "./explanationEngine";
import type { FrameFactory } from "./frameFactory";
import type { GateEngine } from "./gateEngine";
import type { Normalizer } from "./normalizer";
import type { ScoreEngine } from "./scoreEngine";

export type PipelineDependencies = {
  frameFactory: FrameFactory;
  normalizer: Normalizer;
  scoreEngine: ScoreEngine;
  confidenceEngine: ConfidenceEngine;
  gateEngine: GateEngine;
  explanationEngine: ExplanationEngine;
};

export type PipelineInput = {
  subject: EvaluateFrameInput["subject"];
  profile: Profile;
  observedAt: string;
  inputs: Record<string, number>;
  nowIso: string;
  messageId?: string;
};

export class EvaluationPipeline {
  constructor(private deps: PipelineDependencies) {}

  evaluate(input: PipelineInput): Frame {
    const frame = this.deps.frameFactory.create({
      subject: input.subject,
      profile: input.profile,
      observedAt: input.observedAt,
      rawInputs: input.inputs,
      now: input.nowIso,
      messageId: input.messageId,
    });

    frame.lifecycleStage = "captured";

    const normalization = this.deps.normalizer.normalize(
      input.profile,
      input.inputs,
    );
    frame.features = normalization.features;
    frame.lifecycleStage = "normalized";
    frame.audit.steps.push({ stage: "normalized", at: input.nowIso });

    frame.scores = this.deps.scoreEngine.score(input.profile, frame.features);
    frame.lifecycleStage = "scored";
    frame.audit.steps.push({ stage: "scored", at: input.nowIso });

    const observedAtDate = parseIsoDate(input.observedAt);
    if (!isValidDate(observedAtDate)) {
      frame.status = "rejected";
      frame.reasonCodes = [ReasonCode.INPUT_INVALID];
      frame.lifecycleStage = "rejected";
      frame.audit.steps.push({ stage: "rejected", at: input.nowIso });
      frame.explanation = this.deps.explanationEngine.explain(
        input.profile,
        frame,
      );
      frame.updatedAt = input.nowIso;
      return frame;
    }

    const nowMs = new Date(input.nowIso).getTime();
    const freshnessMs = Math.max(0, nowMs - observedAtDate.getTime());
    const totalRequired = input.profile.features.filter(
      (feature) => feature.required,
    ).length;

    const confidenceResult = this.deps.confidenceEngine.compute(
      input.profile,
      freshnessMs,
      normalization.missingRequired.length,
      totalRequired,
    );

    frame.confidence = confidenceResult.confidence;
    frame.confidenceBreakdown = confidenceResult.breakdown;
    frame.freshnessMs = confidenceResult.freshnessMs;

    const gateResult = this.deps.gateEngine.evaluate(
      input.profile,
      frame.confidence,
      frame.scores,
      freshnessMs,
      normalization.missingRequired.length,
      totalRequired,
    );

    frame.status = gateResult.status;
    frame.reasonCodes = gateResult.reasonCodes;
    frame.lifecycleStage = "gated";
    frame.audit.steps.push({ stage: "gated", at: input.nowIso });

    frame.explanation = this.deps.explanationEngine.explain(
      input.profile,
      frame,
    );
    frame.lifecycleStage =
      frame.status === "rejected" ? "rejected" : "explained";
    frame.audit.steps.push({ stage: frame.lifecycleStage, at: input.nowIso });
    frame.updatedAt = input.nowIso;

    return frame;
  }
}
