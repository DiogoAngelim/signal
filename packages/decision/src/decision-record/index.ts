import type {
  AccountabilityReport,
  CoherenceAssessment,
  DecisionRecordInput,
  DecisionRecordStore,
  DecisionReplayComparison,
  SignalDecisionRecord,
} from "../types";
import { createHumanDecisionSummary } from "../human-language";
import { nowIso } from "../utils";

export function createDecisionRecord(input: DecisionRecordInput): SignalDecisionRecord {
  const provisional: SignalDecisionRecord = {
    decisionId: input.decisionId,
    createdAt: input.createdAt ?? nowIso(),
    observation: input.observation,
    ...(input.discovery === undefined ? {} : { discovery: input.discovery }),
    ...(input.judgment === undefined ? {} : { judgment: input.judgment }),
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.need === undefined ? {} : { need: input.need }),
    coherence: input.coherence,
    ...(input.prediction === undefined ? {} : { prediction: input.prediction }),
    ...(input.simulation === undefined ? {} : { simulation: input.simulation }),
    ...(input.wisdom === undefined ? {} : { wisdom: input.wisdom }),
    ...(input.agency === undefined ? {} : { agency: input.agency }),
    ...(input.action === undefined ? {} : { action: input.action }),
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    ...(input.accountability === undefined ? {} : { accountability: input.accountability }),
    humanSummary: input.humanSummary ?? "",
  };
  return {
    ...provisional,
    humanSummary: input.humanSummary ?? createHumanDecisionSummary(provisional),
  };
}

export function createInMemoryDecisionRecordStore(initialRecords: readonly SignalDecisionRecord[] = []): DecisionRecordStore {
  const records = new Map<string, SignalDecisionRecord>();
  for (const record of initialRecords) records.set(record.decisionId, record);

  return {
    save(record) {
      records.set(record.decisionId, record);
      return record;
    },
    get(decisionId) {
      return records.get(decisionId);
    },
    list() {
      return [...records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    audit(decisionId) {
      return records.get(decisionId)?.accountability;
    },
    replay(decisionId, current) {
      const record = records.get(decisionId);
      if (!record) return undefined;
      return compareReplay(record.decisionId, record.coherence, current);
    },
    clear() {
      records.clear();
    },
  };
}

export function compareReplay(
  decisionId: string,
  original: CoherenceAssessment,
  current: CoherenceAssessment,
): DecisionReplayComparison {
  const differences: string[] = [];
  if (original.actionAllowed !== current.actionAllowed) differences.push("Action permission changed.");
  if (Math.abs(original.actionScale - current.actionScale) >= 0.1) differences.push("Recommended action scale changed.");
  if (Math.abs(original.score - current.score) >= 10) differences.push("Coherence score changed materially.");
  if (original.status !== current.status) differences.push(`Status changed from ${original.status} to ${current.status}.`);
  const replayResult = differences.length === 0
    ? "same-decision"
    : current.score === 0 && original.score === 0
      ? "inconclusive"
      : "changed-decision";

  return {
    decisionId,
    originalActionAllowed: original.actionAllowed,
    currentActionAllowed: current.actionAllowed,
    originalScale: original.actionScale,
    currentScale: current.actionScale,
    replayResult,
    differences,
    explanation: differences.length ? differences.join(" ") : "Current knowledge supports the same decision.",
  };
}

export function attachAccountability(
  record: SignalDecisionRecord,
  accountability: AccountabilityReport,
): SignalDecisionRecord {
  return {
    ...record,
    accountability,
  };
}
