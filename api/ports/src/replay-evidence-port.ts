/** JSON-safe values captured at a decision boundary for deterministic replay. */
export type ReplayJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ReplayJsonValue[]
  | { readonly [key: string]: ReplayJsonValue };

export interface ReplayExternalReadSnapshot {
  readonly key: string;
  readonly value: ReplayJsonValue;
  readonly valueFingerprint: string;
  readonly observedAt: string;
}

export interface ReplayEvidenceRecord {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly executionId: string;
  readonly operationName: string;
  readonly operationVersion: string;
  readonly handlerArtifactDigest: string;
  readonly policyVersion: string;
  readonly canonicalInput: ReplayJsonValue;
  readonly inputFingerprint: string;
  readonly externalReads: readonly ReplayExternalReadSnapshot[];
  readonly result: ReplayJsonValue;
  readonly resultFingerprint: string;
  /** Fingerprint of the complete immutable evidence envelope, excluding this field. */
  readonly recordFingerprint: string;
  readonly capturedAt: string;
}

export interface ReplayEvidencePort {
  /** Persist immutable evidence. Repeating the same execution ID and content is idempotent. */
  save(record: ReplayEvidenceRecord): Promise<void>;
  /** Load one immutable execution record, or null when it does not exist. */
  get(input: {
    readonly tenantId: string;
    readonly executionId: string;
  }): Promise<ReplayEvidenceRecord | null>;
}
