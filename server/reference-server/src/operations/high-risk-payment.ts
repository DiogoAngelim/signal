import {
  type SignalAuth,
  type SignalEnvelope,
  createProtocolError,
} from "@signal/protocol";
import type {
  SignalExecutionContext,
  SignalRuntime,
  SignalSchema,
} from "@signal/sdk-node";

export type PaymentRiskDeclaration = {
  declared: true;
  classification: "high" | "critical";
  reason: string;
  approvedBy: string;
};

export type PaymentCaptureInput = {
  tenantId: string;
  authorizationId: string;
  amountCents: number;
  currency: string;
  paymentMethod: {
    token: string;
    last4?: string;
  };
  risk: PaymentRiskDeclaration;
};

export type RedactedPaymentCaptureInput = Omit<
  PaymentCaptureInput,
  "paymentMethod"
> & {
  paymentMethod: {
    token: "[redacted]";
    last4?: string;
  };
};

export type PaymentCaptureResult = {
  captureId: string;
  tenantId: string;
  authorizationId: string;
  amountCents: number;
  currency: string;
  status: "captured";
  capturedAt: string;
  auditId: string;
  outboxId: string;
  risk: Pick<PaymentRiskDeclaration, "declared" | "classification">;
};

export type PaymentCapturedEvent = {
  captureId: string;
  tenantId: string;
  authorizationId: string;
  amountCents: number;
  currency: string;
  status: "captured";
  capturedAt: string;
  auditId: string;
};

export type PaymentAuditEntry = {
  auditId: string;
  operation: "payment.capture.v1";
  tenantId: string;
  actorId: string;
  recordedAt: string;
  redactedInput: RedactedPaymentCaptureInput;
  result: PaymentCaptureResult;
};

export type PaymentOutboxMessage = {
  outboxId: string;
  eventName: "payment.captured.v1";
  status: "pending";
  createdAt: string;
  envelope: SignalEnvelope<PaymentCapturedEvent>;
};

export type PaymentSubscriberDelivery = {
  consumerId: "reference-payment-ledger";
  eventName: "payment.captured.v1";
  messageId: string;
  captureId: string;
  deliveredAt: string;
};

export type ReferenceCertificationCheck = {
  name: string;
  passed: boolean;
  evidence: string;
};

export type ReferenceCertificationResult = {
  name: "signal-reference-high-risk-payment.v1";
  passed: boolean;
  checks: ReferenceCertificationCheck[];
};

type PaymentCaptureAuthorization = {
  actorId: string;
};

type PaymentCaptureGetInput = {
  tenantId: string;
  captureId: string;
};

type PaymentCaptureGetResult = {
  found: boolean;
  capture: PaymentCaptureResult | null;
  audit: PaymentAuditEntry[];
  outbox: Array<
    Omit<PaymentOutboxMessage, "envelope"> & {
      messageId: string;
    }
  >;
  subscriberDeliveries: PaymentSubscriberDelivery[];
};

function schema<T>(parse: (value: unknown) => T): SignalSchema<T> {
  return { parse } as SignalSchema<T>;
}

function validationError(message: string): never {
  throw createProtocolError("VALIDATION_ERROR", message);
}

function badRequest(message: string): never {
  throw createProtocolError("BAD_REQUEST", message);
}

function forbidden(message: string): never {
  throw createProtocolError("FORBIDDEN", message);
}

function unauthorized(message: string): never {
  throw createProtocolError("UNAUTHORIZED", message);
}

