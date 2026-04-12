import type { LifecycleTracker } from "@digelim/12.signal";
import type { EvaluateFrameInput, Frame, Profile } from "./domain";
import type { EvaluationPipeline } from "./runtime/pipeline";

export type PulseOutput = {
  score: number;
  confidence: number;
  features: Record<string, number>;
};

export type PulseEvaluationResult = {
  output: PulseOutput;
  frame: Frame;
};

export type PulseInput = {
  subject: EvaluateFrameInput["subject"];
  profile: Profile;
  observedAt: string;
  inputs: Record<string, number>;
  messageId?: string;
};

export type PulseContext = {
  lifecycle?: LifecycleTracker;
};

const averageScore = (scores: Record<string, number>): number => {
  const values = Object.values(scores);
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export class PulseEngine {
  constructor(private readonly pipeline: EvaluationPipeline) {}

  evaluate(
    input: PulseInput,
    context: PulseContext = {},
  ): PulseEvaluationResult {
    const nowIso = new Date().toISOString();
    const frame = this.pipeline.evaluate({
      subject: input.subject,
      profile: input.profile,
      observedAt: input.observedAt,
      inputs: input.inputs,
      nowIso,
      messageId: input.messageId,
    });

    context.lifecycle?.transition("evaluated");

    const output: PulseOutput = {
      score: averageScore(frame.scores),
      confidence: frame.confidence,
      features: frame.features,
    };

    return { output, frame };
  }
}
