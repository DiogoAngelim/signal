import { nowIso } from "@digelim/12.signal";
import type { Frame, Profile, SubjectRef } from "../domain";
import { createDeterministicId } from "./ids";

export type FrameFactoryInput = {
  subject: SubjectRef;
  profile: Profile;
  observedAt: string;
  rawInputs: Record<string, number>;
  now?: string;
  messageId?: string;
};

export class FrameFactory {
  create(input: FrameFactoryInput): Frame {
    const createdAt = input.now ?? nowIso();
    const seed = [
      input.subject.type,
      input.subject.id,
      input.profile.profileId,
      input.profile.version,
      input.observedAt,
    ].join("|");
    const frameId = createDeterministicId(seed);

    return {
      frameId,
      subject: input.subject,
      profileId: input.profile.profileId,
      profileVersion: input.profile.version,
      lifecycleStage: "captured",
      status: "pending",
      observedAt: input.observedAt,
      createdAt,
      updatedAt: createdAt,
      window: input.profile.window,
      freshnessMs: 0,
      rawInputs: input.rawInputs,
      features: {},
      scores: {},
      confidence: 0,
      confidenceBreakdown: { featureCompleteness: 0, freshness: 0 },
      reasonCodes: [],
      explanation: {
        summary: "",
        reasonCodes: [],
        drivers: [],
        confidenceBreakdown: { featureCompleteness: 0, freshness: 0 },
      },
      audit: { steps: [{ stage: "captured", at: createdAt }] },
      provenance: {
        source: "signal",
        messageId: input.messageId,
      },
    };
  }
}
