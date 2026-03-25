/**
 * Memory Adapter for SignalDB
 * 
 * In-memory implementation for development and testing.
 * Simple, deterministic, no dependencies.
 */

import type { SignalDB, DocumentId } from "../../core/Types";
import { SignalConflictError, SignalVersionMismatchError } from "../../core/Errors";

interface Document {
  _id: DocumentId;
  [key: string]: any;
}

/**
 * In-memory database adapter
 */
export class MemoryAdapter implements SignalDB {
  private collections = new Map<string, Map<DocumentId, Document>>();

  /**
   * Initialize a collection
   */
  initCollection(name: string): void {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
  }

  /**
   * Check connection (always true for memory adapter)
   */
  async isConnected(): Promise<boolean> {
    return true;
  }

  /**
   * Find documents matching query
   */
  async find<T = any>(collection: string, query: any): Promise<T[]> {
    this.initCollection(collection);
    const docs = this.collections.get(collection)!;
    const results: T[] = [];

    for (const doc of docs.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(doc as T);
      }
    }

    return results;
  }

  /**
   * Find one document
   */
  async findOne<T = any>(collection: string, query: any): Promise<T | null> {
    const results = await this.find<T>(collection, query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find by ID
   */
  async findById<T = any>(collection: string, id: DocumentId): Promise<T | null> {
    return this.findOne<T>(collection, { _id: id });
  }

  /**
   * Insert document
   */
  async insert<T = any>(collection: string, doc: Partial<T>): Promise<DocumentId> {
    this.initCollection(collection);
    const docs = this.collections.get(collection)!;

    const id = ((doc as any)?._id as DocumentId) || this.generateId();
    if (docs.has(id)) {
      throw new SignalConflictError(`Document already exists: ${id}`);
    }
    const fullDoc: Document = {
      ...doc,
      _id: id,
      _createdAt: Date.now(),
      _version: 1,
    } as Document;

    docs.set(id, fullDoc);
    return id;
  }

  /**
   * Update document
   */
  async update<T = any>(
    collection: string,
    id: DocumentId,
    update: Partial<T>,
    options?: { expectedVersion?: number }
  ): Promise<void> {
    this.initCollection(collection);
    const docs = this.collections.get(collection)!;
    const doc = docs.get(id);

    if (!doc) {
      throw new SignalConflictError(`Document not found: ${collection}.${id}`);
    }

    const currentVersion = (doc as any)._version ?? 0;
    if (options?.expectedVersion != null && currentVersion !== options.expectedVersion) {
      throw new SignalVersionMismatchError(
        `Version mismatch for ${collection}.${id}`,
        options.expectedVersion,
        currentVersion
      );
    }

    Object.assign(doc, update, {
      _updatedAt: Date.now(),
      _version: currentVersion + 1,
    });
  }

  /**
   * Delete document
   */
  async remove(collection: string, id: DocumentId): Promise<void> {
    this.initCollection(collection);
    const docs = this.collections.get(collection)!;
    docs.delete(id);
  }

  /**
   * Backward-compatible alias
   */
  async delete(collection: string, id: DocumentId): Promise<void> {
    await this.remove(collection, id);
  }

  /**
   * Count documents
   */
  async count(collection: string, query: any): Promise<number> {
    const results = await this.find(collection, query);
    return results.length;
  }

  /**
   * Disconnect (no-op for memory adapter)
   */
  async disconnect(): Promise<void> {
    // no-op
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.collections.clear();
  }

  /**
   * Get all collections (for testing)
   */
  getCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Get all documents in a collection (for testing)
   */
  getAllDocuments<T = any>(collection: string): T[] {
    this.initCollection(collection);
    const docs = this.collections.get(collection)!;
    return Array.from(docs.values()) as T[];
  }

  /**
   * Check if document exists
   */
  async exists(collection: string, id: DocumentId): Promise<boolean> {
    this.initCollection(collection);
    const docs = this.collections.get(collection)!;
    return docs.has(id);
  }

  /**
   * Query helpers
   */
  private matchesQuery(doc: Document, query: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (value === null) {
        if (doc[key] !== null && doc[key] !== undefined) {
          return false;
        }
      } else if (Array.isArray(value)) {
        if (!value.includes(doc[key])) {
          return false;
        }
      } else {
        if (doc[key] !== value) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Generate a document ID
   */
  private generateId(): DocumentId {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
