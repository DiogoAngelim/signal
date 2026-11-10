import type {
  ReplayEvidenceRecord,
  ReplayExternalReadSnapshot,
  ReplayJsonValue,
} from "@signal/ports";
import { fingerprint, stableStringify } from "./hash";

function cloneAndFreeze<T extends ReplayJsonValue>(value: T): T {
  const clone = JSON.parse(stableStringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (typeof item !== "object" || item === null || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export interface ReplayEvidenceInput {
  readonly executionId: string;
  readonly operationName: string;
  readonly operationVersion: string;
  readonly handlerArtifactDigest: string;
  readonly policyVersion: string;
  readonly canonicalInput: ReplayJsonValue;
  readonly externalReads: readonly {
    readonly key: string;
    readonly value: ReplayJsonValue;
    readonly observedAt: string;
  }[];
  readonly result: ReplayJsonValue;
  readonly capturedAt?: string;
}

export interface ReplayCompatibilityIdentity {
  readonly operationName: string;
  readonly operationVersion: string;
  readonly handlerArtifactDigest: string;
  readonly policyVersion: string;
}

export class ReplayEvidenceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayEvidenceIntegrityError";
  }
}

export class ReplayEvidenceCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayEvidenceCompatibilityError";
  }
}

export class ReplayDivergenceError extends Error {
  readonly expectedFingerprint: string;
  readonly actualFingerprint: string;
  constructor(expectedFingerprint: string, actualFingerprint: string) {
    super("Deterministic replay produced a result that differs from the recorded result.");
    this.name = "ReplayDivergenceError";
    this.expectedFingerprint = expectedFingerprint;
    this.actualFingerprint = actualFingerprint;
  }
}

function requireText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReplayEvidenceIntegrityError(name + " is required.");
  }
}

function requireDigest(value: string, name: string): void {
  if (!DIGEST_PATTERN.test(value)) {
    throw new ReplayEvidenceIntegrityError(name + " must be a lowercase SHA-256 digest.");
  }
}

/** Build an immutable, content-addressed execution record from explicit inputs and captured reads. */
export function createReplayEvidenceRecord(input: ReplayEvidenceInput): ReplayEvidenceRecord {
  requireText(input.executionId, "executionId");
  requireText(input.operationName, "operationName");
  requireText(input.operationVersion, "operationVersion");
  requireDigest(input.handlerArtifactDigest, "handlerArtifactDigest");
  requireText(input.policyVersion, "policyVersion");
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw new ReplayEvidenceIntegrityError("capturedAt must be a valid timestamp.");
  }

  const keys = new Set<string>();
  const externalReads: ReplayExternalReadSnapshot[] = input.externalReads.map((read) => {
    requireText(read.key, "external read key");
    if (keys.has(read.key)) {
      throw new ReplayEvidenceIntegrityError("External read keys must be unique within an execution.");
    }
    keys.add(read.key);
    if (!Number.isFinite(Date.parse(read.observedAt))) {
      throw new ReplayEvidenceIntegrityError("External read observedAt must be a valid timestamp.");
    }
    return cloneAndFreeze({
      key: read.key,
      value: read.value,
      valueFingerprint: fingerprint(read.value),
      observedAt: read.observedAt,
    });
  });

  return Object.freeze({
    schemaVersion: 1,
    executionId: input.executionId,
    operationName: input.operationName,
    operationVersion: input.operationVersion,
    handlerArtifactDigest: input.handlerArtifactDigest,
    policyVersion: input.policyVersion,
    canonicalInput: cloneAndFreeze(input.canonicalInput),
    inputFingerprint: fingerprint(input.canonicalInput),
    externalReads: Object.freeze(externalReads),
    result: cloneAndFreeze(input.result),
    resultFingerprint: fingerprint(input.result),
    capturedAt,
  });
}

/** Verify content digests and structural requirements before persisting or replaying a record. */
export function verifyReplayEvidenceRecord(record: ReplayEvidenceRecord): boolean {
  try {
    if (
      record.schemaVersion !== 1 ||
      !record.executionId ||
      !record.operationName ||
      !record.operationVersion ||
      !record.policyVersion ||
      !Number.isFinite(Date.parse(record.capturedAt))
    ) return false;
    requireDigest(record.handlerArtifactDigest, "handlerArtifactDigest");
    requireDigest(record.inputFingerprint, "inputFingerprint");
    requireDigest(record.resultFingerprint, "resultFingerprint");
    if (fingerprint(record.canonicalInput) !== record.inputFingerprint) return false;
    if (fingerprint(record.result) !== record.resultFingerprint) return false;
    const keys = new Set<string>();
    for (const read of record.externalReads) {
      if (!read.key || keys.has(read.key) || !Number.isFinite(Date.parse(read.observedAt))) return false;
      keys.add(read.key);
      requireDigest(read.valueFingerprint, "external read fingerprint");
      if (fingerprint(read.value) !== read.valueFingerprint) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-execute only a deterministic, side-effect-free handler against captured
 * external-read snapshots. Identity mismatches and output divergence fail
 * closed. This helper cannot prevent arbitrary I/O inside a supplied handler;
 * applications must keep replay handlers pure and route side effects elsewhere.
 */
export async function replayWithEvidence<TResult extends ReplayJsonValue>(
  record: ReplayEvidenceRecord,
  identity: ReplayCompatibilityIdentity,
  execute: (input: ReplayJsonValue, externalReads: ReadonlyMap<string, ReplayJsonValue>) => TResult | Promise<TResult>,
): Promise<TResult> {
  if (!verifyReplayEvidenceRecord(record)) {
    throw new ReplayEvidenceIntegrityError("Replay evidence failed structural or digest verification.");
  }
  if (
    identity.operationName !== record.operationName ||
    identity.operationVersion !== record.operationVersion ||
    identity.handlerArtifactDigest !== record.handlerArtifactDigest ||
    identity.policyVersion !== record.policyVersion
  ) {
    throw new ReplayEvidenceCompatibilityError(
      "Replay handler, operation version, or policy version does not match the captured execution.",
    );
  }
  const reads = new Map<string, ReplayJsonValue>(
    record.externalReads.map((read) => [read.key, cloneAndFreeze(read.value)]),
  );
  const result = await execute(cloneAndFreeze(record.canonicalInput), reads);
  const actualFingerprint = fingerprint(result);
  if (actualFingerprint !== record.resultFingerprint) {
    throw new ReplayDivergenceError(record.resultFingerprint, actualFingerprint);
  }
  return result;
}
