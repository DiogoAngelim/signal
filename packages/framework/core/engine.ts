import { authorize } from "../agency/engine";
import { calibrate } from "../calibration/engine";
import type { CalibrationRunInput } from "../calibration/engine";
import { evaluateDiagnostics } from "../diagnostics/engine";
import {
  evaluateDiscoveryIntelligence,
  type DecisionAction as DiscoveryIntelligenceDecisionAction,
  type DiscoveryIntelligenceInput,
} from "../discovery-intelligence/engine";
import { discover } from "../discovery/engine";
import type { DiscoveryInput } from "../discovery/engine";
import { evaluateExecutionReadiness } from "../execution/readiness";
import { evaluateJudgement } from "../judgement";
import { evaluateLegacy } from "../legacy/engine";
import type { LegacyInput } from "../legacy/engine";
import { clamp, immutable, mean, numeric, stdev } from "../math/statistics";
import { evaluateMeaning } from "../meaning/engine";
import type { MetricRegistry } from "../metrics/registry";
import { detectNeeds } from "../need-detection/engine";
import { evaluateOpportunityDensity } from "../opportunity-discovery/density";
import { discoverOpportunities } from "../opportunity-discovery/engine";
import { PerceptionEngine } from "../perception/engine";
import {
  PERCEPTION_LAYER_ORDER,
  classifyPerceptionLayer,
} from "../perception/layers";
import { evaluatePruning, type PruningCandidateInput, type PruningInput } from "../pruning/engine";
import { evaluatePurpose, type PurposeInput } from "../purpose/engine";
import { rankLeadership } from "../ranking/leadership";
import { reflect } from "../reflection/engine";
import { recognizeState } from "../recognition/engine";
import type { RecognitionInput } from "../recognition/engine";
import { RegimeEngine } from "../regimes/engine";
import { SnapshotStore } from "../state/store";
import { evaluateSynchronization } from "../synchronization/engine";
import type {
  MetricState,
  PerceptionLayerState,
  SignalContext,
  SignalSnapshot,
  TimeframeState,
} from "../types";
import { SignalJournal } from "../validation/journal";
import { evaluateViability } from "../viability/engine";
import type { ViabilityConstraintInput, ViabilityInput, ViabilityResult } from "../viability/engine";

export type EngineModule = {
  name: string;
  dependencies?: string[];
  run(snapshot: SignalSnapshot): SignalSnapshot | Promise<SignalSnapshot>;
};

export class SignalFrameworkEngine {
  private readonly perception: PerceptionEngine;
  private readonly regimes = new RegimeEngine();
  private readonly journal = new SignalJournal();
  private readonly store: SnapshotStore;
  private readonly modules = new Map<string, EngineModule>();
  private cycle = 0;

  constructor(
    registry: MetricRegistry,
    options: { maxSnapshots?: number; maxMetricHistory?: number } = {},
  ) {
    this.perception = new PerceptionEngine(registry, {
      maxMetricHistory: options.maxMetricHistory,
    });
    this.store = new SnapshotStore(options.maxSnapshots);
  }

  register(module: EngineModule) {
    this.modules.set(module.name, module);
    return this;
  }

