import { createReferenceLab } from "./signal-app.js";
import type { CaseRequest } from "./domain.js";

export type ScenarioStatus = "passed" | "failed" | "blocked" | "not-run";
export type ScenarioResult = { id: string; title: string; status: ScenarioStatus; durationMs: number; assertions: number; failures: string[]; evidence: string[] };
export type Capability = { id: string; area: string; capability: string; status: "exercised" | "partial" | "not-verified" | "not-applicable"; scenarios: string[]; evidence: string; limitation?: string };

const capabilities: Capability[] = [
  { id: "protocol.envelopes-schemas", area: "Protocol", capability: "Envelope contracts, operation kinds, schema validation and normalized errors", status: "exercised", scenarios: ["invalid-input"], evidence: "SDK operation definitions validate request schemas at dispatch" },
  { id: "sdk.definitions", area: "SDK", capability: "Public query and mutation operation registration", status: "exercised", scenarios: ["lifecycle"], evidence: "createReferenceLab registers public SDK operation definitions" },
  { id: "runtime.dispatch-context", area: "Runtime", capability: "Query/mutation dispatch and execution context propagation", status: "exercised", scenarios: ["lifecycle"], evidence: "Public runtime.query and runtime.mutation calls with source context" },
  { id: "runtime.authorization", area: "Runtime", capability: "Runtime-level mutation authorization policies", status: "not-verified", scenarios: [], evidence: "Business hard-stop is app-level; runtime authorization mode is not configured." },
  { id: "runtime.idempotency", area: "Idempotency", capability: "Reservation, replay, payload conflict and concurrent duplicate handling", status: "partial", scenarios: ["idempotency"], evidence: "Stable mutation keys are passed to the default memory storage port", limitation: "No distributed storage adapter or cross-process test." },
  { id: "events.publish-subscribe", area: "Events", capability: "Event publication and in-process subscriber delivery", status: "exercised", scenarios: ["lifecycle"], evidence: "Four domain lifecycle events are published and subscribed" },
  { id: "binding.http", area: "HTTP binding", capability: "HTTP routes, transport auth context and error mapping", status: "not-verified", scenarios: [], evidence: "The example web server is a thin local UI adapter, not @signal/binding-http." },
  { id: "postgres.transactions", area: "PostgreSQL", capability: "Database transactions, migrations, locks and persistence", status: "not-verified", scenarios: [], evidence: "No PostgreSQL adapter or database is configured." },
  { id: "outbox.durability", area: "Outbox", capability: "Durable outbox, leases, fencing and crash recovery", status: "not-verified", scenarios: [], evidence: "Default in-process dispatcher only; no durable worker is started." },
  { id: "inbox.transactionality", area: "Inbox", capability: "Transactional consumer inbox and effect deduplication", status: "not-verified", scenarios: [], evidence: "Subscriber callback deduplicates in process only." },
  { id: "resilience.retry-budgets", area: "Resilience", capability: "Retry policies, budgets and backoff behavior", status: "not-verified", scenarios: [], evidence: "No retry fault adapter is wired." },
  { id: "resilience.circuit-breakers", area: "Resilience", capability: "Circuit breaker state, half-open recovery and distributed coordination", status: "not-verified", scenarios: [], evidence: "No downstream provider or breaker integration is configured." },
  { id: "replay.evidence", area: "Replay", capability: "Replay evidence capture, deterministic reconstruction and compatibility", status: "not-verified", scenarios: [], evidence: "The process-local event journal is not a replay evidence store." },
  { id: "audit.chain-checkpoints", area: "Audit", capability: "Hash-chain integrity, checkpoints and tamper detection", status: "not-verified", scenarios: [], evidence: "No audit chain or checkpoint verifier is used." },
  { id: "decision.assessment", area: "Decision", capability: "Evidence lineage, uncertainty assessment and hard-stop policy", status: "exercised", scenarios: ["lifecycle", "authorization"], evidence: "packages/decision assessDecisionEvidence is used to calculate evidence quality, confidence, governance and stewardship" },
  { id: "decision.accountability", area: "Decision", capability: "Decision rationale and accountable actor traceability", status: "exercised", scenarios: ["lifecycle"], evidence: "Decision record stores actor, rationale and timestamp" },
  { id: "decision.outcomes", area: "Outcomes", capability: "Outcome capture linked to a recorded decision", status: "exercised", scenarios: ["lifecycle"], evidence: "Outcome operation requires a prior decision", limitation: "The review is recorded, but statistically calibrated policy adaptation is not claimed." },
  { id: "agency.policy", area: "Agency", capability: "Policy gate, action authorization and outcome cycle", status: "exercised", scenarios: ["lifecycle"], evidence: "@signal/agency createAgencyPipeline executes decision and outcome cycles with approval gate" },
  { id: "agency.calibration-learning", area: "Agency", capability: "Confidence calibration, trace learning and self-diagnosis", status: "partial", scenarios: ["lifecycle"], evidence: "Agency traces are retained and evaluated", limitation: "The sample is intentionally too small for calibrated confidence or statistically meaningful learning." },
  { id: "memory.lifecycle", area: "Decision memory", capability: "Decision record and review persistence, retrieval, compaction and retention", status: "partial", scenarios: ["lifecycle"], evidence: "Public SDK createInMemoryDecisionMemoryStore stores decision records and outcome reviews", limitation: "In-memory only; PostgreSQL persistence, scoped retrieval, compaction and retention jobs are not exercised." },
  { id: "commitment.constraints", area: "Commitment", capability: "Resource constraints, feasibility and allocation policy", status: "exercised", scenarios: ["lifecycle", "authorization"], evidence: "@signal/commitment evaluateCommitment runs for each assessment with explicit capacity and hard evidence constraints" },
  { id: "semantic-state.interpretation", area: "Semantic state", capability: "Generic state lexicon and semantic interpretation", status: "exercised", scenarios: ["lifecycle"], evidence: "@signal/semantic-state resolveSemanticState interprets confidence, risk, stability and coherence" },
  { id: "kernel.compatibility", area: "Kernel", capability: "Kernel compatibility adapters and legacy orchestration", status: "not-verified", scenarios: [], evidence: "No legacy adapter is used by the reference workflow." },
  { id: "observability.metrics", area: "Observability", capability: "Metrics, trace export, cardinality controls and telemetry overhead", status: "not-verified", scenarios: [], evidence: "Only local scenario wall-clock timing is collected." },
  { id: "cli.verification", area: "CLI", capability: "Repeatable local scenario and capability report commands", status: "exercised", scenarios: ["lifecycle"], evidence: "evaluate and coverage CLI commands emit JSON reports" }
];

