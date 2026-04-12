import type { StructuredLogger } from "./observability";
import { createProtocolError } from "./protocol";

export type LifecycleStage =
  | "received"
  | "validated"
  | "enriched"
  | "evaluated"
  | "decided"
  | "executed"
  | "completed";

export type LifecycleEntry = {
  stage: LifecycleStage;
  at: string;
  traceId?: string;
  messageId?: string;
  module?: string;
};

const allowedTransitions: Record<LifecycleStage, LifecycleStage | null> = {
  received: "validated",
  validated: "enriched",
  enriched: "evaluated",
  evaluated: "decided",
  decided: "executed",
  executed: "completed",
  completed: null,
};

const isAllowedTransition = (
  from: LifecycleStage | null,
  to: LifecycleStage,
): boolean => {
  if (from === null) {
    return to === "received";
  }
  return allowedTransitions[from] === to;
};

export class LifecycleTracker {
  private stage: LifecycleStage | null;
  private readonly history: LifecycleEntry[];

  constructor(
    private readonly options: {
      traceId?: string;
      messageId?: string;
      module?: string;
      logger?: StructuredLogger;
      initialStage?: LifecycleStage;
    } = {},
  ) {
    this.stage = options.initialStage ?? null;
    this.history = [];
    if (this.stage) {
      this.history.push({
        stage: this.stage,
        at: new Date().toISOString(),
        traceId: options.traceId,
        messageId: options.messageId,
        module: options.module,
      });
    }
  }

  current(): LifecycleStage | null {
    return this.stage;
  }

  entries(): LifecycleEntry[] {
    return [...this.history];
  }

  transition(next: LifecycleStage): LifecycleEntry {
    if (!isAllowedTransition(this.stage, next)) {
      throw createProtocolError(
        "EXECUTION_FAILED",
        `Invalid lifecycle transition from ${this.stage ?? "none"} to ${next}`,
        {
          details: {
            from: this.stage,
            to: next,
          },
          traceId: this.options.traceId,
          messageId: this.options.messageId,
        },
      );
    }

    this.stage = next;
    const entry: LifecycleEntry = {
      stage: next,
      at: new Date().toISOString(),
      traceId: this.options.traceId,
      messageId: this.options.messageId,
      module: this.options.module,
    };
    this.history.push(entry);

    if (this.options.logger) {
      this.options.logger.info(
        {
          event: "lifecycle.transition",
          stage: entry.stage,
          at: entry.at,
          traceId: entry.traceId,
          messageId: entry.messageId,
          module: entry.module,
        },
        "Lifecycle transition",
      );
    }

    return entry;
  }
}
