/**
 * SignalOrchestrator — Central coordinator for the Signal Kernel.
 * Manages plugin registration, pipeline construction, and execution lifecycle.
 * The Kernel owns orchestration; plugins cannot control execution.
 */

import { BoundaryGuard } from "../boundary/BoundaryGuard";
import { DecisionStore } from "../infrastructure/DecisionStore";
import { EventBus } from "../infrastructure/EventBus";
import { SignalStore } from "../infrastructure/SignalStore";
import { StateStore } from "../infrastructure/StateStore";
import type { Aggregator } from "../interfaces/Aggregator";
import type { Analyzer } from "../interfaces/Analyzer";
import type { Scorer } from "../interfaces/Scorer";
import type { SignalGenerator } from "../interfaces/SignalGenerator";
import type {
  SignalPackage,
  SignalPackageId,
  SignalPackageMeta,
} from "../model/SignalPackage";
import { createSignalPackage } from "../model/SignalPackage";
import type {
  PluginContext,
  PluginDescriptor,
  SignalPlugin,
} from "../plugin/SignalPlugin";
import { describePlugin } from "../plugin/SignalPlugin";
import { ExecutionController } from "./ExecutionController";
import { PipelineRunner } from "./PipelineRunner";

export type OrchestratorConfig = {
  readonly domain: string;
  readonly version: number;
  readonly maxConcurrentPipelines: number;
};

export class SignalOrchestrator {
  public readonly eventBus: EventBus;
  public readonly stateStore: StateStore;
  public readonly signalStore: SignalStore;
  public readonly decisionStore: DecisionStore;
  public readonly pipelineRunner: PipelineRunner;
  public readonly executionController: ExecutionController;

  private readonly generators: Map<string, SignalGenerator> = new Map();
  private readonly analyzers: Map<string, Analyzer> = new Map();
  private readonly scorers: Map<string, Scorer> = new Map();
  private readonly aggregators: Map<string, Aggregator> = new Map();
  private readonly plugins: Map<string, SignalPlugin> = new Map();
  public readonly boundaryGuard: BoundaryGuard;

  constructor(private readonly config: OrchestratorConfig) {
    this.eventBus = new EventBus();
    this.boundaryGuard = new BoundaryGuard(this.eventBus);
    this.stateStore = new StateStore(this.eventBus);
    this.signalStore = new SignalStore(this.eventBus);
    this.decisionStore = new DecisionStore(this.eventBus);
    this.executionController = new ExecutionController(
      this.eventBus,
      config.maxConcurrentPipelines,
    );
    this.pipelineRunner = new PipelineRunner(
      this.eventBus,
      this.signalStore,
      this.decisionStore,
    );
  }

  registerGenerator(generator: SignalGenerator): void {
    this.generators.set(generator.id, generator);
    this.eventBus.emit(
      "orchestrator:generator-registered",
      { id: generator.id, version: generator.version },
      "SignalOrchestrator",
    );
  }

  registerAnalyzer(analyzer: Analyzer): void {
    this.analyzers.set(analyzer.id, analyzer);
    this.eventBus.emit(
      "orchestrator:analyzer-registered",
      { id: analyzer.id, version: analyzer.version },
      "SignalOrchestrator",
    );
  }

  registerScorer(scorer: Scorer): void {
    this.scorers.set(scorer.id, scorer);
    this.eventBus.emit(
      "orchestrator:scorer-registered",
      { id: scorer.id, version: scorer.version },
      "SignalOrchestrator",
    );
  }

  registerAggregator(aggregator: Aggregator): void {
    this.aggregators.set(aggregator.id, aggregator);
    this.eventBus.emit(
      "orchestrator:aggregator-registered",
      { id: aggregator.id, version: aggregator.version },
      "SignalOrchestrator",
    );
  }

  getGenerator(id: string): SignalGenerator | undefined {
    return this.generators.get(id);
  }

  getAnalyzer(id: string): Analyzer | undefined {
    return this.analyzers.get(id);
  }

  getScorer(id: string): Scorer | undefined {
    return this.scorers.get(id);
  }

  getAggregator(id: string): Aggregator | undefined {
    return this.aggregators.get(id);
  }

