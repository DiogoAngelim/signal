import { evaluateCommitment } from "./engine";
import type { CommitmentEvaluateInput, CommitmentOperationDefinition, CommitmentResult } from "./types";

export type CommitmentSchema<T> = {
  parse(value: unknown): T;
};

export const COMMITMENT_OPERATION_DEFINITIONS: readonly CommitmentOperationDefinition[] = [
  {
    kind: "query",
    name: "commitment.evaluate.v1",
    version: "v1",
    description: "Evaluate generic decision trust, constraints, resources, and policy into a recommended commitment.",
    idempotent: true,
    replaySafe: true,
  },
];

export const commitmentEvaluateInputSchema: CommitmentSchema<CommitmentEvaluateInput> = {
  parse(value: unknown): CommitmentEvaluateInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("commitment.evaluate.v1 input must be an object");
    }
    return value as CommitmentEvaluateInput;
  },
};

export const commitmentEvaluateResultSchema: CommitmentSchema<CommitmentResult> = {
  parse(value: unknown): CommitmentResult {
    const result = value as CommitmentResult;
    if (
      !result ||
      result.module !== "signal.commitment" ||
      result.operation !== "commitment.evaluate.v1" ||
      result.version !== "v1"
    ) {
      throw new Error("commitment.evaluate.v1 result did not match the protocol contract");
    }
    return result;
  },
};

export type CommitmentRuntimeLike = {
  registerQuery?: (definition: {
    name: "commitment.evaluate.v1";
    kind: "query";
    description: string;
    inputSchema: CommitmentSchema<CommitmentEvaluateInput>;
    resultSchema: CommitmentSchema<CommitmentResult>;
    handler: (input: CommitmentEvaluateInput) => CommitmentResult;
  }) => unknown;
};

export function listCommitmentOperations(): CommitmentOperationDefinition[] {
  return [...COMMITMENT_OPERATION_DEFINITIONS];
}

export function registerCommitmentOperations(registry: CommitmentRuntimeLike): CommitmentOperationDefinition[] {
  const definition = COMMITMENT_OPERATION_DEFINITIONS[0]!;
  registry.registerQuery?.({
    name: "commitment.evaluate.v1",
    kind: "query",
    description: definition.description,
    inputSchema: commitmentEvaluateInputSchema,
    resultSchema: commitmentEvaluateResultSchema,
    handler: evaluateCommitment,
  });

  return listCommitmentOperations();
}
