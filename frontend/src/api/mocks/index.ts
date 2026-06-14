/**
 * Signal Mock Runtime Layer
 *
 * Provides deterministic mock data that matches the API IR contracts exactly.
 * No external calls. No non-deterministic behavior.
 * Simulates latency for realistic UX development.
 *
 * Schema: MockLayerV1
 *
 * To swap to real backend: replace this adapter with HttpSignalAdapter
 * in the setAdapter() call. No UI changes required.
 */

import type { SignalAdapter } from "../client";
import type {
  SignalResult,
  SignalCapabilities,
  NoteGetResult,
  PostGetResult,
  PostPublishResult,
  PaymentCaptureResult,
  PaymentCaptureGetResult,
  ReferenceCertificationResult,
  CommitmentResult,
} from "../../../../contracts/domain-types";

// ─── Simulated Latency ─────────────────────────────────────────

const MOCK_LATENCY_MS = 150;

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

// ─── Deterministic Mock Data ───────────────────────────────────

const MOCK_NOTES: Record<string, { noteId: string; title: string; body: string; updatedAt: string }> = {
  note_1001: {
    noteId: "note_1001",
    title: "Protocol first",
    body: "Signal routes every query, mutation, and event through explicit runtime contracts.",
    updatedAt: "2026-03-25T12:00:00.000Z",
  },
};

const MOCK_POSTS: Record<string, { postId: string; title: string; body: string; publishedAt: string }> = {
  post_1001: {
    postId: "post_1001",
    title: "Protocol first",
    body: "A reference publication used by the Signal runtime smoke path.",
    publishedAt: "2026-03-25T12:00:00.000Z",
  },
};

const MOCK_CAPTURES: Record<string, PaymentCaptureResult> = {};

const MOCK_CAPABILITIES: SignalCapabilities = {
  protocol: "signal.v1",
  version: "v1",
  queries: [
    { name: "note.get.v1", kind: "query", replaySafe: true },
    { name: "post.get.v1", kind: "query", replaySafe: true },
    { name: "payment.capture.get.v1", kind: "query", replaySafe: true },
    { name: "reference.certification.v1", kind: "query", replaySafe: true },
    { name: "decision.get.v1", kind: "query", replaySafe: true },
    { name: "decision.list.v1", kind: "query", replaySafe: true },
    { name: "decision.evaluate.v1", kind: "query", replaySafe: true },
    { name: "decision.replay.v1", kind: "query", replaySafe: true },
    { name: "decision.memory.summary.v1", kind: "query", replaySafe: true },
    { name: "decision.accountability.get.v1", kind: "query", replaySafe: true },
    { name: "decision.scenarios.predict.v1", kind: "query", replaySafe: true },
    { name: "decision.simulate.v1", kind: "query", replaySafe: true },
    { name: "commitment.evaluate.v1", kind: "query", replaySafe: true },
  ],
  mutations: [
    { name: "post.publish.v1", kind: "mutation", idempotency: "optional", emits: ["post.published.v1"], replaySafe: true },
    { name: "payment.capture.v1", kind: "mutation", idempotency: "required", emits: ["payment.captured.v1"], replaySafe: true },
    { name: "decision.record.v1", kind: "mutation", idempotency: "optional", emits: ["decision.recorded.v1"], replaySafe: true },
    { name: "decision.outcome.record.v1", kind: "mutation", idempotency: "optional", emits: ["decision.outcome_recorded.v1"], replaySafe: true },
    { name: "decision.memory.compact.v1", kind: "mutation", idempotency: "optional", emits: ["decision.compacted.v1"], replaySafe: true },
    { name: "decision.calibration.update.v1", kind: "mutation", idempotency: "optional", emits: ["decision.calibration_updated.v1"], replaySafe: true },
  ],
  publishedEvents: [
    { name: "post.published.v1", kind: "event", replaySafe: true },
    { name: "payment.captured.v1", kind: "event", replaySafe: true },
    { name: "decision.recorded.v1", kind: "event", replaySafe: true },
    { name: "decision.evaluated.v1", kind: "event", replaySafe: true },
    { name: "decision.blocked.v1", kind: "event", replaySafe: true },
    { name: "decision.outcome_recorded.v1", kind: "event", replaySafe: true },
    { name: "decision.compacted.v1", kind: "event", replaySafe: true },
    { name: "decision.calibration_updated.v1", kind: "event", replaySafe: true },
    { name: "decision.replayed.v1", kind: "event", replaySafe: true },
  ],
  subscribedEvents: [
    { name: "payment.captured.v1", kind: "event", consumerId: "reference-payment-ledger", replaySafe: true },
  ],
  features: {
    deadlines: true,
    cancellation: true,
    idempotency: true,
    replaySafety: true,
  },
  bindings: {
    inProcess: true,
    http: { basePath: "/signal" },
  },
};

