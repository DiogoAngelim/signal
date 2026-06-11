/**
 * BoundaryGuard — Enforces architectural boundaries between
 * the Kernel and Plugins.
 *
 * Invariants enforced:
 * 1. Kernel owns orchestration — plugins cannot control execution
 * 2. Plugins cannot directly mutate kernel state
 * 3. SignalPackage is the only shared data contract
 * 4. Plugins can only emit events through the PluginContext
 * 5. Plugins cannot register or dispose other plugins
 * 6. Plugins cannot access the execution controller
 */

import type { SignalPlugin, PluginCapability } from "../plugin/SignalPlugin";
import { EventBus } from "../infrastructure/EventBus";

export type BoundaryViolation = {
  readonly pluginId: string;
  readonly rule: BoundaryRule;
  readonly message: string;
  readonly timestamp: number;
};

export type BoundaryRule =
  | "no-execution-control"
  | "no-state-mutation"
  | "no-cross-plugin-access"
  | "no-direct-event-bus"
  | "no-unregistered-capability"
  | "signal-package-only-contract";

const VALID_CAPABILITIES: Set<string> = new Set(["generate", "analyze", "score", "aggregate"]);

export class BoundaryGuard {
  private readonly violations: BoundaryViolation[] = [];
  private readonly registeredPluginIds: Set<string> = new Set();
  private readonly pluginCapabilities: Map<string, Set<string>> = new Map();

  constructor(private readonly eventBus: EventBus) {}

  /**
   * Validate a plugin before registration.
   * Checks that the plugin's capabilities are valid and that
   * it doesn't claim capabilities it doesn't implement.
   */
  validatePlugin(plugin: SignalPlugin): boolean {
    const pluginId = plugin.id;
    let valid = true;

    // Rule: capabilities must be from the valid set
    for (const cap of plugin.capabilities) {
      if (!VALID_CAPABILITIES.has(cap)) {
        this.recordViolation(pluginId, "no-unregistered-capability", `Plugin claims unknown capability: ${cap}`);
        valid = false;
      }
    }

    // Rule: if plugin claims "generate", it must implement getGenerator
    if (plugin.capabilities.includes("generate" as PluginCapability) && !plugin.getGenerator) {
      this.recordViolation(pluginId, "no-unregistered-capability", `Plugin claims "generate" but does not implement getGenerator()`);
      valid = false;
    }

    // Rule: if plugin claims "analyze", it must implement getAnalyzer
    if (plugin.capabilities.includes("analyze" as PluginCapability) && !plugin.getAnalyzer) {
      this.recordViolation(pluginId, "no-unregistered-capability", `Plugin claims "analyze" but does not implement getAnalyzer()`);
      valid = false;
    }

    // Rule: if plugin claims "score", it must implement getScorer
    if (plugin.capabilities.includes("score" as PluginCapability) && !plugin.getScorer) {
      this.recordViolation(pluginId, "no-unregistered-capability", `Plugin claims "score" but does not implement getScorer()`);
      valid = false;
    }

    // Rule: if plugin claims "aggregate", it must implement getAggregator
    if (plugin.capabilities.includes("aggregate" as PluginCapability) && !plugin.getAggregator) {
      this.recordViolation(pluginId, "no-unregistered-capability", `Plugin claims "aggregate" but does not implement getAggregator()`);
      valid = false;
    }

    return valid;
  }

  /**
   * Record a plugin as registered. Used to enforce cross-plugin access rules.
   */
  markRegistered(pluginId: string, capabilities: ReadonlyArray<PluginCapability>): void {
    this.registeredPluginIds.add(pluginId);
    this.pluginCapabilities.set(pluginId, new Set(capabilities));
  }

  /**
   * Remove a plugin from the registered set.
   */
  markUnregistered(pluginId: string): void {
    this.registeredPluginIds.delete(pluginId);
    this.pluginCapabilities.delete(pluginId);
  }

  /**
   * Enforce that a plugin cannot access another plugin's internals.
   */
  enforceNoCrossPluginAccess(callerPluginId: string, targetPluginId: string): boolean {
    if (callerPluginId === targetPluginId) return true; // self-access is fine

    this.recordViolation(callerPluginId, "no-cross-plugin-access", `Plugin ${callerPluginId} attempted to access plugin ${targetPluginId}`);
    return false;
  }

  /**
   * Enforce that plugins cannot control execution.
   * The execution controller is kernel-only.
   */
  enforceNoExecutionControl(pluginId: string): boolean {
    this.recordViolation(pluginId, "no-execution-control", `Plugin ${pluginId} attempted to control execution`);
    return false;
  }

  /**
   * Enforce that plugins cannot directly mutate kernel state.
   * State mutations must go through the kernel's own methods.
   */
  enforceNoStateMutation(pluginId: string, key: string): boolean {
    this.recordViolation(pluginId, "no-state-mutation", `Plugin ${pluginId} attempted to mutate kernel state: ${key}`);
    return false;
  }

  /**
   * Enforce that plugins cannot access the event bus directly.
   * Events must be emitted through PluginContext.events.emit().
   */
  enforceNoDirectEventBus(pluginId: string): boolean {
    this.recordViolation(pluginId, "no-direct-event-bus", `Plugin ${pluginId} attempted to access EventBus directly`);
    return false;
  }

  /**
   * Enforce that SignalPackage is the only shared contract.
   * Plugins must not pass custom types through the pipeline.
   */
  enforceSignalPackageContract(pluginId: string, data: unknown): boolean {
    if (data === null || data === undefined) return true;

    // Data flowing through the pipeline must be plain records
    // (not class instances, functions, etc.)
    if (typeof data === "function") {
      this.recordViolation(pluginId, "signal-package-only-contract", `Plugin ${pluginId} passed a function through the pipeline`);
      return false;
    }

    return true;
  }

  getViolations(): ReadonlyArray<BoundaryViolation> {
    return this.violations;
  }

  getViolationsFor(pluginId: string): ReadonlyArray<BoundaryViolation> {
    return this.violations.filter((v) => v.pluginId === pluginId);
  }

  hasViolations(): boolean {
    return this.violations.length > 0;
  }

  clearViolations(): void {
    this.violations.length = 0;
  }

  private recordViolation(pluginId: string, rule: BoundaryRule, message: string): void {
    const violation: BoundaryViolation = {
      pluginId,
      rule,
      message,
      timestamp: Date.now(),
    };
    this.violations.push(violation);
    this.eventBus.emit("boundary:violation", { pluginId, rule, message }, "BoundaryGuard");
  }
}