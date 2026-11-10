import type { BenchmarkReport } from "./benchmark.js";
import type { ScenarioResult } from "./evaluation.js";

export type QualityPillarName = "correctness" | "security" | "performance" | "reliability";
export type EvidenceStatus = "validated" | "partial" | "failed" | "unverified";
export type QualityCriterion = {
  id: string;
  name: string;
  weight: number;
  status: EvidenceStatus;
  evidence: string[];
  limitation?: string;
  critical?: boolean;
  score?: number;
};
export type QualityPillar = {
  id: QualityPillarName;
  label: string;
  weight: number;
  score: number | null;
  confidence: "high" | "medium" | "low";
  coverage: number;
  validatedWeight: number;
  totalWeight: number;
  criteria: QualityCriterion[];
  interpretation: string;
};
export type QualityScorecard = {
  version: "1.0";
  overall: number | null;
  overallConfidence: "high" | "medium" | "low";
  pillars: QualityPillar[];
  limitations: string[];
  interpretation: string;
};

type BenchmarkEvidence = Pick<BenchmarkReport, "timing" | "integrity" | "environment" | "workload"> & {
  baseline?: Pick<BenchmarkReport, "timing" | "environment" | "workload" | "integrity">;
};

const PILLAR_WEIGHTS: Record<QualityPillarName, number> = {
  correctness: 30,
  security: 25,
  performance: 20,
  reliability: 25,
};

function scenarioStatus(results: ScenarioResult[], ids: string[]): EvidenceStatus {
  const selected = ids.map((id) => results.find((item) => item.id === id)).filter((item): item is ScenarioResult => Boolean(item));
  if (selected.length === 0) return "unverified";
  if (selected.some((item) => item.status === "failed")) return "failed";
  if (selected.every((item) => item.status === "passed")) return "validated";
  if (selected.some((item) => item.status === "passed")) return "partial";
  return "unverified";
}

function combineStatus(a: EvidenceStatus, b: EvidenceStatus): EvidenceStatus {
  if (a === "failed" || b === "failed") return "failed";
  if (a === "validated" || b === "validated") return a === "unverified" || b === "unverified" ? "partial" : "validated";
  if (a === "partial" || b === "partial") return "partial";
  return "unverified";
}

function criterion(
  id: string,
  name: string,
  weight: number,
  status: EvidenceStatus,
  evidence: string[],
  limitation?: string,
  critical = false,
): QualityCriterion {
  return { id, name, weight, status, evidence, ...(limitation ? { limitation } : {}), ...(critical ? { critical: true } : {}) };
}