// ─── Query Handlers ────────────────────────────────────────────

function handleQuery(name: string, input: unknown): SignalResult<unknown> {
  switch (name) {
    case "note.get.v1": {
      const { noteId } = input as { noteId: string };
      const note = MOCK_NOTES[noteId] ?? null;
      return { ok: true, result: { found: Boolean(note), note } as NoteGetResult };
    }
    case "post.get.v1": {
      const { postId } = input as { postId: string };
      const post = MOCK_POSTS[postId] ?? null;
      return { ok: true, result: { found: Boolean(post), post } as PostGetResult };
    }
    case "payment.capture.get.v1": {
      const { captureId } = input as { captureId: string };
      const capture = MOCK_CAPTURES[captureId] ?? null;
      return {
        ok: true,
        result: {
          found: Boolean(capture),
          capture,
          audit: [],
          outbox: [],
          subscriberDeliveries: [],
        } as PaymentCaptureGetResult,
      };
    }
    case "reference.certification.v1": {
      return {
        ok: true,
        result: {
          name: "signal-reference-high-risk-payment.v1",
          passed: true,
          checks: [
            { name: "risk-declared mutation", passed: true, evidence: "Mock: risk declaration is enforced." },
            { name: "scoped idempotency", passed: true, evidence: "Mock: idempotency keys are tenant-scoped." },
            { name: "tenant isolation", passed: true, evidence: "Mock: cross-tenant access is rejected." },
            { name: "audit hook", passed: true, evidence: "Mock: audit entries are recorded." },
            { name: "redaction hook", passed: true, evidence: "Mock: payment tokens are redacted." },
          ],
        } as ReferenceCertificationResult,
      };
    }
    case "commitment.evaluate.v1": {
      return {
        ok: true,
        result: {
          module: "signal.commitment",
          operation: "commitment.evaluate.v1",
          version: "v1",
          decision: "commit",
          status: "allowed",
        } as CommitmentResult,
      };
    }
    default:
      return {
        ok: false,
        error: { code: "UNSUPPORTED_OPERATION", category: "capability", message: `Mock: unknown query "${name}"` },
      };
  }
}

// ─── Mutation Handlers ─────────────────────────────────────────

function handleMutation(name: string, input: unknown): SignalResult<unknown> {
  switch (name) {
    case "post.publish.v1": {
      const { title, body } = input as { postId?: string; title: string; body?: string; publishedAt?: string };
      const postId = `post_${Object.keys(MOCK_POSTS).length + 1001}`;
      const post = { postId, title, body: body ?? "", publishedAt: new Date().toISOString() };
      MOCK_POSTS[postId] = post;
      return { ok: true, result: { post, event: "post.published.v1" as const } as PostPublishResult };
    }
    case "payment.capture.v1": {
      const { tenantId, authorizationId, amountCents, currency, risk } = input as {
        tenantId: string; authorizationId: string; amountCents: number; currency: string;
        paymentMethod: { token: string; last4?: string };
        risk: { declared: true; classification: "high" | "critical"; reason: string; approvedBy: string };
      };
      const captureId = `capture_${tenantId}_${authorizationId}`;
      const result: PaymentCaptureResult = {
        captureId,
        tenantId,
        authorizationId,
        amountCents,
        currency,
        status: "captured",
        capturedAt: new Date().toISOString(),
        auditId: `audit_${captureId}`,
        outboxId: `outbox_${captureId}`,
        risk: { declared: true, classification: risk.classification },
      };
      MOCK_CAPTURES[captureId] = result;
      return { ok: true, result };
    }
    default:
      return {
        ok: false,
        error: { code: "UNSUPPORTED_OPERATION", category: "capability", message: `Mock: unknown mutation "${name}"` },
      };
  }
}

// ─── Mock Adapter ──────────────────────────────────────────────

export const mockAdapter: SignalAdapter = {
  async getCapabilities() {
    await simulateLatency();
    return { ok: true, result: MOCK_CAPABILITIES } as SignalResult<SignalCapabilities>;
  },

  async query<T>(name: string, input: unknown): Promise<SignalResult<T>> {
    await simulateLatency();
    return handleQuery(name, input) as SignalResult<T>;
  },

  async mutate<T>(name: string, input: unknown, _idempotencyKey?: string): Promise<SignalResult<T>> {
    await simulateLatency();
    return handleMutation(name, input) as SignalResult<T>;
  },
};