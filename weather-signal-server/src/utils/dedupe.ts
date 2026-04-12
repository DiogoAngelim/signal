import { stableStringify } from "./json.js";

export function createDedupeKey(parts: unknown[]): string {
  return stableStringify(parts);
}

export class DedupeStore {
  private entries = new Map<string, number>();

  constructor(private readonly ttlMs: number, private readonly maxSize: number) { }

  has(key: string): boolean {
    this.cleanup();
    const timestamp = this.entries.get(key);
    if (!timestamp) {
      return false;
    }
    return Date.now() - timestamp < this.ttlMs;
  }

  add(key: string) {
    this.entries.set(key, Date.now());
    this.cleanup();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.entries.entries()) {
      if (now - timestamp >= this.ttlMs) {
        this.entries.delete(key);
      }
    }
    if (this.entries.size > this.maxSize) {
      const overflow = this.entries.size - this.maxSize;
      const keys = Array.from(this.entries.keys()).slice(0, overflow);
      for (const key of keys) {
        this.entries.delete(key);
      }
    }
  }
}
