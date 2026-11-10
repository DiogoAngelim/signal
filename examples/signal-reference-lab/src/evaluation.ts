import { createReferenceLab } from "./signal-app.js";
import type { CaseRequest } from "./domain.js";

export type ScenarioStatus = "passed" | "failed" | "blocked" | "not-run";
export type ScenarioResult = { id: string; title: string; status: ScenarioStatus; durationMs: number; assertions: number; failures: string[]; evidence: string[] };
export type Capability = { id: string; area: string; capability: string; status: "exercised" | "partial" | "not-verified" | "not-applicable"; scenarios: string[]; evidence: string; limitation?: string };

const capabilities: Capability[] = [
  { id: "protocol.operations", area: "Protocol & SDK", capability: "Typed query and mutation definitions with validated input/result contracts", status: "exercised", scenarios: ["lifecycle", "invalid-input"], evidence: "src/signal-app.ts operation schemas and runtime registrations" },
  { id: "runtime.dispatch", area: "Runtime", capability: "In-process dispatch and execution context", status: "exercised", scenarios: ["lifecycle"], evidence: "createSignalRuntime and public runtime.query/mutation calls" },
  { id: "runtime.events", area: "Events", capability: "Event publication and subscriber delivery", status: "exercised", scenarios: ["lifecycle"], evidence: "four lifecycle events published and subscribed" },
  { id: "idempotency", area: "Reliability", capability: "Mutation idempotency key propagation", status: "partial", scenarios: ["idempotency"], evidence: "Public mutation calls carry stable idempotency keys", limitation: "The default in-process runtime is not a durable distributed idempotency proof." },
  { id: "tenant.isolation", area: "Security", capability: "Tenant-scoped reads and writes", status: "exercised", scenarios: ["tenant-isolation"], evidence: "Repository boundary checks tenant ID before returning or mutating requests" },
  { id: "decision.assessment", area: "Decision", capability: "Evidence-backed assessment and hard-stop policy", status: "exercised", scenarios: ["lifecycle", "authorization"], evidence: "Verified evidence threshold, confidence and risk rationale" },
  { id: "decision.outcomes", area: "Learning", capability: "Outcome capture linked to prior decision", status: "exercised", scenarios: ["lifecycle"], evidence: "Outcome requires and references a recorded decision", limitation: "No persistent learning model or calibrated policy update is claimed." },
  { id: "persistence.postgres", area: "Persistence", capability: "PostgreSQL transactions, outbox/inbox, locking and crash recovery", status: "not-verified", scenarios: [], evidence: "No database adapter is configured in this reference app." },
  { id: "resilience.retry", area: "Resilience", capability: "Retry budgets, circuit breakers and timeout recovery", status: "not-verified", scenarios: [], evidence: "Not wired into the app execution path." },
  { id: "replay.audit", area: "Integrity", capability: "Deterministic replay, audit chains and checkpoints", status: "not-verified", scenarios: [], evidence: "Event list is process-local; it is not an audit chain or replay store." },
  { id: "observability.metrics", area: "Observability", capability: "Operational metrics and trace export", status: "not-verified", scenarios: [], evidence: "Harness timing is local; no telemetry backend is configured." }
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
    const decision = await app.decide({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", approve: true, rationale: "Verified contract and security evidence meet policy." });
    a(decision.result === "approved", "decision should be recorded");
    const outcome = await app.recordOutcome({ requestId: request.id, tenantId: "tenant-a", result: "success", notes: "Temporary access expired as scheduled." });
    a(outcome.result === "success", "outcome should be linked to decision");
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
  const scores = [Math.min(10, 5 + passRate * 5), 3.5, 2.5, 7, 6.5, 7, Math.min(10, 4 + passRate * 6), 7, 3.5];
  const dimensions = weights.map((dimension, index) => ({ ...dimension, score: Number(scores[index].toFixed(1)), confidence: index === 2 || index === 8 ? "low" as const : "medium" as const, evidence: index === 0 || index === 6 ? results.map((item) => `${item.id}:${item.status}`) : [`${exercised.toFixed(2)} exercised capability ratio`, `${unverified} capability areas not verified`] }));
  const overall = Number((dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100).toFixed(2));
  return { overall, dimensions, interpretation: "Provisional reference-app integration score, not a certification or production score for Signal. Unverified database, resilience, replay, audit and telemetry capabilities are explicitly not credited. Performance is low-confidence until repeatable benchmark workloads and resource collectors are connected." };
}

export function summarizeRequests(items: CaseRequest[]) { return { total: items.length, assessed: items.filter((item) => item.assessment).length, decided: items.filter((item) => item.decision).length, outcomes: items.filter((item) => item.outcome).length }; }