  async cycleOnce(context: SignalContext): Promise<Readonly<SignalSnapshot>> {
    const timestamp = context.timestamp ?? Date.now();
    for (const signal of context.signals ?? []) this.journal.record(signal);
    for (const outcome of context.outcomes ?? [])
      this.journal.evaluate(outcome);

    const synchronization = evaluateSynchronization(context.synchronization);
    const rawPerception = this.perception.evaluate(context.metrics, 1);
    const validation = this.journal.snapshot();
    const reflection = reflect(
      buildReflectionInput({
        context,
        timestamp,
        perception: rawPerception,
        synchronization,
        validation,
        metrics: rawPerception.metrics,
        history: this.store.history(),
      }),
    );
    const decision = context.agency?.decision ?? context.decision ?? null;
    const calibration = calibrate(
      buildCalibrationInput({
        context,
        timestamp,
        perception: rawPerception,
        reflection,
        decision,
      }),
    );
    const judgement = context.judgement
      ? evaluateJudgement(
          buildJudgementInput({
            context,
            perception: rawPerception,
            reflection,
            calibration,
            decision,
          }),
        )
      : undefined;
    const discovery = discover(
      buildDiscoveryInput({
        context,
        timestamp,
        perception: rawPerception,
        reflection,
        calibration,
        judgement,
        decision,
      }),
    );
    const recognition = recognizeState(
      buildRecognitionInput({
        context,
        perception: rawPerception,
        reflection,
        calibration,
        discovery,
        judgement,
        decision,
      }),
    );
    const meaning = context.meaning ? evaluateMeaning(context.meaning) : undefined;
    const pruning = evaluatePruning(
      buildPruningInput({
        context,
        timestamp,
        meaning,
        perception: rawPerception,
        reflection,
        calibration,
        judgement,
        discovery,
        recognition,
        decision,
      }),
    );
    const purpose = context.purpose
      ? evaluatePurpose(
          buildPurposeInput({
            context,
            perception: rawPerception,
            reflection,
            calibration,
            judgement,
            discovery,
            recognition,
            pruning,
            meaning,
            decision,
          }),
        )
      : undefined;
    const agencyDecision =
      judgement && decision
        ? {
            ...decision,
            confidence: Math.min(decision.confidence ?? judgement.rawConfidence, judgement.adjustedConfidence),
            metadata: {
              ...(decision.metadata ?? {}),
              judgementStatus: judgement.status,
              judgementTrust: judgement.trust,
              judgementAdjustedConfidence: judgement.adjustedConfidence,
            },
          }
        : decision;
    const agency = authorize({
      ...context.agency,
      decision: agencyDecision,
      reflection: context.agency?.reflection ?? reflection,
      calibration: context.agency?.calibration ?? calibration,
      pruning: context.agency?.pruning ?? pruning,
      meaning: context.agency?.meaning ?? meaning,
    });
    const viability = context.viability || decision
      ? evaluateViability(
          buildViabilityInput({
            context,
            decision,
            calibration,
            agency,
          }),
        )
      : undefined;
    const perception = applyLifecycleSelfAwareness(
      rawPerception,
      reflection,
      calibration,
      agency,
      viability,
    );
    const regime = this.regimes.evaluate(perception.layers, synchronization);
    const diagnostics = evaluateDiagnostics(
      perception.layers,
      synchronization,
      validation,
    );
    const executionReadiness = evaluateExecutionReadiness({
      perceptionScore: perception.compositeScore,
      perceptionConfidence: perception.confidence,
      agreement: perception.agreement,
      regime,
      synchronization,
      diagnostics,
    });
    const rankings = rankLeadership(context.observations);
    const needs = detectNeeds({
      perception: {
        layers: perception.layers,
        compositeScore: perception.compositeScore,
        confidence: perception.confidence,
        agreement: perception.agreement,
      },
      diagnostics,
      synchronization,
      executionReadiness,
      rankings,
    });
    const observationSeries = observationsToSeries(context.observations);
    const opportunities = discoverOpportunities({
      perception: {
        layers: perception.layers,
        compositeScore: perception.compositeScore,
        confidence: perception.confidence,
        agreement: perception.agreement,
      },
      intelligence: {
        readinessScore: executionReadiness.readinessScore,
        trust: diagnostics.trust,
        contradictions: diagnostics.contradictions.length,
        transitionDetected: regime.transitionDetected,
      },
      needs,
      observationSeries,
    });
    const opportunityDensity = evaluateOpportunityDensity({
      candidates: opportunities,
    });
    const discoveryIntelligence = evaluateDiscoveryIntelligence(
      buildDiscoveryIntelligenceInput({
        context,
        timestamp,
        discovery,
        recognition,
        judgement,
        agency,
        viability,
        calibration,
        diagnostics,
        opportunities,
        opportunityDensity,
        history: this.store.history(),
      }),
    );
    const legacy = evaluateLegacy(
      buildLegacyInput({
        context,
        timestamp,
        perception,
        diagnostics,
        discovery,
        discoveryIntelligence,
        recognition,
        judgement,
        agency,
        viability,
        executionReadiness,
        previousLegacy: this.store.latest()?.legacy,
      }),
    );
    const events: SignalSnapshot["events"] = [
      {
        type: "cycle.completed",
        timestamp,
        payload: { regime: regime.name, readiness: executionReadiness.state },
      },
      {
        type: "reflection.completed",
        timestamp,
        payload: { reflectionScore: reflection.reflectionScore },
      },
      {
        type: "calibration.completed",
        timestamp,
        payload: {
          calibratedConfidence: calibration.calibratedConfidence,
          trustworthiness: calibration.trustworthiness,
        },
      },
      {
        type: `agency.${agency.status}`,
        timestamp,
        payload: { agencyScore: agency.agencyScore, status: agency.status },
      },
    ];
    events.push({
      type: `discovery.${discovery.status}`,
      timestamp,
      payload: {
        confidence: discovery.confidence,
        maturity: discovery.maturity,
        opportunities: discovery.opportunities.length,
      },
    });
    events.push({
      type: `recognition.${recognition.verdict}`,
      timestamp,
      payload: {
        recognitionScore: recognition.recognitionScore,
        recurrenceConfidence: recognition.recurrenceConfidence,
        noveltyScore: recognition.noveltyScore,
        archetype: recognition.archetype,
      },
    });
    events.push({
      type: `pruning.${pruning.recommendedAction}`,
      timestamp,
      payload: {
        pruningScore: pruning.pruningScore,
        ignoranceEffectivenessScore: pruning.ignoranceEffectivenessScore,
        candidates: pruning.candidates.length,
      },
    });
    if (meaning) {
      events.push({
        type: `meaning.${meaning.gravityLabel}`,
        timestamp,
        payload: {
          gravityScore: meaning.gravityScore,
          primaryNeed: meaning.primaryNeed,
          actionPermission: meaning.purposeInputs.actionPermission,
        },
      });
    }
    if (purpose) {
      events.push({
        type: `purpose.${purpose.recommendedAction}`,
        timestamp,
        payload: {
          purposeScore: purpose.purposeScore,
          alignmentScore: purpose.alignmentScore,
          behavioralAmbition: purpose.behavioralAmbition,
          satisfactionScore: purpose.satisfactionScore,
        },
      });
    }
    events.push({
      type: "discovery-intelligence.evaluated",
      timestamp,
      payload: {
        score: discoveryIntelligence.score,
        maturityScore: discoveryIntelligence.maturity.maturityScore,
        economicsScore: discoveryIntelligence.economics.economicsScore,
        governanceScore: discoveryIntelligence.governance.score,
      },
    });
    events.push({
      type: "legacy.evaluated",
      timestamp,
      payload: {
        score: legacy.score,
        reputation: legacy.reputation.rank,
        title: legacy.title.name,
      },
    });
    for (const event of legacy.events) {
      events.push({
        type: event.type,
        timestamp,
        payload: event.payload,
      });
    }
    if (judgement) {
      events.push({
        type: `judgement.${judgement.status}`,
        timestamp,
        payload: {
          status: judgement.status,
          trust: judgement.trust,
          adjustedConfidence: judgement.adjustedConfidence,
        },
      });
    }
    if (viability) {
      events.push({
        type: `viability.${viability.verdict}`,
        timestamp,
        payload: {
          score: viability.score,
          verdict: viability.verdict,
          marginOfSafety: viability.marginOfSafety,
        },
      });
    }
    if (regime.transitionDetected) {
      events.push({
        type: "regime.transition",
        timestamp,
        payload: { previous: regime.previous, current: regime.name },
      });
    }
    for (const contradiction of diagnostics.contradictions) {
      events.push({
        type: "diagnostic.contradiction",
        timestamp,
        payload: contradiction,
      });
    }
    for (const need of needs) {
      events.push({ type: "need.detected", timestamp, payload: need });
    }
    for (const opportunity of opportunities.slice(0, 5)) {
      events.push({
        type: "opportunity.discovered",
        timestamp,
        payload: opportunity,
      });
    }

    let snapshot: SignalSnapshot = {
      id: context.id ?? `${timestamp}-${this.cycle + 1}`,
      cycle: ++this.cycle,
      timestamp,
      domain: context.domain ?? "generic",
      context: context.metadata ?? {},
      perception: {
        layers: perception.layers,
        timeframes: perception.timeframes,
        compositeScore: perception.compositeScore,
        confidence: perception.confidence,
        agreement: perception.agreement,
        dominantLayer: perception.dominantLayer,
      },
      reflection,
      calibration,
      judgement,
      discovery,
      discoveryIntelligence,
      recognition,
      legacy,
      pruning,
      meaning,
      purpose,
      decision,
      agency,
      viability,
      regime,
      synchronization,
      diagnostics,
      needs,
      opportunities,
      opportunityDensity,
      confidence: Math.max(
        0,
        Math.min(
          100,
          (perception.confidence + diagnostics.trust + synchronization.score) /
            3,
        ),
      ),
      rankings,
      validation,
      executionReadiness,
      metrics: perception.metrics,
      events,
    };

    for (const module of this.orderedModules()) {
      snapshot = await module.run(snapshot);
    }

    const frozen = immutable(snapshot);
    this.store.append(frozen);
    return frozen;
  }

  history() {
    return this.store.history();
  }

  latest() {
    return this.store.latest();
  }

  private orderedModules() {
    const pending = new Map(this.modules);
    const ordered: EngineModule[] = [];

    while (pending.size) {
      const ready = Array.from(pending.values()).find((module) =>
        (module.dependencies ?? []).every((dependency) =>
          ordered.some((item) => item.name === dependency),
        ),
      );
      if (!ready)
        throw new Error(
          "SignalFrameworkEngine module dependency cycle detected.",
        );
      ordered.push(ready);
      pending.delete(ready.name);
    }

    return ordered;
  }
}

function observationsToSeries(
  observations: SignalContext["observations"] = [],
) {
  const grouped = new Map<string, number[]>();
  for (const observation of observations) {
    const values = grouped.get(observation.id) ?? [];
    values.push(observation.value);
    grouped.set(observation.id, values);
  }
  return Array.from(grouped.entries()).map(([id, values]) => ({ id, values }));
}

type PerceptionEvaluation = ReturnType<PerceptionEngine["evaluate"]>;

