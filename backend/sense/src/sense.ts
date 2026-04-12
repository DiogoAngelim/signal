import {
  type ActionDefinition,
  ActionExecutor,
  type ActionResult,
} from "@digelim/07.action";
import type { CoreDecision, CoreEngine } from "@digelim/06.core";
import type { PulseEngine, PulseInput } from "@digelim/05.pulse";
import type { ResultRecorder } from "@digelim/08.result";
import {
  LifecycleTracker,
  type SignalEnvelope,
  createLogger,
  validateSignalEnvelope,
} from "@digelim/12.signal";

export type SenseExecutionResult = {
  envelope: SignalEnvelope;
  decision: CoreDecision;
  action: ActionResult;
};

export class SenseOrchestrator {
  constructor(
    private readonly deps: {
      pulse: PulseEngine;
      core: CoreEngine;
      actionExecutor?: ActionExecutor;
      resultRecorder?: ResultRecorder;
    },
  ) {}

  async execute(input: {
    envelope: SignalEnvelope;
    pulseInput: PulseInput;
    action: ActionDefinition<unknown>;
    actionInput: unknown;
    lifecycle?: LifecycleTracker;
  }): Promise<SenseExecutionResult> {
    const envelope = validateSignalEnvelope(input.envelope);
    const lifecycle =
      input.lifecycle ??
      new LifecycleTracker({
        traceId: envelope.traceId,
        messageId: envelope.messageId,
        module: "sense",
        logger: createLogger({ module: "sense", traceId: envelope.traceId }),
      });

    const currentStage = lifecycle.current();
    if (currentStage === null) {
      lifecycle.transition("received");
      lifecycle.transition("validated");
    } else if (currentStage === "received") {
      lifecycle.transition("validated");
    }

    if (lifecycle.current() === "validated") {
      lifecycle.transition("enriched");
    }

    const pulseResult = this.deps.pulse.evaluate(input.pulseInput, {
      lifecycle,
    });
    const decision = this.deps.core.decide(pulseResult.output, { lifecycle });

    const actionExecutor = this.deps.actionExecutor ?? new ActionExecutor();
    const action = await actionExecutor.execute(
      input.action,
      input.actionInput,
      {
        idempotencyKey: envelope.meta?.idempotencyKey,
        traceId: envelope.traceId,
        lifecycle,
      },
    );

    if (this.deps.resultRecorder) {
      await this.deps.resultRecorder.record({
        traceId: envelope.traceId,
        decision,
        action,
        envelope,
      });
    }

    lifecycle.transition("completed");

    return { envelope, decision, action };
  }
}