  async execute(
    input: Record<string, unknown>,
    generatorId: string,
    analyzerId: string,
    scorerId: string,
    aggregatorId: string,
  ): Promise<SignalPackage> {
    const generator = this.generators.get(generatorId);
    if (!generator) throw new Error(`Generator not found: ${generatorId}`);

    const analyzer = this.analyzers.get(analyzerId);
    if (!analyzer) throw new Error(`Analyzer not found: ${analyzerId}`);

    const scorer = this.scorers.get(scorerId);
    if (!scorer) throw new Error(`Scorer not found: ${scorerId}`);

    const aggregator = this.aggregators.get(aggregatorId);
    if (!aggregator) throw new Error(`Aggregator not found: ${aggregatorId}`);

    await this.executionController.acquire();

    try {
      const meta: SignalPackageMeta = {
        createdAt: Date.now(),
        domain: this.config.domain,
        version: this.config.version,
        source: generatorId,
      };

      const packageId =
        `${this.config.domain}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}` as SignalPackageId;

      return await this.pipelineRunner.run(
        packageId,
        meta,
        input,
        generator,
        analyzer,
        scorer,
        aggregator,
      );
    } finally {
      this.executionController.release();
    }
  }

  get registeredGenerators(): string[] {
    return Array.from(this.generators.keys());
  }

  get registeredAnalyzers(): string[] {
    return Array.from(this.analyzers.keys());
  }

  get registeredScorers(): string[] {
    return Array.from(this.scorers.keys());
  }

  get registeredAggregators(): string[] {
    return Array.from(this.aggregators.keys());
  }

  /**
   * Register a SignalPlugin with the kernel.
   * The plugin's stage handlers are wired into the pipeline.
   * The kernel retains control of execution — plugins cannot control flow.
   */
  async registerPlugin(plugin: SignalPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }

    // Boundary enforcement: validate plugin before registration
    if (!this.boundaryGuard.validatePlugin(plugin)) {
      const violations = this.boundaryGuard.getViolationsFor(plugin.id);
      throw new Error(
        `Plugin ${plugin.id} failed boundary validation: ${violations.map((v) => v.message).join("; ")}`,
      );
    }

    const descriptor = describePlugin(plugin);

    // Build the plugin context with restricted (read-only) state access
    const context: PluginContext = {
      descriptor,
      state: {
        get: <T = unknown>(key: string) => this.stateStore.get<T>(key),
        has: (key: string) => this.stateStore.has(key),
        snapshot: () => this.stateStore.snapshot(),
      },
      events: {
        emit: (type: string, payload: Record<string, unknown>) => {
          this.eventBus.emit(type, payload, `plugin:${plugin.id}`);
        },
      },
    };

    // Call plugin lifecycle hook
    if (plugin.onRegister) {
      await plugin.onRegister(context);
    }

    // Wire plugin capabilities into the kernel pipeline
    for (const capability of plugin.capabilities) {
      switch (capability) {
        case "generate": {
          const generator = plugin.getGenerator?.();
          if (generator) this.registerGenerator(generator);
          break;
        }
        case "analyze": {
          const analyzer = plugin.getAnalyzer?.();
          if (analyzer) this.registerAnalyzer(analyzer);
          break;
        }
        case "score": {
          const scorer = plugin.getScorer?.();
          if (scorer) this.registerScorer(scorer);
          break;
        }
        case "aggregate": {
          const aggregator = plugin.getAggregator?.();
          if (aggregator) this.registerAggregator(aggregator);
          break;
        }
      }
    }

    this.plugins.set(plugin.id, plugin);
    this.boundaryGuard.markRegistered(plugin.id, plugin.capabilities);
    this.eventBus.emit(
      "orchestrator:plugin-registered",
      { id: plugin.id, capabilities: plugin.capabilities },
      "SignalOrchestrator",
    );
  }

  /**
   * Dispose a plugin and remove its stage handlers from the kernel.
   */
  async disposePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    if (plugin.onDispose) {
      await plugin.onDispose();
    }

    // Remove stage handlers registered by this plugin
    for (const capability of plugin.capabilities) {
      switch (capability) {
        case "generate": {
          const generator = plugin.getGenerator?.();
          if (generator) this.generators.delete(generator.id);
          break;
        }
        case "analyze": {
          const analyzer = plugin.getAnalyzer?.();
          if (analyzer) this.analyzers.delete(analyzer.id);
          break;
        }
        case "score": {
          const scorer = plugin.getScorer?.();
          if (scorer) this.scorers.delete(scorer.id);
          break;
        }
        case "aggregate": {
          const aggregator = plugin.getAggregator?.();
          if (aggregator) this.aggregators.delete(aggregator.id);
          break;
        }
      }
    }

    this.plugins.delete(pluginId);
    this.boundaryGuard.markUnregistered(pluginId);
    this.eventBus.emit(
      "orchestrator:plugin-disposed",
      { id: pluginId },
      "SignalOrchestrator",
    );
  }

  getPlugin(id: string): SignalPlugin | undefined {
    return this.plugins.get(id);
  }

  get registeredPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}