function buildReflectionInput(args: {
  context: SignalContext;
  timestamp: number;
  perception: PerceptionEvaluation;
  synchronization: ReturnType<typeof evaluateSynchronization>;
  validation: ReturnType<SignalJournal["snapshot"]>;
  metrics: Record<string, MetricState>;
  history: Readonly<SignalSnapshot>[];
}) {
  const signalById = new Map(
    (args.context.signals ?? []).map((signal) => [signal.id, signal]),
  );
  const derivedPredictions = (args.context.signals ?? []).map((signal) => ({
    id: signal.id,
    timestamp: signal.timestamp,
    confidence: signal.confidence,
    expectedOutcome: signal.expectedDirection,
  }));
  const derivedOutcomes = (args.context.outcomes ?? []).map((outcome) => {
    const signal = signalById.get(outcome.signalId);
    return {
      predictionId: outcome.signalId,
      timestamp: outcome.evaluatedAt,
      label: outcome.realizedDirection,
      ...(signal
        ? { correct: signal.expectedDirection === outcome.realizedDirection }
        : {}),
    };
  });
  const timestampByMetric = metricTimestampByKey(args.context);
  const derivedInputs = Object.values(args.metrics).map((metric) => ({
    key: metric.key,
    value: metric.raw ?? metric.score,
    quality: metric.confidence,
    timestamp:
      metric.key in timestampByMetric
        ? timestampByMetric[metric.key]
        : args.timestamp,
    known: metric.raw != null && metric.confidence > 0,
    status: metric.raw == null || metric.confidence <= 0 ? "unknown" : "known",
  }));
  const supplied = args.context.reflection ?? {};

  return {
    ...supplied,
    predictions: [...derivedPredictions, ...safeArray(supplied.predictions)],
    decisions: [
      ...(args.context.decision ? [args.context.decision] : []),
      ...safeArray(supplied.decisions),
    ],
    outcomes: [...derivedOutcomes, ...safeArray(supplied.outcomes)],
    history: [...snapshotHistory(args.history), ...safeArray(supplied.history)],
    currentState:
      supplied.currentState ??
      reflectionState(args.perception, args.synchronization, args.validation),
    perceptionLayers:
      supplied.perceptionLayers ?? perceptionLayers(args.perception.layers),
    inputs: [...derivedInputs, ...safeArray(supplied.inputs)],
    requiredInputs: supplied.requiredInputs,
    candidateDecisions: supplied.candidateDecisions,
    now: supplied.now ?? args.timestamp,
  };
}

function buildCalibrationInput(args: {
  context: SignalContext;
  timestamp: number;
  perception: PerceptionEvaluation;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  decision: SignalContext["decision"];
}): CalibrationRunInput {
  const supplied = args.context.calibration ?? {};
  const outcomeBySignalId = new Map(
    (args.context.outcomes ?? []).map((outcome) => [outcome.signalId, outcome]),
  );
  const signalHistory = (args.context.signals ?? []).flatMap((signal) => {
    const outcome = outcomeBySignalId.get(signal.id);
    if (!outcome) return [];
    return [
      {
        id: signal.id,
        timestamp: new Date(signal.timestamp).toISOString(),
        prediction: {
          expectedOutcome: signal.expectedDirection,
          magnitude: signal.expectedMagnitude,
        },
        confidence: signal.confidence,
        outcome: { label: outcome.realizedDirection },
        metadata: { source: "signal-journal" },
      },
    ];
  });

  return {
    current: {
      id: supplied.id ?? args.context.id ?? `calibration-${args.timestamp}`,
      timestamp:
        supplied.timestamp ?? new Date(args.timestamp).toISOString(),
      prediction:
        supplied.prediction ??
        args.decision ??
        {
          compositeScore: args.perception.compositeScore,
          reflectionScore: args.reflection.reflectionScore,
        },
      confidence:
        supplied.confidence ??
        args.decision?.confidence ??
        args.perception.confidence,
      ...(supplied.outcome === undefined ? {} : { outcome: supplied.outcome }),
      metadata: {
        domain: args.context.domain ?? "generic",
        ...(supplied.metadata ?? {}),
      },
    },
    history: [...signalHistory, ...safeArray(supplied.history)],
  };
}

function buildJudgementInput(args: {
  context: SignalContext;
  perception: PerceptionEvaluation;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  decision: SignalContext["decision"];
}) {
  const supplied = args.context.judgement ?? {};
  const outcomeBySignalId = new Map(
    (args.context.outcomes ?? []).map((outcome) => [outcome.signalId, outcome]),
  );
  const journalOutcomes = (args.context.signals ?? []).flatMap((signal) => {
    const outcome = outcomeBySignalId.get(signal.id);
    if (!outcome) return [];

    return [
      {
        id: signal.id,
        state: {
          domain: args.context.domain ?? "generic",
          expectedDirection: signal.expectedDirection,
          regime: signal.regime,
        },
        decision: {
          confidence: signal.confidence,
          expectedMagnitude: signal.expectedMagnitude,
        },
        outcome: {
          label: outcome.realizedDirection,
          value: outcome.realizedMagnitude,
          success: outcome.realizedDirection === signal.expectedDirection,
        },
        confidence: signal.confidence,
        metadata: { source: "signal-journal" },
      },
    ];
  });
  const decision = args.decision;

  return {
    currentState: supplied.currentState ?? {
      domain: args.context.domain ?? "generic",
      compositeScore: args.perception.compositeScore,
      perceptionConfidence: args.perception.confidence,
      agreement: args.perception.agreement,
      dominantLayer: args.perception.dominantLayer,
      reflectionScore: args.reflection.reflectionScore,
      calibratedConfidence: args.calibration.calibratedConfidence,
    },
    proposedDecision: supplied.proposedDecision ?? {
      ...(decision ?? {}),
      rawConfidence: decision?.confidence ?? args.calibration.rawConfidence,
      calibratedConfidence: args.calibration.calibratedConfidence,
    },
    proposedAction: supplied.proposedAction,
    historicalOutcomes: [...journalOutcomes, ...safeArray(supplied.historicalOutcomes)],
    traces: safeArray(supplied.traces),
    context: {
      domain: args.context.domain ?? "generic",
      rawConfidence: decision?.confidence ?? args.calibration.rawConfidence,
      calibratedConfidence: args.calibration.calibratedConfidence,
      ...(supplied.context ?? {}),
    },
  };
}

function buildDiscoveryInput(args: {
  context: SignalContext;
  timestamp: number;
  perception: PerceptionEvaluation;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  judgement?: SignalSnapshot["judgement"];
  decision: SignalContext["decision"];
}): DiscoveryInput {
  const supplied = args.context.discovery ?? {};
  const decision = args.decision;
  const state = {
    domain: args.context.domain ?? "generic",
    compositeScore: args.perception.compositeScore,
    perceptionConfidence: args.perception.confidence,
    agreement: args.perception.agreement,
    dominantLayer: args.perception.dominantLayer,
    reflectionScore: args.reflection.reflectionScore,
    calibratedConfidence: args.calibration.calibratedConfidence,
    judgementStatus: args.judgement?.status ?? "not-provided",
    judgementTrust: args.judgement?.trust ?? 0,
    ...(supplied.state ?? {}),
  };
  const candidates = [
    ...(decision
      ? [{
          id: decision.id ?? args.context.id ?? "candidate:decision",
          label: decision.intent ?? decision.type ?? "Proposed decision",
          score: decision.confidence ?? args.calibration.calibratedConfidence,
          confidence: args.calibration.calibratedConfidence,
          evidence: ["Decision candidate supplied to the framework cycle."],
        }]
      : []),
    ...safeArray(supplied.candidates),
  ];
  const evidence = [
    {
      id: "perception:agreement",
      label: "Perception agreement",
      direction: "support" as const,
      strength: args.perception.agreement,
      confidence: args.perception.confidence,
      group: "perception",
    },
    {
      id: "calibration:confidence",
      label: "Calibrated confidence",
      direction: "support" as const,
      strength: args.calibration.calibratedConfidence,
      confidence: args.calibration.trustworthiness,
      group: "calibration",
    },
    ...(args.judgement
      ? [{
          id: "judgement:trust",
          label: "Judgement trust",
          direction: args.judgement.status === "blocked" ? "contradict" as const : "support" as const,
          strength: args.judgement.trust,
          confidence: args.judgement.reliability,
          group: "judgement",
        }]
      : []),
    ...safeArray(supplied.evidence),
  ];
  const priorOutcomes = [
    ...safeArray(supplied.priorOutcomes),
    ...safeArray(args.context.judgement?.historicalOutcomes).map((outcome) => ({
      id: outcome.id,
      state: outcome.state ?? outcome.currentState,
      outcome: outcome.success === true ? "positive" : outcome.success === false ? "negative" : "neutral",
      score: outcome.score ?? outcome.value,
      confidence: outcome.confidence,
    })),
  ];

  return {
    subjectId: supplied.subjectId ?? args.context.id,
    domain: supplied.domain ?? args.context.domain ?? "generic",
    state,
    candidates,
    evidence,
    historicalStates: safeArray(supplied.historicalStates),
    priorOutcomes,
    constraints: safeArray(supplied.constraints),
    now: supplied.now ?? new Date(args.timestamp).toISOString(),
  };
}

