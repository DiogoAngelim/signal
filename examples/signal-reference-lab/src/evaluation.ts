import { generateKeyPairSync, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createAuditChainEntry, verifyChain, verifyAuditChainEntry, signAuditCheckpoint, verifyAuditCheckpoint, verifyCheckpointAgainstChain, createReplayEvidenceRecord, verifyReplayEvidenceRecord, createCircuitBreakerController, createRetryBudget, executeWithRetry, createSignalRuntime, createInProcessDispatcher, createDistributedCircuitBreakerController, createPrometheusMetricsRecorder } from "@signal/sdk-node";
import { z } from "zod";
import { createSignalHttpServer } from "@signal/binding-http";
import { createPostgresTransactionalStore, createPostgresConsumerInbox, createPostgresRetryBudget, createPostgresCircuitBreakerPort, createPostgresReplayEvidenceStore, createPostgresAuditLedger } from "@signal/idempotency-postgres";
import { NeonPostgresAdapter } from "@signal/decision-memory";
import { SignalOrchestrator, ReplayEngine, StocksOptimizerPlugin } from "@signal/kernel";
import { createReferenceLab } from "./signal-app.js";
import type { CaseRequest } from "./domain.js";

export type ScenarioStatus = "passed" | "failed" | "blocked" | "not-run";
export type ScenarioTarget = "signal" | "integration" | "reference-app";
export type ScenarioResult = { id: string; title: string; target: ScenarioTarget; status: ScenarioStatus; durationMs: number; assertions: number; failures: string[]; failureAttribution?: "infrastructure" | "harness" | "unclassified"; evidence: string[] };
export type Capability = { id: string; area: string; capability: string; status: "exercised" | "partial" | "not-verified" | "not-applicable"; scenarios: string[]; evidence: string; limitation?: string };

