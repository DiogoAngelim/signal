import type { ActionDefinition } from "@digelim/07.action";
import type { Intent, IntentNormalizer } from "@digelim/01.intent";
import type { PulseInput } from "@digelim/05.pulse";
import type {
  SenseExecutionResult,
  SenseOrchestrator,
} from "@digelim/09.sense";
import { LifecycleTracker, createLogger } from "@digelim/12.signal";
import type { SourceNormalizer } from "@digelim/04.source";

export class AppGateway {
  constructor(
    private readonly deps: {
      intent: IntentNormalizer;
      source: SourceNormalizer;
      sense: SenseOrchestrator;
    },
  ) {}

  async handleIntent(input: {
    intent: Intent;
    pulseInput: PulseInput;
    action: ActionDefinition<unknown>;
    actionInput: unknown;
  }): Promise<SenseExecutionResult> {
    const lifecycle = new LifecycleTracker({
      traceId: input.intent.traceId,
      module: "app",
      logger: createLogger({ module: "app", traceId: input.intent.traceId }),
    });

    const envelope = this.deps.intent.normalize(input.intent, {
      lifecycle,
      traceId: input.intent.traceId,
      source: "app",
    });

    const enriched = this.deps.source.enrich(envelope, {
      lifecycle,
      source: "app",
      meta: {
        app: "signal",
      },
    });

    return this.deps.sense.execute({
      envelope: enriched,
      pulseInput: input.pulseInput,
      action: input.action,
      actionInput: input.actionInput,
      lifecycle,
    });
  }
}