function buildRecognitionInput(args: {
  context: SignalContext;
  perception: PerceptionEvaluation;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  discovery: NonNullable<SignalSnapshot["discovery"]>;
  judgement?: SignalSnapshot["judgement"];
  decision: SignalContext["decision"];
}): RecognitionInput {
  const supplied = args.context.recognition ?? {};
  const outcomeBySignalId = new Map(
    (args.context.outcomes ?? []).map((outcome) => [outcome.signalId, outcome]),
  );
  const signalOutcomeSamples = (args.context.signals ?? []).flatMap((signal) => {
    const outcome = outcomeBySignalId.get(signal.id);
    if (!outcome) return [];

    return [{
      id: signal.id,
      state: {
        domain: args.context.domain ?? "generic",
        expectedDirection: signal.expectedDirection,
        regime: signal.regime,
      },
      features: {
        confidence: signal.confidence,
        expectedMagnitude: signal.expectedMagnitude,
      },
      outcome: outcome.realizedDirection === signal.expectedDirection ? "positive" : "negative",
      value: outcome.realizedMagnitude,
      confidence: signal.confidence,
    }];
  });
  const judgementOutcomeSamples = safeArray(args.context.judgement?.historicalOutcomes).map((outcome) => ({
    id: outcome.id,
    state: outcome.state ?? outcome.currentState,
    features: outcome.decision ?? outcome.proposedDecision,
    context: outcome.context,
    outcome: outcome.outcome,
    result: outcome.result,
    value: outcome.value ?? outcome.score ?? outcome.returnPct,
    success: outcome.success,
    confidence: outcome.confidence,
  }));

  return {
    ...supplied,
    currentState: supplied.currentState ?? {
      domain: args.context.domain ?? "generic",
      compositeScore: args.perception.compositeScore,
      perceptionConfidence: args.perception.confidence,
      agreement: args.perception.agreement,
      dominantLayer: args.perception.dominantLayer,
      reflectionScore: args.reflection.reflectionScore,
      calibratedConfidence: args.calibration.calibratedConfidence,
      decisionType: args.decision?.type,
      decisionConfidence: args.decision?.confidence,
    },
    perception: supplied.perception ?? {
      compositeScore: args.perception.compositeScore,
      confidence: args.perception.confidence,
      agreement: args.perception.agreement,
    },
    discovery: supplied.discovery ?? args.discovery,
    judgement: supplied.judgement ?? args.judgement,
    historicalStates: [
      ...safeArray(supplied.historicalStates),
      ...safeArray(args.context.discovery?.historicalStates),
    ],
    outcomeSamples: [
      ...safeArray(supplied.outcomeSamples),
      ...signalOutcomeSamples,
      ...judgementOutcomeSamples,
    ],
  };
}

function buildPruningInput(args: {
  context: SignalContext;
  timestamp: number;
  meaning?: SignalSnapshot["meaning"];
  perception: PerceptionEvaluation;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  judgement?: SignalSnapshot["judgement"];
  discovery: NonNullable<SignalSnapshot["discovery"]>;
  recognition: NonNullable<SignalSnapshot["recognition"]>;
  decision: SignalContext["decision"];
}): PruningInput {
  const supplied = args.context.pruning ?? {};
  const suppliedCandidate = supplied.candidateId || supplied.candidateType || supplied.sourceModule
    ? [candidateOnly(supplied)]
    : [];
  const candidates: PruningCandidateInput[] = [
    ...signalsToPruningCandidates(args.context, args.timestamp),
    ...metricsToPruningCandidates(args.context, args.perception, args.timestamp),
    ...decisionToPruningCandidate(args),
    ...discoveryToPruningCandidates(args),
    ...suppliedCandidate,
    ...safeArray(supplied.candidates),
  ];

  return {
    ...supplied,
    now: supplied.now ?? args.timestamp,
    meaning: supplied.meaning ?? args.meaning,
    candidates,
  };
}

function buildPurposeInput(args: {
  context: SignalContext;
  perception: PerceptionEvaluation;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  judgement?: SignalSnapshot["judgement"];
  discovery: NonNullable<SignalSnapshot["discovery"]>;
  recognition: NonNullable<SignalSnapshot["recognition"]>;
  pruning: NonNullable<SignalSnapshot["pruning"]>;
  meaning?: SignalSnapshot["meaning"];
  decision: SignalContext["decision"];
}): PurposeInput {
  const supplied = args.context.purpose;
  if (!supplied) {
    throw new Error("Purpose requires an ambition input.");
  }
  const survivalLayer = args.perception.layers.survival;
  const selfLayer = args.perception.layers.selfAwareness;
  const outcomeProgress = args.context.outcomes?.length
    ? mean(args.context.outcomes.map((outcome) => clamp(50 + outcome.realizedMagnitude * 10)))
    : undefined;

  return {
    ...supplied,
    behavior: [
      {
        discipline: args.calibration.trustworthiness,
        consistency: args.reflection.reflectionScore,
        recovery: survivalLayer?.score,
        conviction: args.decision?.confidence ?? args.calibration.calibratedConfidence,
        adaptation: args.discovery.confidence,
        stressTolerance: survivalLayer ? 100 - survivalLayer.uncertainty : undefined,
        confidenceCalibration: clamp(100 - Math.abs(args.calibration.calibrationError)),
        panicExit: args.context.agency?.execution?.blocked === true,
        regret: args.judgement?.status === "blocked" ? 45 : undefined,
        sustainedProgress: outcomeProgress != null ? outcomeProgress >= 55 : undefined,
      },
      ...safeArray(supplied.behavior),
    ],
    expectations: [
      {
        expectedExperience: args.decision?.confidence ?? args.calibration.rawConfidence,
        expectedOutcome: args.decision?.expectedValue ?? args.perception.compositeScore,
        actualExperience: args.calibration.trustworthiness,
        actualOutcome: outcomeProgress ?? args.perception.compositeScore,
        disappointment: outcomeProgress == null ? undefined : Math.max(0, 55 - outcomeProgress),
        surprise: Math.abs(args.calibration.calibrationError),
        confidenceShock: Math.max(0, args.calibration.rawConfidence - args.calibration.calibratedConfidence),
        expectationShock: Math.abs(args.calibration.calibrationError),
        progress: outcomeProgress,
      },
      ...safeArray(supplied.expectations),
    ],
    currentPath: {
      alignment: mean([
        args.perception.compositeScore,
        args.discovery.confidence,
        args.recognition.recognitionScore,
        args.pruning.evidenceConfidence,
      ]),
      progress: outcomeProgress ?? args.discovery.maturity,
      survivability: survivalLayer?.score,
      sustainability: mean([
        survivalLayer?.score ?? 60,
        args.calibration.trustworthiness,
        args.perception.confidence,
      ]),
      behaviorFit: mean([
        args.reflection.reflectionScore,
        args.calibration.trustworthiness,
        selfLayer?.score ?? 60,
      ]),
      clarity: args.reflection.knowledgeCompleteness.completenessScore,
      usefulness: args.discovery.confidence,
      evidenceQuality: args.pruning.evidenceConfidence,
      ...(supplied.currentPath ?? {}),
    },
    decision: supplied.decision ?? args.decision,
    pruning: supplied.pruning ?? args.pruning,
    meaning: supplied.meaning ?? args.meaning,
    selfModel: supplied.selfModel ?? {
      score: selfLayer?.score,
      confidence: selfLayer?.confidence,
    },
    governance: supplied.governance ?? {
      score: args.judgement?.trust ?? args.calibration.trustworthiness,
      confidence: args.judgement?.reliability ?? args.calibration.trustworthiness,
      status: args.judgement?.status,
    },
    outcome: supplied.outcome ?? {
      score: outcomeProgress,
      confidence: outcomeProgress == null ? 40 : 70,
    },
    recovery: supplied.recovery,
    evidenceQuality: supplied.evidenceQuality ?? args.pruning.evidenceConfidence,
  };
}

