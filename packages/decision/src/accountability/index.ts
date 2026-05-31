import type {
  AccountabilityReport,
  CoherenceAssessment,
  DecisionReplayComparison,
  OutcomeEvaluation,
  SignalDecisionRecord,
} from "../types";
import { compareReplay } from "../decision-record";

export function createAccountabilityReport(input: {
  record: SignalDecisionRecord;
  currentCoherence?: CoherenceAssessment;
  outcome?: OutcomeEvaluation;
  decisionSummary?: string;
}): AccountabilityReport {
  const replay = input.currentCoherence
    ? compareReplay(input.record.decisionId, input.record.coherence, input.currentCoherence)
    : defaultReplay(input.record);
  const supportingEvidence = [
    ...input.record.coherence.explanation.filter((line) => !/contradict|block|pause/i.test(line)),
    ...(input.record.wisdom?.decision === "proceed" ? input.record.wisdom.reason : []),
  ];
  const conflictingEvidence = [
    ...input.record.coherence.contradictions.map((conflict) => conflict.description),
    ...(input.record.wisdom?.decision === "avoid" ? input.record.wisdom.reason : []),
  ];

  return {
    decisionId: input.record.decisionId,
    decisionSummary: input.decisionSummary ?? input.record.humanSummary,
    actionTaken: Boolean(input.record.action) && input.record.coherence.actionAllowed,
    modulesInvolved: modulesInvolved(input.record),
    supportingEvidence,
    conflictingEvidence,
    contradictionsDetected: input.record.coherence.contradictions.map((conflict) => conflict.conflictId),
    confidenceAtDecision: input.record.coherence.score,
    confidenceToday: input.currentCoherence?.score ?? input.record.coherence.score,
    ...(input.outcome === undefined ? {} : { outcomeSummary: `${input.outcome.category} at ${input.outcome.successScore}/100.` }),
    lessonsLearned: input.outcome?.lessons ?? input.record.outcome?.lessons ?? [],
    replayResult: replay.replayResult,
    humanExplanation: accountabilityExplanation(replay, input.record),
  };
}

export function replayDecision(input: {
  record: SignalDecisionRecord;
  currentCoherence: CoherenceAssessment;
}): DecisionReplayComparison {
  return compareReplay(input.record.decisionId, input.record.coherence, input.currentCoherence);
}

function modulesInvolved(record: SignalDecisionRecord): string[] {
  const modules = ["coherence"];
  if (record.discovery !== undefined) modules.push("discovery");
  if (record.judgment !== undefined) modules.push("judgment");
  if (record.purpose !== undefined) modules.push("purpose");
  if (record.need !== undefined) modules.push("need");
  if (record.prediction !== undefined) modules.push("prediction");
  if (record.simulation !== undefined) modules.push("simulation");
  if (record.wisdom !== undefined) modules.push("wisdom");
  if (record.agency !== undefined) modules.push("agency");
  if (record.outcome !== undefined) modules.push("outcome");
  return modules;
}

function defaultReplay(record: SignalDecisionRecord): DecisionReplayComparison {
  return {
    decisionId: record.decisionId,
    originalActionAllowed: record.coherence.actionAllowed,
    currentActionAllowed: record.coherence.actionAllowed,
    originalScale: record.coherence.actionScale,
    currentScale: record.coherence.actionScale,
    replayResult: "same-decision",
    differences: [],
    explanation: "Replay used the original data because no newer coherence assessment was supplied.",
  };
}

function accountabilityExplanation(replay: DecisionReplayComparison, record: SignalDecisionRecord): string {
  if (replay.replayResult === "changed-decision") {
    return `With current knowledge, Signal would change the decision. ${replay.explanation}`;
  }
  if (!record.coherence.actionAllowed) {
    return "Signal did not act because coherence was not strong enough to permit agency.";
  }
  return "Signal can explain the action from the original evidence and would make the same decision with the supplied knowledge.";
}
