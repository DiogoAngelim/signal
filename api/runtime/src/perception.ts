import type { SignalEnvelope } from "@signal/protocol";
import { fingerprint } from "./hash";

export const perceptionMetricNames = [
  "pressure",
  "stability",
  "instability",
  "coherence",
  "alignment",
  "conflict",
  "momentum",
  "intensity",
  "participation",
  "density",
  "volatility",
  "expansion",
  "compression",
  "entropy",
  "noise",
  "confidence",
  "fragility",
  "stress",
  "conviction",
  "persistence",
  "transitionProbability",
  "environmentalEnergy",
  "directionalClarity",
  "structuralHealth",
] as const;

export type PerceptionMetricName = (typeof perceptionMetricNames)[number];

export type PerceptionMetrics = Record<PerceptionMetricName, number>;

export type PerceptionSignalRole =
  | PerceptionMetricName
  | "flow"
  | "rhythm"
  | "reinforcement"
  | "fragmentation"
  | "convergence"
  | "divergence"
  | "energy"
  | "saturation"
  | "structural-stability"
  | "generic";

export type PerceptionSignalInput =
  | number
  | {
      value: number;
      weight?: number;
      role?: PerceptionSignalRole;
      normalized?: boolean;
      confidence?: number;
      direction?: number;
      meta?: Record<string, unknown>;
    };

export interface PerceptionRelationship {
  from: string;
  to: string;
  strength: number;
  polarity?: number;
  confidence?: number;
  weight?: number;
  meta?: Record<string, unknown>;
}

export interface PerceptionEvent {
  name: string;
  intensity?: number;
  polarity?: number;
  confidence?: number;
  weight?: number;
  observedAt?: string | number | Date;
  meta?: Record<string, unknown>;
}

export interface PerceptionObservation {
  id?: string;
  subject: string;
  observedAt?: string | number | Date;
  source?: string;
  signals?: Record<string, PerceptionSignalInput>;
  dimensions?: Record<string, PerceptionSignalInput>;
  relationships?: PerceptionRelationship[];
  events?: PerceptionEvent[];
  confidence?: number;
  weight?: number;
  meta?: Record<string, unknown>;
}

export interface SignalEnvelopePerceptionOptions {
  subject?: string;
  source?: string;
  includeMetaNumbers?: boolean;
  maxDepth?: number;
}

export interface PerceptionConditionBlend {
  name: string;
  score: number;
  metrics: Partial<PerceptionMetrics>;
}

export interface PerceptionAnomaly {
  signal: string;
  severity: number;
  zScore: number;
  value: number;
  baseline: number;
  metric?: PerceptionMetricName;
  reason: string;
}

export interface PerceptionTransition {
  probability: number;
  magnitude: number;
  acceleration: number;
  fromStateHash?: string;
  toStateHash: string;
  labels: string[];
}

export interface PerceptionPersistence {
  score: number;
  observationCount: number;
  durationMs: number;
  startedAt: string;
  degradation: number;
  halfLifeMs: number;
}

export interface PerceptionConfidenceBreakdown {
  score: number;
  input: number;
  dataQuality: number;
  decay: number;
  degradation: number;
}

export interface PerceptionDriver {
  signal: string;
  metric: PerceptionMetricName;
  contribution: number;
  direction: number;
}

export interface PerceptionSnapshot {
  id: string;
  subject: string;
  sequence: number;
  observedAt: string;
  createdAt: string;
  source?: string;
  metrics: PerceptionMetrics;
  instantaneousMetrics: PerceptionMetrics;
  delta: PerceptionMetrics;
  directionalBias: number;
  conditions: PerceptionConditionBlend[];
  anomalies: PerceptionAnomaly[];
  drivers: PerceptionDriver[];
  transition: PerceptionTransition;
  persistence: PerceptionPersistence;
  confidence: PerceptionConfidenceBreakdown;
  stateHash: string;
  eventNames: string[];
  signalCount: number;
  relationshipCount: number;
  meta?: Record<string, unknown>;
}

export interface PerceptionSnapshotStore {
  record(snapshot: PerceptionSnapshot): void | Promise<void>;
}

export interface PerceptionLayerOptions {
  smoothingAlpha?: number;
  historyLimit?: number;
  confidenceHalfLifeMs?: number;
  transitionSensitivity?: number;
  anomalyZScore?: number;
  expectedSignalCount?: number;
  store?: PerceptionSnapshotStore;
  now?: () => number;
}

export type PerceptionSubscriber = (
  snapshot: PerceptionSnapshot,
) => void | Promise<void>;

type SignalMemory = {
  count: number;
  mean: number;
  m2: number;
  min: number;
  max: number;
  lastValue?: number;
  lastNormalized?: number;
  lastDelta?: number;
};

type SubjectMemory = {
  latest?: PerceptionSnapshot;
  history: PerceptionSnapshot[];
  signals: Map<string, SignalMemory>;
  sequence: number;
  stateStartedAt: number;
  lastTransitionMagnitude: number;
};

type PreparedSignal = {
  name: string;
  value: number;
  normalized: number;
  signed: number;
  delta: number;
  zScore: number;
  baseline: number;
  weight: number;
  confidence: number;
  role: PerceptionSignalRole;
};

const EPSILON = 0.000001;
const DEFAULT_CONFIDENCE_HALF_LIFE_MS = 5 * 60 * 1000;

export function createEmptyPerceptionMetrics(value = 0): PerceptionMetrics {
  return perceptionMetricNames.reduce((metrics, name) => {
    metrics[name] = value;
    return metrics;
  }, {} as PerceptionMetrics);
}

