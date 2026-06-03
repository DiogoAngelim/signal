import { describe, expect, it } from "vitest";
import type { SignalExecutionResult } from "@signal/runtime";
import { createReferenceRuntime } from "../src/lib";
import type { PaymentCaptureInput } from "../src/operations/high-risk-payment";
import {
  runReferencePostgresProof,
  runReferenceProof,
} from "../src/reference-proof";

function tenantAuth(tenantId: string) {
  return {
    actor: {
      id: "ops_alice",
      type: "operator",
      roles: ["payments"],
    },
    subject: `tenant:${tenantId}`,
    scopes: ["payment:capture", `tenant:${tenantId}`],
  };
}

function paymentCaptureInput(
  overrides: Partial<PaymentCaptureInput> = {},
): PaymentCaptureInput {
  const tenantId = overrides.tenantId ?? "tenant_acme";
  return {
    tenantId,
    authorizationId: overrides.authorizationId ?? "auth_9001",
    amountCents: overrides.amountCents ?? 12500,
    currency: overrides.currency ?? "USD",
    paymentMethod: overrides.paymentMethod ?? {
      token: "tok_live_secret_4242",
      last4: "4242",
    },
    risk: overrides.risk ?? {
      declared: true,
      classification: "high",
      reason: "Customer-visible payment capture moves funds.",
      approvedBy: "ops_alice",
    },
  };
}

function unwrapResult<T>(result: SignalExecutionResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.result;
}

