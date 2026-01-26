/**
 * Access Control
 * 
 * Enforces declarative access rules before query/mutation execution.
 */

import { AccessControlDef, AccessRule, SignalContext } from "../core/Types";
import { SignalForbiddenError } from "../core/Errors";

export class AccessControl {
  private collectionName: string;
  private rules: AccessControlDef;

  constructor(collectionName: string, rules: AccessControlDef) {
    this.collectionName = collectionName;
    this.rules = rules;
  }

  /**
   * Check access for a query
   */
  async checkQueryAccess(queryName: string, ctx: SignalContext): Promise<boolean> {
    const rule = this.rules.query?.[queryName];

    if (!rule) {
      // No explicit rule means public
      return true;
    }

    return this.evaluateRule(rule, ctx);
  }

  /**
   * Check access for a mutation
   */
  async checkMutationAccess(
    mutationName: string,
    ctx: SignalContext
  ): Promise<boolean> {
    const rule = this.rules.mutation?.[mutationName];

    if (!rule) {
      // No explicit rule means deny by default
      return false;
    }

    return this.evaluateRule(rule, ctx);
  }

  /**
   * Evaluate an access rule
   */
  private async evaluateRule(rule: AccessRule, ctx: SignalContext): Promise<boolean> {
    if (typeof rule === "string") {
      return this.evaluateStringRule(rule, ctx);
    }

    if (typeof rule === "function") {
      return await rule(ctx);
    }

    return false;
  }

  /**
   * Evaluate built-in string rules
   */
  private evaluateStringRule(rule: string, ctx: SignalContext): boolean {
    switch (rule.toLowerCase()) {
      case "public":
        return true;

      case "auth":
      case "authenticated":
        return ctx.auth?.user != null;

      case "admin":
        return ctx.auth?.user?.roles?.includes("admin") ?? false;

      case "owner":
        // Requires context to define ownership
        return false;

      default:
        // Unknown rule defaults to deny
        return false;
    }
  }

  /**
   * Require access or throw
   */
  async requireAccess(
    type: "query" | "mutation",
    name: string,
    ctx: SignalContext
  ): Promise<void> {
    const allowed =
      type === "query"
        ? await this.checkQueryAccess(name, ctx)
        : await this.checkMutationAccess(name, ctx);

    if (!allowed) {
      throw new SignalForbiddenError(
        `Access denied to ${type} ${this.collectionName}.${name}`
      );
    }
  }
}
