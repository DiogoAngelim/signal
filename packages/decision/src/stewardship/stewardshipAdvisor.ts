import { uniqueStrings } from "../utils";
import { evaluateStewardshipGovernance } from "./governanceEvaluator";
import { consumeStewardshipMemory } from "./memoryConsumer";
import { interpretStewardshipOutcomes } from "./outcomeInterpreter";
import { createStewardshipLedger } from "./stewardshipLedger";
import {
  actionSummary,
  defaultDisclaimers,
  governanceSentence,
  nextStepDescription,
  normalizeSubject,
  recommendationConfidence,
  reviewTrigger,
} from "./stewardshipCopy";
import { selectStewardshipAction } from "./stewardshipPolicy";
import type {
  StewardshipAssessment,
  StewardshipInput,
  StewardshipLesson,
  StewardshipProtection,
  StewardshipThreat,
  StewardshipUncertainty,
} from "./types";

export function assessStewardship(input: StewardshipInput = {}): StewardshipAssessment {
  const subject = normalizeSubject(input.subject);
  const memory = consumeStewardshipMemory(input.memory);
  const outcomeInterpretation = interpretStewardshipOutcomes(input.outcomeReviews);
  const evidence = [...memory.evidence, ...(input.evidence ?? [])];
  const lessons = [...memory.lessons, ...outcomeInterpretation.lessons];
  const threats = normalizeThreats(input.threats);
  const protections = normalizeProtections(input.protections);
  const uncertainties = normalizeUncertainties([...(input.uncertainties ?? []), ...outcomeInterpretation.uncertainties]);
  const ledger = createStewardshipLedger({
    subject,
    context: input.context,
    evidence,
    lessons,
    outcomeReviews: input.outcomeReviews,
    threats,
    protections,
  });
  const governance = evaluateStewardshipGovernance({
    evidence,
    lessons,
    threats,
    protections,
    uncertainties,
    context: input.context,
    governance: input.governance,
  });
  const action = selectStewardshipAction({
    governance,
    lessons,
    threats,
    uncertainties,
    evidenceCount: evidence.length,
  });
  const recommendation = {
    action,
    summary: actionSummary(action, subject),
    rationale: uniqueStrings([
      governanceSentence(governance),
      ...governance.rationale,
      ...dominantLessonRationale(lessons),
      ...threatRationale(threats),
      ...protectionRationale(protections),
    ]),
    confidence: recommendationConfidence(governance),
  };

  return {
    subject,
    whatMatters: uniqueStrings([
      `${subject.label} should remain ${subject.desiredState}.`,
      subject.importance === "critical" ? "The subject is critical, so protection outranks maximum action." : "",
      ...(input.context?.constraints ?? []).map((constraint) => `Constraint: ${constraint}`),
    ]),
    threats,
    protections,
    lessons,
    ledger,
    governance,
    recommendation,
    smallestResponsibleNextStep: {
      category: action,
      description: nextStepDescription(action, subject),
      reviewTrigger: input.context?.monitoringCadence ?? reviewTrigger(action),
      reversible: action !== "stop" && action !== "intervene",
    },
    monitoringPlan: buildMonitoringPlan(input, threats, uncertainties),
    uncertaintySummary: buildUncertaintySummary(uncertainties, memory.missingMemory),
    rationale: recommendation.rationale,
    disclaimers: defaultDisclaimers(),
  };
}

function normalizeThreats(threats: StewardshipThreat[] | undefined): StewardshipThreat[] {
  if (threats?.length) return threats;
  return [
    {
      id: "threat:unknown",
      label: "Unknown threat",
      description: "Threats have not been named yet.",
      severity: "medium",
      mitigated: false,
    },
  ];
}

function normalizeProtections(protections: StewardshipProtection[] | undefined): StewardshipProtection[] {
  if (protections?.length) return protections;
  return [
    {
      id: "protection:review",
      label: "Review before expanding commitment",
      description: "Keep the next step small until the review is clearer.",
      strength: "limited",
      durability: "limited",
    },
  ];
}

function normalizeUncertainties(uncertainties: StewardshipUncertainty[]): StewardshipUncertainty[] {
  return uncertainties.length
    ? uncertainties
    : [
        {
          id: "uncertainty:default",
          label: "Uncertainty remains",
          description: "The review should keep uncertainty visible instead of treating the answer as certain.",
          severity: "medium",
          visibility: "explicit",
        },
      ];
}

function dominantLessonRationale(lessons: StewardshipLesson[]): string[] {
  if (!lessons.length) return ["No durable lesson is available yet."];
  const repeated = lessons.filter((lesson) => lesson.repetition >= 2);
  return repeated.length
    ? repeated.map((lesson) => `Repeated lesson: ${lesson.summary}`)
    : ["Lessons are still provisional."];
}

function threatRationale(threats: StewardshipThreat[]): string[] {
  return threats
    .filter((threat) => threat.severity === "high" || threat.severity === "critical")
    .map((threat) => `Threat to monitor: ${threat.label}.`);
}

function protectionRationale(protections: StewardshipProtection[]): string[] {
  return protections
    .filter((protection) => protection.strength === "adequate" || protection.strength === "strong")
    .map((protection) => `Protection in place: ${protection.label}.`);
}

function buildMonitoringPlan(input: StewardshipInput, threats: StewardshipThreat[], uncertainties: StewardshipUncertainty[]): string[] {
  const cadence = input.context?.monitoringCadence?.replace(/[.]+$/g, "");
  return uniqueStrings([
    cadence ? `Use cadence: ${cadence}.` : "Review after the next material change.",
    ...threats.map((threat) => `Watch ${threat.label}.`),
    ...uncertainties.map((uncertainty) => `Keep visible: ${uncertainty.label}.`),
  ]);
}

function buildUncertaintySummary(uncertainties: StewardshipUncertainty[], missingMemory: boolean): string[] {
  return uniqueStrings([
    missingMemory ? "Decision memory is missing or not yet useful." : "",
    ...uncertainties.map((uncertainty) => uncertainty.description ?? uncertainty.label),
    "This assessment should be updated when new evidence is reviewed.",
  ]);
}