const capabilities: Capability[] = [
  { id: "protocol.envelopes-schemas", area: "Protocol", capability: "Envelope contracts, operation kinds, schema validation and normalized errors", status: "exercised", scenarios: ["invalid-input"], evidence: "SDK operation definitions validate request schemas at dispatch" },
  { id: "sdk.definitions", area: "SDK", capability: "Public query and mutation operation registration", status: "exercised", scenarios: ["lifecycle"], evidence: "createReferenceLab registers public SDK operation definitions" },
  { id: "runtime.dispatch-context", area: "Runtime", capability: "Query/mutation dispatch and execution context propagation", status: "exercised", scenarios: ["lifecycle"], evidence: "Public runtime.query and runtime.mutation calls with source context" },
  { id: "runtime.authorization", area: "Runtime", capability: "Runtime-level mutation authorization policies", status: "exercised", scenarios: ["runtime-authorization", "runtime-policy"], evidence: "Runtime enforces trusted authenticated context and operation-specific authorize policy." },
  { id: "runtime.idempotency", area: "Idempotency", capability: "Reservation, replay, payload conflict and concurrent duplicate handling", status: "partial", scenarios: ["idempotency"], evidence: "Stable mutation keys are passed to the default memory storage port", limitation: "No distributed storage adapter or cross-process test." },
  { id: "ports.contracts", area: "Ports", capability: "Storage, event, observability, replay, retry-budget and distributed-breaker adapter contracts", status: "partial", scenarios: ["lifecycle"], evidence: "SDK runtime uses public StoragePort, EventPort and ObservabilityPort contracts.", limitation: "Replay, retry-budget and distributed circuit-breaker ports are not wired to durable adapters." },
  { id: "postgres.idempotency", area: "PostgreSQL", capability: "Durable PostgreSQL idempotency reservation and replay adapter", status: "not-verified", scenarios: [], evidence: "Adapter is available in @signal/idempotency-postgres but not connected to the lab runtime." },
  { id: "postgres.transactional-outbox", area: "Outbox", capability: "Transactional mutation completion and durable outbox publication", status: "not-verified", scenarios: [], evidence: "Transactional store is not configured; in-process event delivery is not equivalent." },
  { id: "postgres.consumer-inbox", area: "Inbox", capability: "Transactional consumer inbox and effect deduplication", status: "not-verified", scenarios: [], evidence: "Consumer inbox adapter is not configured." },
  { id: "postgres.audit-ledger", area: "Audit", capability: "Append-only PostgreSQL audit ledger and persisted signed checkpoints", status: "not-verified", scenarios: [], evidence: "Only in-memory chain/checkpoint verification is exercised." },
  { id: "postgres.replay-evidence", area: "Replay", capability: "Tenant-scoped immutable PostgreSQL replay evidence persistence", status: "not-verified", scenarios: [], evidence: "Only local content-addressed record creation and verification are exercised." },
  { id: "postgres.retry-budget", area: "Resilience", capability: "Shared PostgreSQL retry-budget state across independent adapter instances", status: "not-verified", scenarios: [], evidence: "Only local in-memory retry budget is exercised." },
  { id: "postgres.distributed-breaker", area: "Resilience", capability: "Shared circuit-breaker state and half-open probe coordination across independent adapters", status: "not-verified", scenarios: [], evidence: "Only local circuit-breaker state transitions are exercised." },
  { id: "events.publish-subscribe", area: "Events", capability: "Event publication and in-process subscriber delivery", status: "exercised", scenarios: ["lifecycle"], evidence: "Four domain lifecycle events are published and subscribed" },
  { id: "binding.http", area: "HTTP binding", capability: "Signal HTTP query/mutation routes, validation and auth-claim rejection", status: "exercised", scenarios: ["http-binding"], evidence: "@signal/binding-http Fastify server is exercised through inject(); external verified identity middleware remains unconfigured." },
  { id: "postgres.transactions", area: "PostgreSQL", capability: "Database migrations, transactional persistence and durable state", status: "exercised", scenarios: ["postgres-integration"], evidence: "PostgreSQL integration validates migration compatibility, durable idempotency across runtime instances, transactional outbox/inbox, shared retry budget and breaker adapters, replay evidence and audit ledger." },
  { id: "resilience.retry-budgets", area: "Resilience", capability: "Retry policies, budgets and bounded retry execution", status: "exercised", scenarios: ["resilience"], evidence: "executeWithRetry is exercised with a deterministic local retry budget and transient failure." },
  { id: "resilience.circuit-breakers", area: "Resilience", capability: "Circuit breaker open/half-open probe and recovery", status: "exercised", scenarios: ["resilience"], evidence: "Local permit-scoped transitions and half-open recovery are exercised.", limitation: "Real provider failures and distributed coordination are covered separately by the PostgreSQL adapter scenario." },
  { id: "replay.evidence", area: "Replay", capability: "Content-addressed replay evidence creation and integrity verification", status: "partial", scenarios: ["replay-evidence"], evidence: "Replay evidence records and digest verification are exercised.", limitation: "A complete historical replay executor and cross-version compatibility workflow are not yet integrated." },
  { id: "audit.chain-checkpoints", area: "Audit", capability: "Hash-chain integrity, signed checkpoints and tamper detection", status: "exercised", scenarios: ["audit-integrity"], evidence: "Audit chain verification, Ed25519 checkpoint signing and chain anchoring are exercised." },
  { id: "decision.assessment", area: "Decision", capability: "Evidence lineage, uncertainty assessment and hard-stop policy", status: "exercised", scenarios: ["lifecycle", "authorization"], evidence: "packages/decision assessDecisionEvidence is used to calculate evidence quality, confidence, governance and stewardship" },
  { id: "decision.accountability", area: "Decision", capability: "Decision rationale and accountable actor traceability", status: "exercised", scenarios: ["lifecycle"], evidence: "Decision record stores actor, rationale and timestamp" },
  { id: "decision.outcomes", area: "Outcomes", capability: "Outcome capture linked to a recorded decision", status: "exercised", scenarios: ["lifecycle"], evidence: "Outcome operation requires a prior decision", limitation: "The review is recorded, but statistically calibrated policy adaptation is not claimed." },
  { id: "workflow.action-execution", area: "Workflow", capability: "Human-approved action execution and outcome gating", status: "exercised", scenarios: ["lifecycle", "authorization"], evidence: "Action execution rejects missing/rejected approvals; outcome capture requires an executed action." },
  { id: "agency.policy", area: "Agency", capability: "Policy gate, action authorization and outcome cycle", status: "exercised", scenarios: ["lifecycle"], evidence: "@signal/agency createAgencyPipeline executes decision and outcome cycles with approval gate" },
  { id: "agency.calibration-learning", area: "Agency", capability: "Confidence calibration, trace learning and self-diagnosis", status: "partial", scenarios: ["lifecycle"], evidence: "Agency traces are retained and evaluated", limitation: "The sample is intentionally too small for calibrated confidence or statistically meaningful learning." },
  { id: "memory.lifecycle", area: "Decision memory", capability: "Decision record and review persistence, retrieval, compaction and retention", status: "partial", scenarios: ["lifecycle", "postgres-integration"], evidence: "In-memory SDK store plus NeonPostgresAdapter persist and retrieve decision records and reviews.", limitation: "Compaction, retention scheduling and large-history retrieval are not benchmarked." },
  { id: "commitment.constraints", area: "Commitment", capability: "Resource constraints, feasibility and allocation policy", status: "exercised", scenarios: ["lifecycle", "authorization"], evidence: "@signal/commitment evaluateCommitment runs for each assessment with explicit capacity and hard evidence constraints" },
  { id: "semantic-state.interpretation", area: "Semantic state", capability: "Generic state lexicon and semantic interpretation", status: "exercised", scenarios: ["lifecycle"], evidence: "@signal/semantic-state resolveSemanticState interprets confidence, risk, stability and coherence" },
  { id: "kernel.compatibility", area: "Kernel", capability: "Kernel orchestration, plugin contracts, stores and execution lifecycle", status: "exercised", scenarios: ["kernel-pipeline"], evidence: "Public SignalOrchestrator registers a real StocksOptimizerPlugin, executes all four stages, persists output and disposes the plugin." },
  { id: "kernel.replay", area: "Kernel", capability: "Kernel historical pipeline replay and deterministic result comparison", status: "exercised", scenarios: ["kernel-pipeline"], evidence: "ReplayEngine reruns the registered pipeline and compares the original result." },
  { id: "cli.signal-verification", area: "Signal CLI", capability: "Standalone Signal CLI phase-chain and artifact verification", status: "not-verified", scenarios: [], evidence: "The CLI verifier is run as a separate executable against its checked-in proof state." },
  { id: "observability.lifecycle", area: "Observability", capability: "Structured runtime lifecycle event emission", status: "exercised", scenarios: ["lifecycle"], evidence: "Signal ObservabilityPort collector captures runtime lifecycle hooks." },
  { id: "observability.export", area: "Observability", capability: "Prometheus exposition, metric allowlists and cardinality controls", status: "partial", scenarios: ["observability-metrics"], evidence: "Prometheus recorder renders bounded counters and latency histograms.", limitation: "No external scrape target, trace exporter or telemetry overhead study." },
  { id: "cli.verification", area: "CLI", capability: "Repeatable local scenario and capability report commands", status: "exercised", scenarios: ["lifecycle"], evidence: "evaluate and coverage CLI commands emit JSON reports" }
];

