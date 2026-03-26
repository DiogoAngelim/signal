import {
  createSignalEnvelope,
  createSignalError,
  type SignalErrorCode,
} from "@signal/protocol";
import type { SignalExecutionContext, SignalExecutionResult } from "./types";
import type { SignalRegistry } from "./registry";
import { ZodError } from "zod";

export async function executeQuery<TInput, TResult>(
  registry: SignalRegistry,
  name: string,
  input: TInput,
  context: SignalExecutionContext
): Promise<SignalExecutionResult<TResult>> {
  try {
    const definition = registry.getQuery(name);
    const validatedInput = definition.inputSchema.parse(input);
    const envelope = createSignalEnvelope({
      kind: "query",
      name,
      payload: validatedInput,
      context: {
        correlationId: context.request.correlationId,
        causationId: context.request.causationId,
        traceId: context.request.traceId,
      },
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

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
    ) {
      const retryableValue = (error as { retryable?: unknown }).retryable;
      const detailsValue = (error as { details?: unknown }).details;

      return {
        ok: false,
        error: createSignalError(
          (error as { code: SignalErrorCode }).code,
          error instanceof Error ? error.message : "Query failed",
          {
            retryable: typeof retryableValue === "boolean" ? retryableValue : undefined,
            details:
              typeof detailsValue === "object" && detailsValue !== null
                ? (detailsValue as Record<string, unknown>)
                : undefined,
          }
        ),
      } as SignalExecutionResult<TResult>;
    }

    return {
      ok: false,
      error: createSignalError("INTERNAL_ERROR", "Query failed", {
        retryable: true,
      }),
    } as SignalExecutionResult<TResult>;
  }
}