function signalsToPruningCandidates(context: SignalContext, timestamp: number): PruningCandidateInput[] {
  const outcomeBySignalId = new Map((context.outcomes ?? []).map((outcome) => [outcome.signalId, outcome]));
  return safeArray(context.signals).map((signal) => {
    const outcome = outcomeBySignalId.get(signal.id);
    const compositionValues = Object.values(signal.composition ?? {}).map((value) => numeric(value, 0));
    const correct = outcome ? outcome.realizedDirection === signal.expectedDirection : undefined;
    return {
      candidateId: signal.id,
      candidateType: "raw-signal",
      sourceModule: "signal-journal",
      currentWeight: compositionValues.length ? clamp(mean(compositionValues)) : signal.confidence,
      historicalUtility: correct == null ? 45 : correct ? 78 : 22,
      predictiveContribution: signal.confidence,
      decisionContribution: clamp(Math.abs(signal.expectedMagnitude) * 10),
      redundancyScore: 0,
      noiseScore: correct === false ? 68 : 100 - signal.confidence,
      volatilitySensitivity: numeric(signal.executionAssumptions?.volatilitySensitivity, 25),
      regimeStability: 55,
      evidenceQuality: outcome ? 72 : 38,
      sampleSize: outcome ? 1 : 0,
      staleDataRisk: staleRiskForTimestamp(signal.timestamp, timestamp),
      contradictionRate: correct === false ? 65 : 0,
      falsePositiveRate: correct === false && signal.expectedDirection === "up" ? 70 : 0,
      falseNegativeRate: correct === false && signal.expectedDirection === "down" ? 70 : 0,
      complexityCost: Object.keys(signal.composition ?? {}).length * 7,
      maintenanceCost: 10,
      latencyCost: 0,
      userClarityCost: 15,
      overfitRisk: 100 - signal.confidence,
      explainabilityValue: compositionValues.length ? 65 : 35,
      survivalValue: numeric(signal.executionAssumptions?.survivalValue, 35),
      recentOutcomeImpact: correct == null ? 0 : correct ? 35 : -35,
      counterfactualImpact: 0,
      confidenceImpact: signal.confidence - 50,
      trustImpact: 0,
      uncertainty: 100 - signal.confidence,
      timestamp: signal.timestamp,
    };
  });
}

function metricsToPruningCandidates(
  context: SignalContext,
  perception: PerceptionEvaluation,
  timestamp: number,
): PruningCandidateInput[] {
  const timestamps = metricTimestampByKey(context);
  return Object.values(perception.metrics).map((metric) => {
    const maxLayerWeight = metric.layers.length ? Math.max(...metric.layers.map((layer) => layer.weight)) : 1;
    const supportsSurvival = metric.layers.some((layer) => layer.layer === "survival");
    const supportsSelfAwareness = metric.layers.some((layer) => layer.layer === "selfAwareness");
    const zScore = numeric(metric.normalization?.zScore, 0);
    const timestampForMetric = timestamps[metric.key];
    const ageRisk = staleRiskForTimestamp(timestampForMetric, timestamp);
    const noiseScore = clamp(100 - metric.confidence + Math.abs(zScore) * 10);
    return {
      candidateId: `metric:${metric.key}`,
      candidateType: "derived-metric",
      sourceModule: "perception",
      currentWeight: clamp(maxLayerWeight * 100),
      historicalUtility: metric.score,
      predictiveContribution: metric.score,
      decisionContribution: clamp(metric.score * 0.5 + metric.confidence * 0.5),
      redundancyScore: 0,
      noiseScore,
      volatilitySensitivity: clamp(Math.abs(zScore) * 15),
      regimeStability: perception.agreement,
      evidenceQuality: metric.confidence,
      sampleSize: metric.confidence >= 80 ? 30 : 8,
      staleDataRisk: ageRisk,
      contradictionRate: supportsSelfAwareness && metric.key.toLowerCase().includes("overfit") ? metric.score : 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      complexityCost: metric.detail && metric.detail.length > 220 ? 45 : 18,
      maintenanceCost: 12,
      latencyCost: 0,
      userClarityCost: metric.detail && metric.detail.length > 260 ? 55 : 20,
      overfitRisk: metric.key.toLowerCase().includes("overfit") ? metric.score : Math.max(0, 100 - metric.confidence),
      explainabilityValue: metric.detail ? 70 : 35,
      survivalValue: supportsSurvival ? metric.score : supportsSelfAwareness ? 55 : 35,
      recentOutcomeImpact: 0,
      counterfactualImpact: 0,
      confidenceImpact: metric.confidence - 50,
      trustImpact: 0,
      uncertainty: 100 - metric.confidence,
      timestamp: timestampForMetric,
      governanceFlags: supportsSurvival ? ["survival-critical"] : [],
    };
  });
}

function decisionToPruningCandidate(args: {
  context: SignalContext;
  timestamp: number;
  reflection: NonNullable<SignalSnapshot["reflection"]>;
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  judgement?: SignalSnapshot["judgement"];
  recognition: NonNullable<SignalSnapshot["recognition"]>;
  decision: SignalContext["decision"];
}): PruningCandidateInput[] {
  const decision = args.decision;
  if (!decision) return [];
  const metadata = decision.metadata ?? {};
  const confidence = finiteMaybe(decision.confidence, args.calibration.calibratedConfidence) ?? 0;
  const uncertainty = finiteMaybe(decision.uncertainty, 100 - confidence) ?? Math.max(0, 100 - confidence);
  return [{
    candidateId: decision.id ?? `${args.context.id ?? args.timestamp}:decision`,
    candidateType: "recommendation-contributor",
    sourceModule: "decision",
    currentWeight: confidence,
    historicalUtility: args.judgement?.trust ?? args.calibration.historicalAccuracy,
    predictiveContribution: confidence,
    decisionContribution: finiteMaybe(decision.impact, decision.expectedValue, confidence),
    redundancyScore: 0,
    noiseScore: uncertainty,
    volatilitySensitivity: finiteMaybe(metadata.volatilitySensitivity, 25),
    regimeStability: args.recognition.recurrenceConfidence,
    evidenceQuality: args.calibration.trustworthiness,
    sampleSize: args.calibration.sampleSize,
    staleDataRisk: 0,
    contradictionRate: args.judgement?.status === "blocked" ? 85 : args.judgement?.status === "review_required" ? 55 : 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    complexityCost: finiteMaybe(metadata.complexityCost, 20),
    maintenanceCost: finiteMaybe(metadata.maintenanceCost, 15),
    latencyCost: finiteMaybe(metadata.latencyCost, 0),
    userClarityCost: finiteMaybe(metadata.userClarityCost, 20),
    overfitRisk: args.judgement?.overfitRisk ?? Math.max(0, confidence - args.calibration.trustworthiness),
    explainabilityValue: args.reflection.knowledgeCompleteness.score,
    survivalValue: finiteMaybe(metadata.survivalValue, 35),
    recentOutcomeImpact: 0,
    counterfactualImpact: 0,
    confidenceImpact: confidence - 50,
    trustImpact: args.calibration.trustworthiness - 50,
    uncertainty,
  }];
}

