/**
 * Signal Collection
 * 
 * Fluent API for collection registration with access control.
 * Example:
 * 
 *   signal.collection("posts")
 *     .access({
 *       query: { public: "public", private: (ctx) => ctx.auth.user != null },
 *       mutation: { create: "auth" }
 *     })
 *     .query("public", async (params, ctx) => { ... })
 *     .mutation("create", async (params, ctx) => { ... })
 */

import { CollectionDef, AccessControlDef, QueryHandler, MutationHandler } from "./Types";
import { Registry } from "./Registry";
import { AccessControl } from "../security/AccessControl";
import { Lifecycle } from "./Lifecycle";

export class Collection {
  private collectionDef: CollectionDef;
  private registry: Registry;
  private lifecycle: Lifecycle;
  private accessControl?: AccessControl;

  constructor(
    name: string,
    registry: Registry,
    lifecycle: Lifecycle
  ) {
    this.collectionDef = { name };
    this.registry = registry;
    this.lifecycle = lifecycle;

    // Register collection immediately
    this.registry.registerCollection(this.collectionDef);
  }

  /**
   * Set access control rules
   */
  access(rules: AccessControlDef): this {
    this.collectionDef.access = rules;
    this.accessControl = new AccessControl(this.collectionDef.name, rules);
    return this;
  }

  /**
   * Get access control if set
   */
  getAccessControl(): AccessControl | undefined {
    return this.accessControl;
  }

  /**
   * Register a query
   */
  query<Params = any, Result = any>(
    name: string,
    handler: QueryHandler<Params, Result>
  ): this {
    this.registry.registerQuery({
      name,
      collectionName: this.collectionDef.name,
      handler,
    });
    return this;
  }

  /**
   * Register a mutation
   */
  mutation<Params = any, Result = any>(
    name: string,
    handler: MutationHandler<Params, Result>
  ): this {
    this.registry.registerMutation({
      name,
      collectionName: this.collectionDef.name,
      handler,
    });
    return this;
  }

  /**
   * Get collection definition
   */
  getDefinition(): CollectionDef {
    return this.collectionDef;
  }

  /**
   * Get collection name
   */
  getName(): string {
    return this.collectionDef.name;
  }
}