export function interpolatePerceptionMetrics(
  from: PerceptionMetrics,
  to: PerceptionMetrics,
  ratio: number,
): PerceptionMetrics {
  const t = clamp01(ratio);
  const metrics = createEmptyPerceptionMetrics();
  for (const name of perceptionMetricNames) {
    metrics[name] = normalized(from[name] + (to[name] - from[name]) * t);
  }
  return metrics;
}

export function interpolatePerceptionSnapshots(
  from: PerceptionSnapshot,
  to: PerceptionSnapshot,
  ratio: number,
): PerceptionSnapshot {
  const t = clamp01(ratio);
  return {
    ...to,
    id: fingerprint({
      perception: "interpolated",
      from: from.id,
      to: to.id,
      ratio: t,
    }),
    sequence: Math.round(from.sequence + (to.sequence - from.sequence) * t),
    observedAt: new Date(
      timestampFrom(from.observedAt) +
        (timestampFrom(to.observedAt) - timestampFrom(from.observedAt)) * t,
    ).toISOString(),
    metrics: interpolatePerceptionMetrics(from.metrics, to.metrics, t),
    instantaneousMetrics: interpolatePerceptionMetrics(
      from.instantaneousMetrics,
      to.instantaneousMetrics,
      t,
    ),
    delta: interpolatePerceptionMetrics(from.delta, to.delta, t),
  };
}

export class PerceptionLayer {
  private readonly subjects = new Map<string, SubjectMemory>();
  private readonly subscribers = new Set<PerceptionSubscriber>();
  private readonly options: Required<Omit<PerceptionLayerOptions, "store">> &
    Pick<PerceptionLayerOptions, "store">;

  constructor(options: PerceptionLayerOptions = {}) {
    this.options = {
      smoothingAlpha: options.smoothingAlpha ?? 0.35,
      historyLimit: options.historyLimit ?? 500,
      confidenceHalfLifeMs:
        options.confidenceHalfLifeMs ?? DEFAULT_CONFIDENCE_HALF_LIFE_MS,
      transitionSensitivity: options.transitionSensitivity ?? 0.28,
      anomalyZScore: options.anomalyZScore ?? 2.75,
      expectedSignalCount: options.expectedSignalCount ?? 12,
      now: options.now ?? (() => Date.now()),
      store: options.store,
    };
  }

  observe(observation: PerceptionObservation): PerceptionSnapshot {
    const observedAtMs = timestampFrom(
      observation.observedAt ?? this.options.now(),
    );
    const observedAt = new Date(observedAtMs).toISOString();
    const memory = this.getMemory(observation.subject, observedAtMs);
    const prepared = this.prepareSignals(observation, memory);
    const instantaneousMetrics = this.computeInstantaneousMetrics(
      prepared,
      observation,
      memory.latest,
    );
    const transitionBase = this.computeTransition(
      memory.latest,
      instantaneousMetrics,
      memory.lastTransitionMagnitude,
    );
    const persistence = this.computePersistence(
      memory,
      observedAtMs,
      transitionBase.magnitude,
    );
    const confidence = this.computeConfidence(
      observation,
      prepared,
      observedAtMs,
      memory.latest,
    );
    const metricsWithState = this.applyStateMetrics(
      instantaneousMetrics,
      persistence.score,
      confidence.score,
      transitionBase.probability,
    );
    const smoothed = this.smoothMetrics(memory.latest, metricsWithState);
    const delta = this.deltaMetrics(memory.latest?.metrics, smoothed);
    const stateHash = stateFingerprint(smoothed);
    const transition: PerceptionTransition = {
      ...transitionBase,
      fromStateHash: memory.latest?.stateHash,
      toStateHash: stateHash,
    };
    const snapshot: PerceptionSnapshot = {
      id:
        observation.id ??
        fingerprint({
          perception: "snapshot",
          subject: observation.subject,
          observedAt,
          sequence: memory.sequence + 1,
          metrics: stateHash,
        }),
      subject: observation.subject,
      sequence: memory.sequence + 1,
      observedAt,
      createdAt: new Date(this.options.now()).toISOString(),
      source: observation.source,
      metrics: smoothed,
      instantaneousMetrics: metricsWithState,
      delta,
      directionalBias: directionalBias(prepared),
      conditions: buildConditions(smoothed),
      anomalies: detectAnomalies(
        prepared,
        this.options.anomalyZScore,
        memory.latest,
        smoothed,
      ),
      drivers: buildDrivers(prepared, smoothed),
      transition,
      persistence,
      confidence,
      stateHash,
      eventNames: (observation.events ?? []).map((event) => event.name),
      signalCount: prepared.length,
      relationshipCount: observation.relationships?.length ?? 0,
      meta: observation.meta,
    };

    this.commitObservation(memory, prepared, snapshot, transition.magnitude);
    this.recordSnapshot(snapshot);
    this.notify(snapshot);

    return snapshot;
  }

  observeEnvelope(
    envelope: SignalEnvelope,
    options: SignalEnvelopePerceptionOptions = {},
  ): PerceptionSnapshot {
    return this.observe(
      signalEnvelopeToPerceptionObservation(envelope, options),
    );
  }

  replay(observations: PerceptionObservation[]): PerceptionSnapshot[] {
    return [...observations]
      .sort(
        (left, right) =>
          timestampFrom(left.observedAt ?? 0) -
          timestampFrom(right.observedAt ?? 0),
      )
      .map((observation) => this.observe(observation));
  }