function performanceCriteria(benchmark?: BenchmarkEvidence): QualityCriterion[] {
  if (!benchmark) return [
    criterion("performance.baseline", "Comparable performance baseline", 10, "unverified", [], "No benchmark evidence was supplied to the scorecard."),
    criterion("performance.latency", "Latency distribution and tail behavior", 30, "unverified", [], "Requires repeated, integrity-checked workload samples."),
    criterion("performance.throughput", "Sustained throughput and concurrency", 25, "unverified", [], "Requires a representative workload and comparable host."),
    criterion("performance.resources", "Memory and resource efficiency", 15, "unverified", [], "Requires comparable resource measurements and workload."),
    criterion("performance.system-profile", "HTTP, database and distributed workload profile", 10, "unverified", [], "Current benchmark covers local in-process query dispatch only."),
    criterion("performance.sustained-load", "Sustained load, saturation and soak behavior", 10, "unverified", [], "No long-duration load or saturation profile is currently measured."),
  ];

  const valid = benchmark.integrity.valid &&
    benchmark.integrity.actualSamples === benchmark.workload.iterations &&
    benchmark.integrity.expectedSamples === benchmark.workload.iterations &&
    benchmark.workload.iterations >= 30;
  const baseline = benchmark.baseline;
  const baselineValid = Boolean(baseline && baseline.integrity.valid && baseline.integrity.actualSamples === baseline.workload.iterations && baseline.integrity.expectedSamples === baseline.workload.iterations && baseline.workload.iterations >= 30);
  const comparable = Boolean(baselineValid && baseline &&
    baseline.workload.operation === benchmark.workload.operation &&
    baseline.workload.iterations === benchmark.workload.iterations &&
    baseline.workload.concurrency === benchmark.workload.concurrency &&
    baseline.workload.warmup === benchmark.workload.warmup &&
    baseline.environment.node === benchmark.environment.node &&
    baseline.environment.platform === benchmark.environment.platform &&
    baseline.environment.osRelease === benchmark.environment.osRelease &&
    baseline.environment.arch === benchmark.environment.arch &&
    baseline.environment.cpuModel === benchmark.environment.cpuModel &&
    baseline.environment.cpus === benchmark.environment.cpus);
  if (!valid || !comparable || !baseline) return [
    criterion("performance.baseline", "Comparable performance baseline", 35, "unverified", ["A benchmark was supplied, but a valid matched baseline is required for a scored comparison."], "Performance is not assigned an absolute score from hardware-specific measurements."),
    criterion("performance.latency", "Latency distribution and tail behavior", 30, "unverified", valid ? [`Observed p95=${benchmark.timing.p95Ms}ms; p99=${benchmark.timing.p99Ms}ms`] : [], "A valid sample set without a matched baseline is descriptive, not a regression score."),
    criterion("performance.throughput", "Sustained throughput and concurrency", 20, "unverified", valid ? [`Observed ${benchmark.timing.throughputPerSecond} operations/second at concurrency ${benchmark.workload.concurrency}`] : [], "A single local run does not establish sustained or production throughput."),
    criterion("performance.resources", "Memory and resource efficiency", 15, "unverified", valid ? [`Observed RSS delta=${benchmark.environment.rssAfter - benchmark.environment.rssBefore} bytes`] : [], "RSS is process- and host-dependent; compare repeated matched runs."),
    criterion("performance.system-profile", "HTTP, database and distributed workload profile", 10, "unverified", [], "Current benchmark covers local in-process query dispatch only."),
    criterion("performance.sustained-load", "Sustained load, saturation and soak behavior", 10, "unverified", [], "No long-duration load or saturation profile is currently measured."),
  ];
  const regression = (current: number, prior: number, higherIsBetter: boolean) => {
    if (prior <= 0) return 0;
    const ratio = higherIsBetter ? current / prior : prior / current;
    return Math.max(0, Math.min(10, 8 + (ratio - 1) * 20));
  };
  const latencyScore = regression(benchmark.timing.p95Ms, baseline.timing.p95Ms, false) * 0.7 + regression(benchmark.timing.p99Ms, baseline.timing.p99Ms, false) * 0.3;
  const throughputScore = regression(benchmark.timing.throughputPerSecond, baseline.timing.throughputPerSecond, true);
  const currentRss = Math.max(1, benchmark.environment.rssAfter - benchmark.environment.rssBefore);
  const baselineRss = Math.max(1, baseline.environment.rssAfter - baseline.environment.rssBefore);
  const resourceScore = regression(currentRss, baselineRss, false);
  const scoreEvidence = (label: string, current: number, prior: number) => `${label}: current=${current}; baseline=${prior}`;
  return [
    criterion("performance.baseline", "Comparable performance baseline", 35, "validated", ["Workload, runtime, OS, architecture, CPU model and CPU count match." ]),
    criterion("performance.latency", "Latency distribution and tail behavior", 30, "validated", [scoreEvidence("p95 ms", benchmark.timing.p95Ms, baseline.timing.p95Ms), scoreEvidence("p99 ms", benchmark.timing.p99Ms, baseline.timing.p99Ms)]),
    criterion("performance.throughput", "Sustained throughput and concurrency", 20, "validated", [scoreEvidence("operations/second", benchmark.timing.throughputPerSecond, baseline.timing.throughputPerSecond)]),
    criterion("performance.resources", "Memory and resource efficiency", 15, "validated", [scoreEvidence("RSS delta bytes", currentRss, baselineRss)]),
    criterion("performance.system-profile", "HTTP, database and distributed workload profile", 10, "unverified", [], "Current benchmark covers local in-process query dispatch only."),
    criterion("performance.sustained-load", "Sustained load, saturation and soak behavior", 10, "unverified", [], "No long-duration load or saturation profile is currently measured."),
  ].map((item) => item.id === "performance.latency" ? { ...item, score: latencyScore, evidence: [...item.evidence, `derived score=${latencyScore.toFixed(2)}`] } : item.id === "performance.throughput" ? { ...item, score: throughputScore, evidence: [...item.evidence, `derived score=${throughputScore.toFixed(2)}`] } : item.id === "performance.resources" ? { ...item, score: resourceScore, evidence: [...item.evidence, `derived score=${resourceScore.toFixed(2)}`] } : item);
}