export async function runEvaluation(): Promise<{ results: ScenarioResult[]; capabilities: Capability[]; score: Scorecard; qualityGates: Record<ScenarioTarget, { total: number; passed: number; failed: number; blocked: number }>; summary: string }> {
  const results: ScenarioResult[] = [];
  const capabilityResults = capabilities.map((item) => ({ ...item, scenarios: [...item.scenarios] }));
  const run = async (id: string, title: string, fn: (assert: (condition: unknown, message: string) => void) => Promise<void>) => {
    const started = performance.now(), failures: string[] = []; let assertions = 0;
    const assert = (condition: unknown, message: string) => { assertions++; if (!condition) failures.push(message); };
    try { await fn(assert); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    const failureText = failures.join(" ").toLowerCase();
    const failureAttribution = failures.length === 0 ? undefined
      : id === "postgres-integration" && /(econnrefused|connection terminated|database .* unavailable|timeout|could not connect)/.test(failureText) ? "infrastructure" as const
      : id === "benchmark-integrity" || /measurement integrity/.test(failureText) ? "harness" as const
      : "unclassified" as const;
    const target: ScenarioTarget = ["lifecycle", "authorization", "tenant-isolation"].includes(id) ? "reference-app" : ["idempotency", "concurrency"].includes(id) ? "integration" : "signal";
    results.push({ id, title, target, status: failures.length ? "failed" : "passed", durationMs: Number((performance.now() - started).toFixed(3)), assertions, failures, failureAttribution, evidence: [`scenario:${id}`] });
  };
  await run("lifecycle", "Request → evidence → assessment → decision → authorized action → outcome", async (a) => {
    const app = createReferenceLab(); const request = await app.submitRequest({ tenantId: "tenant-a", title: "Review supplier access", description: "Assess whether a supplier should receive temporary access." });
    a(request.status === "received", "request should be received");
    await app.addEvidence({ requestId: request.id, tenantId: "tenant-a", description: "Contract approved by procurement", source: "contract-registry", confidence: 0.92, verified: true });
    await app.addEvidence({ requestId: request.id, tenantId: "tenant-a", description: "Security review passed", source: "security-review", confidence: 0.88, verified: true });
    const assessed = await app.getRequest(request.id, "tenant-a"); a(assessed?.assessment?.recommendation === "approve", "two verified evidence items should permit approval recommendation");
    a(assessed?.assessment?.commitment.status === "recommended", "commitment should recommend a feasible allocation");
    a(Boolean(assessed?.assessment?.semanticState.word), "semantic-state should classify the assessment");
    const decision = await app.decide({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", approve: true, rationale: "Verified contract and security evidence meet policy." });
    a(decision.result === "approved", "decision should be recorded");
    const action = await app.executeAction({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", kind: "grant-temporary-access" });
    a(action.result === "completed", "approved action should execute under an accountable operator");
    const outcome = await app.recordOutcome({ requestId: request.id, tenantId: "tenant-a", result: "success", notes: "Temporary access expired as scheduled." });
    a(outcome.result === "success", "outcome should be linked to decision");
    a(app.listDecisionRecords().length === 1, "Signal decision memory should persist a decision record");
    a(app.listDecisionReviews().length === 1, "Signal decision memory should persist an outcome review");
    a(app.listAgencyTraces().length === 2, "agency should record decision and outcome cycles");
    a(app.listTelemetry().some((item) => (item as { event?: string }).event === "execution.end"), "Signal runtime lifecycle telemetry should be collected");
    a(app.events.length >= 5, "lifecycle should emit request, assessment, decision, action and outcome events");
  });
  await run("authorization", "Insufficient evidence blocks approval", async (a) => {
    const app = createReferenceLab(); const request = await app.submitRequest({ tenantId: "tenant-a", title: "Review payment exception", description: "Assess a one-off payment exception request." });
    await app.addEvidence({ requestId: request.id, tenantId: "tenant-a", description: "Requester explanation supplied", source: "requester", confidence: 0.4, verified: false });
    let blocked = false; try { await app.decide({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", approve: true, rationale: "Approve despite missing evidence." }); } catch { blocked = true; }
    a(blocked, "approval must be blocked when assessment recommends investigation");
    let actionBlocked = false; try { await app.executeAction({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", kind: "grant-access" }); } catch { actionBlocked = true; }
    a(actionBlocked, "action execution must remain blocked without an approved decision");
    const rejected = await app.decide({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", approve: false, rationale: "Reject pending independent evidence." });
    a(rejected.result === "rejected", "operator rejection should be recordable");
    let rejectedActionBlocked = false; try { await app.executeAction({ requestId: request.id, tenantId: "tenant-a", actor: "operator-1", kind: "grant-access" }); } catch { rejectedActionBlocked = true; }
    a(rejectedActionBlocked, "a rejected decision must never authorize action execution");
    let prematureOutcomeBlocked = false; try { await app.recordOutcome({ requestId: request.id, tenantId: "tenant-a", result: "success", notes: "Attempted to record an outcome before execution." }); } catch { prematureOutcomeBlocked = true; }
    a(prematureOutcomeBlocked, "outcome capture must require an executed action");
  });
  await run("runtime-authorization", "Runtime rejects mutations without trusted authorization", async (a) => {
    const app = createReferenceLab();
    const input = { tenantId: "tenant-a", title: "Review privileged request", description: "Check that mutation authorization is enforced by the runtime." };
    const denied = await app.runtime.mutation("lab.request.submit.v1", input, { idempotencyKey: "unauthorized-attempt", source: { system: "untrusted-client", transport: "test", runtime: "reference-lab" } });
    a(!denied.ok, "runtime must reject a mutation without trusted authorization");
    const accepted = await app.submitRequest(input);
    a(accepted.status === "received", "trusted internal operator context should be authorized");
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
  await run("http-binding", "Signal HTTP binding validates and dispatches a query", async (a) => {
    const app = createReferenceLab();
    const request = await app.submitRequest({ tenantId: "tenant-a", title: "Review HTTP access", description: "Exercise the Signal HTTP binding query endpoint." });
    const server = createSignalHttpServer(app.runtime, { basePath: "/signal" });
    await server.ready();
    try {
      const response = await server.inject({ method: "POST", url: "/signal/query/lab.request.get.v1", payload: { payload: { requestId: request.id, tenantId: "tenant-a" }, context: { source: { system: "reference-lab-test", transport: "http", runtime: "vitest" } } } });
      a(response.statusCode === 200, "Signal HTTP query should return HTTP 200");
      a(response.json().ok === true, "Signal HTTP response should preserve the runtime result envelope");
      const rejected = await server.inject({ method: "POST", url: "/signal/query/lab.request.get.v1", payload: { payload: { requestId: request.id, tenantId: "tenant-a" }, auth: { subject: "forged-user" } } });
      a(rejected.statusCode === 400, "caller-supplied authentication claims must be rejected");
    } finally {
      await server.close();
    }
  });
  await run("audit-integrity", "Audit chain and signed checkpoint detect tampering", async (a) => {
    const first = createAuditChainEntry(null, { operationName: "lab.request.submit.v1", operationKind: "mutation", messageId: "message-1", outcome: "completed" });
    const second = createAuditChainEntry(first, { operationName: "lab.decision.record.v1", operationKind: "mutation", messageId: "message-2", outcome: "completed" });
    const chain = [first, second];
    a(verifyChain(chain), "well-formed audit chain should verify");
    a(!verifyChain([first, { ...second, operationName: "tampered.operation" }]), "modified audit entry should fail chain verification");
    const keys = generateKeyPairSync("ed25519");
    const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const checkpoint = signAuditCheckpoint(chain, { keyId: "reference-lab-key", privateKey });
    a(verifyAuditCheckpoint(checkpoint, publicKey, "reference-lab-key"), "checkpoint signature should verify against its public key");
    a(verifyCheckpointAgainstChain(checkpoint, chain), "checkpoint should anchor the supplied chain head");
  });
  await run("replay-evidence", "Replay evidence record integrity is content-addressed", async (a) => {
    const record = createReplayEvidenceRecord({ tenantId: "tenant-a", executionId: "execution-1", operationName: "lab.request.get.v1", operationVersion: "v1", handlerArtifactDigest: "a".repeat(64), policyVersion: "policy-v1", canonicalInput: { requestId: "case-1" }, externalReads: [{ key: "risk-source", value: { score: 0.2 }, observedAt: new Date().toISOString() }], result: { allowed: true } });
    a(verifyReplayEvidenceRecord(record), "valid replay evidence should verify");
    a(!verifyReplayEvidenceRecord({ ...record, result: { allowed: false } }), "tampered replay result should fail integrity verification");
  });
  await run("resilience", "Retry budget and circuit breaker recover deterministically", async (a) => {
    let attempts = 0;
    const budget = createRetryBudget({ capacity: 1 });
    const value = await executeWithRetry(async () => { attempts++; if (attempts === 1) throw Object.assign(new Error("temporary upstream failure"), { code: "TRANSIENT" }); return "recovered"; }, { maxAttempts: 2, backoffMs: 0, maxBackoffMs: 0, retryableCodes: new Set(["TRANSIENT"]), retryBudget: budget, random: () => 0, sleep: async () => {} });
    a(value === "recovered" && attempts === 2, "retry should recover after one transient failure");
    a(budget.snapshot().available === 0, "retry should consume one shared retry token");
    let clock = 0;
    const breaker = createCircuitBreakerController(2, 1000, () => clock, 1000);
    const firstPermit = breaker.acquire(0); a(Boolean(firstPermit), "closed breaker should admit a request");
    if (firstPermit) breaker.recordFailure(firstPermit, 0);
    const secondPermit = breaker.acquire(1); if (secondPermit) breaker.recordFailure(secondPermit, 1);
    a(breaker.snapshot().state === "open", "threshold failures should open the breaker");
    a(breaker.acquire(500) === null, "open breaker should reject before reset timeout");
    const probe = breaker.acquire(1001); a(Boolean(probe), "breaker should admit one half-open probe after reset");
    if (probe) breaker.recordSuccess(probe, 1002);
    a(breaker.snapshot().state === "closed", "successful probe should close the breaker");
  });
  await run("runtime-policy", "Operation authorization policy enforces actor roles", async (a) => {
    const runtime = createSignalRuntime({ runtimeName: "reference-lab-auth-test", requireMutationAuthorization: true });
    runtime.registerMutation({
      name: "lab.authorization.probe.v1", kind: "mutation", idempotency: "required",
      inputSchema: z.object({ action: z.string() }), resultSchema: z.object({ accepted: z.boolean() }),
      authorize(input, context) {
        const actor = context.request.auth?.actor;
        if (!actor || typeof actor === "string" || !actor.roles?.includes("lab:write") || input.action !== "write") {
          throw new Error("The authenticated actor is not authorized for this operation.");
        }
      },
      handler: () => ({ accepted: true })
    });
    const unauthenticated = await runtime.mutation<{ action: string }, { accepted: boolean }>("lab.authorization.probe.v1", { action: "write" }, { idempotencyKey: "no-auth" });
    a(!unauthenticated.ok && unauthenticated.error.code === "UNAUTHORIZED", "runtime must reject missing authentication");
    const unauthorized = await runtime.mutation<{ action: string }, { accepted: boolean }>("lab.authorization.probe.v1", { action: "write" }, { idempotencyKey: "wrong-role", auth: { actor: { id: "viewer", roles: ["lab:read"] } } });
    a(!unauthorized.ok, "operation policy must reject insufficient roles");
    const authorized = await runtime.mutation<{ action: string }, { accepted: boolean }>("lab.authorization.probe.v1", { action: "write" }, { idempotencyKey: "authorized", auth: { actor: { id: "operator", roles: ["lab:write"] } } });
    a(authorized.ok && authorized.result.accepted, "authorized actor should execute mutation");
  });
  if (process.env.DATABASE_URL) {
    await run("postgres-integration", "PostgreSQL adapters preserve transactional delivery and shared coordination", async (a) => {
      const connectionString = process.env.DATABASE_URL as string;
      const suffix = randomUUID();
      const store = createPostgresTransactionalStore({ connectionString, applicationName: "signal-reference-lab-test" });
      const storePeer = createPostgresTransactionalStore({ connectionString, applicationName: "signal-reference-lab-peer" });
      const inbox = createPostgresConsumerInbox({ connectionString, applicationName: "signal-reference-lab-inbox" });
      const inboxPeer = createPostgresConsumerInbox({ connectionString, applicationName: "signal-reference-lab-inbox-peer" });
      const retryBudget = createPostgresRetryBudget({ connectionString, budgetKey: `reference-lab:${suffix}`, capacity: 1 });
      const retryBudgetPeer = createPostgresRetryBudget({ connectionString, budgetKey: `reference-lab:${suffix}`, capacity: 1 });
      const breakerPort = createPostgresCircuitBreakerPort({ connectionString });
      const breakerPeerPort = createPostgresCircuitBreakerPort({ connectionString });
      const breaker = createDistributedCircuitBreakerController(breakerPort, `reference-lab:${suffix}`, { threshold: 1, resetTimeoutMs: 0, probeLeaseMs: 1000 });
      const breakerPeer = createDistributedCircuitBreakerController(breakerPeerPort, `reference-lab:${suffix}`, { threshold: 1, resetTimeoutMs: 0, probeLeaseMs: 1000 });
      const replayStore = createPostgresReplayEvidenceStore({ connectionString, applicationName: "signal-reference-lab-replay" });
      const decisionMemory = new NeonPostgresAdapter({ connectionString, source: `reference-lab:${suffix}` });
      const keys = generateKeyPairSync("ed25519");
      const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
      const keyId = `reference-lab-${suffix}`;
      let auditHistory: ReturnType<typeof createAuditChainEntry>[] = [];
      const auditLedger = createPostgresAuditLedger({
        connectionString,
        verifyEntry: verifyAuditChainEntry,
        verifyCheckpoint(checkpoint) { return verifyAuditCheckpoint(checkpoint, publicKey, keyId); }
      });
      try {
        const eventPort = createInProcessDispatcher();
        let deliveries = 0;
        const runtime = createSignalRuntime({ runtimeName: "signal-reference-lab-postgres", eventPort, storagePort: store });
        runtime.registerEvent({ name: "lab.postgres.outbox.v1", kind: "event", inputSchema: z.object({ token: z.string() }), resultSchema: z.object({ accepted: z.boolean() }), handler: () => ({ accepted: true }) });
        runtime.subscribe("lab.postgres.outbox.v1", () => { deliveries += 1; }, { consumerId: "postgres-outbox-proof", replaySafe: true });
        runtime.registerMutation({
          name: "lab.postgres.commit.v1", kind: "mutation", idempotency: "required",
          inputSchema: z.object({ token: z.string() }), resultSchema: z.object({ committed: z.boolean() }),
          async handler(input, context) { await context.emit("lab.postgres.outbox.v1", { token: input.token }); return { committed: true }; }
        });
        const first = await runtime.mutation<{ token: string }, { committed: boolean }>("lab.postgres.commit.v1", { token: suffix }, { idempotencyKey: `outbox:${suffix}` });
        a(first.ok && first.result.committed, "PostgreSQL-backed mutation should commit");
        a(deliveries === 1, "committed outbox event should reach the in-process subscriber");
        const peerRuntime = createSignalRuntime({ runtimeName: "signal-reference-lab-postgres-peer", eventPort, storagePort: storePeer });
        peerRuntime.registerEvent({ name: "lab.postgres.outbox.v1", kind: "event", inputSchema: z.object({ token: z.string() }), resultSchema: z.object({ accepted: z.boolean() }), handler: () => ({ accepted: true }) });
        peerRuntime.registerMutation({
          name: "lab.postgres.commit.v1", kind: "mutation", idempotency: "required",
          inputSchema: z.object({ token: z.string() }), resultSchema: z.object({ committed: z.boolean() }),
          async handler(input, context) { await context.emit("lab.postgres.outbox.v1", { token: input.token }); return { committed: true }; }
        });
        const replayed = await peerRuntime.mutation<{ token: string }, { committed: boolean }>("lab.postgres.commit.v1", { token: suffix }, { idempotencyKey: `outbox:${suffix}` });
        a(replayed.ok && deliveries === 1, "a separately constructed runtime and PostgreSQL adapter must replay without redelivering the outbox event");
        const outboxStats = await storePeer.getStats();
        a(outboxStats.delivered >= 1, "outbox should retain durable delivery state across adapter instances");

        let effects = 0;
        const inboxInput = { tenantId: `tenant-${suffix}`, consumerName: "reference-lab", messageId: `message-${suffix}` };
        const processed = await inbox.processOnce(inboxInput, async (client) => {
          effects += 1;
          await client.query("CREATE TABLE IF NOT EXISTS signal_reference_lab_consumer_effects (test_id text PRIMARY KEY, tenant_id text NOT NULL)");
          await client.query("INSERT INTO signal_reference_lab_consumer_effects (test_id, tenant_id) VALUES ($1, $2)", [suffix, inboxInput.tenantId]);
          const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM signal_reference_lab_consumer_effects WHERE test_id = $1", [suffix]);
          return Number(count.rows[0]?.count ?? 0);
        });
        const duplicate = await inboxPeer.processOnce(inboxInput, async () => { effects += 1; return 99; });
        a(processed.status === "processed" && processed.result === 1 && duplicate.status === "duplicate" && effects === 1, "transactional inbox should commit the consumer effect once and suppress duplicates");
        const rollbackInput = { ...inboxInput, messageId: `rollback-${suffix}` };
        let rollbackAttempts = 0;
        try {
          await inbox.processOnce(rollbackInput, async (client) => {
            rollbackAttempts += 1;
            await client.query("INSERT INTO signal_reference_lab_consumer_effects (test_id, tenant_id) VALUES ($1, $2)", [`rollback-${suffix}`, inboxInput.tenantId]);
            throw new Error("injected consumer failure");
          });
        } catch { /* expected: inbox claim and effect must roll back together */ }
        const recovered = await inbox.processOnce(rollbackInput, async (client) => {
          rollbackAttempts += 1;
          await client.query("INSERT INTO signal_reference_lab_consumer_effects (test_id, tenant_id) VALUES ($1, $2)", [`rollback-${suffix}`, inboxInput.tenantId]);
          const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM signal_reference_lab_consumer_effects WHERE test_id = $1", [`rollback-${suffix}`]);
          return Number(count.rows[0]?.count ?? 0);
        });
        a(recovered.status === "processed" && recovered.result === 1 && rollbackAttempts === 2, "failed consumer transaction must roll back both inbox claim and effect so retry can safely process once");

        a(await retryBudget.tryConsume(), "shared retry budget should grant its available token");
        a(!(await retryBudgetPeer.tryConsume()), "a separate PostgreSQL retry-budget adapter must observe the shared exhausted allowance");
        a(await breaker.tryAcquire(), "distributed breaker should grant an initial permit");
        a(await breaker.recordFailure(), "distributed breaker should record failure");
        a((await breakerPeer.snapshot())?.state === "open", "a separate breaker adapter must observe the shared open state");
        a(await breakerPeer.tryAcquire(new Date(Date.now() + 100)), "a separate breaker adapter should acquire the half-open probe after reset");
        a(await breakerPeer.recordSuccess(), "the peer breaker adapter should record successful probe");
        a((await breaker.snapshot())?.state === "closed", "successful peer probe should close shared breaker state");

        const sampleApp = createReferenceLab();
        const sampleRequest = await sampleApp.submitRequest({ tenantId: `tenant-${suffix}`, title: "Persist decision memory", description: "Verify decision and outcome memory survives a PostgreSQL round trip." });
        await sampleApp.addEvidence({ requestId: sampleRequest.id, tenantId: sampleRequest.tenantId, description: "Contract validated", source: "contract-registry", confidence: 0.95, verified: true });
        await sampleApp.addEvidence({ requestId: sampleRequest.id, tenantId: sampleRequest.tenantId, description: "Security validated", source: "security-review", confidence: 0.93, verified: true });
        await sampleApp.decide({ requestId: sampleRequest.id, tenantId: sampleRequest.tenantId, actor: "operator-1", approve: true, rationale: "Evidence meets the approval threshold." });
        await sampleApp.executeAction({ requestId: sampleRequest.id, tenantId: sampleRequest.tenantId, actor: "operator-1", kind: "persist-memory-test" });
        await sampleApp.recordOutcome({ requestId: sampleRequest.id, tenantId: sampleRequest.tenantId, result: "success", notes: "Memory persistence test completed." });
        const decisionRecord = sampleApp.listDecisionRecords()[0];
        const decisionReview = sampleApp.listDecisionReviews()[0];
        a(Boolean(decisionRecord && decisionReview), "reference lifecycle should produce decision and review records");
        if (decisionRecord && decisionReview) {
          await decisionMemory.saveDecisionRecord(decisionRecord);
          await decisionMemory.saveDecisionReview(decisionReview);
          a(Boolean(await decisionMemory.getDecisionRecord(decisionRecord.decisionId)), "PostgreSQL decision memory should retrieve the persisted decision");
          a((await decisionMemory.listDecisionReviews({ decisionId: decisionRecord.decisionId })).length === 1, "PostgreSQL decision memory should retrieve the persisted review");
        }

        const replayRecord = createReplayEvidenceRecord({ tenantId: `tenant-${suffix}`, executionId: `execution-${suffix}`, operationName: "lab.postgres.commit.v1", operationVersion: "v1", handlerArtifactDigest: "a".repeat(64), policyVersion: "reference-policy-v1", canonicalInput: { token: suffix }, externalReads: [], result: { committed: true } });
        await replayStore.save(replayRecord);
        const replayLoaded = await replayStore.get({ tenantId: replayRecord.tenantId, executionId: replayRecord.executionId });
        a(Boolean(replayLoaded) && verifyReplayEvidenceRecord(replayLoaded!), "PostgreSQL replay evidence should persist and verify");
        const crossTenantReplay = await replayStore.get({ tenantId: `other-${suffix}`, executionId: replayRecord.executionId });
        a(crossTenantReplay === null, "replay evidence must remain isolated across tenant scopes");

        const existingAudit = await auditLedger.readEntries({ limit: 10000 });
        auditHistory = existingAudit;
        const previous = auditHistory.at(-1) ?? null;
        const entry = createAuditChainEntry(previous, { operationName: "lab.postgres.commit.v1", operationKind: "mutation", messageId: `audit-${suffix}`, outcome: "completed" });
        auditHistory = [...auditHistory, entry];
        await auditLedger.appendEntry(entry);
        const checkpoint = signAuditCheckpoint(auditHistory, { keyId, privateKey });
        await auditLedger.appendCheckpoint(checkpoint);
        const persistedAudit = await auditLedger.readEntries({ limit: 10000 });
        const persistedCheckpoint = await auditLedger.latestCheckpoint();
        a(verifyChain(persistedAudit), "persisted audit chain should verify");
        a(Boolean(persistedCheckpoint) && verifyCheckpointAgainstChain(persistedCheckpoint!, persistedAudit), "persisted signed checkpoint should anchor the audit chain");
      } finally {
        await Promise.all([store.close(), storePeer.close(), inbox.close(), inboxPeer.close(), retryBudget.close(), retryBudgetPeer.close(), breakerPort.close(), breakerPeerPort.close(), replayStore.close(), auditLedger.close(), decisionMemory.close()]);
      }
    });
  } else {
    results.push({ id: "postgres-integration", title: "PostgreSQL adapter integration", target: "signal", status: "blocked", durationMs: 0, assertions: 0, failures: [], evidence: ["DATABASE_URL is not configured; durable persistence/outbox/inbox/distributed adapters were not exercised."] });
  }
  await run("kernel-pipeline", "Kernel plugin orchestration and replay reproduce the four-stage pipeline", async (a) => {
    const orchestrator = new SignalOrchestrator({ domain: "reference-lab", version: 1, maxConcurrentPipelines: 2 });
    const plugin = new StocksOptimizerPlugin();
    await orchestrator.registerPlugin(plugin);
    a(orchestrator.registeredPlugins.includes(plugin.id), "kernel should register the plugin");
    const input = { requestId: "kernel-case-1", amount: 42 };
    const original = await orchestrator.execute(input, "stocks-generator", "stocks-analyzer", "stocks-scorer", "stocks-aggregator");
    a(original.trace.length === 4, "pipeline should record all four stage traces");
    a((original.result as { decision: string }).decision === "hold", "reference plugin should produce its deterministic default decision");
    const replay = new ReplayEngine(orchestrator.eventBus, orchestrator.signalStore, orchestrator.decisionStore, orchestrator.pipelineRunner);
    const replayResult = await replay.replay(original.id, input, plugin.getGenerator!(), plugin.getAnalyzer!(), plugin.getScorer!(), plugin.getAggregator!());
    a(replayResult.match && replayResult.mismatches.length === 0, "kernel replay should reproduce the original pipeline result");
    await orchestrator.disposePlugin(plugin.id);
    a(!orchestrator.registeredPlugins.includes(plugin.id), "kernel should dispose and unregister the plugin");
  });
  if (process.env.SIGNAL_CLI_READY === "1") {
    await run("signal-cli", "Signal verification CLI validates its phase chain and stored artifacts", async (a) => {
      const cliDirectory = resolve(process.cwd(), "../../signal-cli");
      const output = execFileSync(process.execPath, ["dist/cli/index.js", "verify"], { cwd: cliDirectory, encoding: "utf8" });
      a(true, "Signal CLI verify exited successfully: " + output.slice(0, 240));
    });
  } else {
    results.push({ id: "signal-cli", title: "Signal CLI verification", target: "signal", status: "blocked", durationMs: 0, assertions: 0, failures: [], evidence: ["SIGNAL_CLI_READY is not set; the separate Signal CLI build/verify gate was not run."] });
  }
  await run("observability-metrics", "Prometheus metrics render bounded execution telemetry", async (a) => {
    const metrics = createPrometheusMetricsRecorder({ maxSeries: 100 });
    metrics.increment("signal.execution.started");
    metrics.increment("signal.execution.completed");
    metrics.timing("signal.execution.duration_ms", 12.5);
    const exposition = metrics.render();
    a(exposition.includes("signal_execution_started_total"), "Prometheus exposition should include execution counters");
    a(exposition.includes("signal_execution_duration_seconds_bucket"), "Prometheus exposition should include latency histogram buckets");
    a(metrics.seriesCount() > 0 && metrics.seriesCount() <= 100, "metric series should remain bounded by configured cardinality");
  });
  await run("invalid-input", "Malformed request is rejected by the Signal contract", async (a) => {
    const app = createReferenceLab(); let rejected = false;
    try { await app.submitRequest({ tenantId: "", title: "x", description: "short" }); } catch { rejected = true; }
    a(rejected, "invalid request should be rejected");
  });
  const cliResult = results.find((item) => item.id === "signal-cli");
  const cliPassed = cliResult?.status === "passed";
  const cliCapability = capabilityResults.find((item) => item.id === "cli.signal-verification");
  if (cliCapability) {
    cliCapability.status = cliPassed ? "exercised" : "not-verified";
    cliCapability.scenarios = cliPassed ? ["signal-cli"] : [];
    cliCapability.evidence = cliPassed ? "Signal CLI verify command exited successfully against its checked-in phase-chain and proof artifacts." : "Signal CLI verification was not run in this environment."; 
  }
  const postgresResult = results.find((item) => item.id === "postgres-integration");
  const postgresPassed = postgresResult?.status === "passed";
  const postgresIds = new Set(["postgres.idempotency", "postgres.transactional-outbox", "postgres.consumer-inbox", "postgres.audit-ledger", "postgres.replay-evidence", "postgres.retry-budget", "postgres.distributed-breaker", "postgres.transactions"]);
  for (const item of capabilityResults) {
    if (postgresIds.has(item.id)) {
      item.status = postgresPassed ? (item.id === "postgres.transactional-outbox" ? "partial" : "exercised") : "not-verified";
      item.scenarios = postgresPassed ? ["postgres-integration"] : [];
      if (postgresPassed) item.evidence = "PostgreSQL integration scenario passed against the configured database."; 
    }
    if (item.id === "outbox.durability") {
      item.status = postgresPassed ? "partial" : "not-verified";
      item.scenarios = postgresPassed ? ["postgres-integration"] : [];
      item.evidence = postgresPassed ? "Transactional outbox commit and delivery acknowledgement are exercised; crash recovery and stale-worker fencing are not." : "Durable outbox adapter is not exercised without PostgreSQL."; 
    }
    if (item.id === "inbox.transactionality") {
      item.status = postgresPassed ? "exercised" : "not-verified";
      item.scenarios = postgresPassed ? ["postgres-integration"] : [];
      item.evidence = postgresPassed ? "PostgreSQL transactional inbox commits one handler effect and deduplicates repeated delivery." : "Transactional inbox adapter is not exercised without PostgreSQL."; 
    }
    if (item.id === "runtime.idempotency" && postgresPassed) {
      item.status = "exercised";
      item.scenarios = ["idempotency", "concurrency", "postgres-integration"];
      item.evidence = "In-memory duplicate handling and PostgreSQL-backed durable idempotency replay are exercised."; 
      item.limitation = "Cross-host contention under production load remains unmeasured."; 
    }
    if (item.id === "resilience.retry-budgets") {
      item.scenarios = postgresPassed ? ["resilience", "postgres-integration"] : ["resilience"];
      item.evidence = postgresPassed ? "Local retry budget and PostgreSQL shared retry-budget exhaustion are exercised." : "Local retry budget is exercised; PostgreSQL shared coordination remains unverified."; 
    }
    if (item.id === "resilience.circuit-breakers") {
      item.scenarios = postgresPassed ? ["resilience", "postgres-integration"] : ["resilience"];
      item.evidence = postgresPassed ? "Local breaker transitions and PostgreSQL distributed breaker coordination are exercised." : "Local breaker transitions are exercised; distributed coordination remains unverified."; 
    }
    if (item.id === "audit.chain-checkpoints" && postgresPassed) {
      item.scenarios = ["audit-integrity", "postgres-integration"];
      item.evidence = "In-memory chain/checkpoint verification plus PostgreSQL append-only audit ledger and persisted signed checkpoints are exercised."; 
    }
    if (item.id === "replay.evidence" && postgresPassed) {
      item.scenarios = ["replay-evidence", "postgres-integration"];
      item.evidence = "Content-addressed record verification and tenant-scoped PostgreSQL replay evidence persistence are exercised."; 
    }
    if (item.id === "memory.lifecycle") {
      item.scenarios = postgresPassed ? ["lifecycle", "postgres-integration"] : ["lifecycle"];
      item.evidence = postgresPassed
        ? "In-memory lifecycle plus NeonPostgresAdapter decision/review persistence and retrieval are exercised."
        : "In-memory decision records and reviews are exercised; PostgreSQL persistence remains unverified."; 
    }
  }
  const cliPassed = results.some((item) => item.id === "signal-cli" && item.status === "passed");
  const cliCapability = capabilityResults.find((item) => item.id === "cli.signal-verification");
  if (cliCapability) {
    cliCapability.status = cliPassed ? "exercised" : "not-verified";
    cliCapability.scenarios = cliPassed ? ["signal-cli"] : [];
    cliCapability.evidence = cliPassed ? "The standalone Signal CLI verify command passed against the checked-in proof state." : "The standalone Signal CLI binary was not built or did not pass verification.";
  }
  for (const item of capabilityResults) {
    if (item.status === "not-verified" || item.status === "not-applicable") continue;
    const observed = item.scenarios.map((id) => results.find((result) => result.id === id)).filter((result): result is ScenarioResult => Boolean(result));
    const passedScenarios = observed.filter((result) => result.status === "passed").length;
    const nonPassingScenarios = observed.filter((result) => result.status !== "passed").length;
    if (observed.length === 0 || passedScenarios === 0) item.status = "not-verified";
    else if (nonPassingScenarios > 0) item.status = "partial";
  }
  const passed = results.filter((item) => item.status === "passed").length;
  const score = scoreEngineering(results, capabilityResults);
  return { results, capabilities: capabilityResults, score, summary: passed + "/" + results.length + " scenarios passed; " + results.filter((item) => item.status === "blocked").length + " blocked; " + results.filter((item) => item.status === "failed").length + " failed; " + capabilityResults.filter((item) => item.status === "exercised").length + "/" + capabilityResults.length + " capabilities directly exercised." };
}

export type Scorecard = { overall: number; dimensions: { name: string; weight: number; score: number; confidence: "high" | "medium" | "low"; evidence: string[] }[]; interpretation: string };
const weights = [{ name: "Functional correctness/effectiveness", weight: 18 }, { name: "Reliability/resilience", weight: 16 }, { name: "Performance/resource efficiency", weight: 12 }, { name: "Architecture/design", weight: 14 }, { name: "Security/privacy/integrity", weight: 12 }, { name: "Maintainability/evolvability", weight: 10 }, { name: "Testing/verification", weight: 8 }, { name: "Developer experience/adoption", weight: 6 }, { name: "Operability/delivery", weight: 4 }];
export function scoreEngineering(results: ScenarioResult[], inventory: Capability[]): Scorecard {
  const passRate = results.length ? results.filter((item) => item.status === "passed").length / results.length : 0;
  const statusWeight = (status: Capability["status"]) => status === "exercised" ? 1 : status === "partial" ? 0.5 : 0;
  const coverage = inventory.length ? inventory.reduce((sum, item) => sum + statusWeight(item.status), 0) / inventory.length : 0;
  const areaCoverage = (areas: string[]) => {
    const selected = inventory.filter((item) => areas.includes(item.area));
    return selected.length ? selected.reduce((sum, item) => sum + statusWeight(item.status), 0) / selected.length : 0;
  };
  const reliabilityCoverage = areaCoverage(["Events", "PostgreSQL", "Outbox", "Inbox", "Resilience", "Idempotency"]);
  const securityCoverage = areaCoverage(["Runtime", "HTTP binding", "Security", "Audit", "Replay", "Ports"]);
  const observabilityCoverage = areaCoverage(["Observability"]);
  const exercisedCount = inventory.filter((item) => item.status === "exercised").length;
  const partialCount = inventory.filter((item) => item.status === "partial").length;
  const unverifiedCount = inventory.filter((item) => item.status === "not-verified").length;
  const scores = [
    Math.min(10, 2 + passRate * 4 + coverage * 4),
    Math.min(10, 2 + passRate * 3 + reliabilityCoverage * 5),
    5,
    Math.min(10, 3 + coverage * 7),
    Math.min(10, 2 + securityCoverage * 6),
    Math.min(10, 2 + coverage * 4 + passRate * 4),
    Math.min(10, 2 + passRate * 5 + coverage * 3),
    Math.min(10, 2 + passRate * 3 + coverage * 3),
    Math.min(10, 2 + observabilityCoverage * 4)
  ];
  const evidenceByDimension = [
    [...results.map((item) => `${item.id}:${item.status} (${item.assertions} assertions${item.failureAttribution ? `; attribution=${item.failureAttribution}` : ""})`), `Capability coverage: ${exercisedCount} exercised, ${partialCount} partial, ${unverifiedCount} unverified.`],
    [`Reliability-related capability coverage: ${(reliabilityCoverage * 100).toFixed(0)}%.`, "PostgreSQL durability, outbox/inbox and distributed recovery remain unverified where not explicitly exercised."],
    ["Local in-process query benchmark reports latency/throughput/RSS.", "No production or cross-host baseline is included; score is neutral and low-confidence."],
    [`Weighted capability coverage across ${inventory.length} registered surfaces: ${(coverage * 100).toFixed(0)}%.`, "Public SDK operations; separate domain/evaluation modules; no private package imports."],
    [`Security/integrity capability coverage: ${(securityCoverage * 100).toFixed(0)}%.`, "No external identity provider or full adversarial security certification."],
    ["Maintainability score derives from demonstrated capability coverage and passing scenario ratio.", "Long-term migrations, multi-version compatibility and change-cost studies are not measured."],
    [`${results.filter((item) => item.status === "passed").length}/${results.length} scenarios passed.`, "Scenario assertions and capability evidence are independently reported."],
    ["Documented setup, local UI, CLI workflows and reproducible scenario commands.", "External developer adoption and first-run usability have not been independently evaluated."],
    [`Signal ObservabilityPort coverage: ${(observabilityCoverage * 100).toFixed(0)}%.`, "No deployed SLOs, on-call process or external telemetry backend is configured."]
  ];
  const dimensions = weights.map((dimension, index) => ({
    ...dimension,
    score: Number(scores[index].toFixed(1)),
    confidence: index === 2 || index === 8 || (index === 1 && reliabilityCoverage < 0.7) || (index === 4 && securityCoverage < 0.7) ? "low" as const : "medium" as const,
    evidence: evidenceByDimension[index]
  }));
  const overall = Number((dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100).toFixed(2));
  return {
    overall,
    dimensions,
    interpretation: "Provisional reference-app integration score, not a certification or production score for Signal. Scenario pass rate and weighted capability coverage both influence correctness and architecture scores. Unverified capabilities reduce coverage rather than being silently credited. Performance and operability remain low-confidence until production-like measurements and telemetry are connected."
  };
}
export function summarizeRequests(items: CaseRequest[]) { return { total: items.length, assessed: items.filter((item) => item.assessment).length, decided: items.filter((item) => item.decision).length, outcomes: items.filter((item) => item.outcome).length }; }
