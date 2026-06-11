import { calibrateConfidence } from "./calibration";
import { learnFromTraces } from "./learning";
import { createInMemoryAgencyMemory } from "./memory";
import { resolveOutcome } from "./outcome";
import { evaluatePolicy } from "./policy";
import { diagnoseAgencyState } from "./self-diagnosis";
import type {
  AgencyCycleInput,
  AgencyPipeline,
  AgencyPipelineConfig,
  AgencyStateEvaluation,
  AgencyTrace,
  SelfDiagnosisResult,
} from "./types";

export function createAgencyPipeline(
  config: AgencyPipelineConfig = {},
): AgencyPipeline {
  const memory = config.memory ?? createInMemoryAgencyMemory();
  let sequence = 0;

  return {
    memory,
    runAgencyCycle(input) {
      sequence += 1;
      const timestamp = (config.clock ?? (() => new Date()))().toISOString();
      const policy = evaluatePolicy({
        decision: input.decision,
        sizing: input.sizing,
        config: config.policy,
        approvalGranted: input.approvalGranted,
        blockReasons: input.blockReasons,
      });
      const action = policy.allowed ? input.action : undefined;
      const outcome = resolveOutcome(input.outcome);
      const traceId = (config.idGenerator ?? defaultTraceId)(input, sequence);
      const provisionalTrace: AgencyTrace = {
        traceId,
        timestamp,
        perception: input.perception,
        intelligence: input.intelligence,
        decision: input.decision,
        sizing: input.sizing,
        policy,
        action,
        outcome,
        selfDiagnosis: neutralSelfDiagnosis(),
      };
      const history = [...memory.list(), provisionalTrace];
      const evaluation = evaluateAgencyState(history, config);
      const trace: AgencyTrace = {
        ...provisionalTrace,
        learning: evaluation.learning,
        selfDiagnosis: evaluation.selfDiagnosis,
      };

      memory.append(trace);
      return trace;
    },
    evaluateAgencyState(history) {
      return evaluateAgencyState(history ?? memory.list(), config);
    },
  };
}

export function runAgencyCycle(
  input: AgencyCycleInput,
  config: AgencyPipelineConfig = {},
): AgencyTrace {
  return createAgencyPipeline(config).runAgencyCycle(input);
}

export function evaluateAgencyState(
  history: readonly AgencyTrace[],
  config: AgencyPipelineConfig = {},
): AgencyStateEvaluation {
  const calibration = calibrateConfidence(history, config.calibration);
  const learning = learnFromTraces(history, calibration, config.learning);
  const selfDiagnosis = diagnoseAgencyState({
    history,
    calibration,
    learning,
    config: config.selfDiagnosis,
  });

  return {
    traceCount: history.length,
    calibration,
    learning,
    selfDiagnosis,
  };
}

function defaultTraceId(_input: AgencyCycleInput, sequence: number) {
  return `agency-${sequence}`;
}

function neutralSelfDiagnosis(): SelfDiagnosisResult {
  return {
    trust: 0.5,
    dataReliability: 0.5,
    calibrationHealth: 0.5,
    overfitRisk: 0.5,
    recommendation: "wait",
    reasons: ["Self-diagnosis has not run yet."],
  };
}