  subscribe(subscriber: PerceptionSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  getSnapshot(subject: string): PerceptionSnapshot | undefined {
    return this.subjects.get(subject)?.latest;
  }

  getHistory(
    subject: string,
    since?: string | number | Date,
  ): PerceptionSnapshot[] {
    const history = this.subjects.get(subject)?.history ?? [];
    if (since === undefined) {
      return [...history];
    }
    const sinceMs = timestampFrom(since);
    return history.filter(
      (snapshot) => timestampFrom(snapshot.observedAt) >= sinceMs,
    );
  }

  clear(subject?: string): void {
    if (subject) {
      this.subjects.delete(subject);
      return;
    }
    this.subjects.clear();
  }

  private getMemory(subject: string, observedAtMs: number): SubjectMemory {
    const existing = this.subjects.get(subject);
    if (existing) {
      return existing;
    }

    const memory: SubjectMemory = {
      history: [],
      signals: new Map(),
      sequence: 0,
      stateStartedAt: observedAtMs,
      lastTransitionMagnitude: 0,
    };
    this.subjects.set(subject, memory);
    return memory;
  }

  private prepareSignals(
    observation: PerceptionObservation,
    memory: SubjectMemory,
  ): PreparedSignal[] {
    const merged = {
      ...(observation.dimensions ?? {}),
      ...(observation.signals ?? {}),
    };
    const entries = Object.entries(merged);
    const events = observation.events ?? [];

    if (entries.length === 0 && events.length > 0) {
      entries.push([
        "event.activity",
        {
          value: average(
            events.map((event) => clamp01(event.intensity ?? 0.55)),
          ),
          normalized: true,
          role: "intensity",
          confidence: observation.confidence ?? 1,
        },
      ]);
    }

    return entries
      .map(([name, input]) =>
        prepareSignal(name, input, memory.signals.get(name)),
      )
      .filter((signal): signal is PreparedSignal => signal !== null);
  }

  private computeInstantaneousMetrics(
    signals: PreparedSignal[],
    observation: PerceptionObservation,
    previous?: PerceptionSnapshot,
  ): PerceptionMetrics {
    if (signals.length === 0) {
      const empty = createEmptyPerceptionMetrics();
      empty.confidence = normalized(observation.confidence ?? 0.2);
      empty.stability = 0.5;
      empty.structuralHealth = 0.35;
      empty.persistence = previous?.metrics.persistence ?? 0;
      return empty;
    }

    const relationships = observation.relationships ?? [];
    const events = observation.events ?? [];
    const totalWeight = sumWeights(signals);
    const activeWeight = signals.reduce(
      (sum, signal) =>
        sum +
        (Math.abs(signal.signed) > 0.08 || Math.abs(signal.delta) > 0.08
          ? signal.weight
          : 0),
      0,
    );
    const positive = weightedSum(signals, (signal) =>
      Math.max(signal.signed, 0),
    );
    const negative = weightedSum(signals, (signal) =>
      Math.max(-signal.signed, 0),
    );
    const signedTotal = positive + negative;
    const netDirection =
      signedTotal > EPSILON ? (positive - negative) / signedTotal : 0;
    const directionalClarity = clamp01(Math.abs(netDirection));
    const participation = clamp01(
      activeWeight / Math.max(totalWeight, EPSILON),
    );
    const density = clamp01(
      (signals.length / Math.max(1, this.options.expectedSignalCount)) * 0.72 +
        Math.min(relationships.length / Math.max(1, signals.length), 1) * 0.28,
    );
    const intensity =
      weightedAverage(signals, (signal) => Math.abs(signal.signed)) * 0.48 +
      weightedAverage(signals, (signal) => Math.abs(signal.delta)) * 0.32 +
      eventIntensity(events) * 0.2;
    const normalizedValues = signals.map((signal) => signal.normalized);
    const signedValues = signals.map((signal) => signal.signed);
    const deltaValues = signals.map((signal) => signal.delta);
    const dispersion = clamp01(standardDeviation(normalizedValues) * 2.2);
    const deltaVolatility = clamp01(standardDeviation(deltaValues) * 2.4);
    const volatility = clamp01(
      deltaVolatility * 0.52 + dispersion * 0.3 + eventIntensity(events) * 0.18,
    );
    const relation = relationshipInterpretation(signals, relationships);
    const rawConflict =
      signedTotal > EPSILON
        ? Math.min(positive, negative) / Math.max(positive, negative, EPSILON)
        : 0;
    const eventConflictValue = eventConflict(events);
    const conflict = clamp01(
      rawConflict * 0.48 + relation.conflict * 0.32 + eventConflictValue * 0.2,
    );
    const coherence = clamp01(
      (1 - standardDeviation(signedValues) * 0.55) * 0.5 +
        (1 - conflict) * 0.24 +
        relation.alignment * 0.16 +
        participation * 0.1,
    );
    const alignment = clamp01(
      directionalClarity * 0.38 +
        relation.alignment * 0.32 +
        (1 - conflict) * 0.2 +
        coherence * 0.1,
    );
    const momentum = clamp01(
      weightedAverage(signals, (signal) => Math.abs(signal.delta)) * 0.62 +
        Math.abs(average(deltaValues)) * 0.38,
    );
    const pressure = clamp01(
      directionalClarity * 0.42 + intensity * 0.35 + momentum * 0.23,
    );
    const expansion = clamp01(
      Math.max(0, average(deltaValues)) * 0.46 +
        Math.max(0, netDirection) * 0.24 +
        participation * 0.16 +
        (1 - volatility) * 0.14,
    );
    const compression = clamp01(
      (1 - expansion) * 0.38 +
        (1 - volatility) * 0.25 +
        density * 0.2 +
        (1 - momentum) * 0.17,
    );
    const entropy = clamp01(
      contributionEntropy(signals) * 0.46 +
        conflict * 0.26 +
        dispersion * 0.18 +
        (1 - coherence) * 0.1,
    );
    const noise = clamp01(
      entropy * 0.5 + volatility * 0.3 + (1 - coherence) * 0.2,
    );
    const confidence = clamp01(
      (observation.confidence ?? 1) * 0.34 +
        average(signals.map((signal) => signal.confidence)) * 0.3 +
        coherence * 0.2 +
        participation * 0.16,
    );
    const transitionProbabilitySeed = clamp01(
      (previous
        ? metricDistance(previous.metrics, {
            ...previous.metrics,
            pressure,
            volatility,
            conflict,
            momentum,
            intensity,
            entropy,
          })
        : 0.35) *
        1.3 +
        momentum * 0.25 +
        volatility * 0.22 +
        conflict * 0.18,
    );
    const instability = clamp01(
      volatility * 0.3 +
        conflict * 0.22 +
        noise * 0.18 +
        transitionProbabilitySeed * 0.18 +
        (1 - confidence) * 0.12,
    );
    const stability = clamp01(
      (1 - instability) * 0.52 + coherence * 0.26 + confidence * 0.22,
    );
    const concentration = clamp01(1 - participation * 0.58 - density * 0.42);
    const fragility = clamp01(
      instability * 0.28 +
        conflict * 0.22 +
        concentration * 0.2 +
        (1 - confidence) * 0.16 +
        volatility * 0.14,
    );
    const stress = clamp01(
      pressure * 0.24 +
        volatility * 0.22 +
        conflict * 0.2 +
        fragility * 0.2 +
        eventIntensity(events) * 0.14,
    );
    const conviction = clamp01(
      confidence * 0.3 +
        coherence * 0.23 +
        alignment * 0.2 +
        directionalClarity * 0.13 +
        participation * 0.14 -
        conflict * 0.18,
    );
    const environmentalEnergy = clamp01(
      intensity * 0.3 +
        momentum * 0.25 +
        volatility * 0.18 +
        participation * 0.15 +
        eventIntensity(events) * 0.12,
    );
    const structuralHealth = clamp01(
      stability * 0.28 +
        coherence * 0.24 +
        confidence * 0.18 +
        participation * 0.14 +
        alignment * 0.12 -
        stress * 0.18 -
        fragility * 0.12,
    );

    const metrics: PerceptionMetrics = {
      pressure,
      stability,
      instability,
      coherence,
      alignment,
      conflict,
      momentum,
      intensity,
      participation,
      density,
      volatility,
      expansion,
      compression,
      entropy,
      noise,
      confidence,
      fragility,
      stress,
      conviction,
      persistence: previous?.metrics.persistence ?? 0,
      transitionProbability: transitionProbabilitySeed,
      environmentalEnergy,
      directionalClarity,
      structuralHealth,
    };

    return applyRoleHints(metrics, signals);
  }

  private computeTransition(
    previous: PerceptionSnapshot | undefined,
    metrics: PerceptionMetrics,
    previousMagnitude: number,
  ): Omit<PerceptionTransition, "fromStateHash" | "toStateHash"> {
    if (!previous) {
      return {
        probability: 0.65,
        magnitude: 1,
        acceleration: 0,
        labels: ["initial-perception"],
      };
    }

    const magnitude = metricDistance(previous.metrics, metrics);
    const acceleration = clamp01(Math.abs(magnitude - previousMagnitude));
    const probability = clamp01(
      magnitude * 1.35 +
        acceleration * 0.62 +
        metrics.instability * 0.24 +
        (1 - previous.metrics.persistence) * 0.18,
    );
    const labels = transitionLabels(previous.metrics, metrics, magnitude);

    return { probability, magnitude, acceleration, labels };
  }

  private computePersistence(
    memory: SubjectMemory,
    observedAtMs: number,
    transitionMagnitude: number,
  ): PerceptionPersistence {
    const previous = memory.latest;
    const changed = transitionMagnitude >= this.options.transitionSensitivity;
    const startedAt =
      changed || !previous ? observedAtMs : memory.stateStartedAt;
    const continuity = clamp01(1 - transitionMagnitude);
    const previousScore = previous?.metrics.persistence ?? 0;
    const score = previous
      ? clamp01(previousScore * 0.74 + continuity * 0.26)
      : 0.12;

    return {
      score,
      observationCount: memory.sequence + 1,
      durationMs: Math.max(0, observedAtMs - startedAt),
      startedAt: new Date(startedAt).toISOString(),
      degradation: clamp01(1 - continuity),
      halfLifeMs: this.options.confidenceHalfLifeMs,
    };
  }

  private computeConfidence(
    observation: PerceptionObservation,
    signals: PreparedSignal[],
    observedAtMs: number,
    previous?: PerceptionSnapshot,
  ): PerceptionConfidenceBreakdown {
    const input = clamp01(observation.confidence ?? 1);
    const signalConfidence = signals.length
      ? average(signals.map((signal) => signal.confidence))
      : input;
    const dataQuality = clamp01(
      signalConfidence * 0.46 +
        Math.min(
          signals.length / Math.max(1, this.options.expectedSignalCount),
          1,
        ) *
          0.34 +
        input * 0.2,
    );
    const previousAt = previous
      ? timestampFrom(previous.observedAt)
      : observedAtMs;
    const elapsedMs = Math.max(0, observedAtMs - previousAt);
    const decay = 0.5 ** (elapsedMs / this.options.confidenceHalfLifeMs);
    const degradation = clamp01(1 - decay);
    const score = clamp01(input * 0.36 + dataQuality * 0.34 + decay * 0.3);

    return { score, input, dataQuality, decay, degradation };
  }

  private applyStateMetrics(
    metrics: PerceptionMetrics,
    persistence: number,
    confidence: number,
    transitionProbability: number,
  ): PerceptionMetrics {
    const next = { ...metrics };
    next.persistence = normalized(persistence);
    next.confidence = normalized(confidence);
    next.transitionProbability = normalized(transitionProbability);
    next.conviction = normalized(
      next.confidence * 0.3 +
        next.coherence * 0.22 +
        next.alignment * 0.18 +
        next.persistence * 0.16 +
        next.directionalClarity * 0.14 -
        next.conflict * 0.18,
    );
    next.instability = normalized(
      next.instability * 0.72 +
        next.transitionProbability * 0.18 +
        (1 - next.persistence) * 0.1,
    );
    next.stability = normalized(
      (1 - next.instability) * 0.48 +
        next.coherence * 0.24 +
        next.confidence * 0.16 +
        next.persistence * 0.12,
    );
    next.fragility = normalized(
      next.fragility * 0.6 +
        next.stress * 0.18 +
        (1 - next.structuralHealth) * 0.14 +
        (1 - next.confidence) * 0.08,
    );
    next.structuralHealth = normalized(
      next.stability * 0.3 +
        next.coherence * 0.22 +
        next.confidence * 0.18 +
        next.participation * 0.12 +
        next.alignment * 0.1 +
        next.persistence * 0.08 -
        next.stress * 0.16 -
        next.fragility * 0.1,
    );
    return next;
  }

  private smoothMetrics(
    previous: PerceptionSnapshot | undefined,
    metrics: PerceptionMetrics,
  ): PerceptionMetrics {
    if (!previous) {
      return normalizeMetrics(metrics);
    }

    const alpha = clamp01(this.options.smoothingAlpha);
    const smoothed = createEmptyPerceptionMetrics();
    for (const name of perceptionMetricNames) {
      smoothed[name] = normalized(
        previous.metrics[name] * (1 - alpha) + metrics[name] * alpha,
      );
    }
    return smoothed;
  }

  private deltaMetrics(
    previous: PerceptionMetrics | undefined,
    metrics: PerceptionMetrics,
  ): PerceptionMetrics {
    const delta = createEmptyPerceptionMetrics();
    if (!previous) {
      return delta;
    }
    for (const name of perceptionMetricNames) {
      delta[name] = normalized(Math.abs(metrics[name] - previous[name]));
    }
    return delta;
  }

  private commitObservation(
    memory: SubjectMemory,
    signals: PreparedSignal[],
    snapshot: PerceptionSnapshot,
    transitionMagnitude: number,
  ): void {
    for (const signal of signals) {
      updateSignalMemory(memory.signals, signal);
    }

    if (
      transitionMagnitude >= this.options.transitionSensitivity ||
      !memory.latest
    ) {
      memory.stateStartedAt = timestampFrom(snapshot.observedAt);
    }

    memory.latest = snapshot;
    memory.sequence = snapshot.sequence;
    memory.lastTransitionMagnitude = transitionMagnitude;
    memory.history.push(snapshot);
    if (memory.history.length > this.options.historyLimit) {
      memory.history.shift();
    }
  }

  private recordSnapshot(snapshot: PerceptionSnapshot): void {
    if (!this.options.store) {
      return;
    }

    void Promise.resolve()
      .then(() => this.options.store?.record(snapshot))
      .catch(() => {
        undefined;
      });
  }

  private notify(snapshot: PerceptionSnapshot): void {
    for (const subscriber of this.subscribers) {
      void Promise.resolve()
        .then(() => subscriber(snapshot))
        .catch(() => {
          undefined;
        });
    }
  }
}

export function signalEnvelopeToPerceptionObservation(
  envelope: SignalEnvelope,
  options: SignalEnvelopePerceptionOptions = {},
): PerceptionObservation {
  const payloadSignals = extractNumericSignals(
    envelope.payload,
    "payload",
    options.maxDepth ?? 4,
  );
  const metaSignals = options.includeMetaNumbers
    ? extractNumericSignals(envelope.meta ?? {}, "meta", options.maxDepth ?? 2)
    : {};
  const subject =
    options.subject ?? envelope.name.split(".").slice(0, 2).join(".");
  const replayed = Boolean(envelope.delivery?.replayed);
  const deliveryAttempt = envelope.delivery?.attempt ?? 1;
  const operationIntensity =
    envelope.kind === "event"
      ? 0.62
      : envelope.kind === "mutation"
        ? 0.54
        : 0.38;

  return {
    id: envelope.messageId,
    subject,
    observedAt: envelope.timestamp,
    source:
      options.source ??
      envelope.source?.system ??
      envelope.source?.runtime ??
      "signal.runtime",
    signals: {
      ...payloadSignals,
      ...metaSignals,
      "signal.delivery.attempt": {
        value: deliveryAttempt,
        role: "intensity",
        weight: 0.35,
      },
      "signal.activity": {
        value: operationIntensity,
        normalized: true,
        role: "intensity",
        weight: 0.7,
      },
    },
    events: [
      {
        name: envelope.name,
        intensity: replayed ? operationIntensity * 0.55 : operationIntensity,
        confidence: replayed ? 0.72 : 1,
        polarity: envelope.kind === "event" ? 1 : 0,
      },
    ],
    confidence: replayed ? 0.72 : 1,
    meta: {
      protocol: envelope.protocol,
      kind: envelope.kind,
      messageId: envelope.messageId,
      correlationId: envelope.context?.correlationId,
      causationId: envelope.context?.causationId,
    },
  };
}

function prepareSignal(
  name: string,
  input: PerceptionSignalInput,
  memory?: SignalMemory,
): PreparedSignal | null {
  const signal =
    typeof input === "number"
      ? {
          value: input,
          weight: 1,
          role: "generic" as const,
          confidence: 1,
        }
      : {
          value: input.value,
          weight: input.weight ?? 1,
          role: input.role ?? "generic",
          normalized: input.normalized,
          confidence: input.confidence ?? 1,
          direction: input.direction,
        };

  if (!Number.isFinite(signal.value)) {
    return null;
  }

  const stats = memory;
  const baseline = stats?.mean ?? 0;
  const deviation = signal.value - baseline;
  const variance =
    stats && stats.count > 1 ? stats.m2 / Math.max(stats.count - 1, 1) : 0;
  const std = Math.sqrt(Math.max(variance, 0));
  const zScore = std > EPSILON ? deviation / std : 0;
  const normalizedValue =
    signal.normalized === true
      ? clamp01(signal.value)
      : normalizeAdaptive(signal.value, stats);
  const deltaRaw =
    stats?.lastValue !== undefined ? signal.value - stats.lastValue : 0;
  const delta = normalizeSigned(
    std > EPSILON ? deltaRaw / (std * 3) : deltaRaw / 10,
  );
  const centered = normalizedValue * 2 - 1;
  const signed =
    typeof signal.direction === "number" && Number.isFinite(signal.direction)
      ? clamp(signal.direction, -1, 1) * Math.abs(centered)
      : centered;

  return {
    name,
    value: signal.value,
    normalized: normalizedValue,
    signed: clamp(signed, -1, 1),
    delta,
    zScore,
    baseline,
    weight: Math.max(0, signal.weight),
    confidence: clamp01(signal.confidence),
    role: signal.role,
  };
}

function updateSignalMemory(
  signals: Map<string, SignalMemory>,
  signal: PreparedSignal,
): void {
  const memory =
    signals.get(signal.name) ??
    ({
      count: 0,
      mean: 0,
      m2: 0,
      min: signal.value,
      max: signal.value,
    } satisfies SignalMemory);
  const count = memory.count + 1;
  const delta = signal.value - memory.mean;
  const mean = memory.mean + delta / count;
  const delta2 = signal.value - mean;

  signals.set(signal.name, {
    count,
    mean,
    m2: memory.m2 + delta * delta2,
    min: Math.min(memory.min, signal.value),
    max: Math.max(memory.max, signal.value),
    lastValue: signal.value,
    lastNormalized: signal.normalized,
    lastDelta: signal.delta,
  });
}

function normalizeAdaptive(value: number, stats?: SignalMemory): number {
  if (value >= 0 && value <= 1) {
    return clamp01(value);
  }

  if (value >= 0 && value <= 100) {
    return clamp01(value / 100);
  }

  if (stats && stats.count > 1) {
    const variance = stats.m2 / Math.max(stats.count - 1, 1);
    const std = Math.sqrt(Math.max(variance, 0));
    if (std > EPSILON) {
      return clamp01(0.5 + Math.tanh((value - stats.mean) / (std * 3)) / 2);
    }
  }

  return clamp01(0.5 + Math.tanh(value / 10) / 2);
}

function extractNumericSignals(
  value: unknown,
  prefix: string,
  depth: number,
): Record<string, PerceptionSignalInput> {
  if (depth < 0 || value == null) {
    return {};
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { [prefix]: value };
  }

  if (typeof value === "boolean") {
    return { [prefix]: { value: value ? 1 : 0, normalized: true } };
  }

  if (Array.isArray(value)) {
    const signals: Record<string, PerceptionSignalInput> = {};
    value.forEach((entry, index) => {
      Object.assign(
        signals,
        extractNumericSignals(entry, `${prefix}.${index}`, depth - 1),
      );
    });
    return signals;
  }

  if (typeof value !== "object") {
    return {};
  }

  const signals: Record<string, PerceptionSignalInput> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(
      signals,
      extractNumericSignals(entry, `${prefix}.${key}`, depth - 1),
    );
  }
  return signals;
}

