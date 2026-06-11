/**
 * trace.ts — Wrap engine execution with deterministic trace
 *
 * Captures input → output per step, emitting
 * { step, inputHash, outputHash } for each execution phase.
 * No engine logic is modified — this is a pure wrapper.
 */

import { canonicalize } from "./canonicalize.js";
import { hashSync } from "./hash.js";

export interface StepTrace {
  step: string;
  inputHash: string;
  outputHash: string;
}

export interface TraceResult {
  steps: StepTrace[];
  inputHash: string;
  outputHash: string;
  fingerprint: string;
}

/**
 * Trace a single step: canonicalize input and output, hash both.
 */
function traceStep(
  stepName: string,
  input: unknown,
  output: unknown,
): StepTrace {
  const inputHash = hashSync(input);
  const outputHash = hashSync(output);
  return { step: stepName, inputHash, outputHash };
}

/**
 * Engine function type — accepts any input, returns any output.
 */
export type EngineFn = (input: any) => any;

/**
 * Step definition for the trace wrapper.
 * Each step has a name and a transform function.
 */
export interface StepDef {
  name: string;
  fn: (input: any) => any;
}

/**
 * Run the engine through a sequence of traced steps.
 * Each step's input → output is canonicalized and hashed.
 * Returns the full trace with all step hashes.
 */
export function traceExecution(
  steps: StepDef[],
  initialInput: unknown,
): TraceResult {
  const stepTraces: StepTrace[] = [];
  let currentInput = initialInput;

  for (const step of steps) {
    const output = step.fn(currentInput);
    const trace = traceStep(step.name, currentInput, output);
    stepTraces.push(trace);
    currentInput = output;
  }

  const inputHash =
    stepTraces.length > 0 ? stepTraces[0].inputHash : hashSync(initialInput);
  const outputHash =
    stepTraces.length > 0
      ? stepTraces[stepTraces.length - 1].outputHash
      : hashSync(null);
  const fingerprint = hashSync(stepTraces);

  return {
    steps: stepTraces,
    inputHash,
    outputHash,
    fingerprint,
  };
}

/**
 * Create the standard step definitions for the stocks optimizer engine.
 * These wrap the engine without modifying it, tracing each logical phase.
 */
export function createEngineSteps(engineFn: EngineFn): StepDef[] {
  return [
    {
      name: "canonicalize-input",
      fn: (input: any) => {
        const canonical = canonicalize(input);
        return { original: input, canonical };
      },
    },
    {
      name: "engine-execute",
      fn: (input: any) => {
        const result = engineFn(input.original);
        return { ...input, result };
      },
    },
    {
      name: "canonicalize-output",
      fn: (input: any) => {
        const canonical = canonicalize(input.result);
        return { ...input, outputCanonical: canonical };
      },
    },
  ];
}
