/**
 * Aggregator interface — responsible for combining multiple scored results
 * into a final aggregate decision. Fourth stage in the kernel pipeline.
 */

export type AggregatorInput = Record<string, unknown>;

export type AggregatorOutput = {
  readonly decision: string;
  readonly weight: number;
  readonly metadata: Record<string, unknown>;
};

export interface Aggregator {
  readonly id: string;
  readonly version: number;
  aggregate(input: AggregatorInput): Promise<AggregatorOutput>;
}