function applyRoleHints(
  metrics: PerceptionMetrics,
  signals: PreparedSignal[],
): PerceptionMetrics {
  const next = { ...metrics };

  for (const name of perceptionMetricNames) {
    const roleSignals = signals.filter((signal) => signal.role === name);
    if (roleSignals.length === 0) {
      continue;
    }
    const roleValue = weightedAverage(
      roleSignals,
      (signal) => signal.normalized,
    );
    next[name] = normalized(next[name] * 0.58 + roleValue * 0.42);
  }

  const structural = signals.filter(
    (signal) => signal.role === "structural-stability",
  );
  if (structural.length) {
    const value = weightedAverage(structural, (signal) => signal.normalized);
    next.stability = normalized(next.stability * 0.65 + value * 0.35);
    next.structuralHealth = normalized(
      next.structuralHealth * 0.65 + value * 0.35,
    );
  }

  const energy = signals.filter(
    (signal) => signal.role === "energy" || signal.role === "flow",
  );
  if (energy.length) {
    const value = weightedAverage(energy, (signal) => signal.normalized);
    next.environmentalEnergy = normalized(
      next.environmentalEnergy * 0.62 + value * 0.38,
    );
  }

  const fragmentation = signals.filter(
    (signal) => signal.role === "fragmentation",
  );
  if (fragmentation.length) {
    const value = weightedAverage(fragmentation, (signal) => signal.normalized);
    next.conflict = normalized(next.conflict * 0.62 + value * 0.38);
    next.noise = normalized(next.noise * 0.7 + value * 0.3);
  }

  return normalizeMetrics(next);
}