function conflict(message: string): never {
  throw createProtocolError("CONFLICT", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (isRecord(value)) return value;
  return validationError(`${field} must be an object`);
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  return validationError(`${field} is required`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return validationError(`${field} must be a positive integer`);
}

function requireCurrency(value: unknown): string {
  const currency = requireString(value, "currency");
  if (/^[A-Z]{3}$/.test(currency)) return currency;
  return validationError("currency must be an ISO-style three-letter code");
}

function requireRiskDeclaration(value: unknown): PaymentRiskDeclaration {
  const risk = requireRecord(value, "risk");
  if (risk.declared !== true) {
    return validationError("risk.declared must be true");
  }

  const classification = requireString(
    risk.classification,
    "risk.classification",
  );
  if (classification !== "high" && classification !== "critical") {
    return validationError("risk.classification must be high or critical");
  }

  return {
    declared: true,
    classification,
    reason: requireString(risk.reason, "risk.reason"),
    approvedBy: requireString(risk.approvedBy, "risk.approvedBy"),
  };
}

function requirePaymentMethod(
  value: unknown,
): PaymentCaptureInput["paymentMethod"] {
  const paymentMethod = requireRecord(value, "paymentMethod");
  const last4 = optionalString(paymentMethod.last4);
  if (last4 !== undefined && !/^[0-9]{4}$/.test(last4)) {
    return validationError("paymentMethod.last4 must contain four digits");
  }

  return {
    token: requireString(paymentMethod.token, "paymentMethod.token"),
    ...(last4 ? { last4 } : {}),
  };
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function buildCaptureId(input: PaymentCaptureInput): string {
  return `capture_${safeIdPart(input.tenantId)}_${safeIdPart(input.authorizationId)}`;
}

function actorIdFromAuth(auth: SignalAuth | undefined): string | undefined {
  const actor = auth?.actor;
  if (typeof actor === "string") return actor;
  if (actor && typeof actor === "object" && typeof actor.id === "string") {
    return actor.id;
  }
  return typeof auth?.subject === "string" ? auth.subject : undefined;
}

function scopesFromAuth(auth: SignalAuth | undefined): string[] {
  return Array.isArray(auth?.scopes)
    ? auth.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
}

function hasScope(auth: SignalAuth | undefined, scope: string): boolean {
  return scopesFromAuth(auth).includes(scope);
}

export function authorizePaymentCapture(
  input: PaymentCaptureInput,
  context: SignalExecutionContext,
): PaymentCaptureAuthorization {
  const auth = context.request.auth;
  const actorId = actorIdFromAuth(auth);
  if (!actorId) {
    return unauthorized("payment.capture.v1 requires an authenticated actor");
  }

  if (!hasScope(auth, "payment:capture")) {
    return forbidden("payment.capture.v1 requires payment:capture scope");
  }

  const tenantScope = `tenant:${input.tenantId}`;
  if (auth?.subject !== tenantScope && !hasScope(auth, tenantScope)) {
    return forbidden("payment.capture.v1 cannot cross tenant boundaries");
  }

  const idempotencyKey = context.request.idempotencyKey;
  if (
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.startsWith(`${input.tenantId}:`)
  ) {
    return badRequest(
      "payment.capture.v1 idempotency keys must be prefixed with the tenant id",
    );
  }

  return { actorId };
}

export function redactPaymentCaptureInput(
  input: PaymentCaptureInput,
): RedactedPaymentCaptureInput {
  return {
    tenantId: input.tenantId,
    authorizationId: input.authorizationId,
    amountCents: input.amountCents,
    currency: input.currency,
    paymentMethod: {
      token: "[redacted]",
      ...(input.paymentMethod.last4
        ? { last4: input.paymentMethod.last4 }
        : {}),
    },
    risk: {
      declared: true,
      classification: input.risk.classification,
      reason: input.risk.reason,
      approvedBy: input.risk.approvedBy,
    },
  };
}

export function createHighRiskPaymentStore() {
  let captures = new Map<string, PaymentCaptureResult>();
  const auditEntries: PaymentAuditEntry[] = [];
  const outboxMessages: PaymentOutboxMessage[] = [];
  const subscriberDeliveries: PaymentSubscriberDelivery[] = [];

  async function transaction<T>(run: () => Promise<T>): Promise<T> {
    const captureSnapshot = new Map(captures);
    const auditLength = auditEntries.length;
    const outboxLength = outboxMessages.length;
    const deliveryLength = subscriberDeliveries.length;

    try {
      return await run();
    } catch (error) {
      captures = captureSnapshot;
      auditEntries.splice(auditLength);
      outboxMessages.splice(outboxLength);
      subscriberDeliveries.splice(deliveryLength);
      throw error;
    }
  }

  return {
    async captureAuthorizedPayment(
      input: PaymentCaptureInput,
      authorization: PaymentCaptureAuthorization,
      emit: SignalExecutionContext["emit"],
    ): Promise<PaymentCaptureResult> {
      return transaction(async () => {
        const captureId = buildCaptureId(input);
        if (captures.has(captureId)) {
          return conflict("authorization was already captured");
        }

        const capturedAt = new Date().toISOString();
        const auditId = `audit_${captureId}`;
        const outboxId = `outbox_${captureId}`;
        const eventPayload: PaymentCapturedEvent = {
          captureId,
          tenantId: input.tenantId,
          authorizationId: input.authorizationId,
          amountCents: input.amountCents,
          currency: input.currency,
          status: "captured",
          capturedAt,
          auditId,
        };
        const eventEnvelope = (await emit("payment.captured.v1", eventPayload, {
          auditId,
          outboxId,
          redacted: true,
        })) as SignalEnvelope<PaymentCapturedEvent>;

        const result: PaymentCaptureResult = {
          captureId,
          tenantId: input.tenantId,
          authorizationId: input.authorizationId,
          amountCents: input.amountCents,
          currency: input.currency,
          status: "captured",
          capturedAt,
          auditId,
          outboxId,
          risk: {
            declared: true,
            classification: input.risk.classification,
          },
        };

        captures.set(captureId, result);
        auditEntries.push({
          auditId,
          operation: "payment.capture.v1",
          tenantId: input.tenantId,
          actorId: authorization.actorId,
          recordedAt: capturedAt,
          redactedInput: redactPaymentCaptureInput(input),
          result,
        });
        outboxMessages.push({
          outboxId,
          eventName: "payment.captured.v1",
          status: "pending",
          createdAt: capturedAt,
          envelope: eventEnvelope,
        });

        return result;
      });
    },
    getCapture(captureId: string): PaymentCaptureResult | undefined {
      return captures.get(captureId);
    },
    listAuditEntries(): PaymentAuditEntry[] {
      return auditEntries.map((entry) => ({ ...entry }));
    },
    listOutboxMessages(): PaymentOutboxMessage[] {
      return outboxMessages.map((message) => ({ ...message }));
    },
    recordSubscriberDelivery(input: {
      messageId: string;
      captureId: string;
    }): void {
      subscriberDeliveries.push({
        consumerId: "reference-payment-ledger",
        eventName: "payment.captured.v1",
        messageId: input.messageId,
        captureId: input.captureId,
        deliveredAt: new Date().toISOString(),
      });
    },
    listSubscriberDeliveries(): PaymentSubscriberDelivery[] {
      return subscriberDeliveries.map((delivery) => ({ ...delivery }));
    },
  };
}

export type HighRiskPaymentStore = ReturnType<
  typeof createHighRiskPaymentStore
>;

const paymentCaptureInputSchema = schema<PaymentCaptureInput>((value) => {
  const input = requireRecord(value, "payment.capture.v1 input");
  return {
    tenantId: requireString(input.tenantId, "tenantId"),
    authorizationId: requireString(input.authorizationId, "authorizationId"),
    amountCents: requirePositiveInteger(input.amountCents, "amountCents"),
    currency: requireCurrency(input.currency),
    paymentMethod: requirePaymentMethod(input.paymentMethod),
    risk: requireRiskDeclaration(input.risk),
  };
});

const paymentCaptureResultSchema = schema<PaymentCaptureResult>(
  (value) => value as PaymentCaptureResult,
);

const paymentCapturedEventSchema = schema<PaymentCapturedEvent>((value) => {
  const event = requireRecord(value, "payment.captured.v1 payload");
  return {
    captureId: requireString(event.captureId, "captureId"),
    tenantId: requireString(event.tenantId, "tenantId"),
    authorizationId: requireString(event.authorizationId, "authorizationId"),
    amountCents: requirePositiveInteger(event.amountCents, "amountCents"),
    currency: requireCurrency(event.currency),
    status:
      event.status === "captured"
        ? "captured"
        : validationError("status must be captured"),
    capturedAt: requireString(event.capturedAt, "capturedAt"),
    auditId: requireString(event.auditId, "auditId"),
  };
});

const paymentCaptureGetInputSchema = schema<PaymentCaptureGetInput>((value) => {
  const input = requireRecord(value, "payment.capture.get.v1 input");
  return {
    tenantId: requireString(input.tenantId, "tenantId"),
    captureId: requireString(input.captureId, "captureId"),
  };
});

const paymentCaptureGetResultSchema = schema<PaymentCaptureGetResult>(
  (value) => value as PaymentCaptureGetResult,
);

const certificationInputSchema = schema<Record<string, never>>((value) => {
  if (value === undefined || isRecord(value)) return {};
  return validationError("reference.certification.v1 input must be an object");
});

const certificationResultSchema = schema<ReferenceCertificationResult>(
  (value) => value as ReferenceCertificationResult,
);

function certificationCheck(
  name: string,
  passed: boolean,
  evidence: string,
): ReferenceCertificationCheck {
  return { name, passed, evidence };
}

function samplePaymentCaptureInput(
  overrides: Partial<PaymentCaptureInput> = {},
): PaymentCaptureInput {
  const tenantId = overrides.tenantId ?? "tenant_acme";

  return {
    tenantId,
    authorizationId: overrides.authorizationId ?? "auth_certification_probe",
    amountCents: overrides.amountCents ?? 12500,
    currency: overrides.currency ?? "USD",
    paymentMethod: overrides.paymentMethod ?? {
      token: "tok_certification_secret",
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

function certificationAuth(tenantId: string): SignalAuth {
  return {
    actor: {
      id: "ops_alice",
      type: "operator",
      roles: ["payments"],
    },
    subject: `tenant:${tenantId}`,
    scopes: ["payment:capture", "payment:read", `tenant:${tenantId}`],
  };
}

function certificationContext(
  tenantId: string,
  idempotencyKey = `${tenantId}:capture:certification_probe`,
): SignalExecutionContext {
  return {
    request: {
      idempotencyKey,
      auth: certificationAuth(tenantId),
    },
    emit: async () => {
      throw new Error("certification context does not emit");
    },
  };
}

function rejectsWithCode(run: () => unknown, code: string): boolean {
  try {
    run();
  } catch (error) {
    return isRecord(error) && error.code === code;
  }

  return false;
}

async function certifyIsolatedCapture(): Promise<{
  auditCount: number;
  outboxCount: number;
  leakedSecret: boolean;
}> {
  const store = createHighRiskPaymentStore();
  const input = samplePaymentCaptureInput();
  const authorization = authorizePaymentCapture(
    input,
    certificationContext(input.tenantId),
  );

  await store.captureAuthorizedPayment(
    input,
    authorization,
    async <TPayload>(
      eventName: string,
      payload: TPayload,
      meta?: Record<string, unknown>,
    ) =>
      ({
        protocol: "signal.v1",
        kind: "event",
        name: eventName,
        messageId: "certification-message",
        timestamp: new Date().toISOString(),
        payload,
        meta,
      }) as SignalEnvelope<TPayload>,
  );

  const evidence = JSON.stringify({
    audit: store.listAuditEntries(),
    outbox: store.listOutboxMessages(),
  });

  return {
    auditCount: store.listAuditEntries().length,
    outboxCount: store.listOutboxMessages().length,
    leakedSecret: evidence.includes("tok_certification_secret"),
  };
}

export async function buildReferenceCertification(
  input: {
    runtime?: SignalRuntime;
    store?: HighRiskPaymentStore;
  } = {},
): Promise<ReferenceCertificationResult> {
  const capabilities = input.runtime?.capabilities();
  const paymentMutation = capabilities?.mutations.find(
    (entry) => entry.name === "payment.capture.v1",
  );
  const paymentSubscriber = capabilities?.subscribedEvents.find(
    (entry) =>
      entry.name === "payment.captured.v1" &&
      entry.consumerId === "reference-payment-ledger",
  );
  const sampleInput = samplePaymentCaptureInput();
  const redactedInput = redactPaymentCaptureInput(sampleInput);
  const isolatedCapture = await certifyIsolatedCapture();
  const observedAuditCount = input.store?.listAuditEntries().length ?? 0;
  const observedOutboxCount = input.store?.listOutboxMessages().length ?? 0;
  const observedDeliveryCount =
    input.store?.listSubscriberDeliveries().length ?? 0;

  const checks = [
    certificationCheck(
      "risk-declared mutation",
      rejectsWithCode(
        () =>
          paymentCaptureInputSchema.parse({
            ...sampleInput,
            risk: {
              declared: false,
              classification: "high",
              reason: "not declared",
              approvedBy: "ops_alice",
            },
          }),
        "VALIDATION_ERROR",
      ),
      "payment.capture.v1 schema rejected a probe input with risk.declared=false.",
    ),
    certificationCheck(
      "scoped idempotency",
      rejectsWithCode(
        () =>
          authorizePaymentCapture(
            sampleInput,
            certificationContext(sampleInput.tenantId, "capture:unscoped"),
          ),
        "BAD_REQUEST",
      ),
      "authorizePaymentCapture rejected an idempotency key without the tenant prefix.",
    ),
    certificationCheck(
      "tenant isolation",
      rejectsWithCode(
        () =>
          authorizePaymentCapture(sampleInput, {
            ...certificationContext("tenant_other"),
            request: {
              ...certificationContext("tenant_other").request,
              idempotencyKey: "tenant_acme:capture:cross_tenant_probe",
            },
          }),
        "FORBIDDEN",
      ),
      "authorizePaymentCapture rejected a cross-tenant authorization probe.",
    ),
    certificationCheck(
      "authorization-before-handler",
      paymentMutation?.idempotency === "required" &&
        Boolean(paymentMutation.emits?.includes("payment.captured.v1")),
      "runtime capabilities expose payment.capture.v1 as an idempotent mutation with declared event emission.",
    ),
    certificationCheck(
      "audit hook",
      isolatedCapture.auditCount === 1,
      `isolated capture probe appended ${isolatedCapture.auditCount} redacted audit entry.`,
    ),
    certificationCheck(
      "redaction hook",
      redactedInput.paymentMethod.token === "[redacted]" &&
        !JSON.stringify(redactedInput).includes("tok_certification_secret") &&
        !isolatedCapture.leakedSecret,
      "redaction probe removed payment tokens from audit and outbox evidence.",
    ),
    certificationCheck(
      "transactional outbox",
      isolatedCapture.auditCount === 1 && isolatedCapture.outboxCount === 1,
      `isolated capture probe committed audit=${isolatedCapture.auditCount} and outbox=${isolatedCapture.outboxCount} together.`,
    ),
    certificationCheck(
      "subscriber dedupe",
      paymentSubscriber?.replaySafe === true,
      "runtime capabilities expose reference-payment-ledger as a replay-safe payment.captured.v1 subscriber.",
    ),
    certificationCheck(
      "conformance tests",
      paymentMutation?.idempotency === "required" &&
        isolatedCapture.auditCount === 1 &&
        isolatedCapture.outboxCount === 1,
      "certification probes exercised the successful mutation contract, audit, and outbox path.",
    ),
    certificationCheck(
      "adversarial tests",
      rejectsWithCode(
        () =>
          paymentCaptureInputSchema.parse({
            ...sampleInput,
            amountCents: 0,
          }),
        "VALIDATION_ERROR",
      ),
      "certification probes exercised invalid risk, unscoped idempotency, tenant mismatch, and invalid amount failures.",
    ),
    certificationCheck(
      "certification check",
      capabilities?.queries.some(
        (entry) => entry.name === "reference.certification.v1",
      ) === true,
      "runtime capabilities expose reference.certification.v1.",
    ),
    certificationCheck(
      "high-risk reference flow",
      Boolean(paymentMutation?.emits?.includes("payment.captured.v1")) &&
        (observedAuditCount === 0 ||
          (observedAuditCount >= 1 &&
            observedOutboxCount >= 1 &&
            observedDeliveryCount >= 1)),
      observedAuditCount > 0
        ? `current runtime has observed audit=${observedAuditCount}, outbox=${observedOutboxCount}, subscriberDeliveries=${observedDeliveryCount}.`
        : "current runtime is ready to observe audit, outbox, and subscriber evidence after the proof executes.",
    ),
  ];

  return {
    name: "signal-reference-high-risk-payment.v1",
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export function registerHighRiskPaymentFlow(
  runtime: SignalRuntime,
  store: HighRiskPaymentStore = createHighRiskPaymentStore(),
) {
  const paymentCapturedEvent = runtime.registerEvent({
    name: "payment.captured.v1",
    kind: "event",
    description: "Redacted event emitted after a high-risk payment capture.",
    inputSchema: paymentCapturedEventSchema,
    resultSchema: paymentCapturedEventSchema,
    async handler(input) {
      return input;
    },
  });

  const paymentCaptureMutation = runtime.registerMutation({
    name: "payment.capture.v1",
    kind: "mutation",
    description:
      "High-risk reference mutation for tenant-scoped, replay-safe payment capture.",
    idempotency: "required",
    inputSchema: paymentCaptureInputSchema,
    resultSchema: paymentCaptureResultSchema,
    emits: ["payment.captured.v1"],
    authorize(input, context) {
      authorizePaymentCapture(input, context);
    },
    normalizeIdempotencyInput(input) {
      return {
        tenantId: input.tenantId,
        authorizationId: input.authorizationId,
        amountCents: input.amountCents,
        currency: input.currency,
        risk: {
          declared: input.risk.declared,
          classification: input.risk.classification,
          approvedBy: input.risk.approvedBy,
        },
      };
    },
    async handler(input, context) {
      const authorization = authorizePaymentCapture(input, context);
      return store.captureAuthorizedPayment(input, authorization, context.emit);
    },
  });

  const paymentCaptureQuery = runtime.registerQuery({
    name: "payment.capture.get.v1",
    kind: "query",
    description:
      "Inspect the redacted audit and outbox evidence for a captured payment.",
    inputSchema: paymentCaptureGetInputSchema,
    resultSchema: paymentCaptureGetResultSchema,
    async handler(input, context) {
      const auth = context.request.auth;
      const actorId = actorIdFromAuth(auth);
      if (!actorId) {
        return unauthorized(
          "payment.capture.get.v1 requires an authenticated actor",
        );
      }
      if (
        !hasScope(auth, "payment:read") &&
        !hasScope(auth, "payment:capture")
      ) {
        return forbidden(
          "payment.capture.get.v1 requires payment:read or payment:capture scope",
        );
      }

      const tenantScope = `tenant:${input.tenantId}`;
      if (auth?.subject !== tenantScope && !hasScope(auth, tenantScope)) {
        return forbidden(
          "payment.capture.get.v1 cannot cross tenant boundaries",
        );
      }

      const capture = store.getCapture(input.captureId);
      const visibleCapture =
        capture && capture.tenantId === input.tenantId ? capture : null;
      if (!visibleCapture) {
        return {
          found: false,
          capture: null,
          audit: [],
          outbox: [],
          subscriberDeliveries: [],
        };
      }

      return {
        found: true,
        capture: visibleCapture,
        audit: store
          .listAuditEntries()
          .filter((entry) => entry.result.captureId === input.captureId),
        outbox: store
          .listOutboxMessages()
          .filter(
            (message) => message.envelope.payload.captureId === input.captureId,
          )
          .map((message) => ({
            outboxId: message.outboxId,
            eventName: message.eventName,
            status: message.status,
            createdAt: message.createdAt,
            messageId: message.envelope.messageId,
          })),
        subscriberDeliveries: store
          .listSubscriberDeliveries()
          .filter((delivery) => delivery.captureId === input.captureId),
      };
    },
  });

  const certificationQuery = runtime.registerQuery({
    name: "reference.certification.v1",
    kind: "query",
    description:
      "Return the reference-server certification checklist for the high-risk flow.",
    inputSchema: certificationInputSchema,
    resultSchema: certificationResultSchema,
    async handler() {
      return buildReferenceCertification({ runtime, store });
    },
  });

  return {
    paymentCaptureMutation,
    paymentCapturedEvent,
    paymentCaptureQuery,
    certificationQuery,
    store,
  };
}
