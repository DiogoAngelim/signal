/**
 * Scorer interface — responsible for evaluating analysis results
 * and producing a scored decision. Third stage in the kernel pipeline.
 */

export type ScorerInput = Record<string, unknown>;

export type ScorerOutput = {
  readonly score: number;
  readonly confidence: number;
  readonly rationale: Record<string, unknown>;
};

export interface Scorer {
  readonly id: string;
  readonly version: number;
  score(input: ScorerInput): Promise<ScorerOutput>;
}