function relationshipInterpretation(
  signals: PreparedSignal[],
  relationships: PerceptionRelationship[],
): { alignment: number; conflict: number } {
  if (relationships.length === 0) {
    return { alignment: 0.5, conflict: 0 };
  }

  const byName = new Map(signals.map((signal) => [signal.name, signal]));
  let alignment = 0;
  let conflict = 0;
  let total = 0;

  for (const relationship of relationships) {
    const from = byName.get(relationship.from);
    const to = byName.get(relationship.to);
    const strength = clamp01(relationship.strength);
    const confidence = clamp01(relationship.confidence ?? 1);
    const weight =
      Math.max(0, relationship.weight ?? 1) * strength * confidence;
    if (!from || !to || weight <= 0) {
      continue;
    }
    const polarity = relationship.polarity ?? 1;
    const compatible = from.signed * to.signed * polarity >= 0;
    alignment += compatible ? weight : 0;
    conflict += compatible ? 0 : weight;
    total += weight;
  }

  if (total <= EPSILON) {
    return { alignment: 0.5, conflict: 0 };
  }

  return {
    alignment: clamp01(alignment / total),
    conflict: clamp01(conflict / total),
  };
}

function buildConditions(
  metrics: PerceptionMetrics,
): PerceptionConditionBlend[] {
  const conditions: PerceptionConditionBlend[] = [
    {
      name: "stable",
      score: metrics.stability,
      metrics: {
        stability: metrics.stability,
        structuralHealth: metrics.structuralHealth,
      },
    },
    {
      name: "unstable",
      score: metrics.instability,
      metrics: {
        instability: metrics.instability,
        volatility: metrics.volatility,
      },
    },
    {
      name: "coherent",
      score: metrics.coherence,
      metrics: { coherence: metrics.coherence, alignment: metrics.alignment },
    },
    {
      name: "reinforced",
      score: normalized(
        metrics.coherence * 0.42 +
          metrics.alignment * 0.34 +
          metrics.conviction * 0.24,
      ),
      metrics: {
        coherence: metrics.coherence,
        alignment: metrics.alignment,
        conviction: metrics.conviction,
      },
    },
    {
      name: "conflicted",
      score: metrics.conflict,
      metrics: { conflict: metrics.conflict, noise: metrics.noise },
    },
    {
      name: "fragmented",
      score: normalized(
        metrics.noise * 0.45 + metrics.entropy * 0.35 + metrics.conflict * 0.2,
      ),
      metrics: {
        noise: metrics.noise,
        entropy: metrics.entropy,
        conflict: metrics.conflict,
      },
    },
    {
      name: "energized",
      score: metrics.environmentalEnergy,
      metrics: {
        environmentalEnergy: metrics.environmentalEnergy,
        intensity: metrics.intensity,
      },
    },
    {
      name: "compressed",
      score: metrics.compression,
      metrics: { compression: metrics.compression, density: metrics.density },
    },
    {
      name: "expanding",
      score: metrics.expansion,
      metrics: {
        expansion: metrics.expansion,
        participation: metrics.participation,
      },
    },
    {
      name: "transitional",
      score: metrics.transitionProbability,
      metrics: { transitionProbability: metrics.transitionProbability },
    },
    {
      name: "persistent",
      score: metrics.persistence,
      metrics: {
        persistence: metrics.persistence,
        conviction: metrics.conviction,
      },
    },
    {
      name: "fragile",
      score: metrics.fragility,
      metrics: { fragility: metrics.fragility, stress: metrics.stress },
    },
  ];

  return conditions
    .map((condition) => ({
      ...condition,
      score: normalized(condition.score),
    }))
    .filter((condition) => condition.score >= 0.08)
    .sort((left, right) => right.score - left.score);
}

