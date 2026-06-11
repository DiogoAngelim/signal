import type { EventPort, StoragePort } from "@signal/ports";
import {
  type SignalEnvelope,
  type SignalErrorEnvelope,
  createSignalEnvelope,
  createSignalError,
} from "@signal/protocol";
import { ZodError } from "zod";
import { dispatchEvent } from "./event";
import {
  createExecutionSuccessMeta,
  createNestedExecutionContext,
  throwIfExecutionBlocked,
  toEnvelopeContext,
  toEnvelopeDelivery,
  toSignalFailure,
} from "./execution";
import { fingerprint } from "./hash";
import type { SignalRegistry } from "./registry";
import type { SignalExecutionContext, SignalExecutionResult } from "./types";

function toFailure<TResult>(
  error: SignalErrorEnvelope,
): SignalExecutionResult<TResult> {
  return { ok: false, error } as SignalExecutionResult<TResult>;
}

export async function executeMutation<TInput, TResult>(
  registry: SignalRegistry,
  eventPort: EventPort,
  storagePort: StoragePort | undefined,
  name: string,
  input: TInput,
  context: SignalExecutionContext,
  idempotencyKey?: string,
): Promise<SignalExecutionResult<TResult>> {
  let definition: ReturnType<SignalRegistry["getMutation"]> | undefined;
  let payloadFingerprint = "";
  let reservedRecord = false;

  try {
    throwIfExecutionBlocked(context.request);

    definition = registry.getMutation(name);
    const validatedInput = definition.inputSchema.parse(input);
    const normalizedIdempotencyInput = definition.normalizeIdempotencyInput
      ? definition.normalizeIdempotencyInput(validatedInput)
      : validatedInput;

    const envelope = createSignalEnvelope({
      kind: "mutation",
      name,
      payload: validatedInput,
      context: toEnvelopeContext(context.request),
      delivery: toEnvelopeDelivery(context.request),
      source: context.request.source,
      auth: context.request.auth,
    }) as SignalEnvelope<TInput>;
    payloadFingerprint = fingerprint({
      kind: "mutation",
      name,
      payload: normalizedIdempotencyInput,
      auth: context.request.auth ?? null,
    });

    if (definition.authorize) {
      await definition.authorize(validatedInput, {
        request: context.request,
        envelope,
        startedAt: context.startedAt,
        emit: async () => {
          throw new Error("emit is only available inside mutation handlers");
        },
      });
    }

    if (definition.idempotency === "required" && !idempotencyKey) {
      return toFailure<TResult>(
        createSignalError(
          "BAD_REQUEST",
          "An idempotency key is required for this mutation",
        ),
      );
    }

    if (
      storagePort &&
      idempotencyKey &&
      definition &&
      definition.idempotency !== "none"
    ) {
      const reservation = await storagePort.reserve({
        operationName: name,
        idempotencyKey,
        payloadFingerprint,
      });

      if (reservation.state === "conflict") {
        return toFailure<TResult>(
          createSignalError(
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was reused with different input",
          ),
        );
      }

      if (reservation.state === "inflight") {
        return toFailure<TResult>(
          createSignalError(
            "RETRYABLE_ERROR",
            "The same mutation is already in flight",
            {
              details: {
                idempotencyKey,
                operationName: name,
              },
            },
          ),
        );
      }

      if (reservation.state === "replayed" && reservation.record) {
        if (reservation.record.status === "completed") {
          return {
            ok: true,
            result: reservation.record.result as TResult,
            meta: createExecutionSuccessMeta({
              outcome: "replayed",
              envelope,
              request: context.request,
              startedAt: context.startedAt,
              idempotency: {
                key: idempotencyKey,
                status: "replayed",
                fingerprint: reservation.record.payloadFingerprint,
              },
              replay: {
                replayed: true,
                reason: "idempotency",
                originalMessageId: reservation.record.messageId,
              },
            }),
            envelope,
          };
        }

        if (
          reservation.record.status === "failed" &&
          reservation.record.error
        ) {
          return toFailure<TResult>(reservation.record.error);
        }
      }

      reservedRecord = reservation.state === "reserved";
    }

    const emittedEvents: SignalEnvelope[] = [];
    const executionContext: SignalExecutionContext = {
      request: context.request,
      envelope,
      startedAt: context.startedAt,
      emit: async <TPayload>(
        eventName: string,
        payload: TPayload,
        meta?: Record<string, unknown>,
      ) => {
        const eventEnvelope = await dispatchEvent(
          registry,
          undefined,
          eventName,
          payload,
          createNestedExecutionContext(context, envelope),
          meta,
        );
        emittedEvents.push(eventEnvelope);
        return eventEnvelope;
      },
    };

    const result = await definition.handler(validatedInput, executionContext);
    const validatedResult = definition.resultSchema.parse(result);

    for (const eventEnvelope of emittedEvents) {
      await eventPort.dispatch(eventEnvelope);
    }

    if (
      storagePort &&
      idempotencyKey &&
      definition &&
      definition.idempotency !== "none"
    ) {
      const meta = createExecutionSuccessMeta({
        outcome: "completed",
        envelope,
        request: context.request,
        startedAt: context.startedAt,
        idempotency: {
          key: idempotencyKey,
          status: "recorded",
          fingerprint: payloadFingerprint,
        },
        replay: {
          replayed: false,
        },
      });

      await storagePort.complete({
        operationName: name,
        idempotencyKey,
        payloadFingerprint,
        result: validatedResult,
        resultMeta: meta,
        messageId: envelope.messageId,
      });

      return {
        ok: true,
        result: validatedResult as TResult,
        meta,
        envelope,
      };
    }

    return {
      ok: true,
      result: validatedResult as TResult,
      meta: createExecutionSuccessMeta({
        outcome: "completed",
        envelope,
        request: context.request,
        startedAt: context.startedAt,
        idempotency: {
          status: "not-applicable",
        },
        replay: {
          replayed: false,
        },
      }),
      envelope,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const failure = createSignalError("VALIDATION_ERROR", error.message, {
        details: { issues: error.issues },
      });

      if (
        reservedRecord &&
        storagePort &&
        idempotencyKey &&
        definition &&
        definition.idempotency !== "none"
      ) {
        await storagePort.fail({
          operationName: name,
          idempotencyKey,
          payloadFingerprint,
          error: failure,
        });
      }

      return toFailure<TResult>(failure);
    }

    const failure = toSignalFailure(error, "INTERNAL_ERROR", "Mutation failed");

    if (
      reservedRecord &&
      storagePort &&
      idempotencyKey &&
      definition &&
      definition.idempotency !== "none"
    ) {
      await storagePort.fail({
        operationName: name,
        idempotencyKey,
        payloadFingerprint,
        error: failure,
      });
    }

    return toFailure<TResult>(failure);
  }
}
