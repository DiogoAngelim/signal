import { randomUUID } from "node:crypto";
import { signalKinds, signalProtocolVersion } from "@digelim/12.signal";
import type { SignalEnvelope } from "@digelim/12.signal";
import type { LocalSignalRecord } from "@digelim/13.store";
import type {
  ReceiveEnvelopeOptions,
  ReceivedResult,
  SignalContextEnvelope,
  ValidationIssue,
} from "./contracts";
import { createFrameworkError, createFrameworkErrorCause } from "./errors";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isValidKind = (value: unknown): boolean =>
  typeof value === "string" &&
  (signalKinds as readonly string[]).includes(value);

const isValidTimestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const createIssue = (
  path: string,
  message: string,
  rule: string,
): ValidationIssue => ({
  path,
  message,
  rule,
});

const getTraceIdFromEnvelope = (
  envelope: Record<string, unknown>,
): string | undefined => {
  if (isNonEmptyString(envelope.traceId)) {
    return envelope.traceId;
  }

  if (
    isRecord(envelope.context) &&
    isNonEmptyString(envelope.context.traceId)
  ) {
    return envelope.context.traceId;
  }

  return undefined;
};

const collectReceivableIssues = (
  input: unknown,
): { issues: ValidationIssue[]; protocolInvalid: boolean } => {
  const issues: ValidationIssue[] = [];
  let protocolInvalid = false;

  if (!isRecord(input)) {
    issues.push(createIssue("", "Envelope must be an object", "type.object"));
    return { issues, protocolInvalid };
  }

  const envelope = input as Record<string, unknown>;

  if ("protocol" in envelope && envelope.protocol !== undefined) {
    if (envelope.protocol !== signalProtocolVersion) {
      protocolInvalid = true;
      issues.push(
        createIssue(
          "protocol",
          "Protocol must be signal.v1",
          "protocol.expected",
        ),
      );
    }
  }

  if (!("kind" in envelope)) {
    issues.push(createIssue("kind", "Kind is required", "kind.required"));
  } else if (!isValidKind(envelope.kind)) {
    issues.push(
      createIssue(
        "kind",
        "Kind must be query, mutation, or event",
        "kind.allowed",
      ),
    );
  }

  if (!("name" in envelope)) {
    issues.push(createIssue("name", "Name is required", "name.required"));
  } else if (!isNonEmptyString(envelope.name)) {
    issues.push(
      createIssue("name", "Name must be a non-empty string", "name.type"),
    );
  }

  if (!hasOwn(envelope, "payload") || envelope.payload === undefined) {
    issues.push(
      createIssue("payload", "Payload is required", "payload.required"),
    );
  }

  if (
    "messageId" in envelope &&
    envelope.messageId !== undefined &&
    !isNonEmptyString(envelope.messageId)
  ) {
    issues.push(
      createIssue(
        "messageId",
        "Message ID must be a non-empty string",
        "messageId.type",
      ),
    );
  }

  if (
    "traceId" in envelope &&
    envelope.traceId !== undefined &&
    !isNonEmptyString(envelope.traceId)
  ) {
    issues.push(
      createIssue(
        "traceId",
        "Trace ID must be a non-empty string",
        "traceId.type",
      ),
    );
  }

  if (
    "timestamp" in envelope &&
    envelope.timestamp !== undefined &&
    !isValidTimestamp(envelope.timestamp)
  ) {
    issues.push(
      createIssue(
        "timestamp",
        "Timestamp must be an ISO date-time string",
        "timestamp.format",
      ),
    );
  }

  if ("meta" in envelope && envelope.meta !== undefined) {
    if (!isRecord(envelope.meta)) {
      issues.push(createIssue("meta", "Meta must be an object", "meta.type"));
    }
  }

  return { issues, protocolInvalid };
};

export async function receiveEnvelope(
  input: SignalEnvelope | unknown,
  options: ReceiveEnvelopeOptions = {},
): Promise<ReceivedResult> {
  const { issues, protocolInvalid } = collectReceivableIssues(input);

  if (issues.length > 0) {
    const traceId = isRecord(input) ? getTraceIdFromEnvelope(input) : undefined;
    const error = createFrameworkError(
      protocolInvalid ? "PROTOCOL_ERROR" : "VALIDATION_ERROR",
      "Envelope intake failed",
      { traceId, details: { issues } },
    );

    return { ok: false, error };
  }

  const envelope = input as Record<string, unknown>;
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;
  const traceId = getTraceIdFromEnvelope(envelope) ?? idFactory();
  const messageId = isNonEmptyString(envelope.messageId)
    ? envelope.messageId
    : idFactory();
  const receivedAt = now();
  const timestamp = isValidTimestamp(envelope.timestamp)
    ? envelope.timestamp
    : receivedAt;

  const receivedEnvelope: SignalContextEnvelope = {
    ...(envelope as SignalEnvelope),
    protocol: signalProtocolVersion,
    messageId,
    timestamp,
    traceId,
    lifecycle: "received",
    receivedAt,
  };

  if (options.store) {
    try {
      const existing = await options.store.getByMessageId(messageId);
      if (!existing) {
        const meta = isRecord(envelope.meta)
          ? {
            idempotencyKey: isNonEmptyString(envelope.meta.idempotencyKey)
              ? envelope.meta.idempotencyKey
              : undefined,
            replay:
              typeof envelope.meta.replay === "boolean"
                ? envelope.meta.replay
                : undefined,
          }
          : undefined;

        const record: LocalSignalRecord = {
          id: idFactory(),
          traceId,
          messageId,
          protocol: signalProtocolVersion,
          kind: receivedEnvelope.kind,
          name: receivedEnvelope.name,
          lifecycle: "received",
          payload: receivedEnvelope.payload,
          meta,
          source: receivedEnvelope.source,
          timestamp: receivedEnvelope.timestamp,
          createdAt: receivedAt,
          updatedAt: receivedAt,
          synced: false,
          syncAttempts: 0,
        };

        await options.store.append(record);
      }
    } catch (error) {
      return {
        ok: false,
        error: createFrameworkError(
          "SYNC_ERROR",
          "Failed to persist envelope",
          {
            traceId,
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        ),
      };
    }
  }

  return { ok: true, value: receivedEnvelope };
}

export function isReceivedEnvelope(
  input: unknown,
): input is SignalContextEnvelope {
  if (!isRecord(input)) {
    return false;
  }

  if (input.lifecycle !== "received") {
    return false;
  }

  if (input.protocol !== signalProtocolVersion) {
    return false;
  }

  if (!isValidKind(input.kind)) {
    return false;
  }

  if (!isNonEmptyString(input.name)) {
    return false;
  }

  if (!isNonEmptyString(input.messageId)) {
    return false;
  }

  if (!isValidTimestamp(input.timestamp)) {
    return false;
  }

  if (!isNonEmptyString(input.traceId)) {
    return false;
  }

  if (!hasOwn(input, "payload") || input.payload === undefined) {
    return false;
  }

  return true;
}

export function assertReceivableEnvelope(input: unknown): void {
  const { issues, protocolInvalid } = collectReceivableIssues(input);

  if (issues.length > 0) {
    const traceId = isRecord(input) ? getTraceIdFromEnvelope(input) : undefined;
    throw createFrameworkErrorCause(
      protocolInvalid ? "PROTOCOL_ERROR" : "VALIDATION_ERROR",
      "Envelope intake failed",
      { traceId, details: { issues } },
    );
  }
}