function discoveryToPruningCandidates(args: {
  discovery: NonNullable<SignalSnapshot["discovery"]>;
  recognition: NonNullable<SignalSnapshot["recognition"]>;
}): PruningCandidateInput[] {
  return args.discovery.opportunities.slice(0, 5).map((opportunity) => ({
    candidateId: opportunity.id,
    candidateType: "historical-pattern",
    sourceModule: "discovery",
    currentWeight: opportunity.strength,
    historicalUtility: opportunity.trust,
    predictiveContribution: opportunity.confidence,
    decisionContribution: opportunity.readiness,
    redundancyScore: 0,
    noiseScore: opportunity.fragility,
    volatilitySensitivity: opportunity.fragility,
    regimeStability: args.recognition.recurrenceConfidence,
    evidenceQuality: opportunity.confidence,
    sampleSize: opportunity.supportingEvidence.length + opportunity.contradictoryEvidence.length,
    staleDataRisk: opportunity.lifecycle.decayRisk,
    contradictionRate: opportunity.contradictoryEvidence.length * 12,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    complexityCost: opportunity.traces.length * 2,
    maintenanceCost: 10,
    latencyCost: 0,
    userClarityCost: opportunity.explanation.length > 180 ? 45 : 20,
    overfitRisk: opportunity.fragility,
    explainabilityValue: opportunity.explanation.length ? 70 : 35,
    survivalValue: 35,
    recentOutcomeImpact: 0,
    counterfactualImpact: 0,
    confidenceImpact: opportunity.confidence - 50,
    trustImpact: opportunity.trust - 50,
    uncertainty: 100 - opportunity.confidence,
  }));
}

function candidateOnly(input: Partial<PruningInput>): PruningCandidateInput {
  const { candidates: _candidates, now: _now, strictValidation: _strictValidation, ...candidate } = input;
  return candidate;
}

function staleRiskForTimestamp(value: unknown, now: number) {
  if (value == null) return 35;
  const timestamp = Number(value instanceof Date ? value.getTime() : value);
  if (!Number.isFinite(timestamp)) {
    const parsed = Date.parse(String(value));
    if (!Number.isFinite(parsed)) return 35;
    return staleRiskForAge(now - parsed);
  }
  return staleRiskForAge(now - timestamp);
}

function staleRiskForAge(ageMs: number) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs <= 60_000) return 0;
  if (ageMs >= 60 * 60_000) return 100;
  return clamp((ageMs / (60 * 60_000)) * 100);
}

function buildViabilityInput(args: {
  context: SignalContext;
  decision: SignalContext["decision"];
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  agency: NonNullable<SignalSnapshot["agency"]>;
}): ViabilityInput {
  const supplied = args.context.viability ?? {};
  const decision = args.decision;
  const metadata = decision?.metadata ?? {};
  const constraints = supplied.constraints ?? agencyConstraints(args.agency);

  return {
    targetRef:
      supplied.targetRef ??
      decision?.id ??
      args.context.id ??
      `${args.context.domain ?? "generic"}:action`,
    actionRef: supplied.actionRef ?? decision?.intent ?? decision?.type,
    decisionRef: supplied.decisionRef ?? decision?.id,
    expectedBenefit:
      supplied.expectedBenefit ??
      firstFinite(metadata.expectedBenefit, decision?.expectedValue, decision?.impact, decision?.confidence, args.agency.commitmentConfidence),
    expectedCost:
      supplied.expectedCost ??
      firstFinite(metadata.expectedCost, metadata.cost, Math.max(0, 100 - args.agency.executionReadiness), 0),
    expectedRisk:
      supplied.expectedRisk ??
      firstFinite(decision?.risk, metadata.expectedRisk, metadata.risk, 100 - args.agency.constraintEvaluation.score),
    uncertainty:
      supplied.uncertainty ??
      firstFinite(decision?.uncertainty, metadata.uncertainty, 100 - args.agency.commitmentConfidence),
    confidence:
      supplied.confidence ??
      firstFinite(args.agency.commitmentConfidence, args.calibration.calibratedConfidence, decision?.confidence),
    constraints,
    minMarginOfSafety: supplied.minMarginOfSafety,
    thresholds: supplied.thresholds,
    weights: supplied.weights,
    context: {
      domain: args.context.domain ?? "generic",
      ...(supplied.context ?? {}),
    },
  };
}