export async function runEvaluation(): Promise<{ results: ScenarioResult[]; capabilities: Capability[]; score: Scorecard; summary: string }> {
  const results: ScenarioResult[] = [];
  const run = async (id: string, title: string, fn: (assert: (condition: unknown, message: string) => void) => Promise<void>) => {
    const started = performance.now(), failures: string[] = []; let assertions = 0;
    const assert = (condition: unknown, message: string) => { assertions++; if (!condition) failures.push(message); };
    try { await fn(assert); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    results.push({ id, title, status: failures.length ? "failed" : "passed", durationMs: Number((performance.now() - started).toFixed(3)), assertions, failures, evidence: [`scenario:${id}`] });
  };
  await run("lifecycle", "Request → evidence → assessment → decision → outcome", async (a) => {
    const app = createReferenceLab(); const request = await app.submitRequest({ tenantId: "tenant-a", title: "Review supplier access", description: "Assess whether a supplier should receive temporary access." });
    a(request.status === "received", "request should be received");
    await app.addEvidence({ requestId: request.id, tenantId: "tenant-a", description: "Contract approved by procurement", source: "contract-registry", confidence: 0.92, verified: true });
    await app.addEvidence({ requestId: request.id, tenantId: "tenant-a", description: "Security review passed", source: "security-review", confidence: 0.88, verified: true });
    const assessed = await app.getRequest(request.id, "tenant-a"); a(assessed?.assessment?.recommendation === "approve", "two verified evidence items should permit approval recommendation");
    a(assessed?.assessment?.commitment.status === "recommended", "commitment should recommend a feasible allocation");
    a(Boolean(assessed?.assessment?.semanticState.word), "semantic-state should classify the assessment");
    const decision = await app.decide({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", approve: true, rationale: "Verified contract and security evidence meet policy." });
    a(decision.result === "approved", "decision should be recorded");
    const outcome = await app.recordOutcome({ requestId: request.id, tenantId: "tenant-a", result: "success", notes: "Temporary access expired as scheduled." });
    a(outcome.result === "success", "outcome should be linked to decision");
    a(app.listDecisionRecords().length === 1, "Signal decision memory should persist a decision record");
    a(app.listDecisionReviews().length === 1, "Signal decision memory should persist an outcome review");
    a(app.listAgencyTraces().length === 2, "agency should record decision and outcome cycles");
    a(app.events.length >= 4, "lifecycle should emit request, assessment, decision and outcome events");
  });
  await run("authorization", "Insufficient evidence blocks approval", async (a) => {
    const app = createReferenceLab(); const request = await app.submitRequest({ tenantId: "tenant-a", title: "Review payment exception", description: "Assess a one-off payment exception request." });
    await app.addEvidence({ requestId: request.id, tenantId: "tenant-a", description: "Requester explanation supplied", source: "requester", confidence: 0.4, verified: false });
    let blocked = false; try { await app.decide({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", approve: true, rationale: "Approve despite missing evidence." }); } catch { blocked = true; }
    a(blocked, "approval must be blocked when assessment recommends investigation");
  });
  await run("tenant-isolation", "Tenant boundary prevents cross-tenant reads and writes", async (a) => {
    const app = createReferenceLab(); const request = await app.submitRequest({ tenantId: "tenant-a", title: "Review data export", description: "Assess a requested export of customer data." });
    a(await app.getRequest(request.id, "tenant-b") === null, "other tenant must not read request");
    let blocked = false; try { await app.addEvidence({ requestId: request.id, tenantId: "tenant-b", description: "Injected evidence", source: "attacker", confidence: 1, verified: true }); } catch { blocked = true; }
    a(blocked, "other tenant must not mutate request");
  });
  await run("idempotency", "Repeated submission returns a stable request identity", async (a) => {
    const app = createReferenceLab(); const input = { tenantId: "tenant-a", title: "Review account closure", description: "Confirm closure request meets retention requirements." };
    const first = await app.submitRequest(input), second = await app.submitRequest(input);
    a(first.id === second.id, "repeat submit should resolve to same request");
    a(app.events.filter((event) => event.name === "lab.request.received.v1").length === 1, "repeat submit should not duplicate the request event");
  });
  await run("concurrency", "Concurrent duplicate submissions do not create duplicate cases", async (a) => {
    const app = createReferenceLab(); const input = { tenantId: "tenant-a", title: "Review vendor onboarding", description: "Validate a new vendor onboarding request." };
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => app.submitRequest(input)));
    a(attempts.every((item) => item.status === "fulfilled"), "all concurrent duplicate callers should receive a result");
    const ids = attempts.flatMap((item) => item.status === "fulfilled" ? [item.value.id] : []);
    a(new Set(ids).size === 1, "all concurrent callers should receive the same request identity");
    a(app.events.filter((event) => event.name === "lab.request.received.v1").length === 1, "concurrent duplicate should emit one received event");
  });
  await run("invalid-input", "Malformed request is rejected by the Signal contract", async (a) => {
    const app = createReferenceLab(); let rejected = false;
    try { await app.submitRequest({ tenantId: "", title: "x", description: "short" }); } catch { rejected = true; }
    a(rejected, "invalid request should be rejected");
  });
  const passed = results.filter((item) => item.status === "passed").length;
  const score = scoreEngineering(results, capabilities);
  return { results, capabilities, score, summary: `${passed}/${results.length} scenarios passed; ${capabilities.filter((item) => item.status === "exercised").length}/${capabilities.length} capabilities directly exercised.` };
}

export type Scorecard = { overall: number; dimensions: { name: string; weight: number; score: number; confidence: "high" | "medium" | "low"; evidence: string[] }[]; interpretation: string };
const weights = [{ name: "Functional correctness/effectiveness", weight: 18 }, { name: "Reliability/resilience", weight: 16 }, { name: "Performance/resource efficiency", weight: 12 }, { name: "Architecture/design", weight: 14 }, { name: "Security/privacy/integrity", weight: 12 }, { name: "Maintainability/evolvability", weight: 10 }, { name: "Testing/verification", weight: 8 }, { name: "Developer experience/adoption", weight: 6 }, { name: "Operability/delivery", weight: 4 }];
export function scoreEngineering(results: ScenarioResult[], inventory: Capability[]): Scorecard {
  const passRate = results.length ? results.filter((item) => item.status === "passed").length / results.length : 0;
  const exercised = inventory.filter((item) => item.status === "exercised").length / inventory.length;
  const unverified = inventory.filter((item) => item.status === "not-verified").length;
  const scores = [Math.min(10, 5 + passRate * 5), 3.5, 5, 7, 6.5, 7, Math.min(10, 4 + passRate * 6), 7, 5];
  const evidenceByDimension = [
    results.map((item) => `${item.id}:${item.status} (${item.assertions} assertions)`),
    ["In-process idempotency and subscriber delivery only", "PostgreSQL/outbox/inbox/recovery remain unverified"],
    ["Local in-process query benchmark reports latency/throughput/RSS", "No production or cross-host baseline is included"],
    ["Public SDK operations; separate domain/evaluation modules", "No private package imports"],
    ["Tenant-scoped read/write tests and evidence hard-stop", "No external identity provider or adversarial security test"],
    ["Small typed modules with explicit domain contracts and docs", "No long-term migration/evolution exercise"],
    results.map((item) => `${item.id}:${item.status}`),
    ["CLI evaluate/coverage/benchmark/compare commands", "Local browser workflow and workspace package scripts"],
    ["Dedicated CI workflow builds workspace dependency closure", "No deployed environment, SLOs or operational telemetry"]
  ];
  const dimensions = weights.map((dimension, index) => ({ ...dimension, score: Number(scores[index].toFixed(1)), confidence: index === 1 || index === 2 || index === 4 || index === 8 ? "low" as const : "medium" as const, evidence: evidenceByDimension[index] }));
  const overall = Number((dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100).toFixed(2));
  return { overall, dimensions, interpretation: "Provisional reference-app integration score, not a certification or production score for Signal. Unverified database, resilience, replay, audit and telemetry capabilities are explicitly not credited. Performance is low-confidence until repeatable benchmark workloads and resource collectors are connected." };
}

export function summarizeRequests(items: CaseRequest[]) { return { total: items.length, assessed: items.filter((item) => item.assessment).length, decided: items.filter((item) => item.decision).length, outcomes: items.filter((item) => item.outcome).length }; }
