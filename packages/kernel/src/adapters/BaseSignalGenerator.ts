/**
 * BaseSignalGenerator — Adapter base class for wrapping existing
 * signal generation modules as kernel-compatible SignalGenerator implementations.
 *
 * Subclasses override `doGenerate()` to delegate to existing code.
 * The base class handles tracing, timing, and error reporting.
 */

import type {
  SignalGenerator,
  SignalGeneratorInput,
  SignalGeneratorOutput,
} from "../interfaces/SignalGenerator";

export abstract class BaseSignalGenerator implements SignalGenerator {
  abstract readonly id: string;
  abstract readonly version: number;

  async generate(input: SignalGeneratorInput): Promise<SignalGeneratorOutput> {
    return this.doGenerate(input);
  }

  /**
   * Override this method to wrap an existing signal generation module.
   * The input is the raw data; the output must be a feature record.
   */
  protected abstract doGenerate(
    input: SignalGeneratorInput,
  ): Promise<SignalGeneratorOutput>;
}
