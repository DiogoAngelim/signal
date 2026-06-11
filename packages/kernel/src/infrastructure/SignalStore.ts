/**
 * SignalStore — Persistent storage for SignalPackage instances.
 * Provides CRUD operations and query capabilities for signal packages
 * flowing through the kernel pipeline.
 */

import type { SignalPackage, SignalPackageId } from "../model/SignalPackage";
import { EventBus } from "./EventBus";

export class SignalStore {
  private readonly packages: Map<SignalPackageId, SignalPackage> = new Map();
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async store(pkg: SignalPackage): Promise<void> {
    this.packages.set(pkg.id, pkg);
    this.eventBus.emit("signal:stored", { packageId: pkg.id, domain: pkg.meta.domain }, "SignalStore");
  }

  async get(id: SignalPackageId): Promise<SignalPackage | undefined> {
    return this.packages.get(id);
  }

  async delete(id: SignalPackageId): Promise<boolean> {
    const result = this.packages.delete(id);
    if (result) {
      this.eventBus.emit("signal:deleted", { packageId: id }, "SignalStore");
    }
    return result;
  }

  async findByDomain(domain: string): Promise<SignalPackage[]> {
    const results: SignalPackage[] = [];
    for (const pkg of this.packages.values()) {
      if (pkg.meta.domain === domain) {
        results.push(pkg);
      }
    }
    return results;
  }

  async findBySource(source: string): Promise<SignalPackage[]> {
    const results: SignalPackage[] = [];
    for (const pkg of this.packages.values()) {
      if (pkg.meta.source === source) {
        results.push(pkg);
      }
    }
    return results;
  }

  async findSince(timestamp: number): Promise<SignalPackage[]> {
    const results: SignalPackage[] = [];
    for (const pkg of this.packages.values()) {
      if (pkg.meta.createdAt >= timestamp) {
        results.push(pkg);
      }
    }
    return results;
  }

  async all(): Promise<SignalPackage[]> {
    return Array.from(this.packages.values());
  }

  async count(): Promise<number> {
    return this.packages.size;
  }

  async clear(): Promise<void> {
    this.packages.clear();
    this.eventBus.emit("signal:cleared", {}, "SignalStore");
  }
}