describe("high-risk payment reference flow", () => {
  it("conforms to the high-trust payment capture path", async () => {
    const { runtime, operations } = createReferenceRuntime();
    const input = paymentCaptureInput();

    const first = await runtime.mutation("payment.capture.v1", input, {
      idempotencyKey: "tenant_acme:capture:auth_9001",
      auth: tenantAuth("tenant_acme"),
      correlationId: "corr_payment_capture_1",
    });

    const capture = unwrapResult(first);
    expect(capture).toMatchObject({
      tenantId: "tenant_acme",
      authorizationId: "auth_9001",
      amountCents: 12500,
      currency: "USD",
      status: "captured",
      risk: {
        declared: true,
        classification: "high",
      },
    });

    const store = operations.highRiskPayment.store;
    expect(store.listAuditEntries()).toHaveLength(1);
    expect(store.listOutboxMessages()).toHaveLength(1);
    expect(store.listSubscriberDeliveries()).toHaveLength(1);
    expect(JSON.stringify(store.listAuditEntries())).not.toContain(
      "tok_live_secret_4242",
    );
    expect(JSON.stringify(store.listOutboxMessages())).not.toContain(
      "tok_live_secret_4242",
    );
    expect(JSON.stringify(capture)).not.toContain("tok_live_secret_4242");

    const evidence = await runtime.query(
      "payment.capture.get.v1",
      {
        tenantId: "tenant_acme",
        captureId: capture.captureId,
      },
      {
        auth: tenantAuth("tenant_acme"),
      },
    );
    const evidenceResult = unwrapResult(evidence);
    expect(evidenceResult).toMatchObject({
      found: true,
      capture: {
        captureId: capture.captureId,
      },
      audit: [
        {
          auditId: capture.auditId,
          actorId: "ops_alice",
        },
      ],
      outbox: [
        {
          outboxId: capture.outboxId,
          eventName: "payment.captured.v1",
          status: "pending",
        },
      ],
      subscriberDeliveries: [
        {
          consumerId: "reference-payment-ledger",
          eventName: "payment.captured.v1",
          captureId: capture.captureId,
        },
      ],
    });
    expect(JSON.stringify(evidenceResult)).not.toContain(
      "tok_live_secret_4242",
    );

    const wrongTenantEvidence = unwrapResult(
      await runtime.query(
        "payment.capture.get.v1",
        {
          tenantId: "tenant_other",
          captureId: capture.captureId,
        },
        {
          auth: tenantAuth("tenant_other"),
        },
      ),
    );
    expect(wrongTenantEvidence).toEqual({
      found: false,
      capture: null,
      audit: [],
      outbox: [],
      subscriberDeliveries: [],
    });

    const replay = await runtime.mutation("payment.capture.v1", input, {
      idempotencyKey: "tenant_acme:capture:auth_9001",
      auth: tenantAuth("tenant_acme"),
      correlationId: "corr_payment_capture_1",
    });
    const replayedCapture = unwrapResult(replay);
    expect(replayedCapture).toEqual(capture);
    expect(replay.ok ? replay.meta.replay?.replayed : false).toBe(true);
    expect(store.listAuditEntries()).toHaveLength(1);
    expect(store.listOutboxMessages()).toHaveLength(1);
    expect(store.listSubscriberDeliveries()).toHaveLength(1);

    const outboxMessage = store.listOutboxMessages()[0];
    expect(outboxMessage).toBeDefined();
    if (!outboxMessage) throw new Error("expected outbox message");
    await runtime.dispatcher.dispatch(outboxMessage.envelope);
    expect(store.listSubscriberDeliveries()).toHaveLength(1);
  });

  it("certifies the reference-server controls in capabilities and through a query", async () => {
    const { runtime } = createReferenceRuntime();
    const capabilities = runtime.capabilities();

    expect(capabilities.mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "payment.capture.v1",
          idempotency: "required",
          emits: ["payment.captured.v1"],
        }),
      ]),
    );
    expect(capabilities.subscribedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "payment.captured.v1",
          consumerId: "reference-payment-ledger",
          replaySafe: true,
        }),
      ]),
    );

    const certification = unwrapResult(
      await runtime.query("reference.certification.v1", {}),
    );
    expect(certification.passed).toBe(true);
    expect(certification.checks.map((check) => check.name)).toEqual([
      "risk-declared mutation",
      "scoped idempotency",
      "tenant isolation",
      "authorization-before-handler",
      "audit hook",
      "redaction hook",
      "transactional outbox",
      "subscriber dedupe",
      "conformance tests",
      "adversarial tests",
      "certification check",
      "high-risk reference flow",
    ]);
  });

  it("runs the five-minute reference proof", async () => {
    const proof = await runReferenceProof();

    expect(proof).toMatchObject({
      proof: "signal-reference-proof.v1",
      passed: true,
      mutation: "payment.capture.v1",
      event: "payment.captured.v1",
      certification: "reference.certification.v1",
    });
    expect(proof.steps.map((step) => step.name)).toEqual([
      "high-risk mutation declaration",
      "authorization-before-handler",
      "execute dangerous mutation",
      "observe replay",
      "observe conflict",
      "observe audit trail",
      "observe tenant isolation",
      "observe emitted events",
      "run certification",
    ]);
  });

  it("fails fast when the durable Postgres proof has no database url", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      await expect(runReferencePostgresProof()).rejects.toThrow(
        /DATABASE_URL is required/,
      );
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  it("blocks adversarial inputs without committing capture, audit, or outbox state", async () => {
    const { runtime, operations } = createReferenceRuntime();
    const store = operations.highRiskPayment.store;

    const missingRisk = await runtime.mutation(
      "payment.capture.v1",
      {
        ...paymentCaptureInput(),
        risk: {
          declared: false,
          classification: "high",
          reason: "not actually declared",
          approvedBy: "ops_alice",
        },
      },
      {
        idempotencyKey: "tenant_acme:capture:missing_risk",
        auth: tenantAuth("tenant_acme"),
      },
    );
    expect(missingRisk).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
      },
    });

    const crossTenant = await runtime.mutation(
      "payment.capture.v1",
      paymentCaptureInput({ authorizationId: "auth_cross_tenant" }),
      {
        idempotencyKey: "tenant_acme:capture:cross_tenant",
        auth: tenantAuth("tenant_other"),
      },
    );
    expect(crossTenant).toMatchObject({
      ok: false,
      error: {
        code: "FORBIDDEN",
      },
    });

    expect(store.listAuditEntries()).toHaveLength(0);
    expect(store.listOutboxMessages()).toHaveLength(0);
    expect(store.listSubscriberDeliveries()).toHaveLength(0);
  });

  it("authorizes before idempotency reservation so rejected callers cannot poison a retry key", async () => {
    const { runtime, operations } = createReferenceRuntime();
    const input = paymentCaptureInput({ authorizationId: "auth_pre_auth" });

    const rejected = await runtime.mutation("payment.capture.v1", input, {
      idempotencyKey: "tenant_acme:capture:auth_pre_auth",
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
      },
    });

    const accepted = await runtime.mutation("payment.capture.v1", input, {
      idempotencyKey: "tenant_acme:capture:auth_pre_auth",
      auth: tenantAuth("tenant_acme"),
    });
    const capture = unwrapResult(accepted);
    expect(capture.authorizationId).toBe("auth_pre_auth");
    expect(operations.highRiskPayment.store.listOutboxMessages()).toHaveLength(
      1,
    );
  });

  it("keeps idempotency tenant-scoped and rejects key reuse with changed intent", async () => {
    const { runtime, operations } = createReferenceRuntime();
    const acmeInput = paymentCaptureInput({ authorizationId: "auth_scope" });
    const otherInput = paymentCaptureInput({
      tenantId: "tenant_other",
      authorizationId: "auth_scope",
    });

    unwrapResult(
      await runtime.mutation("payment.capture.v1", acmeInput, {
        idempotencyKey: "tenant_acme:capture:auth_scope",
        auth: tenantAuth("tenant_acme"),
      }),
    );
    unwrapResult(
      await runtime.mutation("payment.capture.v1", otherInput, {
        idempotencyKey: "tenant_other:capture:auth_scope",
        auth: tenantAuth("tenant_other"),
      }),
    );

    const conflict = await runtime.mutation(
      "payment.capture.v1",
      paymentCaptureInput({
        authorizationId: "auth_scope",
        amountCents: 13000,
      }),
      {
        idempotencyKey: "tenant_acme:capture:auth_scope",
        auth: tenantAuth("tenant_acme"),
      },
    );

    expect(conflict).toMatchObject({
      ok: false,
      error: {
        code: "IDEMPOTENCY_CONFLICT",
      },
    });
    expect(operations.highRiskPayment.store.listOutboxMessages()).toHaveLength(
      2,
    );
  });
});
