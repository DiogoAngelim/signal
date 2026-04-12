import { createSignalEnvelope } from "@digelim/12.signal";
import {
  type EvaluateFrameInput,
  EvaluateFrameInputSchema,
  type EvaluateFrameResult,
  type Frame,
  type Profile,
  ReasonCode,
} from "../domain";
import { ExplanationEngine } from "./explanationEngine";
import { FrameFactory } from "./frameFactory";
import { createDeterministicId } from "./ids";
import type { EvaluationPipeline } from "./pipeline";
import type {
  EventPublisher,
  FrameRepository,
  ProfileRepository,
} from "./repositories";

export type MetricsRecorder = {
  recordEvaluation(durationMs: number, rejected: boolean): void;
};

export type Clock = () => Date;

export type EvaluateFrameDependencies = {
  profileRepo: ProfileRepository;
  frameRepo: FrameRepository;
  eventPublisher: EventPublisher;
  pipeline: EvaluationPipeline;
  clock?: Clock;
  metrics?: MetricsRecorder;
  frameFactory?: FrameFactory;
  explanationEngine?: ExplanationEngine;
};

const createFallbackProfile = (
  profileId: string,
  subjectType: string,
): Profile => ({
  profileId,
  version: "unknown",
  subjectType,
  window: { sizeMs: 0 },
  features: [],
  normalization: [],
  scoring: [],
  gate: {},
  freshnessPolicy: { maxAgeMs: 0, onExpired: "reject" },
  explanation: { drivers: [] },
  enabled: false,
});

export class EvaluateFrameUseCase {
  private clock: Clock;
  private frameFactory: FrameFactory;
  private explanationEngine: ExplanationEngine;

  constructor(private deps: EvaluateFrameDependencies) {
    this.clock = deps.clock ?? (() => new Date());
    this.frameFactory = deps.frameFactory ?? new FrameFactory();
    this.explanationEngine = deps.explanationEngine ?? new ExplanationEngine();
  }

  async execute(input: unknown): Promise<EvaluateFrameResult> {
    const start = Date.now();
    const nowIso = this.clock().toISOString();

    const parsed = EvaluateFrameInputSchema.safeParse(input);
    if (!parsed.success) {
      const frame = this.buildRejectedFrame({
        reason: ReasonCode.INPUT_INVALID,
        nowIso,
        subject: { type: "unknown", id: "unknown" },
        profileId: "unknown",
        observedAt: nowIso,
        inputs: {},
      });
      await this.deps.frameRepo.put(frame);
      await this.publish(frame, nowIso);
      this.recordMetrics(start, frame.status === "rejected");
      return { ok: true, frame };
    }

    const payload: EvaluateFrameInput = parsed.data;
    const profile = await this.deps.profileRepo.get(payload.profileId);

    if (!profile || !profile.enabled) {
      const frame = this.buildRejectedFrame({
        reason: ReasonCode.PROFILE_NOT_FOUND,
        nowIso,
        subject: payload.subject,
        profileId: payload.profileId,
        observedAt: payload.observedAt,
        inputs: payload.inputs,
      });
      await this.deps.frameRepo.put(frame);
      await this.publish(frame, nowIso);
      this.recordMetrics(start, frame.status === "rejected");
      return { ok: true, frame };
    }

    const frame = this.deps.pipeline.evaluate({
      subject: payload.subject,
      profile,
      observedAt: payload.observedAt,
      inputs: payload.inputs,
      nowIso,
    });

    await this.deps.frameRepo.put(frame);
    await this.publish(frame, nowIso);
    this.recordMetrics(start, frame.status === "rejected");

    return { ok: true, frame };
  }

  private buildRejectedFrame(params: {
    reason: ReasonCode;
    nowIso: string;
    subject: EvaluateFrameInput["subject"];
    profileId: string;
    observedAt: string;
    inputs: Record<string, number>;
  }) {
    const profile = createFallbackProfile(
      params.profileId,
      params.subject.type,
    );
    const frame = this.frameFactory.create({
      subject: params.subject,
      profile,
      observedAt: params.observedAt,
      rawInputs: params.inputs,
      now: params.nowIso,
    });
    frame.status = "rejected";
    frame.lifecycleStage = "rejected";
    frame.reasonCodes = [params.reason];
    frame.audit.steps.push({ stage: "rejected", at: params.nowIso });
    frame.explanation = this.explanationEngine.explain(profile, frame);
    frame.updatedAt = params.nowIso;
    return frame;
  }

  private async publish(
    frame: { frameId: string; status: string },
    nowIso: string,
  ) {
    const name =
      frame.status === "rejected"
        ? "pulse.frame.rejected.v1"
        : "pulse.frame.evaluated.v1";
    const messageId = createDeterministicId(`${name}:${frame.frameId}`);
    const traceId = createDeterministicId(`${name}:${frame.frameId}:trace`);
    const envelope = createSignalEnvelope({
      kind: "event",
      name,
      messageId,
      timestamp: nowIso,
      traceId,
      payload: { frame },
      source: "pulse",
      meta: { source: "pulse" },
    });
    await this.deps.eventPublisher.publish(envelope);
  }

  private recordMetrics(start: number, rejected: boolean): void {
    if (!this.deps.metrics) {
      return;
    }
    const durationMs = Date.now() - start;
    this.deps.metrics.recordEvaluation(durationMs, rejected);
  }
}

export class PutProfileUseCase {
  constructor(private repo: ProfileRepository) {}

  async execute(profile: Profile): Promise<{ ok: true; profile: Profile }> {
    await this.repo.put(profile);
    return { ok: true, profile };
  }
}

export class GetProfileUseCase {
  constructor(private repo: ProfileRepository) {}

  async execute(
    profileId: string,
    version?: string,
  ): Promise<{ ok: true; profile: Profile | null }> {
    const profile = await this.repo.get(profileId, version);
    return { ok: true, profile };
  }
}

export class GetFrameUseCase {
  constructor(private repo: FrameRepository) {}

  async execute(frameId: string): Promise<{ ok: true; frame: Frame | null }> {
    const frame = await this.repo.get(frameId);
    return { ok: true, frame };
  }
}
