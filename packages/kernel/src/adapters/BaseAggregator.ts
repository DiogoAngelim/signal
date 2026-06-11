/**
 * BaseAggregator — Adapter base class for wrapping existing
 * aggregation modules as kernel-compatible Aggregator implementations.
 *
 * Subclasses override `doAggregate()` to delegate to existing code.
 */

import type { Aggregator, AggregatorInput, AggregatorOutput } from "../interfaces/Aggregator";

export abstract class BaseAggregator implements Aggregator {
  abstract readonly id: string;
  abstract readonly version: number;

  async aggregate(input: AggregatorInput): Promise<AggregatorOutput> {
    return this.doAggregate(input);
  }

  /**
   * Override this method to wrap an existing aggregation module.
   * The input is the combined scored results; the output is the final decision.
   */
  protected abstract doAggregate(input: AggregatorInput): Promise<AggregatorOutput>;
}