function buildDiscoveryIntelligenceInput(args: {
  context: SignalContext;
  timestamp: number;
  discovery: NonNullable<SignalSnapshot["discovery"]>;
  recognition: NonNullable<SignalSnapshot["recognition"]>;
  judgement?: SignalSnapshot["judgement"];
  agency: NonNullable<SignalSnapshot["agency"]>;
  viability?: SignalSnapshot["viability"];
  calibration: NonNullable<SignalSnapshot["calibration"]>;
  diagnostics: NonNullable<SignalSnapshot["diagnostics"]>;
  opportunities: SignalSnapshot["opportunities"];
  opportunityDensity: NonNullable<SignalSnapshot["opportunityDensity"]>;
  history: Readonly<SignalSnapshot>[];
}): DiscoveryIntelligenceInput {
  const supplied = args.context.discoveryIntelligence ?? {};
  const decision = args.context.decision;
  const discoveryRecords = [
    {
      id: `${args.context.id ?? args.timestamp}:discovery`,
      stage: args.discovery.lifecycle.status,
      previousStage: args.discovery.lifecycle.previousStatus,
      novelty: args.discovery.novelty,
      confidence: args.discovery.confidence,
      trust: args.discovery.trust,
      maturity: args.discovery.maturity,
      value: args.discovery.confidence - args.discovery.fragility,
      converted: args.discovery.confidence >= 70,
    },
    ...args.discovery.opportunities.map((opportunity) => ({
      id: opportunity.id,
      stage: opportunity.lifecycle.status ?? opportunity.status,
      previousStage: opportunity.lifecycle.previousStatus,
      novelty: opportunity.novelty,
      confidence: opportunity.confidence,
      trust: opportunity.trust,
      maturity: opportunity.maturity,
      value: opportunity.strength,
      converted: opportunity.confidence >= 70,
    })),
    ...args.opportunities.map((opportunity) => ({
      id: opportunity.opportunityId,
      stage: opportunity.persistent
        ? "REPEATABLE"
        : opportunity.emerging
          ? "DETECTED"
          : "OBSERVED",
      confidence: opportunity.confidence,
      maturity: opportunity.strength,
      value: opportunity.strength,
      converted: opportunity.confidence >= 70,
    })),
    ...safeArray(supplied.discoveries),
  ];
  const decisionRecords = [
    ...(decision
      ? [
          {
            id: decision.id ?? `${args.context.id ?? args.timestamp}:decision`,
            discoveryId: args.discovery.opportunities[0]?.id,
            action: discoveryIntelligenceAction(args.agency.status),
            expectedValue: finiteMaybe(
              decision.expectedValue,
              decision.impact,
              decision.confidence,
            ),
            alternatives: alternativeValuesForDiscoveryIntelligence({
              confidence: decision.confidence,
              risk: decision.risk,
              opportunity: args.opportunityDensity.quality,
              agency: args.agency,
            }),
            confidence: decision.confidence,
            timestamp: args.timestamp,
          },
        ]
      : []),
    ...safeArray(supplied.decisions),
  ];
  const outcomeRecords = [
    ...safeArray(args.context.outcomes).map((outcome) => ({
      id: `${outcome.signalId}:${outcome.window}`,
      decisionId: outcome.signalId,
      value: outcome.realizedMagnitude,
      success: outcome.realizedDirection !== "unknown" && outcome.realizedDirection !== "flat",
      timestamp: outcome.evaluatedAt,
      calibrationScore: args.calibration.trustworthiness,
      trustScore: args.diagnostics.trust,
      survivalScore: args.viability?.score,
      decisionQuality: args.judgement?.adjustedConfidence,
      governanceScore: args.agency.constraintEvaluation.score,
    })),
    ...safeArray(supplied.outcomes),
  ];
  const restrictionRecords = [
    ...args.agency.constraintEvaluation.constraints.map((constraint) => ({
      id: constraint.id,
      type: constraint.type,
      label: constraint.label,
      decisionId: decision?.id ?? `${args.context.id ?? args.timestamp}:decision`,
      avoidedLoss: constraint.passed ? 0 : constraint.severity === "critical" ? 25 : 10,
      missedUpside: constraint.passed ? 0 : Math.max(0, 100 - constraint.score) / 5,
    })),
    ...(args.viability?.constraints ?? []).map((constraint) => ({
      id: constraint.id,
      type: constraint.type,
      label: constraint.label,
      decisionId: args.viability?.decisionRef ?? decision?.id,
      avoidedLoss: constraint.passed ? 0 : Math.max(0, 100 - constraint.score) / 4,
      missedUpside: constraint.passed ? 0 : Math.max(0, 100 - (args.viability?.score ?? 0)) / 5,
    })),
    ...safeArray(supplied.restrictions),
  ];
  const traces = [
    ...historyDiscoveryIntelligenceTraces(args.history),
    {
      id: `${args.context.id ?? args.timestamp}:calibration`,
      metric: "calibration",
      value: args.calibration.trustworthiness,
      timestamp: args.timestamp,
    },
    {
      id: `${args.context.id ?? args.timestamp}:trust`,
      metric: "trust",
      value: args.diagnostics.trust,
      timestamp: args.timestamp,
    },
    {
      id: `${args.context.id ?? args.timestamp}:survival`,
      metric: "survival",
      value: args.viability?.score ?? args.agency.executionReadiness,
      timestamp: args.timestamp,
    },
    {
      id: `${args.context.id ?? args.timestamp}:decision-quality`,
      metric: "decision quality",
      value: args.judgement?.adjustedConfidence ?? args.recognition.recognitionScore,
      timestamp: args.timestamp,
    },
    {
      id: `${args.context.id ?? args.timestamp}:governance`,
      metric: "governance",
      value: args.agency.constraintEvaluation.score,
      timestamp: args.timestamp,
    },
    ...safeArray(supplied.traces),
  ];

  return {
    discoveries: discoveryRecords,
    decisions: decisionRecords,
    outcomes: outcomeRecords,
    restrictions: restrictionRecords,
    traces,
  };
}

function buildLegacyInput(args: {
  context: SignalContext;
  timestamp: number;
  perception: PerceptionEvaluation;
  diagnostics: NonNullable<SignalSnapshot["diagnostics"]>;
  discovery: NonNullable<SignalSnapshot["discovery"]>;
  discoveryIntelligence: NonNullable<SignalSnapshot["discoveryIntelligence"]>;
  recognition: NonNullable<SignalSnapshot["recognition"]>;
  judgement?: SignalSnapshot["judgement"];
  agency: NonNullable<SignalSnapshot["agency"]>;
  viability?: SignalSnapshot["viability"];
  executionReadiness: NonNullable<SignalSnapshot["executionReadiness"]>;
  previousLegacy?: SignalSnapshot["legacy"];
}): LegacyInput {
  const supplied = args.context.legacy ?? {};
  const suppliedScores = supplied.scores ?? {};
  const recoveryScore = finiteMaybe(suppliedScores.recovery);
  const governanceApproved = args.agency.status === "approved" || (finiteMaybe(suppliedScores.governance) ?? 0) >= 80;

  return {
    now: supplied.now ?? new Date(args.timestamp).toISOString(),
    history: supplied.history ?? args.previousLegacy?.history,
    eventLog: supplied.eventLog,
    config: supplied.config,
    scores: {
      trust: args.diagnostics.trust,
      recovery: recoveryScore,
      governance: args.discoveryIntelligence.governance.score,
      survival: args.perception.layers.survival?.score,
      agency: args.agency.agencyScore,
      wisdom: args.discoveryIntelligence.metaLearning.score,
      discovery: args.discovery.maturity,
      recognition: args.recognition.recognitionScore,
      judgement: args.judgement?.trust,
      readiness: args.executionReadiness.readinessScore,
      viability: args.viability?.score,
      institutionalization: args.discoveryIntelligence.institutionalization.institutionalizationScore,
      ...(suppliedScores ?? {}),
    },
    counters: {
      ...(supplied.counters ?? {}),
    },
    flags: {
      governanceApproved,
      recoveryComplete: (recoveryScore ?? 0) >= 80,
      ...(supplied.flags ?? {}),
    },
  };
}

function discoveryIntelligenceAction(
  agencyStatus: string,
): DiscoveryIntelligenceDecisionAction {
  const status = agencyStatus.trim().toLowerCase();
  if (status === "approved") return "ACT";
  if (status === "limited") return "RESTRICT";
  if (status === "denied" || status === "rollback") return "REJECT";
  return "WAIT";
}

function alternativeValuesForDiscoveryIntelligence(args: {
  confidence?: number;
  risk?: number;
  opportunity: number;
  agency: NonNullable<SignalSnapshot["agency"]>;
}): Partial<Record<DiscoveryIntelligenceDecisionAction, number>> {
  const opportunity = finiteMaybe(args.opportunity) ?? 0;
  const confidence = finiteMaybe(args.confidence, args.agency.commitmentConfidence) ?? 0;
  const risk = finiteMaybe(args.risk) ?? Math.max(0, 100 - args.agency.executionReadiness);
  const base = (opportunity * 0.45 + confidence * 0.35) / 10 - risk / 12;

  return {
    ACT: base,
    WAIT: base * 0.45,
    REJECT: 0,
    RESTRICT: base * 0.65,
  };
}

