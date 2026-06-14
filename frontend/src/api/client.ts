/**
 * Signal API Client — Single Source of Truth
 *
 * All domain data MUST flow through this client.
 * No direct fetch calls or hardcoded domain data in UI components.
 *
 * To swap from mock to real backend, only the adapter implementation
 * changes. The function signatures remain identical.
 *
 * Schema: ApiClientV1
 */

import type {
  SignalResult,
  SignalCapabilities,
  NoteGetInput,
  NoteGetResult,
  PostGetInput,
  PostGetResult,
  PostPublishInput,
  PostPublishResult,
  PaymentCaptureInput,
  PaymentCaptureResult,
  PaymentCaptureGetInput,
  PaymentCaptureGetResult,
  ReferenceCertificationResult,
  CommitmentResult,
} from "../../../contracts/domain-types";

// ─── Adapter Interface ──────────────────────────────────────────

export interface SignalAdapter {
  getCapabilities(): Promise<SignalResult<SignalCapabilities>>;
  query<T>(name: string, input: unknown): Promise<SignalResult<T>>;
  mutate<T>(name: string, input: unknown, idempotencyKey?: string): Promise<SignalResult<T>>;
}

// ─── API Client ────────────────────────────────────────────────

let _adapter: SignalAdapter | null = null;

export function setAdapter(adapter: SignalAdapter): void {
  _adapter = adapter;
}

function getAdapter(): SignalAdapter {
  if (!_adapter) {
    throw new Error("Signal API adapter not configured. Call setAdapter() before using the client.");
  }
  return _adapter;
}

// ─── Capabilities ──────────────────────────────────────────────

export async function getCapabilities(): Promise<SignalResult<SignalCapabilities>> {
  return getAdapter().getCapabilities();
}

// ─── Query Operations ──────────────────────────────────────────

export async function getNote(input: NoteGetInput): Promise<SignalResult<NoteGetResult>> {
  return getAdapter().query("note.get.v1", input);
}

export async function getPost(input: PostGetInput): Promise<SignalResult<PostGetResult>> {
  return getAdapter().query("post.get.v1", input);
}

export async function getPaymentCapture(input: PaymentCaptureGetInput): Promise<SignalResult<PaymentCaptureGetResult>> {
  return getAdapter().query("payment.capture.get.v1", input);
}

export async function getCertification(): Promise<SignalResult<ReferenceCertificationResult>> {
  return getAdapter().query("reference.certification.v1", {});
}

export async function evaluateCommitment(input: unknown): Promise<SignalResult<CommitmentResult>> {
  return getAdapter().query("commitment.evaluate.v1", input);
}

// ─── Mutation Operations ───────────────────────────────────────

export async function publishPost(input: PostPublishInput, idempotencyKey?: string): Promise<SignalResult<PostPublishResult>> {
  return getAdapter().mutate("post.publish.v1", input, idempotencyKey);
}

export async function capturePayment(input: PaymentCaptureInput, idempotencyKey: string): Promise<SignalResult<PaymentCaptureResult>> {
  return getAdapter().mutate("payment.capture.v1", input, idempotencyKey);
}

// ─── Generic Query/Mutation (for decision domain operations) ────

export async function signalQuery<T>(name: string, input: unknown): Promise<SignalResult<T>> {
  return getAdapter().query<T>(name, input);
}

export async function signalMutation<T>(name: string, input: unknown, idempotencyKey?: string): Promise<SignalResult<T>> {
  return getAdapter().mutate<T>(name, input, idempotencyKey);
}