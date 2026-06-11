/**
 * BaseScorer — Adapter base class for wrapping existing
 * scoring/decision modules as kernel-compatible Scorer implementations.
 *
 * Subclasses override `doScore()` to delegate to existing code.
 */

import type { Scorer, ScorerInput, ScorerOutput } from "../interfaces/Scorer";

export abstract class BaseScorer implements Scorer {
  abstract readonly id: string;
  abstract readonly version: number;

  async score(input: ScorerInput): Promise<ScorerOutput> {
    return this.doScore(input);
  }

  /**
   * Override this method to wrap an existing scoring module.
   * The input is the analysis result; the output is a scored decision.
   */
  protected abstract doScore(input: ScorerInput): Promise<ScorerOutput>;
}