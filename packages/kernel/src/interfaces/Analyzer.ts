/**
 * Analyzer interface — responsible for transforming raw signal features
 * into structured analysis. Second stage in the kernel pipeline.
 */

export type AnalyzerInput = Record<string, unknown>;

export type AnalyzerOutput = Record<string, unknown>;

export interface Analyzer {
  readonly id: string;
  readonly version: number;
  analyze(input: AnalyzerInput): Promise<AnalyzerOutput>;
}