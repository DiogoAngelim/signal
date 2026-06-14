// Auto-generated domain types from Signal API IR
// Schema: DomainTypesV1

// ─── Protocol Core ───────────────────────────────────────────────

export type SignalKind = "query" | "mutation" | "event";

export type SignalErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_REJECTION"
  | "IDEMPOTENCY_CONFLICT"
  | "DEADLINE_EXCEEDED"
  | "CANCELLED"
  | "TRANSPORT_ERROR"
  | "INTERNAL_ERROR"
  | "RETRYABLE_ERROR"
  | "UNSUPPORTED_OPERATION";

export type SignalErrorCategory =
  | "validation"
  | "authorization"
  | "business"
  | "idempotency"
  | "deadline"
  | "cancellation"
  | "transport"
  | "runtime"
  | "capability";

export interface SignalError {
  code: SignalErrorCode;
  category: SignalErrorCategory;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export interface SignalSuccess<T = unknown> {
  ok: true;
  result: T;
  meta?: SignalResultMeta;
}

export interface SignalFailure {
  ok: false;
  error: SignalError;
}

export type SignalResult<T = unknown> = SignalSuccess<T> | SignalFailure;

export interface SignalResultMeta {
  outcome?: "completed" | "replayed";
  durationMs?: number;
  context?: { messageId?: string; correlationId?: string; causationId?: string };
  idempotency?: { key?: string; status?: "not-applicable" | "recorded" | "replayed"; fingerprint?: string };
  replay?: { replayed: boolean; reason?: "idempotency" | "event-redelivery" | "event-replay"; originalMessageId?: string };
}

// ─── Note Domain ─────────────────────────────────────────────────

export interface Note {
  noteId: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface NoteGetInput {
  noteId: string;
}

export interface NoteGetResult {
  found: boolean;
  note: Note | null;
}

// ─── Post Domain ─────────────────────────────────────────────────

export interface Post {
  postId: string;
  title: string;
  body?: string;
  publishedAt: string;
}

export interface PostGetInput {
  postId: string;
}

export interface PostGetResult {
  found: boolean;
  post: Post | null;
}

export interface PostPublishInput {
  postId?: string;
  title: string;
  body?: string;
  publishedAt?: string;
}

export interface PostPublishResult {
  post: Post;
  event: "post.published.v1";
}

// ─── Payment Domain ──────────────────────────────────────────────

export interface PaymentRiskDeclaration {
  declared: true;
  classification: "high" | "critical";
  reason: string;
  approvedBy: string;
}

export interface PaymentMethodInput {
  token: string;
  last4?: string;
}

export interface PaymentCaptureInput {
  tenantId: string;
  authorizationId: string;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethodInput;
  risk: PaymentRiskDeclaration;
}

export interface PaymentCaptureResult {
  captureId: string;
  tenantId: string;
  authorizationId: string;
  amountCents: number;
  currency: string;
  status: "captured";
  capturedAt: string;
  auditId: string;
  outboxId: string;
  risk: { declared: true; classification: "high" | "critical" };
}

export interface PaymentCaptureGetInput {
  tenantId: string;
  captureId: string;
}

export interface PaymentAuditEntry {
  auditId: string;
  operation: "payment.capture.v1";
  tenantId: string;
  actorId: string;
  recordedAt: string;
  redactedInput: Omit<PaymentCaptureInput, "paymentMethod"> & { paymentMethod: { token: "[redacted]"; last4?: string } };
  result: PaymentCaptureResult;
}

export interface PaymentCaptureGetResult {
  found: boolean;
  capture: PaymentCaptureResult | null;
  audit: PaymentAuditEntry[];
  outbox: Array<{ outboxId: string; eventName: string; status: string; createdAt: string; messageId: string }>;
  subscriberDeliveries: Array<{ consumerId: string; eventName: string; messageId: string; captureId: string; deliveredAt: string }>;
}

export interface PaymentCapturedEvent {
  captureId: string;
  tenantId: string;
  authorizationId: string;
  amountCents: number;
  currency: string;
  status: "captured";
  capturedAt: string;
  auditId: string;
}

// ─── Reference Domain ────────────────────────────────────────────

export interface ReferenceCertificationCheck {
  name: string;
  passed: boolean;
  evidence: string;
}

export interface ReferenceCertificationResult {
  name: string;
  passed: boolean;
  checks: ReferenceCertificationCheck[];
}

// ─── Decision Domain ─────────────────────────────────────────────

export interface DecisionEvidence {
  direction: "for" | "against" | "neutral";
  weight: number;
  description: string;
  source: string;
}

export interface DecisionRecord {
  id: string;
  evidence?: DecisionEvidence[];
  assessment?: Record<string, unknown>;
  journal?: Record<string, unknown>;
  outcome?: Record<string, unknown>;
  replay?: Record<string, unknown>;
}

// ─── Commitment Domain ───────────────────────────────────────────

export interface CommitmentResult {
  module: "signal.commitment";
  operation: "commitment.evaluate.v1";
  version: "v1";
  decision: string;
  status: string;
  score?: Record<string, unknown>;
  recommendation?: Record<string, unknown>;
  constraints?: unknown[];
  resources?: unknown[];
  trust?: Record<string, unknown>;
}

// ─── Capabilities ───────────────────────────────────────────────

export interface SignalOperationCapability {
  name: string;
  kind: SignalKind;
  description?: string;
  inputSchemaId?: string;
  resultSchemaId?: string;
  idempotency?: "required" | "optional" | "none";
  emits?: string[];
  replaySafe?: boolean;
  consumerId?: string;
}

export interface SignalCapabilities {
  protocol: "signal.v1";
  version: "v1";
  queries: SignalOperationCapability[];
  mutations: SignalOperationCapability[];
  publishedEvents: SignalOperationCapability[];
  subscribedEvents: SignalOperationCapability[];
  features?: {
    deadlines: boolean;
    cancellation: boolean;
    idempotency: boolean;
    replaySafety: boolean;
    perception?: boolean;
  };
  bindings?: {
    inProcess: boolean;
    http?: { basePath: string };
  };
}