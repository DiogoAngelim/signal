/**
 * SQL Adapter Base
 * 
 * Abstract base class for concrete SQL implementations (PostgreSQL, MySQL, etc.)
 * Provides common SQL building logic; subclasses implement actual execution.
 */

import type { SignalDB, DocumentId } from "../../core/Types";

export abstract class SqlAdapterBase implements SignalDB {
  protected isConnectedFlag = false;
  protected tableName?: string;

  /**
   * Execute raw SQL (implemented by subclasses)
   */
  protected abstract executeSql(
    sql: string,
    params?: any[]
  ): Promise<any[]>;

  /**
   * Execute raw SQL and get first row (implemented by subclasses)
   */
  protected abstract executeSqlOne(
    sql: string,
    params?: any[]
  ): Promise<any | null>;

  /**
   * Get table name for collection
   */
  protected getTableName(collection: string): string {
    return `"${collection}"`;
  }

  /**
   * Build WHERE clause from query object
   */
  protected buildWhereClause(
    query: Record<string, any>,
    startIndex = 1
  ): { clause: string; params: any[] } {
    if (Object.keys(query).length === 0) {
      return { clause: "", params: [] };
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = startIndex;

    for (const [key, value] of Object.entries(query)) {
      if (value === null) {
        conditions.push(`"${key}" IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => `$${paramIndex++}`).join(",");
        conditions.push(`"${key}" IN (${placeholders})`);
        params.push(...value);
      } else {
        conditions.push(`"${key}" = $${paramIndex++}`);
        params.push(value);
      }
    }

    return {
      clause: `WHERE ${conditions.join(" AND ")}`,
      params,
    };
  }

  /**
   * Check database connection (implemented by subclasses)
   */
  async isConnected(): Promise<boolean> {
    return this.isConnectedFlag;
  }

  /**
   * Find documents
   */
  async find<T = any>(collection: string, query: any = {}): Promise<T[]> {
    const table = this.getTableName(collection);
    const { clause, params } = this.buildWhereClause(query);
    const sql = `SELECT * FROM ${table} ${clause}`;

    const rows = await this.executeSql(sql, params);
    return rows as T[];
  }

  /**
   * Find one document
   */
  async findOne<T = any>(collection: string, query: any = {}): Promise<T | null> {
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
    const table = this.getTableName(collection);
    const id = ((doc as any)?._id as DocumentId) || this.generateDocId();
    const now = Date.now();

    const data = {
      ...doc,
      _id: id,
      _createdAt: now,
    };

    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");
    const columns = keys.map((k) => `"${k}"`).join(",");

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const values = keys.map((k) => data[k as keyof typeof data]);

    await this.executeSql(sql, values);
    return id;
  }

  /**
   * Update document
   */
  async update<T = any>(
    collection: string,
    id: DocumentId,
    update: Partial<T>
  ): Promise<void> {
    const table = this.getTableName(collection);
    const keys = Object.keys(update);

    if (keys.length === 0) {
      return;
    }

    const setClauses = keys
      .map((k, i) => `"${k}" = $${i + 1}`)
      .join(",");

    const values = keys.map((k) => update[k as keyof typeof update]);
    values.push(id as any);

    const sql = `UPDATE ${table} SET ${setClauses} WHERE "_id" = $${keys.length + 1}`;
    await this.executeSql(sql, values);
  }

  /**
   * Delete document
   */
  async remove(collection: string, id: DocumentId): Promise<void> {
    const table = this.getTableName(collection);
    const sql = `DELETE FROM ${table} WHERE "_id" = $1`;
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
  async count(collection: string, query: any = {}): Promise<number> {
    const table = this.getTableName(collection);
    const { clause, params } = this.buildWhereClause(query);
    const sql = `SELECT COUNT(*) as count FROM ${table} ${clause}`;

    const result = await this.executeSqlOne(sql, params);
    return (result?.count || 0) as number;
  }

  /**
   * Disconnect (implemented by subclasses)
   */
  async disconnect(): Promise<void> {
    this.isConnectedFlag = false;
  }

  /**
   * Generate document ID
   */
  protected generateDocId(): DocumentId {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
