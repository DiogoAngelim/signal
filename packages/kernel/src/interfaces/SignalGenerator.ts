/**
 * SignalGenerator interface — responsible for producing raw signal features
 * from input data. This is the first stage in the kernel pipeline.
 */

export type SignalGeneratorInput = Record<string, unknown>;

export type SignalGeneratorOutput = Record<string, unknown>;

export interface SignalGenerator {
  readonly id: string;
  readonly version: number;
  generate(input: SignalGeneratorInput): Promise<SignalGeneratorOutput>;
}
