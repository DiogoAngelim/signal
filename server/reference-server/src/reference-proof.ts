import type { SignalExecutionResult } from "@signal/sdk-node";
import { createReferenceRuntime } from "./lib/runtime";
import type {
  PaymentCaptureInput,
  PaymentCaptureResult,
  ReferenceCertificationResult,
} from "./operations/high-risk-payment";

type ProofStep = {
  name: string;
  passed: true;
  evidence: string;
};

type PaymentCaptureEvidence = {
  found: boolean;
  capture: PaymentCaptureResult | null;
  audit: unknown[];
  outbox: Array<{
    eventName: "payment.captured.v1";
    messageId: string;
  }>;
  subscriberDeliveries: unknown[];
};

export type ReferenceProofResult = {
  proof: "signal-reference-proof.v1";
  passed: true;
  mutation: "payment.capture.v1";
  event: "payment.captured.v1";
  certification: "reference.certification.v1";
  steps: ProofStep[];
};

function tenantAuth(tenantId: string) {
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

function paymentCaptureInput(
  overrides: Partial<PaymentCaptureInput> = {},
): PaymentCaptureInput {
  const tenantId = overrides.tenantId ?? "tenant_acme";

  return {
    tenantId,
    authorizationId: overrides.authorizationId ?? "auth_reference_proof",
    amountCents: overrides.amountCents ?? 12500,
    currency: overrides.currency ?? "USD",
    paymentMethod: overrides.paymentMethod ?? {
      token: "tok_live_secret_reference_proof",
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

function pass(steps: ProofStep[], name: string, evidence: string): void {
  steps.push({ name, passed: true, evidence });
}

function assertCondition(
  condition: boolean,
  name: string,
  evidence: string,
): void {
  if (!condition) {
    throw new Error(`${name}: ${evidence}`);
  }
}

function unwrap<T>(name: string, result: SignalExecutionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${name}: ${result.error.code} ${result.error.message}`);
  }

  return result.result;
}

function assertFailure(
  name: string,
  result: SignalExecutionResult<unknown>,
  code: string,
): void {
  if (result.ok) {
    throw new Error(`${name}: expected ${code}, received success`);
  }

  if (result.error.code !== code) {
    throw new Error(`${name}: expected ${code}, received ${result.error.code}`);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function runReferenceProof(): Promise<ReferenceProofResult> {
  const { runtime, operations } = createReferenceRuntime();
  const steps: ProofStep[] = [];
  const input = paymentCaptureInput();
  const idempotencyKey = "tenant_acme:capture:reference_proof";

  const capabilities = runtime.capabilities();
  const paymentMutation = capabilities.mutations.find(
    (entry) => entry.name === "payment.capture.v1",
  );
  assertCondition(
    paymentMutation?.idempotency === "required" &&
      paymentMutation.emits?.includes("payment.captured.v1") === true,
    "high-risk mutation declaration",
    "payment.capture.v1 must require idempotency and declare payment.captured.v1.",
  );
  pass(
    steps,
    "high-risk mutation declaration",
    "payment.capture.v1 requires idempotency and declares payment.captured.v1.",
  );

  const rejectedBeforeAuth = await runtime.mutation(
    "payment.capture.v1",
    paymentCaptureInput({ authorizationId: "auth_pre_auth_proof" }),
    {
      idempotencyKey: "tenant_acme:capture:pre_auth_proof",
    },
  );
  assertFailure(
    "authorization-before-handler",
    rejectedBeforeAuth,
    "UNAUTHORIZED",
  );

  const acceptedAfterAuth = unwrap(
    "authorization-before-handler retry",
    await runtime.mutation<PaymentCaptureInput, PaymentCaptureResult>(
      "payment.capture.v1",
      paymentCaptureInput({ authorizationId: "auth_pre_auth_proof" }),
      {
        idempotencyKey: "tenant_acme:capture:pre_auth_proof",
        auth: tenantAuth("tenant_acme"),
      },
    ),
  );
  assertCondition(
    acceptedAfterAuth.authorizationId === "auth_pre_auth_proof",
    "authorization-before-handler",
    "an unauthorized caller must not reserve or poison the retry key.",
  );
  pass(
    steps,
    "authorization-before-handler",
    "Rejected callers cannot reserve an idempotency key before authorization.",
  );

  const capture = unwrap(
    "execute dangerous mutation",
    await runtime.mutation<PaymentCaptureInput, PaymentCaptureResult>(
      "payment.capture.v1",
      input,
      {
        idempotencyKey,
        auth: tenantAuth("tenant_acme"),
        correlationId: "corr_reference_proof",
      },
    ),
  );
  pass(
    steps,
    "execute dangerous mutation",
    `captured ${capture.captureId} for tenant_acme with audit and outbox identifiers.`,
  );

  const replay = await runtime.mutation<
    PaymentCaptureInput,
    PaymentCaptureResult
  >("payment.capture.v1", input, {
    idempotencyKey,
    auth: tenantAuth("tenant_acme"),
    correlationId: "corr_reference_proof",
  });
  if (!replay.ok) {
    throw new Error(
      `observe replay: ${replay.error.code} ${replay.error.message}`,
    );
  }
  const replayedCapture = unwrap("observe replay", replay);
  assertCondition(
    replay.meta.replay?.replayed === true && sameJson(replayedCapture, capture),
    "observe replay",
    "same idempotency key plus same payload must replay the stored result.",
  );
  pass(
    steps,
    "observe replay",
    "same idempotency key and payload returned the stored capture result.",
  );

  const conflict = await runtime.mutation(
    "payment.capture.v1",
    paymentCaptureInput({ amountCents: 13000 }),
    {
      idempotencyKey,
      auth: tenantAuth("tenant_acme"),
      correlationId: "corr_reference_proof",
    },
  );
  assertFailure("observe conflict", conflict, "IDEMPOTENCY_CONFLICT");
  pass(
    steps,
    "observe conflict",
    "same idempotency key plus different normalized payload returned IDEMPOTENCY_CONFLICT.",
  );

  const evidence = unwrap(
    "observe audit trail",
    await runtime.query<
      { tenantId: string; captureId: string },
      PaymentCaptureEvidence
    >(
      "payment.capture.get.v1",
      {
        tenantId: "tenant_acme",
        captureId: capture.captureId,
      },
      {
        auth: tenantAuth("tenant_acme"),
      },
    ),
  );
  const evidenceJson = JSON.stringify(evidence);
  assertCondition(
    evidence.found &&
      evidence.audit.length === 1 &&
      evidence.outbox.length === 1 &&
      evidence.subscriberDeliveries.length === 1 &&
      !evidenceJson.includes("tok_live_secret_reference_proof"),
    "observe audit trail",
    "audit, outbox, and subscriber evidence must exist without leaking payment tokens.",
  );
  pass(
    steps,
    "observe audit trail",
    "redacted audit, outbox, and subscriber evidence are visible for the capture.",
  );

  const wrongTenantEvidence = unwrap(
    "observe tenant isolation",
    await runtime.query<
      { tenantId: string; captureId: string },
      PaymentCaptureEvidence
    >(
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
  assertCondition(
    wrongTenantEvidence.found === false,
    "observe tenant isolation",
    "another tenant must not see the capture evidence.",
  );
  pass(
    steps,
    "observe tenant isolation",
    "tenant_other receives no capture, audit, outbox, or subscriber evidence.",
  );

  const outboxMessage = operations.highRiskPayment.store
    .listOutboxMessages()
    .find((message) => message.outboxId === capture.outboxId);
  if (!outboxMessage) {
    throw new Error(
      "observe emitted events: the capture must create an outbox event envelope.",
    );
  }
  await runtime.publish(
    outboxMessage.envelope.name,
    outboxMessage.envelope.payload,
  );
  assertCondition(
    operations.highRiskPayment.store
      .listSubscriberDeliveries()
      .filter((delivery) => delivery.captureId === capture.captureId).length ===
      1,
    "observe emitted events",
    "re-dispatching the same event must not duplicate subscriber side effects.",
  );
  pass(
    steps,
    "observe emitted events",
    "payment.captured.v1 was emitted and replay-safe subscriber dedupe skipped the duplicate delivery.",
  );

  const certification = unwrap(
    "run certification",
    await runtime.query<Record<string, never>, ReferenceCertificationResult>(
      "reference.certification.v1",
      {},
    ),
  );
  assertCondition(
    certification.passed && certification.checks.every((check) => check.passed),
    "run certification",
    "reference.certification.v1 must report all checks passing.",
  );
  pass(
    steps,
    "run certification",
    "reference.certification.v1 reported all high-risk controls passing.",
  );

  return {
    proof: "signal-reference-proof.v1",
    passed: true,
    mutation: "payment.capture.v1",
    event: "payment.captured.v1",
    certification: "reference.certification.v1",
    steps,
  };
}

export async function runReferencePostgresProof(): Promise<ReferenceProofResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for the durable Postgres reference proof.",
    );
  }

  return runReferenceProof();
}

async function main() {
  const proof = process.argv.includes("--postgres")
    ? await runReferencePostgresProof()
    : await runReferenceProof();
  console.log(JSON.stringify(proof, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
