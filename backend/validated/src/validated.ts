import { randomUUID } from "node:crypto";
import {
  signalKinds,
  signalNamePattern,
  signalProtocolVersion,
} from "@digelim/12.signal";
import type { LocalSignalRecord } from "@digelim/13.store";
import type {
  SignalContextEnvelope,
  ValidateEnvelopeOptions,
  ValidationIssue,
  ValidationResult,
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

const isValidTimestamp = (value: unknown): boolean =>
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

const collectStructuralIssues = (
  envelope: Record<string, unknown>,
): { issues: ValidationIssue[]; protocolInvalid: boolean } => {
  const issues: ValidationIssue[] = [];
  let protocolInvalid = false;

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

  if (!isValidKind(envelope.kind)) {
    issues.push(
      createIssue(
        "kind",
        "Kind must be query, mutation, or event",
        "kind.allowed",
      ),
    );
  }

  if (!isNonEmptyString(envelope.name)) {
    issues.push(createIssue("name", "Name is required", "name.required"));
  } else if (!validateOperationName(envelope.name)) {
    issues.push(
      createIssue(
        "name",
        "Name must match <domain>.<operation>.v#",
        "name.format",
      ),
    );
  }

  if (!isNonEmptyString(envelope.messageId)) {
    issues.push(
      createIssue(
        "messageId",
        "Message ID must be a non-empty string",
        "messageId.required",
      ),
    );
  }

  if (!isValidTimestamp(envelope.timestamp)) {
    issues.push(
      createIssue(
        "timestamp",
        "Timestamp must be an ISO date-time string",
        "timestamp.format",
      ),
    );
  }

  if (!isNonEmptyString(envelope.traceId)) {
    issues.push(
      createIssue(
        "traceId",
        "Trace ID must be a non-empty string",
        "traceId.required",
      ),
    );
  }

  if (!hasOwn(envelope, "payload") || envelope.payload === undefined) {
    issues.push(
      createIssue("payload", "Payload is required", "payload.required"),
    );
  }

  if ("meta" in envelope && envelope.meta !== undefined) {
    if (!isRecord(envelope.meta)) {
      issues.push(createIssue("meta", "Meta must be an object", "meta.type"));
    } else {
      const allowedMetaKeys = new Set(["idempotencyKey", "replay"]);
      for (const key of Object.keys(envelope.meta)) {
        if (!allowedMetaKeys.has(key)) {
          issues.push(
            createIssue(`meta.${key}`, "Unknown meta field", "meta.allowed"),
          );
        }
      }

      if (
        "idempotencyKey" in envelope.meta &&
        envelope.meta.idempotencyKey !== undefined &&
        !isNonEmptyString(envelope.meta.idempotencyKey)
      ) {
        issues.push(
          createIssue(
            "meta.idempotencyKey",
            "Idempotency key must be a non-empty string",
            "meta.idempotencyKey",
          ),
        );
      }

      if (
        "replay" in envelope.meta &&
        envelope.meta.replay !== undefined &&
        typeof envelope.meta.replay !== "boolean"
      ) {
        issues.push(
          createIssue("meta.replay", "Replay must be a boolean", "meta.replay"),
        );
      }
    }
  }

  return { issues, protocolInvalid };
};

export function validateOperationName(name: string): boolean {
  return signalNamePattern.test(name);
}

export async function validateEnvelope(
  input: SignalContextEnvelope,
  options: ValidateEnvelopeOptions = {},
): Promise<ValidationResult> {
  if (!isRecord(input)) {
    const issues = [
      createIssue("", "Envelope must be an object", "type.object"),
    ];
    return {
      ok: false,
      error: createFrameworkError("VALIDATION_ERROR", "Envelope invalid", {
        details: { issues },
      }),
      issues,
    };
  }

  if (input.lifecycle !== "received") {
    const issues = [
      createIssue(
        "lifecycle",
        "Envelope must be in received state",
        "lifecycle.transition",
      ),
    ];

    return {
      ok: false,
      error: createFrameworkError("TRANSITION_ERROR", "Invalid lifecycle", {
        traceId: isNonEmptyString(input.traceId) ? input.traceId : undefined,
        details: { from: input.lifecycle, to: "validated", issues },
      }),
      issues,
    };
  }

  const { issues, protocolInvalid } = collectStructuralIssues(input);

  if (issues.length > 0) {
    const errorCode = protocolInvalid ? "PROTOCOL_ERROR" : "VALIDATION_ERROR";

    return {
      ok: false,
      error: createFrameworkError(errorCode, "Envelope validation failed", {
        traceId: isNonEmptyString(input.traceId) ? input.traceId : undefined,
        details: { issues },
      }),
      issues,
    };
  }

  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? randomUUID;
  const validatedAt = now();
  const validatedEnvelope: SignalContextEnvelope = {
    ...input,
    lifecycle: "validated",
    validatedAt,
  };

  if (options.store) {
    try {
      const existing = await options.store.getByMessageId(
        validatedEnvelope.messageId,
      );
      const meta = validatedEnvelope.meta
        ? {
          idempotencyKey: validatedEnvelope.meta.idempotencyKey,
          replay: validatedEnvelope.meta.replay,
        }
        : undefined;

      if (existing) {
        const updatedRecord: LocalSignalRecord = {
          ...existing,
          protocol: validatedEnvelope.protocol,
          kind: validatedEnvelope.kind,
          name: validatedEnvelope.name,
          lifecycle: "validated",
          payload: validatedEnvelope.payload,
          meta,
          source: validatedEnvelope.source,
          timestamp: validatedEnvelope.timestamp,
          traceId: validatedEnvelope.traceId,
          messageId: validatedEnvelope.messageId,
          updatedAt: validatedAt,
        };

        await options.store.update(updatedRecord);
      } else {
        const record: LocalSignalRecord = {
          id: idFactory(),
          traceId: validatedEnvelope.traceId,
          messageId: validatedEnvelope.messageId,
          protocol: validatedEnvelope.protocol,
          kind: validatedEnvelope.kind,
          name: validatedEnvelope.name,
          lifecycle: "validated",
          payload: validatedEnvelope.payload,
          meta,
          source: validatedEnvelope.source,
          timestamp: validatedEnvelope.timestamp,
          createdAt: validatedAt,
          updatedAt: validatedAt,
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
            traceId: isNonEmptyString(validatedEnvelope.traceId)
              ? validatedEnvelope.traceId
              : undefined,
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        ),
        issues: [],
      };
    }
  }

  return { ok: true, value: validatedEnvelope };
}

export function isValidatedEnvelope(
  input: unknown,
): input is SignalContextEnvelope {
  if (!isRecord(input)) {
    return false;
  }

  if (input.lifecycle !== "validated") {
    return false;
  }

  return collectStructuralIssues(input).issues.length === 0;
}

export function assertValidatedEnvelope(input: SignalContextEnvelope): void {
  if (!isRecord(input)) {
    throw createFrameworkErrorCause(
      "VALIDATION_ERROR",
      "Envelope must be an object",
    );
  }

  if (input.lifecycle !== "validated") {
    throw createFrameworkErrorCause(
      "TRANSITION_ERROR",
      "Envelope must be validated",
      { traceId: isNonEmptyString(input.traceId) ? input.traceId : undefined },
    );
  }

  const { issues, protocolInvalid } = collectStructuralIssues(input);

  if (issues.length > 0) {
    throw createFrameworkErrorCause(
      protocolInvalid ? "PROTOCOL_ERROR" : "VALIDATION_ERROR",
      "Envelope validation failed",
      {
        traceId: isNonEmptyString(input.traceId) ? input.traceId : undefined,
        details: { issues },
      },
    );
  }
}
