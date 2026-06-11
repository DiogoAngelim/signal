/**
 * @signal/kernel — Signal Kernel + Plugin Architecture
 *
 * The Kernel owns orchestration, state, and execution control.
 * Plugins implement the pipeline stage interfaces and are registered
 * through the orchestrator. SignalPackage is the only shared contract.
 */

// ─── Core Model ───────────────────────────────────────────────
export {
  type SignalPackage,
  type SignalPackageId,
  type SignalPackageMeta,
  type SignalPackageTraceEntry,
  SignalPackageBuilder,
  createSignalPackage,
} from "./model/SignalPackage";

// ─── Interfaces ────────────────────────────────────────────────
export {
  type SignalGenerator,
  type SignalGeneratorInput,
  type SignalGeneratorOutput,
} from "./interfaces/SignalGenerator";

export {
  type Analyzer,
  type AnalyzerInput,
  type AnalyzerOutput,
} from "./interfaces/Analyzer";

export {
  type Scorer,
  type ScorerInput,
  type ScorerOutput,
} from "./interfaces/Scorer";

export {
  type Aggregator,
  type AggregatorInput,
  type AggregatorOutput,
} from "./interfaces/Aggregator";

// ─── Infrastructure ───────────────────────────────────────────
export {
  EventBus,
  type EventListener,
  type KernelEvent,
} from "./infrastructure/EventBus";

export {
  StateStore,
  type StateChange,
} from "./infrastructure/StateStore";

export {
  SignalStore,
} from "./infrastructure/SignalStore";

export {
  DecisionStore,
  type DecisionRecord,
} from "./infrastructure/DecisionStore";

// ─── Orchestration ─────────────────────────────────────────────
export {
  SignalOrchestrator,
  type OrchestratorConfig,
} from "./orchestrator/SignalOrchestrator";

export {
  PipelineRunner,
} from "./orchestrator/PipelineRunner";

export {
  ExecutionController,
  type ExecutionState,
} from "./orchestrator/ExecutionController";

export {
  ReplayEngine,
  type ReplayResult,
  type ReplayMismatch,
} from "./orchestrator/ReplayEngine";

// ─── Plugin Contract ───────────────────────────────────────────
export {
  type SignalPlugin,
  type PluginCapability,
  type PluginDescriptor,
  type PluginContext,
  describePlugin,
} from "./plugin/SignalPlugin";

// ─── Adapter Layer ─────────────────────────────────────────────
export { BaseSignalGenerator } from "./adapters/BaseSignalGenerator";
export { BaseAnalyzer } from "./adapters/BaseAnalyzer";
export { BaseScorer } from "./adapters/BaseScorer";
export { BaseAggregator } from "./adapters/BaseAggregator";

// ─── Built-in Plugins ──────────────────────────────────────────
export {
  StocksOptimizerPlugin,
  StocksGenerator,
  StocksAnalyzer,
  StocksScorer,
  StocksAggregator,
  wireStocksFramework,
  type StocksFrameworkFns,
} from "./plugins/StocksOptimizerPlugin";

// ─── Boundary Enforcement ──────────────────────────────────────
export {
  BoundaryGuard,
  type BoundaryViolation,
  type BoundaryRule,
} from "./boundary/BoundaryGuard";
