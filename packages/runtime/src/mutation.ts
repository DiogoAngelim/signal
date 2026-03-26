import {
  createSignalEnvelope,
  createSignalError,
  type SignalErrorCode,
  type SignalEnvelope,
  type SignalErrorEnvelope,
} from "@signal/protocol";
import { fingerprint } from "./hash";
import { dispatchEvent } from "./event";
import { ZodError } from "zod";
import type {
  SignalDispatcher,
  SignalExecutionContext,
  SignalExecutionResult,
  SignalIdempotencyStore,
} from "./types";
import type { SignalRegistry } from "./registry";

function toFailure<TResult>(error: SignalErrorEnvelope): SignalExecutionResult<TResult> {
  return { ok: false, error } as SignalExecutionResult<TResult>;
}

export async function executeMutation<TInput, TResult>(
  registry: SignalRegistry,
  dispatcher: SignalDispatcher | undefined,
  idempotencyStore: SignalIdempotencyStore | undefined,
  name: string,
  input: TInput,
  context: SignalExecutionContext,
  idempotencyKey?: string
): Promise<SignalExecutionResult<TResult>> {
  let definition: ReturnType<SignalRegistry["getMutation"]> | undefined;
  let payloadFingerprint = "";

  try {
    definition = registry.getMutation(name);
    const validatedInput = definition.inputSchema.parse(input);
    const envelope = createSignalEnvelope({
      kind: "mutation",
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
    payloadFingerprint = fingerprint({
      kind: "mutation",
      name,
      payload: validatedInput,
      auth: context.request.auth ?? null,
    });

    if (definition.idempotency === "required" && !idempotencyKey) {
      return toFailure<TResult>(
        createSignalError("BAD_REQUEST", "An idempotency key is required for this mutation")
      );
    }

    if (idempotencyStore && idempotencyKey && definition && definition.idempotency !== "none") {
      const reservation = await idempotencyStore.reserve({
        operationName: name,
        idempotencyKey,
        payloadFingerprint,
      });

      if (reservation.state === "conflict") {
        return toFailure<TResult>(
          createSignalError("IDEMPOTENCY_CONFLICT", "The idempotency key was reused with different input")
        );
      }

      if (reservation.state === "inflight") {
        return toFailure<TResult>(
          createSignalError("RETRYABLE_ERROR", "The same mutation is already in flight", {
            retryable: true,
            details: {
              idempotencyKey,
              operationName: name,
            },
          })
        );
      }

      if (reservation.state === "replayed" && reservation.record) {
        if (reservation.record.status === "completed") {
          return {
            ok: true,
            result: reservation.record.result as TResult,
            envelope,
          };
        }

        if (reservation.record.status === "failed" && reservation.record.error) {
          return toFailure<TResult>(reservation.record.error);
        }
      }
    }

    const emittedEvents: SignalEnvelope[] = [];
    const executionContext: SignalExecutionContext = {
      request: context.request,
      envelope,
      emit: async <TPayload>(
        eventName: string,
        payload: TPayload,
        meta?: Record<string, unknown>
      ) => {
        const eventEnvelope = await dispatchEvent(
          registry,
          undefined,
          eventName,
          payload,
          {
            request: {
              ...context.request,
              causationId: envelope.messageId,
            },
            envelope,
            /* c8 ignore next 3 */
            emit: async () => {
              throw new Error("Nested emit is not supported");
            },
          },
          meta
        );
        emittedEvents.push(eventEnvelope);
        return eventEnvelope;
      },
    };

    const result = await definition.handler(validatedInput, executionContext);
    const validatedResult = definition.resultSchema.parse(result);

    for (const eventEnvelope of emittedEvents) {
      await dispatcher?.dispatch(eventEnvelope);
    }

    if (idempotencyStore && idempotencyKey && definition && definition.idempotency !== "none") {
      await idempotencyStore.complete({
        operationName: name,
        idempotencyKey,
        payloadFingerprint,
        result: validatedResult,
        /* c8 ignore next */
        messageId: context.envelope?.messageId,
      });
    }

    return {
      ok: true,
      result: validatedResult as TResult,
      envelope,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const failure = createSignalError("VALIDATION_ERROR", error.message, {
        retryable: false,
        details: { issues: error.issues },
      });

      if (idempotencyStore && idempotencyKey && definition) {
        await idempotencyStore.fail({
          operationName: name,
          idempotencyKey,
          payloadFingerprint: fingerprint({
            kind: "mutation",
            name,
            payload: input,
            auth: context.request.auth ?? null,
          }),
          error: failure,
        });
      }

      return toFailure<TResult>(failure);
    }

    const failure =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code?: unknown }).code
        ? createSignalError(
            (error as { code: SignalErrorCode }).code,
            error instanceof Error ? error.message : "Mutation failed",
            {
              retryable:
                typeof (error as { retryable?: unknown }).retryable === "boolean"
                  ? ((error as { retryable?: unknown }).retryable as boolean)
                  : undefined,
              details:
                typeof (error as { details?: unknown }).details === "object" &&
                (error as { details?: unknown }).details !== null
                  ? ((error as { details?: unknown }).details as Record<string, unknown>)
                  : undefined,
            }
          )
        : error instanceof Error
          ? createSignalError("INTERNAL_ERROR", error.message, { retryable: true })
          : createSignalError("INTERNAL_ERROR", "Unknown mutation failure", {
              retryable: true,
            });

    if (idempotencyStore && idempotencyKey && definition && definition.idempotency !== "none") {
      await idempotencyStore.fail({
        operationName: name,
        idempotencyKey,
        payloadFingerprint,
        error: failure,
      });
    }

    return toFailure<TResult>(failure);
  }
}
