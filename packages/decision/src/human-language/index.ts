import type {
  AccountabilityReport,
  CoherenceAssessment,
  PredictionScenario,
  SignalDecisionRecord,
  SimulationResult,
  WisdomAssessment,
} from "../types";
import { mostDangerousScenario, mostLikelyScenario } from "../prediction";

export type HumanDecisionGuideStep = {
  step: number;
  title: string;
  text: string;
  why?: string[];
};

export function createHumanDecisionSummary(record: SignalDecisionRecord): string {
  const coherence = record.coherence;
  const wisdom = record.wisdom;
  const simulation = record.simulation;
  if (!coherence.actionAllowed) {
    return "Signal found too much disagreement to act safely right now.";
  }
  if (wisdom?.decision === "avoid") {
    return "The opportunity exists, but the downside is not worth the risk.";
  }
  if (simulation?.recommendedAction === "wait") {
    return "Signal tested a few paths and waiting is safer than acting fully right now.";
  }
  if (coherence.actionScale < 1) {
    return "The idea may be useful, but Signal would act smaller because uncertainty remains.";
  }
  return "Signal sees enough agreement to proceed while continuing to track the result.";
}

export function buildHumanDecisionGuide(record: SignalDecisionRecord): HumanDecisionGuideStep[] {
  const prediction = record.prediction ?? [];
  return [
    {
      step: 1,
      title: "What is happening?",
      text: happeningText(record.coherence),
      why: record.coherence.explanation.slice(0, 2),
    },
    {
      step: 2,
      title: "What matters?",
      text: mattersText(record.coherence, record.wisdom),
      why: record.coherence.contradictions.map((conflict) => conflict.description),
    },
    {
      step: 3,
      title: "What could happen next?",
      text: predictionText(prediction),
      why: prediction.flatMap((scenario) => scenario.warningSigns).slice(0, 3),
    },
    {
      step: 4,
      title: "What did Signal test?",
      text: simulationText(record.simulation),
      why: record.simulation?.pathComparisons.map((path) => path.explanation[0] ?? path.actionVariant).slice(0, 4),
    },
    {
      step: 5,
      title: "What should I do now?",
      text: nextActionText(record.coherence, record.simulation, record.wisdom),
    },
    {
      step: 6,
      title: "Why?",
      text: whyText(record),
      why: record.wisdom?.reason,
    },
    {
      step: 7,
      title: "What will Signal learn from this?",
      text: record.outcome
        ? `This decision will update trust by ${record.outcome.trustImpact} and calibration by ${record.outcome.calibrationImpact}.`
        : "This decision will be tracked so future confidence can improve.",
    },
  ];
}

export function accountabilityHumanSummary(report: AccountabilityReport): string {
  return report.humanExplanation || `${report.decisionSummary} Replay result: ${report.replayResult}.`;
}

function happeningText(coherence: CoherenceAssessment): string {
  if (coherence.status === "blocked") return "Signal is not ready to act because important parts disagree.";
  if (coherence.status === "contradictory") return "The opportunity looks promising, but not all parts of Signal agree yet.";
  if (coherence.status === "tension") return "Signal sees a possible path, but the evidence is still uneven.";
  return "Signal sees enough agreement to continue evaluating the decision.";
}

function mattersText(coherence: CoherenceAssessment, wisdom: WisdomAssessment | undefined): string {
  if (wisdom?.decision === "avoid") return "Survival matters more than the attractive upside.";
  if (coherence.actionScale < 1) return "The safest choice is to reduce size until agreement improves.";
  return "The important question is whether the action still satisfies purpose, need, and survivability.";
}

function predictionText(scenarios: PredictionScenario[]): string {
  if (!scenarios.length) return "Signal does not have enough future scenarios yet.";
  const likely = mostLikelyScenario(scenarios);
  const dangerous = mostDangerousScenario(scenarios);
  return `The most likely path is "${likely?.label ?? "mixed"}"; the path to watch is "${dangerous?.label ?? "stress"}".`;
}

function simulationText(simulation: SimulationResult | undefined): string {
  if (!simulation) return "Signal has not compared action paths yet.";
  if (simulation.recommendedAction === "reduce") return "Signal tested acting fully, acting smaller, waiting, and blocking. Acting smaller is safer than acting fully.";
  if (simulation.recommendedAction === "wait") return "Signal tested several paths. Waiting preserves more options right now.";
  if (simulation.recommendedAction === "block") return "Signal tested the paths and found the downside too large to act.";
  return `Signal tested several paths and prefers ${simulation.actionVariant}.`;
}

function nextActionText(
  coherence: CoherenceAssessment,
  simulation: SimulationResult | undefined,
  wisdom: WisdomAssessment | undefined,
): string {
  if (!coherence.actionAllowed || wisdom?.decision === "avoid" || simulation?.recommendedAction === "block") return "Do not act yet.";
  if (wisdom?.decision === "wait" || simulation?.recommendedAction === "wait") return "Wait for better confirmation.";
  if (wisdom?.decision === "proceed-small" || simulation?.recommendedAction === "reduce" || coherence.actionScale < 1) {
    return "Act smaller, not because the idea is weak, but because the system is still uncertain.";
  }
  return "Proceed only within the plan and keep tracking the outcome.";
}

function whyText(record: SignalDecisionRecord): string {
  if (record.coherence.contradictions.length) {
    return record.coherence.contradictions[0]?.recommendation ?? "Signal is reducing action because the evidence is mixed.";
  }
  if (record.wisdom?.reason.length) return record.wisdom.reason[0] ?? "The decision is tied to survivability.";
  return record.humanSummary;
}
