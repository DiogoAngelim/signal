/**
 * SignalPlugin — The contract that all plugins must implement.
 * Plugins provide implementations for the kernel pipeline stages
 * (generate, analyze, score, aggregate) but cannot control execution.
 *
 * The Kernel owns orchestration; plugins only provide stage handlers.
 * SignalPackage is the only shared data contract between kernel and plugins.
 */

import type { SignalGenerator } from "../interfaces/SignalGenerator";
import type { Analyzer } from "../interfaces/Analyzer";
import type { Scorer } from "../interfaces/Scorer";
import type { Aggregator } from "../interfaces/Aggregator";

export type PluginCapability = "generate" | "analyze" | "score" | "aggregate";

export type PluginDescriptor = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly domain: string;
  readonly capabilities: ReadonlyArray<PluginCapability>;
};

export interface SignalPlugin {
  /** Unique identifier for this plugin (e.g., "stocks-optimizer") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Plugin version (incremented on breaking changes) */
  readonly version: number;

  /** Description of what this plugin provides */
  readonly description: string;

  /** Domain this plugin operates within (e.g., "stocks", "weather") */
  readonly domain: string;

  /** List of pipeline capabilities this plugin provides */
  readonly capabilities: ReadonlyArray<PluginCapability>;

  /** Called by the kernel when the plugin is registered. Perform initialization here. */
  onRegister?(context: PluginContext): Promise<void>;

  /** Called by the kernel before shutdown. Clean up resources here. */
  onDispose?(): Promise<void>;

  /** Provide a SignalGenerator implementation. Required if "generate" is in capabilities. */
  getGenerator?(): SignalGenerator;

  /** Provide an Analyzer implementation. Required if "analyze" is in capabilities. */
  getAnalyzer?(): Analyzer;

  /** Provide a Scorer implementation. Required if "score" is in capabilities. */
  getScorer?(): Scorer;

  /** Provide an Aggregator implementation. Required if "aggregate" is in capabilities. */
  getAggregator?(): Aggregator;
}

export type PluginContext = {
  /** The plugin's own descriptor, as registered */
  readonly descriptor: PluginDescriptor;

  /** Read-only access to kernel state (plugins cannot directly mutate) */
  readonly state: {
    get<T = unknown>(key: string): T | undefined;
    has(key: string): boolean;
    snapshot(): Readonly<Record<string, unknown>>;
  };

  /** Emit events into the kernel event bus */
  readonly events: {
    emit(type: string, payload: Record<string, unknown>): void;
  };
};

export function describePlugin(plugin: SignalPlugin): PluginDescriptor {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    domain: plugin.domain,
    capabilities: plugin.capabilities,
  };
}