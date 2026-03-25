/**
 * Signal Database Interface
 * 
 * Abstract database layer that adapters must implement.
 * Completely agnostic to underlying database.
 */

import { SignalDB, DocumentId } from "../core/Types";
import { SignalConflictError, SignalVersionMismatchError } from "../core/Errors";

/**
 * Base SignalDB interface (already in Types)
 * This file serves as the base for all adapters.
 */

/**
 * Abstract base for SQL adapters
 * Provides common utilities for SQL-based implementations
 */
export abstract class SqlAdapterBase implements SignalDB {
  protected isConnectedFlag = false;

  /**
   * Execute a raw SQL query
   * Subclasses must implement this
   */
  protected abstract executeSql(
    sql: string,
    params?: any[]
  ): Promise<any[]>;

  /**
   * Execute a raw SQL query and return first row
   */
  protected abstract executeSqlOne(
    sql: string,
    params?: any[]
  ): Promise<any | null>;

  /**
   * Build WHERE clause from query object
   */
  protected buildWhereClause(
    query: Record<string, any>,
    prefix = "WHERE"
  ): { clause: string; params: any[] } {
    if (Object.keys(query).length === 0) {
      return { clause: "", params: [] };
    }

    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(query)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        conditions.push(`${key} IN (${value.map(() => "?").join(",")})`);
        params.push(...value);
      } else {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }

    return {
      clause: `${prefix} ${conditions.join(" AND ")}`,
      params,
    };
  }

  /**
   * Check database connection
   */
  async isConnected(): Promise<boolean> {
    return this.isConnectedFlag;
  }

  /**
   * Find multiple documents
   */
  async find<T = any>(collection: string, query: any): Promise<T[]> {
    const { clause, params } = this.buildWhereClause(query);
    const sql = `SELECT * FROM ${collection} ${clause}`;
    const rows = await this.executeSql(sql, params);
    return rows as T[];
  }

  /**
   * Find single document
   */
  async findOne<T = any>(collection: string, query: any): Promise<T | null> {
    const rows = await this.find<T>(collection, query);
    return rows.length > 0 ? rows[0] : null;
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
    const doc_ = {
      ...doc,
      _id: (doc as any)?._id || generateDocId(),
      _createdAt: Date.now(),
      _version: 1,
    };
    if ((doc as any)?._id) {
      const existing = await this.findById(collection, (doc as any)._id);
      if (existing) {
        throw new SignalConflictError(`Document already exists: ${(doc as any)._id}`);
      }
    }
    const keys = Object.keys(doc_);
    const placeholders = keys.map(() => "?").join(",");
    const sql = `INSERT INTO ${collection} (${keys.join(",")}) VALUES (${placeholders})`;
    const values = keys.map((k) => doc_[k as keyof typeof doc_]);

    await this.executeSql(sql, values);
    return doc_._id;
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
    const current = await this.findById<any>(collection, id);
    if (!current) {
      throw new SignalConflictError(`Document not found: ${collection}.${id}`);
    }

    if (options?.expectedVersion != null) {
      const actualVersion = current._version ?? 0;
      if (actualVersion !== options.expectedVersion) {
        throw new SignalVersionMismatchError(
          `Version mismatch for ${collection}.${id}`,
          options.expectedVersion,
          actualVersion
        );
      }
    }

    const nextVersion = (current._version ?? 0) + 1;
    const mergedUpdate: Record<string, any> = {
      ...update,
      _updatedAt: Date.now(),
      _version: nextVersion,
    };

    const mergedKeys = Object.keys(mergedUpdate);
    const setClause = mergedKeys.map((k) => `${k} = ?`).join(",");
    const values = mergedKeys.map((k) => mergedUpdate[k]);

    const sql = `UPDATE ${collection} SET ${setClause} WHERE _id = ?`;
    await this.executeSql(sql, [...values, id]);
  }

  /**
   * Delete document
   */
  async remove(collection: string, id: DocumentId): Promise<void> {
    const sql = `DELETE FROM ${collection} WHERE _id = ?`;
    await this.executeSql(sql, [id]);
  }

  /**
   * Backward-compatible alias for legacy callers
   */
  async delete(collection: string, id: DocumentId): Promise<void> {
    await this.remove(collection, id);
  }

  /**
   * Count documents
   */
  async count(collection: string, query: any): Promise<number> {
    const { clause, params } = this.buildWhereClause(query);
    const sql = `SELECT COUNT(*) as count FROM ${collection} ${clause}`;
    const result = await this.executeSqlOne(sql, params);
    return result?.count || 0;
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.isConnectedFlag = false;
  }
}

/**
 * Generate document ID
 */
function generateDocId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