function makePillar(
  id: QualityPillarName,
  label: string,
  criteria: QualityCriterion[],
): QualityPillar {
  const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
  const validatedWeight = criteria.reduce((sum, item) => sum + (item.status === "validated" ? item.weight : item.status === "partial" ? item.weight * 0.5 : 0), 0);
  const earned = criteria.reduce((sum, item) => sum + item.weight * (item.status === "validated" ? (item.score ?? 10) / 10 : item.status === "partial" ? (item.score ?? 5) / 10 : 0), 0);
  const criticalFailure = criteria.some((item) => item.critical && item.status === "failed");
  const hasEvidence = criteria.some((item) => item.status !== "unverified");
  const score = totalWeight > 0 && hasEvidence ? Number(Math.min(criticalFailure ? 2 : 10, (earned / totalWeight) * 10).toFixed(2)) : null;
  const coverage = totalWeight ? Number((validatedWeight / totalWeight).toFixed(3)) : 0;
  const confidence = coverage >= 0.85 ? "high" : coverage >= 0.55 ? "medium" : "low";
  const interpretation = score === null
    ? "Not scored: no applicable evidence."
    : criticalFailure
      ? "Critical control failure caps this pillar at 2.0/10."
      : coverage < 0.55
        ? "Low evidence coverage; treat this score as a conservative lower bound, not a complete assessment."
        : coverage < 0.85
          ? "Partial evidence coverage; unverified criteria receive no credit."
          : "Strong evidence coverage; score remains limited to the tested scope.";
  return { id, label, weight: PILLAR_WEIGHTS[id], score, confidence, coverage, validatedWeight, totalWeight, criteria, interpretation };
}

