import crypto from "node:crypto";
import pg from "pg";
import type { Pool as PgPool, PoolConfig } from "pg";
import type {
  SignalEnvelope,
  SignalFilters,
  WebhookFilters,
} from "../schemas/signal-api.js";

const { Pool } = pg;

export type SignalTrustMetadata = {
  rawConfidence: number;
  calibratedConfidence: number;
  trustScore: number;
  riskState: "normal" | "elevated" | "risk_off";
  exposureCap: number;
  reason: string;
  rejectionReason?: string;
  moduleContributionSummary: Record<
    string,
    { present: boolean; score?: number }
  >;
  timestampFreshnessMs: number;
  dataFreshness: "fresh" | "stale" | "unknown";
  actionability: "actionable" | "informational" | "blocked";
};

export type SignalRecord = {
  signal: SignalEnvelope;
  trust: SignalTrustMetadata;
  acceptedAt: string;
  sequence: number;
  requestId: string;
};

export type SignalAuditRecord = {
  id: string;
  signalId?: string;
  messageId?: string;
  action: string;
  actor?: string;
  requestId?: string;
  createdAt: string;
  metadata?: unknown;
};

export type SignalApiScope =
  | "signals:read"
  | "signals:emit"
  | "signals:stream"
  | "webhooks:read"
  | "webhooks:write"
  | "audit:read"
  | "admin:keys";

export const SIGNAL_API_SCOPES: SignalApiScope[] = [
  "signals:read",
  "signals:emit",
  "signals:stream",
  "webhooks:read",
  "webhooks:write",
  "audit:read",
  "admin:keys",
];

