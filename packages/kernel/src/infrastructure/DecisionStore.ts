/**
 * DecisionStore — Storage for pipeline decisions and their outcomes.
 * Tracks the decision history for audit, replay, and governance.
 */

import { EventBus } from "./EventBus";

export type DecisionRecord = {
  readonly id: string;
  readonly packageId: string;
  readonly decision: string;
  readonly weight: number;
  readonly metadata: Record<string, unknown>;
  readonly timestamp: number;
};

export class DecisionStore {
  private readonly decisions: Map<string, DecisionRecord> = new Map();
  private readonly packageIndex: Map<string, Set<string>> = new Map();
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async store(decision: DecisionRecord): Promise<void> {
    this.decisions.set(decision.id, decision);

    if (!this.packageIndex.has(decision.packageId)) {
      this.packageIndex.set(decision.packageId, new Set());
    }
    this.packageIndex.get(decision.packageId)!.add(decision.id);

    this.eventBus.emit("decision:stored", { decisionId: decision.id, packageId: decision.packageId }, "DecisionStore");
  }

  async get(id: string): Promise<DecisionRecord | undefined> {
    return this.decisions.get(id);
  }

  async findByPackageId(packageId: string): Promise<DecisionRecord[]> {
    const ids = this.packageIndex.get(packageId);
    if (!ids) return [];

    const results: DecisionRecord[] = [];
    for (const id of ids) {
      const record = this.decisions.get(id);
      if (record) results.push(record);
    }
    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  async findSince(timestamp: number): Promise<DecisionRecord[]> {
    const results: DecisionRecord[] = [];
    for (const record of this.decisions.values()) {
      if (record.timestamp >= timestamp) {
        results.push(record);
      }
    }
    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  async all(): Promise<DecisionRecord[]> {
    return Array.from(this.decisions.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  async count(): Promise<number> {
    return this.decisions.size;
  }

  async delete(id: string): Promise<boolean> {
    const record = this.decisions.get(id);
    if (!record) return false;

    this.decisions.delete(id);
    this.packageIndex.get(record.packageId)?.delete(id);

    this.eventBus.emit("decision:deleted", { decisionId: id }, "DecisionStore");
    return true;
  }

  async clear(): Promise<void> {
    this.decisions.clear();
    this.packageIndex.clear();
    this.eventBus.emit("decision:cleared", {}, "DecisionStore");
  }
}