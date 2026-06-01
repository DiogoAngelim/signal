import { describe, expect, it, vi } from "vitest";
import {
  createProtocolError,
  createSignalEnvelope,
  createSignalError,
  createSignalName,
  createSignalCapabilities,
  fail,
  isSignalEnvelope,
  isSignalName,
  looksPastTense,
  parseSignalName,
  ok,
  validateSignalEnvelope,
  signalCapabilitiesSchema,
  signalErrorSchema,
  signalNameSchema,
  signalResultSchema,
} from "../src";

describe("protocol", () => {
  it("validates envelopes and preserves metadata", () => {
    const envelope = createSignalEnvelope({
      kind: "mutation",
      name: "payment.capture.v1",
      payload: { paymentId: "pay_1" },
      source: {
        system: "checkout",
        transport: "http",
        runtime: "signal-node",
      },
      context: {
        correlationId: "corr-1",
        causationId: "cause-1",
        traceId: "trace-1",
      },
      delivery: {
        mode: "at-least-once",
        attempt: 2,
        consumerId: "consumer-1",
      },
      auth: { actor: "agent" },
      meta: { region: "us-east-1" },
      messageId: "msg-1",
      timestamp: "2026-03-25T12:00:00.000Z",
    });

    expect(validateSignalEnvelope(envelope)).toEqual(envelope);
    expect(isSignalEnvelope(envelope)).toBe(true);
    expect(envelope.source?.transport).toBe("http");
    expect(envelope.delivery?.attempt).toBe(2);
    expect(envelope.meta?.region).toBe("us-east-1");

    const generated = createSignalEnvelope({
      kind: "query",
      name: "user.get.v1",
      payload: { userId: "user_1" },
    });

    expect(generated.messageId).toHaveLength(36);
    expect(generated.timestamp).toContain("T");
  });

  it("validates names and helper functions", () => {
    expect(isSignalName("payment.capture.v1")).toBe(true);
    expect(isSignalName("payment.capture")).toBe(false);
    expect(signalNameSchema.safeParse("payment.capture.v1").success).toBe(true);
    expect(parseSignalName("payment.capture.v1")).toEqual({
      domain: "payment",
      action: "capture",
      version: "v1",
    });
    const parseSpy = vi
      .spyOn(signalNameSchema, "parse")
      .mockReturnValueOnce("broken" as never);
    expect(() => parseSignalName("broken")).toThrow("Invalid Signal name: broken");
    parseSpy.mockRestore();
    expect(createSignalName("payment", "captured")).toBe("payment.captured.v1");
    expect(looksPastTense("captured")).toBe(true);
    expect(looksPastTense("closed")).toBe(true);
    expect(looksPastTense("set")).toBe(true);
    expect(looksPastTense("capture")).toBe(false);
  });

  it("creates results, errors, and capabilities", () => {
    const success = ok({ accepted: true }, { requestId: "req-1" });
    const failure = fail(createSignalError("CONFLICT", "Conflict"));
    const protocolError = createProtocolError("RETRYABLE_ERROR", "Retry later", {
      retryable: true,
      details: { retryAfter: 10 },
    });

    const capabilities = createSignalCapabilities({
      protocol: "signal.v1",
      version: "v1",
      queries: [
        {
          name: "payment.status.v1",
          kind: "query",
          inputSchemaId: "payment-status-input",
          resultSchemaId: "payment-status-result",
        },
      ],
      mutations: [
        {
          name: "payment.capture.v1",
          kind: "mutation",
          inputSchemaId: "payment-capture-input",
          resultSchemaId: "payment-capture-result",
          idempotency: "required",
        },
      ],
      publishedEvents: [
        {
          name: "payment.captured.v1",
          kind: "event",
          inputSchemaId: "payment-captured-input",
        },
      ],
      subscribedEvents: [
        {
          name: "ledger.entry.created.v1",
          kind: "event",
        },
      ],
      bindings: {
        inProcess: true,
        http: { basePath: "/signal" },
      },
    });

    expect(signalResultSchema.parse(success)).toEqual(success);
    expect(signalResultSchema.parse(failure)).toEqual(failure);
    expect(signalErrorSchema.parse(protocolError)).toMatchObject({
      code: "RETRYABLE_ERROR",
      retryable: true,
    });
    expect(capabilities.queries).toHaveLength(1);
    expect(signalCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
  });
});
