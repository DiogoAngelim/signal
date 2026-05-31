import crypto from "node:crypto";
import type { SignalEnvelope, SignalFilters, WebhookFilters } from "../schemas/signal-api.js";

export type SignalTrustMetadata = {
  rawConfidence: number;
  calibratedConfidence: number;
  trustScore: number;
  riskState: "normal" | "elevated" | "risk_off";
  exposureCap: number;
  reason: string;
  rejectionReason?: string;
  moduleContributionSummary: Record<string, { present: boolean; score?: number }>;
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

export type WebhookSubscription = {
  id: string;
  url: string;
  secret: string;
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

export type StoreStats = {
  signals: number;
  audits: number;
  webhooks: number;
  deliveryAttempts: number;
  idempotencyKeys: number;
};

export interface SignalReplayStore {
  consumeReplayKey(key: string, ttlMs: number): Promise<boolean>;
}

export interface SignalStorageAdapter extends SignalReplayStore {
  saveSignal(record: SignalRecord): Promise<{ saved: true } | { saved: false; duplicate: SignalRecord }>;
  getSignal(id: string): Promise<SignalRecord | null>;
  getLatestSignal(filters?: Partial<SignalFilters>): Promise<SignalRecord | null>;
  listSignals(filters?: Partial<SignalFilters>): Promise<SignalRecord[]>;
  findByIdempotencyKey(key: string): Promise<SignalRecord | null>;
  appendAudit(record: Omit<SignalAuditRecord, "id" | "createdAt">): Promise<SignalAuditRecord>;
  listAudit(limit?: number): Promise<SignalAuditRecord[]>;
  createWebhook(input: Omit<WebhookSubscription, "id" | "createdAt" | "updatedAt" | "active">): Promise<WebhookSubscription>;
  listWebhooks(): Promise<WebhookSubscription[]>;
  getWebhook(id: string): Promise<WebhookSubscription | null>;
  deleteWebhook(id: string): Promise<boolean>;
  appendDeliveryAttempt(record: Omit<WebhookDeliveryAttempt, "id" | "createdAt">): Promise<WebhookDeliveryAttempt>;
  updateDeliveryAttempt(id: string, patch: Partial<Omit<WebhookDeliveryAttempt, "id" | "createdAt">>): Promise<void>;
  hasDelivery(deliveryKey: string): Promise<boolean>;
  markDelivery(deliveryKey: string): Promise<boolean>;
  stats(): Promise<StoreStats>;
  reset(): Promise<void>;
}

export class MemorySignalStore implements SignalStorageAdapter {
  private readonly signals = new Map<string, SignalRecord>();
  private readonly orderedSignals: SignalRecord[] = [];
  private readonly latestSignals = new Map<string, SignalRecord>();
  private readonly idempotency = new Map<string, string>();
  private readonly audit: SignalAuditRecord[] = [];
  private readonly webhooks = new Map<string, WebhookSubscription>();
  private readonly deliveryAttempts = new Map<string, WebhookDeliveryAttempt>();
  private readonly deliveryKeys = new Set<string>();
  private readonly replayKeys = new Map<string, number>();
  private sequence = 0;

  async saveSignal(record: SignalRecord): Promise<{ saved: true } | { saved: false; duplicate: SignalRecord }> {
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
    this.idempotency.set(nextRecord.signal.idempotencyKey, nextRecord.signal.id);
    this.orderedSignals.push(nextRecord);
    this.latestSignals.set(latestKey(nextRecord.signal), nextRecord);
    return { saved: true };
  }

  async getSignal(id: string): Promise<SignalRecord | null> {
    return this.signals.get(id) ?? null;
  }

  async getLatestSignal(filters: Partial<SignalFilters> = {}): Promise<SignalRecord | null> {
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

  async listSignals(filters: Partial<SignalFilters> = {}): Promise<SignalRecord[]> {
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
    return id ? this.signals.get(id) ?? null : null;
  }

  async appendAudit(record: Omit<SignalAuditRecord, "id" | "createdAt">): Promise<SignalAuditRecord> {
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

  async createWebhook(input: Omit<WebhookSubscription, "id" | "createdAt" | "updatedAt" | "active">): Promise<WebhookSubscription> {
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
    return Array.from(this.webhooks.values()).filter((webhook) => webhook.active);
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

  async appendDeliveryAttempt(record: Omit<WebhookDeliveryAttempt, "id" | "createdAt">): Promise<WebhookDeliveryAttempt> {
    const attempt = {
      ...record,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.deliveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  async updateDeliveryAttempt(id: string, patch: Partial<Omit<WebhookDeliveryAttempt, "id" | "createdAt">>) {
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
      signals: this.signals.size,
      audits: this.audit.length,
      webhooks: Array.from(this.webhooks.values()).filter((webhook) => webhook.active).length,
      deliveryAttempts: this.deliveryAttempts.size,
      idempotencyKeys: this.idempotency.size,
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
    this.sequence = 0;
  }

  private pruneReplayKeys() {
    const now = Date.now();
    for (const [key, expiresAt] of this.replayKeys.entries()) {
      if (expiresAt <= now) this.replayKeys.delete(key);
    }
  }
}

let singleton: SignalStorageAdapter = new MemorySignalStore();

export function getSignalStore() {
  return singleton;
}

export function setSignalStoreForTests(store: SignalStorageAdapter) {
  singleton = store;
}

export async function resetSignalStoreForTests() {
  await singleton.reset();
}

export function signalMatchesFilters(record: SignalRecord, filters: Partial<SignalFilters | WebhookFilters> = {}) {
  const signal = record.signal;
  const webhookFilters = filters as WebhookFilters;
  const queryFilters = filters as SignalFilters;
  const symbols = webhookFilters.symbols?.map(normalize) ?? (queryFilters.symbol ? [normalize(queryFilters.symbol)] : []);
  const venues = webhookFilters.venues?.map(normalize) ?? (queryFilters.venue ? [normalize(queryFilters.venue)] : []);
  const kinds = webhookFilters.kinds ?? (queryFilters.kind ? [queryFilters.kind] : []);
  const minTrust = webhookFilters.minTrust ?? queryFilters.minTrust;

  if (symbols.length && !symbols.includes(normalize(signal.symbol))) return false;
  if (venues.length && !venues.includes(normalize(signal.venue))) return false;
  if (kinds.length && !kinds.includes(signal.kind)) return false;
  if (queryFilters.timeframe && normalize(queryFilters.timeframe) !== normalize(signal.timeframe)) return false;
  if (minTrust != null && signal.trust < Number(minTrust)) return false;
  return true;
}

function latestKey(input: Pick<SignalEnvelope, "symbol" | "venue" | "timeframe">) {
  return `${normalize(input.venue)}:${normalize(input.symbol)}:${normalize(input.timeframe)}`;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function sequenceFromCursor(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

