import {
  type LifecycleTracker,
  type SignalIdempotencyStore,
  fingerprint,
} from "@digelim/12.signal";

export type ActionResult = {
  status: "pending" | "completed" | "failed";
  result: true | false | null;
  effects: unknown[];
  latency: number;
  errors?: string[];
};

export type ActionDefinition<TInput = unknown> = {
  name: string;
  idempotency?: "required" | "optional" | "none";
  handler: (
    input: TInput,
  ) => Promise<{ result: true | false | null; effects?: unknown[] }>;
};

export type ActionContext = {
  idempotencyKey?: string;
  traceId?: string;
  lifecycle?: LifecycleTracker;
  idempotencyStore?: SignalIdempotencyStore;
};

export class ActionExecutor {
  async execute<TInput>(
    definition: ActionDefinition<TInput>,
    input: TInput,
    context: ActionContext = {},
  ): Promise<ActionResult> {
    const startedAt = Date.now();
    const idempotencyKey = context.idempotencyKey;
    const idempotencyStore = context.idempotencyStore;

    context.lifecycle?.transition("executed");

    if (definition.idempotency === "required" && !idempotencyKey) {
      return {
        status: "failed",
        result: false,
        effects: [],
        latency: Date.now() - startedAt,
        errors: ["IDEMPOTENCY_KEY_REQUIRED"],
      };
    }

    let payloadFingerprint = "";
    if (idempotencyKey) {
      payloadFingerprint = fingerprint({ name: definition.name, input });
    }

    if (
      idempotencyStore &&
      idempotencyKey &&
      definition.idempotency !== "none"
    ) {
      const reservation = await idempotencyStore.reserve({
        operationName: definition.name,
        idempotencyKey,
        payloadFingerprint,
      });

      if (reservation.state === "conflict") {
        return {
          status: "failed",
          result: false,
          effects: [],
          latency: Date.now() - startedAt,
          errors: ["IDEMPOTENCY_CONFLICT"],
        };
      }

      if (reservation.state === "inflight") {
        return {
          status: "pending",
          result: null,
          effects: [],
          latency: Date.now() - startedAt,
          errors: ["IDEMPOTENCY_INFLIGHT"],
        };
      }

      if (reservation.state === "replayed" && reservation.record?.result) {
        return reservation.record.result as ActionResult;
      }
    }

    try {
      const outcome = await definition.handler(input);
      const result: ActionResult = {
        status: "completed",
        result: outcome.result,
        effects: outcome.effects ?? [],
        latency: Date.now() - startedAt,
      };

      if (
        idempotencyStore &&
        idempotencyKey &&
        definition.idempotency !== "none"
      ) {
        await idempotencyStore.complete({
          operationName: definition.name,
          idempotencyKey,
          payloadFingerprint,
          result,
        });
      }

      return result;
    } catch (error) {
      const result: ActionResult = {
        status: "failed",
        result: false,
        effects: [],
        latency: Date.now() - startedAt,
        errors: [
          error instanceof Error ? error.message : "ACTION_EXECUTION_FAILED",
        ],
      };

      if (
        idempotencyStore &&
        idempotencyKey &&
        definition.idempotency !== "none"
      ) {
        await idempotencyStore.fail({
          operationName: definition.name,
          idempotencyKey,
          payloadFingerprint,
          error: {
            code: "EXECUTION_FAILED",
            category: "execution",
            message: result.errors?.[0] ?? "Action failed",
            retryable: false,
            traceId: context.traceId,
          },
        });
      }

      return result;
    }
  }
}
