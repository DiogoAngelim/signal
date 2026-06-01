import type { IdempotencyRecord, IdempotencyStore } from "./contracts";

const cloneRecord = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async has(key: string): Promise<boolean> {
    return this.records.has(key);
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key);
    return record ? cloneRecord(record) : null;
  }

  async put(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.key, cloneRecord(record));
  }
}
