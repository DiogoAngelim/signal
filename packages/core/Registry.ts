/**
 * Signal Registry
 * 
 * Tracks and enforces integrity of collections, queries, and mutations.
 * 
 * Registry guarantees:
 * - Unique names per collection (posts, comments, etc.)
 * - Unique names per query/mutation (collection.queryName)
 * - No overrides allowed
 * - Immutable after startup
 */

import {
  SignalRegistry,
  SignalPhase,
  CollectionDef,
  QueryDef,
  MutationDef,
} from "./Types";
import {
  SignalRegistryError,
  SignalLifecycleError,
} from "./Errors";
import { Lifecycle } from "./Lifecycle";
import { invariant } from "../utils/invariant";

export class Registry implements SignalRegistry {
  readonly collections = new Map<string, CollectionDef>();
  readonly queries = new Map<string, QueryDef>();
  readonly mutations = new Map<string, MutationDef>();

  private lifecycle: Lifecycle;
  private registeredKeys = new Set<string>();

  constructor(lifecycle: Lifecycle) {
    this.lifecycle = lifecycle;
  }

  /**
   * Get current lifecycle phase
   */
  get phase(): SignalPhase {
    return this.lifecycle.getPhase();
  }

  /**
   * Generate registry key: "collectionName.itemName"
   */
  getKey(collection: string, name: string): string {
    return `${collection}.${name}`;
  }

  /**
   * Register a collection
   * Name must be unique
   */
  registerCollection(def: CollectionDef): void {
    this.lifecycle.requireRegistrationPhase("register collection");

    const { name } = def;

    if (this.collections.has(name)) {
      throw new SignalRegistryError(
        `Collection "${name}" already registered`
      );
    }

    this.collections.set(name, def);
  }

  /**
   * Get a collection by name
   */
  getCollection(name: string): CollectionDef {
    const col = this.collections.get(name);
    if (!col) {
      throw new SignalRegistryError(
        `Collection "${name}" not found in registry`
      );
    }
    return col;
  }

  /**
   * Check if collection exists
   */
  hasCollection(name: string): boolean {
    return this.collections.has(name);
  }

  /**
   * Register a query
   * Name must be unique within its collection
   */
  registerQuery(def: QueryDef): void {
    this.lifecycle.requireRegistrationPhase("register query");

    const key = this.getKey(def.collectionName, def.name);

    // Verify collection exists
    this.getCollection(def.collectionName);

    // Ensure query name is unique
    if (this.queries.has(key)) {
      throw new SignalRegistryError(
        `Query "${key}" already registered`
      );
    }

    // Don't allow overriding a mutation
    if (this.mutations.has(key)) {
      throw new SignalRegistryError(
        `Key "${key}" already registered as mutation`
      );
    }

    this.queries.set(key, def);
    this.registeredKeys.add(key);
  }

  /**
   * Get a query by collection and name
   */
  getQuery(collectionName: string, queryName: string): QueryDef {
    const key = this.getKey(collectionName, queryName);
    const query = this.queries.get(key);
    if (!query) {
      throw new SignalRegistryError(
        `Query "${key}" not found in registry`
      );
    }
    return query;
  }

  /**
   * Check if query exists
   */
  hasQuery(collectionName: string, queryName: string): boolean {
    const key = this.getKey(collectionName, queryName);
    return this.queries.has(key);
  }

  /**
   * Register a mutation
   * Name must be unique within its collection
   */
  registerMutation(def: MutationDef): void {
    this.lifecycle.requireRegistrationPhase("register mutation");

    const key = this.getKey(def.collectionName, def.name);

    // Verify collection exists
    this.getCollection(def.collectionName);

    // Ensure mutation name is unique
    if (this.mutations.has(key)) {
      throw new SignalRegistryError(
        `Mutation "${key}" already registered`
      );
    }

    // Don't allow overriding a query
    if (this.queries.has(key)) {
      throw new SignalRegistryError(
        `Key "${key}" already registered as query`
      );
    }

    this.mutations.set(key, def);
    this.registeredKeys.add(key);
  }

  /**
   * Get a mutation by collection and name
   */
  getMutation(collectionName: string, mutationName: string): MutationDef {
    const key = this.getKey(collectionName, mutationName);
    const mutation = this.mutations.get(key);
    if (!mutation) {
      throw new SignalRegistryError(
        `Mutation "${key}" not found in registry`
      );
    }
    return mutation;
  }

  /**
   * Check if mutation exists
   */
  hasMutation(collectionName: string, mutationName: string): boolean {
    const key = this.getKey(collectionName, mutationName);
    return this.mutations.has(key);
  }

  /**
   * Get all registered keys (for introspection)
   */
  getAllKeys(): string[] {
    return Array.from(this.registeredKeys);
  }

  /**
   * Introspection: get all operations as a flat list
   */
  introspect(): {
    collections: string[];
    queries: string[];
    mutations: string[];
  } {
    return {
      collections: Array.from(this.collections.keys()),
      queries: Array.from(this.queries.keys()),
      mutations: Array.from(this.mutations.keys()),
    };
  }
}
