import { ZodError } from "zod";
import { createSignalEnvelope, createSignalError } from "../protocol";
import {
  createExecutionSuccessMeta,
  throwIfExecutionBlocked,
  toEnvelopeContext,
  toEnvelopeDelivery,
  toSignalFailure,
} from "./execution";
import type { SignalRegistry } from "./registry";
import type { SignalExecutionContext, SignalExecutionResult } from "./types";

export async function executeQuery<TInput, TResult>(
  registry: SignalRegistry,
  name: string,
  input: TInput,
  context: SignalExecutionContext,
): Promise<SignalExecutionResult<TResult>> {
  try {
    throwIfExecutionBlocked(context.request);

    const definition = registry.getQuery(name);
    const validatedInput = definition.inputSchema.parse(input);
    const envelope = createSignalEnvelope({
      kind: "query",
      name,
      payload: validatedInput,
      context: toEnvelopeContext(context.request),
      delivery: toEnvelopeDelivery(context.request),
      source: context.request.source,
      auth: context.request.auth,
    });
    const result = await definition.handler(validatedInput, {
      ...context,
      envelope,
    });
    const validatedResult = definition.resultSchema.parse(result);

    return {
      ok: true,
      result: validatedResult,
      meta: createExecutionSuccessMeta({
        outcome: "completed",
        envelope,
        request: context.request,
        startedAt: context.startedAt,
        idempotency: {
          status: "not-applicable",
        },
      }),
      envelope,
    } as SignalExecutionResult<TResult>;
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        error: createSignalError("VALIDATION_ERROR", error.message, {
          retryable: false,
          details: { issues: error.issues },
        }),
      } as SignalExecutionResult<TResult>;
    }

    return {
      ok: false,
      error: toSignalFailure(error, "EXECUTION_FAILED", "Query failed", {
        traceId: context.request.traceId,
        messageId: context.envelope?.messageId,
      }),
    } as SignalExecutionResult<TResult>;
  }
}
