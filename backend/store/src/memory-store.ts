import type { LocalSignalRecord, SignalStore } from "./contracts";

const cloneRecord = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export class InMemorySignalStore implements SignalStore {
  private readonly records = new Map<string, LocalSignalRecord>();
  private readonly byMessageId = new Map<string, string>();
  private readonly order: string[] = [];

  async append(record: LocalSignalRecord): Promise<void> {
    const existingId = this.byMessageId.get(record.messageId);
    if (this.records.has(record.id) || existingId) {
      return;
    }

    const snapshot = cloneRecord(record);
    this.records.set(snapshot.id, snapshot);
    this.byMessageId.set(snapshot.messageId, snapshot.id);
    this.order.push(snapshot.id);
  }

  async update(record: LocalSignalRecord): Promise<void> {
    const snapshot = cloneRecord(record);
    const existing = this.records.get(snapshot.id);
    const existingId = this.byMessageId.get(snapshot.messageId);

    if (!existing) {
      if (existingId && existingId !== snapshot.id) {
        return;
      }
      this.records.set(snapshot.id, snapshot);
      this.byMessageId.set(snapshot.messageId, snapshot.id);
      this.order.push(snapshot.id);
      return;
    }

    if (existing.messageId !== snapshot.messageId) {
      this.byMessageId.delete(existing.messageId);
      this.byMessageId.set(snapshot.messageId, snapshot.id);
    }

    this.records.set(snapshot.id, snapshot);
  }

  async getById(id: string): Promise<LocalSignalRecord | null> {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : null;
  }

  async getByMessageId(messageId: string): Promise<LocalSignalRecord | null> {
    const id = this.byMessageId.get(messageId);
    if (!id) {
      return null;
    }
    return this.getById(id);
  }

  async getUnsynced(limit?: number): Promise<LocalSignalRecord[]> {
    const records = this.collectOrdered((record) => !record.synced, limit);
    return records.map((record) => cloneRecord(record));
  }

  async markSynced(id: string, syncedAt: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      return;
    }

    const updated: LocalSignalRecord = {
      ...record,
      synced: true,
      lastSyncedAt: syncedAt,
      lastSyncError: undefined,
      updatedAt: syncedAt,
    };

    this.records.set(id, updated);
  }

  async markSyncFailed(id: string, error: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      return;
    }

    const updated: LocalSignalRecord = {
      ...record,
      syncAttempts: record.syncAttempts + 1,
      lastSyncError: error,
      updatedAt: new Date().toISOString(),
    };

    this.records.set(id, updated);
  }

  async listByTraceId(traceId: string): Promise<LocalSignalRecord[]> {
    const records = this.collectOrdered((record) => record.traceId === traceId);
    return records.map((record) => cloneRecord(record));
  }

  private collectOrdered(
    predicate: (record: LocalSignalRecord) => boolean,
    limit?: number,
  ): LocalSignalRecord[] {
    const records: LocalSignalRecord[] = [];

    for (const id of this.order) {
      const record = this.records.get(id);
      if (!record) {
        continue;
      }
      if (!predicate(record)) {
        continue;
      }

      records.push(record);
      if (limit !== undefined && records.length >= limit) {
        break;
      }
    }

    return records;
  }
}