function detectAnomalies(
  signals: PreparedSignal[],
  threshold: number,
  previous: PerceptionSnapshot | undefined,
  metrics: PerceptionMetrics,
): PerceptionAnomaly[] {
  const anomalies: PerceptionAnomaly[] = signals
    .filter((signal) => Math.abs(signal.zScore) >= threshold)
    .map((signal) => ({
      signal: signal.name,
      severity: clamp01(Math.abs(signal.zScore) / Math.max(threshold * 2, 1)),
      zScore: Number(signal.zScore.toFixed(4)),
      value: signal.value,
      baseline: Number(signal.baseline.toFixed(4)),
      reason: "adaptive-baseline-deviation",
    }));

  if (previous) {
    for (const metric of ["stress", "instability", "volatility"] as const) {
      const shift = Math.abs(metrics[metric] - previous.metrics[metric]);
      if (shift >= 0.28) {
        anomalies.push({
          signal: `metric.${metric}`,
          metric,
          severity: clamp01(shift * 1.8),
          zScore: Number((shift / 0.12).toFixed(4)),
          value: metrics[metric],
          baseline: previous.metrics[metric],
          reason: "metric-shift",
        });
      }
    }
  }

  return anomalies.sort((left, right) => right.severity - left.severity);
}

function buildDrivers(
  signals: PreparedSignal[],
  metrics: PerceptionMetrics,
): PerceptionDriver[] {
  return signals
    .map((signal) => {
      const metric = driverMetric(signal, metrics);
      return {
        signal: signal.name,
        metric,
        contribution: normalized(
          Math.abs(signal.signed) * 0.5 +
            Math.abs(signal.delta) * 0.3 +
            (signal.weight / Math.max(sumWeights(signals), EPSILON)) * 0.2,
        ),
        direction: Number(signal.signed.toFixed(4)),
      };
    })
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 12);
}