export function scoreQuality(
  results: ScenarioResult[],
  benchmark?: BenchmarkEvidence,
): QualityScorecard {
  const s = (id: string) => scenarioStatus(results, [id]);
  const correctness = makePillar("correctness", "Correctness", [
    criterion("correctness.contracts", "Input contracts and invalid-input handling", 12, s("invalid-input"), ["Signal rejects malformed operation input."], undefined, true),
    criterion("correctness.lifecycle", "End-to-end operation and state transitions", 18, s("lifecycle"), ["Request, evidence, assessment, decision, action and outcome lifecycle."], undefined, true),
    criterion("correctness.tenant", "Tenant-scoped data access", 12, s("tenant-isolation"), ["Cross-tenant reads and writes are rejected or isolated."], undefined, true),
    criterion("correctness.idempotency", "Duplicate and concurrent request semantics", 14, combineStatus(s("idempotency"), s("concurrency")), ["Repeated and concurrent submissions preserve one logical result."], "Cross-host behavior requires a distributed contention test."),
    criterion("correctness.replay", "Deterministic replay and evidence integrity", 14, combineStatus(s("replay-evidence"), s("kernel-pipeline")), ["Replay evidence digest and deterministic pipeline replay."], "Cross-version replay compatibility remains a separate gate."),
    criterion("correctness.persistence", "Persistence and transactional semantics", 14, s("postgres-integration"), ["PostgreSQL transaction and persistence assertions."], "Blocked when DATABASE_URL is unavailable."),
    criterion("correctness.compatibility", "Schema and cross-version compatibility", 8, "unverified", [], "Historical schema evolution and cross-version compatibility are not exercised by this suite."),
    criterion("correctness.property-tests", "Property-based, fuzz and metamorphic verification", 8, "unverified", [], "Deterministic scenario tests do not replace fuzzing or property-based invariant exploration."),
  ]);
  const security = makePillar("security", "Security", [
    criterion("security.authentication", "Runtime authentication enforcement", 12, combineStatus(s("runtime-authorization"), s("http-binding")), ["Unauthenticated and forged HTTP identity claims are rejected."], "External identity-provider integration is not certified.", true),
    criterion("security.authorization", "Operation-level authorization and least privilege", 14, s("runtime-policy"), ["Actor roles and operation scope are checked."], undefined, true),
    criterion("security.tenant", "Tenant isolation and cross-tenant access control", 14, s("tenant-isolation"), ["Tenant boundary scenario."], undefined, true),
    criterion("security.audit", "Tamper-evident audit and signed checkpoints", 14, s("audit-integrity"), ["Hash-chain verification, checkpoint signatures and tamper detection."], "External key custody and independent anchoring are not tested.", true),
    criterion("security.replay", "Replay evidence integrity and tenant scoping", 8, s("replay-evidence"), ["Content-addressed replay evidence verification."], "Full replay executor is not integrated."),
    criterion("security.persistence", "Durable security controls and database isolation", 10, s("postgres-integration"), ["PostgreSQL inbox, tenant-scoped replay storage and append-only audit ledger."], "Blocked when DATABASE_URL is unavailable."),
    criterion("security.external-identity", "External identity-provider integration", 8, "unverified", [], "The harness verifies trusted runtime context handling but does not integrate a production identity provider."),
    criterion("security.key-custody", "Independent cryptographic key custody and rotation", 8, "unverified", [], "Test keys are generated locally; external key custody, rotation and independent checkpoint anchoring are not tested."),
    criterion("security.supply-chain", "Dependency vulnerability and supply-chain assurance", 6, "unverified", [], "Repository security workflows are separate from this deterministic runtime evaluation and their artifacts are not ingested here."),
    criterion("security.static-analysis", "Static security analysis and secret scanning", 6, "unverified", [], "SAST and secret-scanning evidence is not currently ingested by this scorecard."),
    criterion("security.confidentiality", "Data confidentiality and encryption at rest/in transit", 4, "unverified", [], "The reference suite does not certify deployment-level encryption or data-loss controls."),
  ]);
  const reliability = makePillar("reliability", "Reliability", [
    criterion("reliability.idempotency", "Idempotency under retries and duplicate delivery", 15, combineStatus(s("idempotency"), s("concurrency")), ["Duplicate and concurrent request scenarios."], "Cross-process and cross-host contention remain distinct validation gates."),
    criterion("reliability.retry", "Bounded retries and retry-budget enforcement", 10, s("resilience"), ["Retry budget and bounded retry execution."], undefined, true),
    criterion("reliability.breaker", "Circuit-breaker transitions and recovery", 10, s("resilience"), ["Open, half-open and successful recovery transitions."], undefined, true),
    criterion("reliability.outbox", "Durable event delivery and consumer deduplication", 15, s("postgres-integration"), ["Transactional outbox/inbox integration assertions."], "Crash-after-claim recovery and stale-worker fencing are not injected."),
    criterion("reliability.persistence", "Durable state and adapter rehydration", 15, s("postgres-integration"), ["PostgreSQL persistence and adapter-peer replay assertions."], "Long-duration crash/restart and multi-process tests remain outstanding."),
    criterion("reliability.observability", "Operational telemetry and bounded metrics", 10, s("observability-metrics"), ["Prometheus counters, histogram exposition and cardinality bounds."], "External scrape, alerting and trace export are not tested."),
    criterion("reliability.crash-recovery", "Crash recovery and stale-worker fencing", 10, "unverified", [], "Crash-after-claim recovery and stale-worker fencing are not injected."),
    criterion("reliability.distributed-contention", "Multi-process and cross-host contention", 10, "unverified", [], "Adapter-peer tests do not establish real multi-process or cross-host contention behavior."),
    criterion("reliability.soak", "Long-duration soak and fault-injection behavior", 5, "unverified", [], "No long-duration soak or systematic chaos/fault-injection profile is currently run."),
  ]);
  const performance = makePillar("performance", "Performance", performanceCriteria(benchmark));
  const pillars = [correctness, security, performance, reliability];
  const scored = pillars.filter((item) => item.score !== null);
  const overall = scored.length === pillars.length && pillars.every((item) => item.coverage >= 0.55)
    ? Number((scored.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / 100).toFixed(2))
    : null;
  const overallConfidence = pillars.every((item) => item.confidence === "high") ? "high" : pillars.some((item) => item.confidence === "low") ? "low" : "medium";
  return {
    version: "1.0",
    overall,
    overallConfidence,
    pillars,
    limitations: [
      "Scenario passes prove only the exercised paths and assertions; they do not establish universal correctness or absence of vulnerabilities.",
      "A blocked or missing scenario is unverified, never a pass.",
      "Performance requires a matched baseline on equivalent hardware and workload; a single absolute timing is not a performance score.",
      "Scores are evidence-coverage weighted and conservative; partial criteria receive half credit and unverified criteria receive none.",
      "This is an engineering assessment instrument, not a security certification, SLO, or production-readiness guarantee.",
    ],
    interpretation: overall === null
      ? "Four-pillar assessment is available, but no composite score is published until every pillar has sufficient comparable evidence; inspect each pillar score and coverage independently."
      : "Composite score is a weighted engineering signal across correctness, security, performance and reliability. Always interpret it alongside pillar coverage, confidence, evidence and limitations.",
  };
}
