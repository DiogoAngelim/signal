/**
 * BaseAnalyzer — Adapter base class for wrapping existing
 * analysis modules as kernel-compatible Analyzer implementations.
 *
 * Subclasses override `doAnalyze()` to delegate to existing code.
 */

import type {
  Analyzer,
  AnalyzerInput,
  AnalyzerOutput,
} from "../interfaces/Analyzer";

export abstract class BaseAnalyzer implements Analyzer {
  abstract readonly id: string;
  abstract readonly version: number;

  async analyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    return this.doAnalyze(input);
  }

  /**
   * Override this method to wrap an existing analysis module.
   * The input is the feature record; the output is the analysis result.
   */
  protected abstract doAnalyze(input: AnalyzerInput): Promise<AnalyzerOutput>;
}