function driverMetric(
  signal: PreparedSignal,
  _metrics: PerceptionMetrics,
): PerceptionMetricName {
  if (perceptionMetricNames.includes(signal.role as PerceptionMetricName)) {
    return signal.role as PerceptionMetricName;
  }
  if (signal.role === "energy" || signal.role === "flow") {
    return "environmentalEnergy";
  }
  if (signal.role === "fragmentation" || signal.role === "divergence") {
    return "conflict";
  }
  if (signal.role === "convergence" || signal.role === "reinforcement") {
    return "coherence";
  }
  return Math.abs(signal.delta) > Math.abs(signal.signed)
    ? "momentum"
    : "pressure";
}

function transitionLabels(
  previous: PerceptionMetrics,
  next: PerceptionMetrics,
  magnitude: number,
): string[] {
  const labels: string[] = [];
  if (magnitude >= 0.28) labels.push("structural-transition");
  if (next.instability - previous.instability >= 0.16)
    labels.push("instability-rising");
  if (next.stability - previous.stability >= 0.16)
    labels.push("stability-reinforcing");
  if (next.conflict - previous.conflict >= 0.14)
    labels.push("conflict-emerging");
  if (next.coherence - previous.coherence >= 0.14)
    labels.push("coherence-forming");
  if (next.volatility - previous.volatility >= 0.14)
    labels.push("volatility-expanding");
  if (previous.volatility - next.volatility >= 0.14)
    labels.push("volatility-compressing");
  if (next.environmentalEnergy - previous.environmentalEnergy >= 0.14)
    labels.push("energy-rising");
  return labels.length ? labels : ["gradual-drift"];
}