export type ApiKeyRecord = {
  id: string;
  prefix: string;
  name?: string;
  secretHash: string;
  scopes: SignalApiScope[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
  rotatedFromKeyId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SecretRotationRecord = {
  id: string;
  subjectType: "api_key" | "webhook";
  subjectId: string;
  action: "created" | "rotated" | "revoked";
  previousSubjectId?: string;
  graceExpiresAt?: string;
  actor?: string;
  createdAt: string;
  metadata?: unknown;
};

export type WebhookSubscription = {
  id: string;
  url: string;
  secretCiphertext: string;
  secretPreview: string;
  previousSecretCiphertext?: string;
  previousSecretExpiresAt?: string;
  events: string[];
  filters: WebhookFilters;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryAttempt = {
  id: string;
  webhookId: string;
  signalId?: string;
  event: string;
  deliveryId: string;
  attempt: number;
  status: "queued" | "delivered" | "failed" | "retrying";
  statusCode?: number;
  error?: string;
  createdAt: string;
  nextAttemptAt?: string;
};

export type QueueJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter";

export type QueueJobRecord = {
  id: string;
  queue: string;
  dedupeKey: string;
  payload: unknown;
  status: QueueJobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt?: string;
  lockedBy?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type QueueStats = {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  deadLetter: number;
  oldestQueuedAt?: string;
};

export type StoreStats = {
  driver: "memory" | "postgres";
  signals: number;
  audits: number;
  webhooks: number;
  deliveryAttempts: number;
  idempotencyKeys: number;
  queueJobs: number;
  deadLetterJobs: number;
  apiKeys: number;
  secretRotations: number;
};

export type StoreHealth = {
  ok: boolean;
  driver: StoreStats["driver"];
  latencyMs: number;
  details?: string;
};

export interface SignalReplayStore {
  consumeReplayKey(key: string, ttlMs: number): Promise<boolean>;
}

export interface SignalStorageAdapter extends SignalReplayStore {
  readonly driver: StoreStats["driver"];
  saveSignal(
    record: SignalRecord,
  ): Promise<{ saved: true } | { saved: false; duplicate: SignalRecord }>;
  getSignal(id: string): Promise<SignalRecord | null>;
  getLatestSignal(
    filters?: Partial<SignalFilters>,
  ): Promise<SignalRecord | null>;
  listSignals(filters?: Partial<SignalFilters>): Promise<SignalRecord[]>;
  findByIdempotencyKey(key: string): Promise<SignalRecord | null>;
  appendAudit(
    record: Omit<SignalAuditRecord, "id" | "createdAt">,
  ): Promise<SignalAuditRecord>;
  listAudit(limit?: number): Promise<SignalAuditRecord[]>;
  createWebhook(
    input: Omit<
      WebhookSubscription,
      "id" | "createdAt" | "updatedAt" | "active"
    >,
  ): Promise<WebhookSubscription>;
  listWebhooks(): Promise<WebhookSubscription[]>;
  getWebhook(id: string): Promise<WebhookSubscription | null>;
  deleteWebhook(id: string): Promise<boolean>;
  rotateWebhookSecret(
    id: string,
    patch: {
      secretCiphertext: string;
      secretPreview: string;
      previousSecretCiphertext?: string;
      previousSecretExpiresAt?: string;
    },
  ): Promise<WebhookSubscription | null>;
  appendDeliveryAttempt(
    record: Omit<WebhookDeliveryAttempt, "id" | "createdAt">,
  ): Promise<WebhookDeliveryAttempt>;
  updateDeliveryAttempt(
    id: string,
    patch: Partial<Omit<WebhookDeliveryAttempt, "id" | "createdAt">>,
  ): Promise<void>;
  hasDelivery(deliveryKey: string): Promise<boolean>;
  markDelivery(deliveryKey: string): Promise<boolean>;
  createApiKey(
    input: Omit<
      ApiKeyRecord,
      "id" | "createdAt" | "updatedAt" | "lastUsedAt" | "revokedAt"
    >,
  ): Promise<ApiKeyRecord>;
  listApiKeys(): Promise<ApiKeyRecord[]>;
  getApiKey(id: string): Promise<ApiKeyRecord | null>;
  getApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null>;
  updateApiKey(
    id: string,
    patch: Partial<Omit<ApiKeyRecord, "id" | "createdAt">>,
  ): Promise<ApiKeyRecord | null>;
  recordApiKeyUse(id: string, usedAt: string): Promise<void>;
  appendSecretRotation(
    record: Omit<SecretRotationRecord, "id" | "createdAt">,
  ): Promise<SecretRotationRecord>;
  listSecretRotations(limit?: number): Promise<SecretRotationRecord[]>;
  enqueueQueueJob(
    input: Omit<
      QueueJobRecord,
      | "id"
      | "status"
      | "attempts"
      | "lockedAt"
      | "lockedBy"
      | "lastError"
      | "createdAt"
      | "updatedAt"
    >,
  ): Promise<QueueJobRecord>;
  claimQueueJobs(
    queue: string,
    workerId: string,
    limit: number,
    lockMs?: number,
  ): Promise<QueueJobRecord[]>;
  completeQueueJob(id: string): Promise<void>;
  failQueueJob(
    id: string,
    input: { error: string; nextRunAt?: string; deadLetter?: boolean },
  ): Promise<void>;
  queueStats(queue?: string): Promise<QueueStats>;
  redriveDeadLetterJobs(queue?: string, ids?: string[]): Promise<number>;
  stats(): Promise<StoreStats>;
  healthCheck(): Promise<StoreHealth>;
  reset(): Promise<void>;
}

export class MemorySignalStore implements SignalStorageAdapter {
  readonly driver = "memory" as const;
  private readonly signals = new Map<string, SignalRecord>();
  private readonly orderedSignals: SignalRecord[] = [];
  private readonly latestSignals = new Map<string, SignalRecord>();
  private readonly idempotency = new Map<string, string>();
  private readonly audit: SignalAuditRecord[] = [];
  private readonly webhooks = new Map<string, WebhookSubscription>();
  private readonly deliveryAttempts = new Map<string, WebhookDeliveryAttempt>();
  private readonly deliveryKeys = new Set<string>();
  private readonly replayKeys = new Map<string, number>();
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly apiKeyPrefixes = new Map<string, string>();
  private readonly secretRotations: SecretRotationRecord[] = [];
  private readonly queueJobs = new Map<string, QueueJobRecord>();
  private sequence = 0;

  async saveSignal(
    record: SignalRecord,
  ): Promise<{ saved: true } | { saved: false; duplicate: SignalRecord }> {
    this.pruneReplayKeys();
    const duplicateId = this.idempotency.get(record.signal.idempotencyKey);
    if (duplicateId) {
      const duplicate = this.signals.get(duplicateId);
      if (duplicate) return { saved: false, duplicate };
    }

    if (this.signals.has(record.signal.id)) {
      return { saved: false, duplicate: this.signals.get(record.signal.id)! };
    }

    const nextRecord = {
      ...record,
      sequence: record.sequence || ++this.sequence,
    };

    this.signals.set(nextRecord.signal.id, nextRecord);
    this.idempotency.set(
      nextRecord.signal.idempotencyKey,
      nextRecord.signal.id,
    );
    this.orderedSignals.push(nextRecord);
    this.latestSignals.set(latestKey(nextRecord.signal), nextRecord);
    return { saved: true };
  }

  async getSignal(id: string): Promise<SignalRecord | null> {
    return this.signals.get(id) ?? null;
  }

  async getLatestSignal(
    filters: Partial<SignalFilters> = {},
  ): Promise<SignalRecord | null> {
    if (filters.symbol || filters.venue || filters.timeframe) {
      const key = latestKey({
        symbol: String(filters.symbol ?? "*"),
        venue: String(filters.venue ?? "*"),
        timeframe: String(filters.timeframe ?? "*"),
      });
      const exact = this.latestSignals.get(key);
      if (exact && signalMatchesFilters(exact, filters)) return exact;
    }

    for (let index = this.orderedSignals.length - 1; index >= 0; index -= 1) {
      const record = this.orderedSignals[index];
      if (signalMatchesFilters(record, filters)) return record;
    }

    return null;
  }

  async listSignals(
    filters: Partial<SignalFilters> = {},
  ): Promise<SignalRecord[]> {
    const limit = Math.max(1, Math.min(Number(filters.limit ?? 100), 500));
    const afterSequence = sequenceFromCursor(filters.after);
    return this.orderedSignals
      .filter((record) => record.sequence > afterSequence)
      .filter((record) => signalMatchesFilters(record, filters))
      .slice(-limit)
      .reverse();
  }

  async findByIdempotencyKey(key: string): Promise<SignalRecord | null> {
    const id = this.idempotency.get(key);
    return id ? (this.signals.get(id) ?? null) : null;
  }

  async appendAudit(
    record: Omit<SignalAuditRecord, "id" | "createdAt">,
  ): Promise<SignalAuditRecord> {
    const auditRecord = {
      ...record,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.audit.push(auditRecord);
    return auditRecord;
  }

  async listAudit(limit = 100): Promise<SignalAuditRecord[]> {
    return this.audit.slice(-Math.max(1, Math.min(limit, 500))).reverse();
  }

  async createWebhook(
    input: Omit<
      WebhookSubscription,
      "id" | "createdAt" | "updatedAt" | "active"
    >,
  ): Promise<WebhookSubscription> {
    const now = new Date().toISOString();
    const subscription: WebhookSubscription = {
      ...input,
      id: crypto.randomUUID(),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.webhooks.set(subscription.id, subscription);
    return subscription;
  }

  async listWebhooks(): Promise<WebhookSubscription[]> {
    return Array.from(this.webhooks.values()).filter(
      (webhook) => webhook.active,
    );
  }

  async getWebhook(id: string): Promise<WebhookSubscription | null> {
    return this.webhooks.get(id) ?? null;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;
    this.webhooks.set(id, {
      ...webhook,
      active: false,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async rotateWebhookSecret(
    id: string,
    patch: {
      secretCiphertext: string;
      secretPreview: string;
      previousSecretCiphertext?: string;
      previousSecretExpiresAt?: string;
    },
  ): Promise<WebhookSubscription | null> {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;
    const updated = {
      ...webhook,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.webhooks.set(id, updated);
    return updated;
  }

  async appendDeliveryAttempt(
    record: Omit<WebhookDeliveryAttempt, "id" | "createdAt">,
  ): Promise<WebhookDeliveryAttempt> {
    const attempt = {
      ...record,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.deliveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  async updateDeliveryAttempt(
    id: string,
    patch: Partial<Omit<WebhookDeliveryAttempt, "id" | "createdAt">>,
  ) {
    const attempt = this.deliveryAttempts.get(id);
    if (!attempt) return;
    this.deliveryAttempts.set(id, { ...attempt, ...patch });
  }

  async hasDelivery(deliveryKey: string): Promise<boolean> {
    return this.deliveryKeys.has(deliveryKey);
  }

  async markDelivery(deliveryKey: string): Promise<boolean> {
    if (this.deliveryKeys.has(deliveryKey)) return false;
    this.deliveryKeys.add(deliveryKey);
    return true;
  }

  async createApiKey(
    input: Omit<
      ApiKeyRecord,
      "id" | "createdAt" | "updatedAt" | "lastUsedAt" | "revokedAt"
    >,
  ): Promise<ApiKeyRecord> {
    if (this.apiKeyPrefixes.has(input.prefix)) {
      throw new Error(`Duplicate API key prefix: ${input.prefix}`);
    }

    const now = new Date().toISOString();
    const record: ApiKeyRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.apiKeys.set(record.id, record);
    this.apiKeyPrefixes.set(record.prefix, record.id);
    return record;
  }

  async listApiKeys(): Promise<ApiKeyRecord[]> {
    return Array.from(this.apiKeys.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  async getApiKey(id: string): Promise<ApiKeyRecord | null> {
    return this.apiKeys.get(id) ?? null;
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const id = this.apiKeyPrefixes.get(prefix);
    return id ? (this.apiKeys.get(id) ?? null) : null;
  }

  async updateApiKey(
    id: string,
    patch: Partial<Omit<ApiKeyRecord, "id" | "createdAt">>,
  ): Promise<ApiKeyRecord | null> {
    const existing = this.apiKeys.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.apiKeys.set(id, updated);
    return updated;
  }

  async recordApiKeyUse(id: string, usedAt: string): Promise<void> {
    await this.updateApiKey(id, { lastUsedAt: usedAt });
  }

  async appendSecretRotation(
    record: Omit<SecretRotationRecord, "id" | "createdAt">,
  ): Promise<SecretRotationRecord> {
    const rotation = {
      ...record,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.secretRotations.push(rotation);
    return rotation;
  }

  async listSecretRotations(limit = 100): Promise<SecretRotationRecord[]> {
    return this.secretRotations
      .slice(-Math.max(1, Math.min(limit, 500)))
      .reverse();
  }

  async enqueueQueueJob(
    input: Omit<
      QueueJobRecord,
      | "id"
      | "status"
      | "attempts"
      | "lockedAt"
      | "lockedBy"
      | "lastError"
      | "createdAt"
      | "updatedAt"
    >,
  ): Promise<QueueJobRecord> {
    const existing = Array.from(this.queueJobs.values()).find(
      (job) =>
        job.queue === input.queue &&
        job.dedupeKey === input.dedupeKey &&
        !["succeeded", "dead_letter"].includes(job.status),
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const job: QueueJobRecord = {
      ...input,
      id: crypto.randomUUID(),
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.queueJobs.set(job.id, job);
    return job;
  }

  async claimQueueJobs(
    queue: string,
    workerId: string,
    limit: number,
    lockMs = 30_000,
  ): Promise<QueueJobRecord[]> {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const lockExpiredBefore = nowMs - lockMs;
    const jobs = Array.from(this.queueJobs.values())
      .filter((job) => job.queue === queue)
      .filter(
        (job) =>
          job.status === "queued" ||
          (job.status === "running" &&
            job.lockedAt &&
            Date.parse(job.lockedAt) < lockExpiredBefore),
      )
      .filter((job) => Date.parse(job.runAt) <= nowMs)
      .sort((left, right) => left.runAt.localeCompare(right.runAt))
      .slice(0, Math.max(1, limit));

    return jobs.map((job) => {
      const claimed = {
        ...job,
        status: "running" as const,
        attempts: job.status === "running" ? job.attempts : job.attempts + 1,
        lockedAt: now,
        lockedBy: workerId,
        updatedAt: now,
      };
      this.queueJobs.set(job.id, claimed);
      return claimed;
    });
  }

  async completeQueueJob(id: string): Promise<void> {
    const job = this.queueJobs.get(id);
    if (!job) return;
    this.queueJobs.set(id, {
      ...job,
      status: "succeeded",
      lockedAt: undefined,
      lockedBy: undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  async failQueueJob(
    id: string,
    input: { error: string; nextRunAt?: string; deadLetter?: boolean },
  ): Promise<void> {
    const job = this.queueJobs.get(id);
    if (!job) return;
    this.queueJobs.set(id, {
      ...job,
      status: input.deadLetter ? "dead_letter" : "queued",
      runAt: input.nextRunAt ?? job.runAt,
      lockedAt: undefined,
      lockedBy: undefined,
      lastError: safeError(input.error),
      updatedAt: new Date().toISOString(),
    });
  }

  async queueStats(queue?: string): Promise<QueueStats> {
    const jobs = Array.from(this.queueJobs.values()).filter(
      (job) => !queue || job.queue === queue,
    );
    const oldest = jobs
      .filter((job) => job.status === "queued")
      .map((job) => job.createdAt)
      .sort()[0];

    return {
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      succeeded: jobs.filter((job) => job.status === "succeeded").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      deadLetter: jobs.filter((job) => job.status === "dead_letter").length,
      ...(oldest ? { oldestQueuedAt: oldest } : {}),
    };
  }

  async redriveDeadLetterJobs(queue?: string, ids?: string[]): Promise<number> {
    const idSet = ids?.length ? new Set(ids) : null;
    let count = 0;
    for (const job of this.queueJobs.values()) {
      if (job.status !== "dead_letter") continue;
      if (queue && job.queue !== queue) continue;
      if (idSet && !idSet.has(job.id)) continue;
      this.queueJobs.set(job.id, {
        ...job,
        status: "queued",
        runAt: new Date().toISOString(),
        lockedAt: undefined,
        lockedBy: undefined,
        updatedAt: new Date().toISOString(),
      });
      count += 1;
    }
    return count;
  }

  async consumeReplayKey(key: string, ttlMs: number): Promise<boolean> {
    this.pruneReplayKeys();
    const now = Date.now();
    const existing = this.replayKeys.get(key);
    if (existing && existing > now) return false;
    this.replayKeys.set(key, now + ttlMs);
    return true;
  }

  async stats(): Promise<StoreStats> {
    return {
      driver: this.driver,
      signals: this.signals.size,
      audits: this.audit.length,
      webhooks: Array.from(this.webhooks.values()).filter(
        (webhook) => webhook.active,
      ).length,
      deliveryAttempts: this.deliveryAttempts.size,
      idempotencyKeys: this.idempotency.size,
      queueJobs: this.queueJobs.size,
      deadLetterJobs: Array.from(this.queueJobs.values()).filter(
        (job) => job.status === "dead_letter",
      ).length,
      apiKeys: this.apiKeys.size,
      secretRotations: this.secretRotations.length,
    };
  }

  async healthCheck(): Promise<StoreHealth> {
    return {
      ok: true,
      driver: this.driver,
      latencyMs: 0,
    };
  }

  async reset() {
    this.signals.clear();
    this.orderedSignals.length = 0;
    this.latestSignals.clear();
    this.idempotency.clear();
    this.audit.length = 0;
    this.webhooks.clear();
    this.deliveryAttempts.clear();
    this.deliveryKeys.clear();
    this.replayKeys.clear();
    this.apiKeys.clear();
    this.apiKeyPrefixes.clear();
    this.secretRotations.length = 0;
    this.queueJobs.clear();
    this.sequence = 0;
  }

  private pruneReplayKeys() {
    const now = Date.now();
    for (const [key, expiresAt] of this.replayKeys.entries()) {
      if (expiresAt <= now) this.replayKeys.delete(key);
    }
  }
}

export class PostgresSignalStore implements SignalStorageAdapter {
  readonly driver = "postgres" as const;
  private readonly pool: PgPool;

  constructor(config: PoolConfig | PgPool) {
    this.pool =
      typeof (config as PgPool).query === "function"
        ? (config as PgPool)
        : new Pool(config as PoolConfig);
  }

  async saveSignal(
    record: SignalRecord,
  ): Promise<{ saved: true } | { saved: false; duplicate: SignalRecord }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ sequence: string }>(
        `INSERT INTO signal_records (
          id, message_id, idempotency_key, venue, symbol, timeframe, kind, trust, record, request_id, accepted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
        ON CONFLICT DO NOTHING
        RETURNING sequence`,
        [
          record.signal.id,
          record.signal.messageId,
          record.signal.idempotencyKey,
          record.signal.venue,
          record.signal.symbol,
          record.signal.timeframe,
          record.signal.kind,
          record.signal.trust,
          JSON.stringify(record),
          record.requestId,
          record.acceptedAt,
        ],
      );

      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        const duplicate = await this.findDuplicateSignal(
          record.signal.id,
          record.signal.idempotencyKey,
        );
        if (duplicate) return { saved: false, duplicate };
        throw new Error(
          "Signal insert conflicted but duplicate record could not be loaded.",
        );
      }

      const sequence = Number(inserted.rows[0].sequence);
      const stored = { ...record, sequence };
      await client.query(
        "UPDATE signal_records SET record = $2::jsonb WHERE id = $1",
        [record.signal.id, JSON.stringify(stored)],
      );
      await client.query(
        `INSERT INTO signal_idempotency_keys (idempotency_key, signal_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [record.signal.idempotencyKey, record.signal.id],
      );
      await client.query(
        `INSERT INTO latest_signal_indexes (venue, symbol, timeframe, signal_id, sequence, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (venue, symbol, timeframe)
         DO UPDATE SET signal_id = EXCLUDED.signal_id, sequence = EXCLUDED.sequence, updated_at = NOW()`,
        [
          record.signal.venue,
          record.signal.symbol,
          record.signal.timeframe,
          record.signal.id,
          sequence,
        ],
      );
      await client.query("COMMIT");
      return { saved: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getSignal(id: string): Promise<SignalRecord | null> {
    const result = await this.pool.query<{ record: SignalRecord }>(
      "SELECT record FROM signal_records WHERE id = $1",
      [id],
    );
    return result.rows[0]?.record ?? null;
  }

  async getLatestSignal(
    filters: Partial<SignalFilters> = {},
  ): Promise<SignalRecord | null> {
    const listed = await this.listSignals({ ...filters, limit: 1 });
    return listed[0] ?? null;
  }

  async listSignals(
    filters: Partial<SignalFilters> = {},
  ): Promise<SignalRecord[]> {
    const limit = Math.max(1, Math.min(Number(filters.limit ?? 100), 500));
    const values: unknown[] = [];
    const where: string[] = [];

    if (filters.symbol) {
      values.push(normalize(filters.symbol));
      where.push(`symbol = $${values.length}`);
    }
    if (filters.venue) {
      values.push(String(filters.venue));
      where.push(`venue = $${values.length}`);
    }
    if (filters.timeframe) {
      values.push(String(filters.timeframe));
      where.push(`timeframe = $${values.length}`);
    }
    if (filters.kind) {
      values.push(filters.kind);
      where.push(`kind = $${values.length}`);
    }
    if (filters.minTrust != null) {
      values.push(Number(filters.minTrust));
      where.push(`trust >= $${values.length}`);
    }
    if (filters.after) {
      values.push(sequenceFromCursor(filters.after));
      where.push(`sequence > $${values.length}`);
    }

    values.push(limit);
    const result = await this.pool.query<{ record: SignalRecord }>(
      `SELECT record FROM signal_records ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY sequence DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => row.record);
  }

  async findByIdempotencyKey(key: string): Promise<SignalRecord | null> {
    const result = await this.pool.query<{ record: SignalRecord }>(
      `SELECT sr.record
       FROM signal_idempotency_keys ik
       JOIN signal_records sr ON sr.id = ik.signal_id
       WHERE ik.idempotency_key = $1`,
      [key],
    );
    return result.rows[0]?.record ?? null;
  }

  async appendAudit(
    record: Omit<SignalAuditRecord, "id" | "createdAt">,
  ): Promise<SignalAuditRecord> {
    const id = crypto.randomUUID();
    const result = await this.pool.query<{ created_at: Date }>(
      `INSERT INTO signal_audit_logs (id, signal_id, message_id, action, actor, request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING created_at`,
      [
        id,
        record.signalId ?? null,
        record.messageId ?? null,
        record.action,
        record.actor ?? null,
        record.requestId ?? null,
        JSON.stringify(record.metadata ?? null),
      ],
    );
    return {
      ...record,
      id,
      createdAt: result.rows[0].created_at.toISOString(),
    };
  }

  async listAudit(limit = 100): Promise<SignalAuditRecord[]> {
    const result = await this.pool.query(
      `SELECT id, signal_id, message_id, action, actor, request_id, created_at, metadata
       FROM signal_audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 500))],
    );
    return result.rows.map((row) => ({
      id: row.id,
      signalId: row.signal_id ?? undefined,
      messageId: row.message_id ?? undefined,
      action: row.action,
      actor: row.actor ?? undefined,
      requestId: row.request_id ?? undefined,
      createdAt: row.created_at.toISOString(),
      metadata: row.metadata ?? undefined,
    }));
  }

  async createWebhook(
    input: Omit<
      WebhookSubscription,
      "id" | "createdAt" | "updatedAt" | "active"
    >,
  ): Promise<WebhookSubscription> {
    const id = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO signal_webhook_subscriptions (
        id, url, secret_ciphertext, secret_preview, events, filters, description, active
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,true)
       RETURNING created_at, updated_at`,
      [
        id,
        input.url,
        input.secretCiphertext,
        input.secretPreview,
        JSON.stringify(input.events),
        JSON.stringify(input.filters),
        input.description ?? null,
      ],
    );
    return {
      ...input,
      id,
      active: true,
      createdAt: result.rows[0].created_at.toISOString(),
      updatedAt: result.rows[0].updated_at.toISOString(),
    };
  }

  async listWebhooks(): Promise<WebhookSubscription[]> {
    const result = await this.pool.query(
      "SELECT * FROM signal_webhook_subscriptions WHERE active = true ORDER BY created_at DESC",
    );
    return result.rows.map(rowToWebhook);
  }

  async getWebhook(id: string): Promise<WebhookSubscription | null> {
    const result = await this.pool.query(
      "SELECT * FROM signal_webhook_subscriptions WHERE id = $1",
      [id],
    );
    return result.rows[0] ? rowToWebhook(result.rows[0]) : null;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE signal_webhook_subscriptions SET active = false, updated_at = NOW() WHERE id = $1 AND active = true",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async rotateWebhookSecret(
    id: string,
    patch: {
      secretCiphertext: string;
      secretPreview: string;
      previousSecretCiphertext?: string;
      previousSecretExpiresAt?: string;
    },
  ): Promise<WebhookSubscription | null> {
    const result = await this.pool.query(
      `UPDATE signal_webhook_subscriptions
       SET secret_ciphertext = $2,
           secret_preview = $3,
           previous_secret_ciphertext = $4,
           previous_secret_expires_at = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        patch.secretCiphertext,
        patch.secretPreview,
        patch.previousSecretCiphertext ?? null,
        patch.previousSecretExpiresAt ?? null,
      ],
    );
    return result.rows[0] ? rowToWebhook(result.rows[0]) : null;
  }

  async appendDeliveryAttempt(
    record: Omit<WebhookDeliveryAttempt, "id" | "createdAt">,
  ): Promise<WebhookDeliveryAttempt> {
    const id = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO signal_webhook_delivery_attempts (
        id, webhook_id, signal_id, event, delivery_id, attempt, status, status_code, error, next_attempt_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING created_at`,
      [
        id,
        record.webhookId,
        record.signalId ?? null,
        record.event,
        record.deliveryId,
        record.attempt,
        record.status,
        record.statusCode ?? null,
        record.error ?? null,
        record.nextAttemptAt ?? null,
      ],
    );
    return {
      ...record,
      id,
      createdAt: result.rows[0].created_at.toISOString(),
    };
  }

  async updateDeliveryAttempt(
    id: string,
    patch: Partial<Omit<WebhookDeliveryAttempt, "id" | "createdAt">>,
  ) {
    await this.pool.query(
      `UPDATE signal_webhook_delivery_attempts
       SET status = COALESCE($2, status),
           status_code = COALESCE($3, status_code),
           error = COALESCE($4, error),
           next_attempt_at = $5
       WHERE id = $1`,
      [
        id,
        patch.status ?? null,
        patch.statusCode ?? null,
        patch.error ?? null,
        patch.nextAttemptAt ?? null,
      ],
    );
  }

  async hasDelivery(deliveryKey: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM signal_delivery_dedupe WHERE delivery_key = $1",
      [deliveryKey],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markDelivery(deliveryKey: string): Promise<boolean> {
    const result = await this.pool.query(
      "INSERT INTO signal_delivery_dedupe (delivery_key) VALUES ($1) ON CONFLICT DO NOTHING",
      [deliveryKey],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createApiKey(
    input: Omit<
      ApiKeyRecord,
      "id" | "createdAt" | "updatedAt" | "lastUsedAt" | "revokedAt"
    >,
  ): Promise<ApiKeyRecord> {
    const id = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO signal_api_keys (
        id, prefix, name, secret_hash, scopes, rate_limit_max, rate_limit_window_ms, expires_at, rotated_from_key_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
       RETURNING created_at, updated_at`,
      [
        id,
        input.prefix,
        input.name ?? null,
        input.secretHash,
        JSON.stringify(input.scopes),
        input.rateLimitMax ?? null,
        input.rateLimitWindowMs ?? null,
        input.expiresAt ?? null,
        input.rotatedFromKeyId ?? null,
      ],
    );
    return {
      ...input,
      id,
      createdAt: result.rows[0].created_at.toISOString(),
      updatedAt: result.rows[0].updated_at.toISOString(),
    };
  }

  async listApiKeys(): Promise<ApiKeyRecord[]> {
    const result = await this.pool.query(
      "SELECT * FROM signal_api_keys ORDER BY created_at ASC",
    );
    return result.rows.map(rowToApiKey);
  }

  async getApiKey(id: string): Promise<ApiKeyRecord | null> {
    const result = await this.pool.query(
      "SELECT * FROM signal_api_keys WHERE id = $1",
      [id],
    );
    return result.rows[0] ? rowToApiKey(result.rows[0]) : null;
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const result = await this.pool.query(
      "SELECT * FROM signal_api_keys WHERE prefix = $1",
      [prefix],
    );
    return result.rows[0] ? rowToApiKey(result.rows[0]) : null;
  }

  async updateApiKey(
    id: string,
    patch: Partial<Omit<ApiKeyRecord, "id" | "createdAt">>,
  ): Promise<ApiKeyRecord | null> {
    const existing = await this.getApiKey(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    const result = await this.pool.query(
      `UPDATE signal_api_keys
       SET name = $2,
           secret_hash = $3,
           scopes = $4::jsonb,
           rate_limit_max = $5,
           rate_limit_window_ms = $6,
           expires_at = $7,
           revoked_at = $8,
           last_used_at = $9,
           rotated_from_key_id = $10,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        next.name ?? null,
        next.secretHash,
        JSON.stringify(next.scopes),
        next.rateLimitMax ?? null,
        next.rateLimitWindowMs ?? null,
        next.expiresAt ?? null,
        next.revokedAt ?? null,
        next.lastUsedAt ?? null,
        next.rotatedFromKeyId ?? null,
      ],
    );
    return result.rows[0] ? rowToApiKey(result.rows[0]) : null;
  }

  async recordApiKeyUse(id: string, usedAt: string): Promise<void> {
    await this.pool.query(
      "UPDATE signal_api_keys SET last_used_at = $2, updated_at = NOW() WHERE id = $1",
      [id, usedAt],
    );
  }

  async appendSecretRotation(
    record: Omit<SecretRotationRecord, "id" | "createdAt">,
  ): Promise<SecretRotationRecord> {
    const id = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO signal_secret_rotations (
        id, subject_type, subject_id, action, previous_subject_id, grace_expires_at, actor, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING created_at`,
      [
        id,
        record.subjectType,
        record.subjectId,
        record.action,
        record.previousSubjectId ?? null,
        record.graceExpiresAt ?? null,
        record.actor ?? null,
        JSON.stringify(record.metadata ?? null),
      ],
    );
    return {
      ...record,
      id,
      createdAt: result.rows[0].created_at.toISOString(),
    };
  }

  async listSecretRotations(limit = 100): Promise<SecretRotationRecord[]> {
    const result = await this.pool.query(
      "SELECT * FROM signal_secret_rotations ORDER BY created_at DESC LIMIT $1",
      [Math.max(1, Math.min(limit, 500))],
    );
    return result.rows.map((row) => ({
      id: row.id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      action: row.action,
      previousSubjectId: row.previous_subject_id ?? undefined,
      graceExpiresAt: row.grace_expires_at?.toISOString?.() ?? undefined,
      actor: row.actor ?? undefined,
      createdAt: row.created_at.toISOString(),
      metadata: row.metadata ?? undefined,
    }));
  }

  async enqueueQueueJob(
    input: Omit<
      QueueJobRecord,
      | "id"
      | "status"
      | "attempts"
      | "lockedAt"
      | "lockedBy"
      | "lastError"
      | "createdAt"
      | "updatedAt"
    >,
  ): Promise<QueueJobRecord> {
    const id = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO signal_queue_jobs (id, queue, dedupe_key, payload, status, attempts, max_attempts, run_at)
       VALUES ($1,$2,$3,$4::jsonb,'queued',0,$5,$6)
       ON CONFLICT (queue, dedupe_key) WHERE status IN ('queued', 'running', 'failed')
       DO UPDATE SET updated_at = signal_queue_jobs.updated_at
       RETURNING *`,
      [
        id,
        input.queue,
        input.dedupeKey,
        JSON.stringify(input.payload),
        input.maxAttempts,
        input.runAt,
      ],
    );
    return rowToQueueJob(result.rows[0]);
  }

  async claimQueueJobs(
    queue: string,
    workerId: string,
    limit: number,
    lockMs = 30_000,
  ): Promise<QueueJobRecord[]> {
    const result = await this.pool.query(
      `WITH candidates AS (
         SELECT id
         FROM signal_queue_jobs
         WHERE queue = $1
           AND run_at <= NOW()
           AND (
             status = 'queued'
             OR (status = 'running' AND locked_at < NOW() - ($4::text || ' milliseconds')::interval)
           )
         ORDER BY run_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE signal_queue_jobs jobs
       SET status = 'running',
           attempts = CASE WHEN jobs.status = 'running' THEN jobs.attempts ELSE jobs.attempts + 1 END,
           locked_at = NOW(),
           locked_by = $3,
           updated_at = NOW()
       FROM candidates
       WHERE jobs.id = candidates.id
       RETURNING jobs.*`,
      [queue, Math.max(1, limit), workerId, lockMs],
    );
    return result.rows.map(rowToQueueJob);
  }

  async completeQueueJob(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE signal_queue_jobs SET status = 'succeeded', locked_at = NULL, locked_by = NULL, updated_at = NOW() WHERE id = $1",
      [id],
    );
  }

  async failQueueJob(
    id: string,
    input: { error: string; nextRunAt?: string; deadLetter?: boolean },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE signal_queue_jobs
       SET status = $2,
           run_at = COALESCE($3, run_at),
           locked_at = NULL,
           locked_by = NULL,
           last_error = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        input.deadLetter ? "dead_letter" : "queued",
        input.nextRunAt ?? null,
        safeError(input.error),
      ],
    );
  }

  async queueStats(queue?: string): Promise<QueueStats> {
    const result = await this.pool.query(
      `SELECT status, COUNT(*)::int AS count, MIN(created_at) AS oldest
       FROM signal_queue_jobs
       ${queue ? "WHERE queue = $1" : ""}
       GROUP BY status`,
      queue ? [queue] : [],
    );
    const stats: QueueStats = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      deadLetter: 0,
    };
    for (const row of result.rows) {
      if (row.status === "queued") stats.queued = row.count;
      if (row.status === "running") stats.running = row.count;
      if (row.status === "succeeded") stats.succeeded = row.count;
      if (row.status === "failed") stats.failed = row.count;
      if (row.status === "dead_letter") stats.deadLetter = row.count;
      if (row.status === "queued" && row.oldest)
        stats.oldestQueuedAt = row.oldest.toISOString();
    }
    return stats;
  }

  async redriveDeadLetterJobs(queue?: string, ids?: string[]): Promise<number> {
    const values: unknown[] = [];
    const where = ["status = 'dead_letter'"];
    if (queue) {
      values.push(queue);
      where.push(`queue = $${values.length}`);
    }
    if (ids?.length) {
      values.push(ids);
      where.push(`id = ANY($${values.length})`);
    }
    const result = await this.pool.query(
      `UPDATE signal_queue_jobs
       SET status = 'queued', run_at = NOW(), locked_at = NULL, locked_by = NULL, updated_at = NOW()
       WHERE ${where.join(" AND ")}`,
      values,
    );
    return result.rowCount ?? 0;
  }

  async consumeReplayKey(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO signal_replay_keys (replay_key, expires_at)
       VALUES ($1, NOW() + ($2::text || ' milliseconds')::interval)
       ON CONFLICT (replay_key)
       DO UPDATE SET replay_key = signal_replay_keys.replay_key
       WHERE signal_replay_keys.expires_at <= NOW()`,
      [key, ttlMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async stats(): Promise<StoreStats> {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM signal_records) AS signals,
        (SELECT COUNT(*)::int FROM signal_audit_logs) AS audits,
        (SELECT COUNT(*)::int FROM signal_webhook_subscriptions WHERE active = true) AS webhooks,
        (SELECT COUNT(*)::int FROM signal_webhook_delivery_attempts) AS delivery_attempts,
        (SELECT COUNT(*)::int FROM signal_idempotency_keys) AS idempotency_keys,
        (SELECT COUNT(*)::int FROM signal_queue_jobs) AS queue_jobs,
        (SELECT COUNT(*)::int FROM signal_queue_jobs WHERE status = 'dead_letter') AS dead_letter_jobs,
        (SELECT COUNT(*)::int FROM signal_api_keys) AS api_keys,
        (SELECT COUNT(*)::int FROM signal_secret_rotations) AS secret_rotations
    `);
    const row = result.rows[0];
    return {
      driver: this.driver,
      signals: row.signals,
      audits: row.audits,
      webhooks: row.webhooks,
      deliveryAttempts: row.delivery_attempts,
      idempotencyKeys: row.idempotency_keys,
      queueJobs: row.queue_jobs,
      deadLetterJobs: row.dead_letter_jobs,
      apiKeys: row.api_keys,
      secretRotations: row.secret_rotations,
    };
  }

  async healthCheck(): Promise<StoreHealth> {
    const startedAt = Date.now();
    try {
      await this.pool.query("SELECT 1");
      return {
        ok: true,
        driver: this.driver,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        driver: this.driver,
        latencyMs: Date.now() - startedAt,
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async reset(): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to reset signal storage in production.");
    }
    await this.pool.query(`
      TRUNCATE
        signal_replay_keys,
        signal_delivery_dedupe,
        signal_webhook_delivery_attempts,
        signal_queue_jobs,
        signal_secret_rotations,
        signal_api_keys,
        signal_webhook_subscriptions,
        signal_audit_logs,
        latest_signal_indexes,
        signal_idempotency_keys,
        signal_records
      RESTART IDENTITY CASCADE
    `);
  }

  private async findDuplicateSignal(
    id: string,
    idempotencyKey: string,
  ): Promise<SignalRecord | null> {
    const result = await this.pool.query<{ record: SignalRecord }>(
      "SELECT record FROM signal_records WHERE id = $1 OR idempotency_key = $2 LIMIT 1",
      [id, idempotencyKey],
    );
    return result.rows[0]?.record ?? null;
  }
}

let singleton: SignalStorageAdapter = createSignalStoreFromEnvironment();

export function createSignalStoreFromEnvironment(): SignalStorageAdapter {
  const driver =
    process.env.SIGNAL_STORAGE_DRIVER ??
    (process.env.DATABASE_URL ? "postgres" : "memory");

  if (driver === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("SIGNAL_STORAGE_DRIVER=postgres requires DATABASE_URL.");
    }
    return new PostgresSignalStore({
      connectionString: process.env.DATABASE_URL,
      max: positiveInt(process.env.SIGNAL_DATABASE_POOL_MAX, 10),
      idleTimeoutMillis: positiveInt(
        process.env.SIGNAL_DATABASE_IDLE_TIMEOUT_MS,
        30_000,
      ),
      connectionTimeoutMillis: positiveInt(
        process.env.SIGNAL_DATABASE_CONNECT_TIMEOUT_MS,
        5_000,
      ),
    });
  }

  return new MemorySignalStore();
}

export function getSignalStore() {
  return singleton;
}

export function setSignalStoreForTests(store: SignalStorageAdapter) {
  singleton = store;
}

export async function resetSignalStoreForTests() {
  await singleton.reset();
}

export function publicApiKey(record: ApiKeyRecord) {
  return {
    id: record.id,
    prefix: record.prefix,
    name: record.name,
    scopes: record.scopes,
    rateLimitMax: record.rateLimitMax,
    rateLimitWindowMs: record.rateLimitWindowMs,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    rotatedFromKeyId: record.rotatedFromKeyId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function signalMatchesFilters(
  record: SignalRecord,
  filters: Partial<SignalFilters | WebhookFilters> = {},
) {
  const signal = record.signal;
  const webhookFilters = filters as WebhookFilters;
  const queryFilters = filters as SignalFilters;
  const symbols =
    webhookFilters.symbols?.map(normalize) ??
    (queryFilters.symbol ? [normalize(queryFilters.symbol)] : []);
  const venues =
    webhookFilters.venues?.map(normalize) ??
    (queryFilters.venue ? [normalize(queryFilters.venue)] : []);
  const kinds =
    webhookFilters.kinds ?? (queryFilters.kind ? [queryFilters.kind] : []);
  const minTrust = webhookFilters.minTrust ?? queryFilters.minTrust;

  if (symbols.length && !symbols.includes(normalize(signal.symbol)))
    return false;
  if (venues.length && !venues.includes(normalize(signal.venue))) return false;
  if (kinds.length && !kinds.includes(signal.kind)) return false;
  if (
    queryFilters.timeframe &&
    normalize(queryFilters.timeframe) !== normalize(signal.timeframe)
  )
    return false;
  if (minTrust != null && signal.trust < Number(minTrust)) return false;
  return true;
}

function rowToWebhook(row: any): WebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    secretCiphertext: row.secret_ciphertext,
    secretPreview: row.secret_preview,
    previousSecretCiphertext: row.previous_secret_ciphertext ?? undefined,
    previousSecretExpiresAt:
      row.previous_secret_expires_at?.toISOString?.() ?? undefined,
    events: row.events ?? [],
    filters: row.filters ?? {},
    description: row.description ?? undefined,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToApiKey(row: any): ApiKeyRecord {
  return {
    id: row.id,
    prefix: row.prefix,
    name: row.name ?? undefined,
    secretHash: row.secret_hash,
    scopes: row.scopes ?? [],
    rateLimitMax: row.rate_limit_max ?? undefined,
    rateLimitWindowMs: row.rate_limit_window_ms ?? undefined,
    expiresAt: row.expires_at?.toISOString?.() ?? undefined,
    revokedAt: row.revoked_at?.toISOString?.() ?? undefined,
    lastUsedAt: row.last_used_at?.toISOString?.() ?? undefined,
    rotatedFromKeyId: row.rotated_from_key_id ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToQueueJob(row: any): QueueJobRecord {
  return {
    id: row.id,
    queue: row.queue,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: row.run_at.toISOString(),
    lockedAt: row.locked_at?.toISOString?.() ?? undefined,
    lockedBy: row.locked_by ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function latestKey(
  input: Pick<SignalEnvelope, "symbol" | "venue" | "timeframe">,
) {
  return `${normalize(input.venue)}:${normalize(input.symbol)}:${normalize(input.timeframe)}`;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function sequenceFromCursor(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function safeError(error: string) {
  return error.slice(0, 500);
}