function historyDiscoveryIntelligenceTraces(
  history: Readonly<SignalSnapshot>[],
) {
  return history.flatMap((snapshot) => [
    {
      id: `${snapshot.id}:di-calibration`,
      metric: "calibration",
      value: snapshot.calibration?.trustworthiness,
      timestamp: snapshot.timestamp,
    },
    {
      id: `${snapshot.id}:di-trust`,
      metric: "trust",
      value: snapshot.diagnostics.trust,
      timestamp: snapshot.timestamp,
    },
    {
      id: `${snapshot.id}:di-survival`,
      metric: "survival",
      value: snapshot.viability?.score ?? snapshot.agency?.executionReadiness,
      timestamp: snapshot.timestamp,
    },
    {
      id: `${snapshot.id}:di-decision-quality`,
      metric: "decision quality",
      value: snapshot.judgement?.adjustedConfidence ?? snapshot.recognition?.recognitionScore,
      timestamp: snapshot.timestamp,
    },
    {
      id: `${snapshot.id}:di-governance`,
      metric: "governance",
      value: snapshot.agency?.constraintEvaluation.score,
      timestamp: snapshot.timestamp,
    },
  ]);
}

function finiteMaybe(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function agencyConstraints(agency: NonNullable<SignalSnapshot["agency"]>): ViabilityConstraintInput[] {
  return agency.constraintEvaluation.constraints.map((constraint) => ({
    id: constraint.id,
    label: constraint.label,
    type: constraint.hard ? "hard" : "soft",
    hard: constraint.hard,
    passed: constraint.passed,
    severity: constraint.severity,
    reason: constraint.reason,
  }));
}

function applyLifecycleSelfAwareness(
  perception: PerceptionEvaluation,
  reflection: NonNullable<SignalSnapshot["reflection"]>,
  calibration: NonNullable<SignalSnapshot["calibration"]>,
  agency: NonNullable<SignalSnapshot["agency"]>,
  viability?: ViabilityResult,
): PerceptionEvaluation {
  const baseLayer = perception.layers.selfAwareness;
  const lifecycleContributors = [
    lifecycleContribution(
      "reflectionScore",
      "Reflection score",
      reflection.reflectionScore,
    ),
    lifecycleContribution(
      "calibration",
      "Reflection calibration",
      reflection.calibration.score,
    ),
    lifecycleContribution(
      "historicalAccuracy",
      "Historical accuracy",
      calibration.historicalAccuracy,
    ),
    lifecycleContribution(
      "calibrationQuality",
      "Calibration quality",
      100 - Math.abs(calibration.calibrationError),
    ),
    lifecycleContribution(
      "trustworthiness",
      "Trustworthiness",
      calibration.trustworthiness,
    ),
    lifecycleContribution(
      "memoryDepth",
      "Memory depth",
      Math.min(100, calibration.sampleSize * 5),
    ),
    lifecycleContribution(
      "knowledgeCompleteness",
      "Knowledge completeness",
      reflection.knowledgeCompleteness.score,
    ),
    lifecycleContribution("agencyScore", "Agency score", agency.agencyScore),
    lifecycleContribution(
      "commitmentConfidence",
      "Commitment confidence",
      agency.commitmentConfidence,
    ),
    lifecycleContribution(
      "executionReadiness",
      "Execution readiness",
      agency.executionReadiness,
    ),
    ...(viability
      ? [
          lifecycleContribution("viabilityScore", "Viability score", viability.score),
          lifecycleContribution(
            "viabilityMarginOfSafety",
            "Viability margin of safety",
            clamp(50 + viability.marginOfSafety * 100),
          ),
        ]
      : []),
  ];
  const lifecycleScore = mean(
    lifecycleContributors.map((item) => item.contribution),
  );
  const score = clamp(baseLayer.score * 0.34 + lifecycleScore * 0.66);
  const confidence = clamp(
    mean([
      baseLayer.confidence,
      reflection.reflectionScore,
      calibration.trustworthiness,
      agency.commitmentConfidence,
    ]),
  );
  const selfAwareness: PerceptionLayerState = {
    ...baseLayer,
    score,
    confidence,
    uncertainty: clamp(100 - confidence),
    classification: classifyPerceptionLayer("selfAwareness", score),
    contributors: [...lifecycleContributors, ...baseLayer.contributors],
  };
  const layers = { ...perception.layers, selfAwareness };
  const layerScores = PERCEPTION_LAYER_ORDER.map((key) => layers[key].score);
  const timeframes = {
    intraday: timeframe("intraday", "Intraday", [
      layers.survival.score,
      layers.emotion.score,
      layers.information.score,
      layers.selfAwareness.score,
    ]),
    swing: timeframe("swing", "Swing", [
      layers.conviction.score,
      layers.harmony.score,
      layers.intuition.score,
      layers.selfAwareness.score,
    ]),
    macro: timeframe("macro", "Macro", [
      layers.macroContext.score,
      layers.survival.score,
      layers.harmony.score,
      layers.selfAwareness.score,
    ]),
  };
  const dominantLayer = PERCEPTION_LAYER_ORDER.reduce(
    (best, key) => (layers[key].score > layers[best].score ? key : best),
    "survival",
  );

  return {
    ...perception,
    layers,
    timeframes,
    compositeScore: clamp(mean(layerScores)),
    confidence: clamp(
      mean(PERCEPTION_LAYER_ORDER.map((key) => layers[key].confidence)),
    ),
    agreement: clamp(100 - stdev(layerScores) * 1.35),
    dominantLayer,
  };
}

function reflectionState(
  perception: PerceptionEvaluation,
  synchronization: ReturnType<typeof evaluateSynchronization>,
  validation: ReturnType<SignalJournal["snapshot"]>,
) {
  return {
    compositeScore: perception.compositeScore,
    confidence: perception.confidence,
    agreement: perception.agreement,
    synchronization: synchronization.score,
    calibrationAccuracy: validation.calibrationAccuracy,
    confidenceRealism: validation.confidenceRealism,
    evaluatedSignals: validation.evaluatedSignals,
    ...Object.fromEntries(
      PERCEPTION_LAYER_ORDER.map((key) => [
        `layer.${key}`,
        perception.layers[key].score,
      ]),
    ),
  };
}

function snapshotHistory(history: Readonly<SignalSnapshot>[]) {
  return history.map((snapshot) => ({
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    state: {
      compositeScore: snapshot.perception.compositeScore,
      confidence: snapshot.perception.confidence,
      agreement: snapshot.perception.agreement,
      synchronization: snapshot.synchronization.score,
          reflectionScore: snapshot.reflection?.reflectionScore,
          calibratedConfidence: snapshot.calibration?.calibratedConfidence,
          trustworthiness: snapshot.calibration?.trustworthiness,
          agencyScore: snapshot.agency?.agencyScore,
      ...Object.fromEntries(
        PERCEPTION_LAYER_ORDER.map((key) => [
          `layer.${key}`,
          snapshot.perception.layers[key].score,
        ]),
      ),
    },
  }));
}

function perceptionLayers(layers: Record<string, PerceptionLayerState>) {
  return Object.fromEntries(
    Object.entries(layers).map(([key, layer]) => [
      key,
      {
        key,
        score: layer.score,
        confidence: layer.confidence,
        uncertainty: layer.uncertainty,
      },
    ]),
  );
}

function metricTimestampByKey(context: SignalContext) {
  return Object.fromEntries(
    (context.metrics ?? []).map((metric) => [metric.key, metric.timestamp]),
  );
}

function lifecycleContribution(
  metricKey: string,
  label: string,
  value: number,
) {
  return {
    metricKey,
    label,
    value,
    contribution: clamp(value),
    weight: 1,
    raw: value,
    detail: `${label} from the generic Reflection/Agency lifecycle.`,
    polarity: "direct" as const,
  };
}

function timeframe(
  key: "intraday" | "swing" | "macro",
  label: string,
  values: number[],
): TimeframeState {
  return {
    key,
    label,
    score: clamp(mean(values)),
    agreement: clamp(100 - stdev(values) * 1.25),
  };
}

function safeArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

function firstFinite(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