function stateFingerprint(metrics: PerceptionMetrics): string {
  return fingerprint({
    perception: "state",
    pressure: Math.round(metrics.pressure * 10),
    stability: Math.round(metrics.stability * 10),
    instability: Math.round(metrics.instability * 10),
    coherence: Math.round(metrics.coherence * 10),
    conflict: Math.round(metrics.conflict * 10),
    energy: Math.round(metrics.environmentalEnergy * 10),
    transition: Math.round(metrics.transitionProbability * 10),
  });
}

function normalizeMetrics(metrics: PerceptionMetrics): PerceptionMetrics {
  const next = createEmptyPerceptionMetrics();
  for (const name of perceptionMetricNames) {
    next[name] = normalized(metrics[name]);
  }
  return next;
}

function metricDistance(
  previous: PerceptionMetrics,
  next: PerceptionMetrics,
): number {
  const weighted: Array<[PerceptionMetricName, number]> = [
    ["pressure", 0.9],
    ["stability", 0.75],
    ["instability", 0.9],
    ["coherence", 0.65],
    ["conflict", 0.8],
    ["momentum", 0.85],
    ["intensity", 0.75],
    ["volatility", 0.8],
    ["entropy", 0.65],
    ["stress", 0.9],
    ["environmentalEnergy", 0.7],
    ["structuralHealth", 0.85],
  ];
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  return clamp01(
    weighted.reduce(
      (sum, [name, weight]) =>
        sum + Math.abs(next[name] - previous[name]) * weight,
      0,
    ) / Math.max(total, EPSILON),
  );
}

function eventIntensity(events: PerceptionEvent[]): number {
  if (events.length === 0) {
    return 0;
  }
  return weightedEventAverage(events, (event) =>
    clamp01(event.intensity ?? 0.5),
  );
}

function eventConflict(events: PerceptionEvent[]): number {
  let positive = 0;
  let negative = 0;
  for (const event of events) {
    const intensity = clamp01(event.intensity ?? 0.5);
    const weight =
      Math.max(0, event.weight ?? 1) * clamp01(event.confidence ?? 1);
    if ((event.polarity ?? 0) >= 0) {
      positive += intensity * weight;
    }
    if ((event.polarity ?? 0) <= 0) {
      negative += intensity * weight;
    }
  }
  const total = positive + negative;
  return total > EPSILON ? clamp01(Math.min(positive, negative) / total) : 0;
}

function weightedEventAverage(
  events: PerceptionEvent[],
  value: (event: PerceptionEvent) => number,
): number {
  let weighted = 0;
  let total = 0;
  for (const event of events) {
    const weight =
      Math.max(0, event.weight ?? 1) * clamp01(event.confidence ?? 1);
    weighted += value(event) * weight;
    total += weight;
  }
  return total > EPSILON ? clamp01(weighted / total) : 0;
}

function contributionEntropy(signals: PreparedSignal[]): number {
  const weights = signals.map((signal) =>
    Math.max(EPSILON, signal.weight * Math.max(Math.abs(signal.signed), 0.05)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= EPSILON || weights.length <= 1) {
    return 0;
  }
  const entropy = weights.reduce((sum, weight) => {
    const probability = weight / total;
    return sum - probability * Math.log(probability);
  }, 0);
  return clamp01(entropy / Math.log(weights.length));
}

function directionalBias(signals: PreparedSignal[]): number {
  const total = sumWeights(signals);
  if (total <= EPSILON) {
    return 0;
  }
  return Number(
    clamp(
      signals.reduce((sum, signal) => sum + signal.signed * signal.weight, 0) /
        total,
      -1,
      1,
    ).toFixed(6),
  );
}

function normalizeSigned(value: number): number {
  return clamp(Math.tanh(value), -1, 1);
}

function weightedAverage(
  signals: PreparedSignal[],
  value: (signal: PreparedSignal) => number,
): number {
  const total = sumWeights(signals);
  if (total <= EPSILON) {
    return 0;
  }
  return clamp01(weightedSum(signals, value) / total);
}

function weightedSum(
  signals: PreparedSignal[],
  value: (signal: PreparedSignal) => number,
): number {
  return signals.reduce(
    (sum, signal) => sum + value(signal) * signal.weight * signal.confidence,
    0,
  );
}

function sumWeights(signals: PreparedSignal[]): number {
  return signals.reduce(
    (sum, signal) => sum + signal.weight * signal.confidence,
    0,
  );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function timestampFrom(value: string | number | Date): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalized(value: number): number {
  return Number(clamp01(value).toFixed(6));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
