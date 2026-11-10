import { createAgencyPipeline } from "@signal/agency";
import { reviewDecisionOutcome } from "@signal/decision";
import {
  createDecisionRecord,
  createInMemoryDecisionMemoryStore,
  createSignalRuntime,
  type SignalEventDefinition,
  type SignalExecutionContext,
  type SignalMutationDefinition,
  type SignalQueryDefinition,
} from "@signal/sdk-node";
import { z } from "zod";
import {
  assess,
  type Assessment,
  type CaseAction,
  type CaseRequest,
  type Decision,
  type Evidence,
  type LabEvent,
  type Outcome,
} from "./domain.js";

const requestInput = z.object({
  tenantId: z.string().min(1),
  title: z.string().min(3).max(160),
  description: z.string().min(8).max(4000),
});
const evidenceInput = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().min(1),
  description: z.string().min(3),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1),
  verified: z.boolean(),
});
const decisionInput = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().min(1),
  actor: z.string().min(1),
  approve: z.boolean(),
  rationale: z.string().min(8),
});
const actionInput = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().min(1),
  actor: z.string().min(1),
  kind: z.string().min(1).max(120),
});
const outcomeInput = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().min(1),
  result: z.enum(["success", "failure", "partial", "unknown"]),
  notes: z.string().max(2000),
});

export function createReferenceLab(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const requests = new Map<string, CaseRequest>();
  const events: LabEvent[] = [];
  const inFlightSubmissions = new Map<string, Promise<CaseRequest>>();
  const memory = createInMemoryDecisionMemoryStore();
  const agency = createAgencyPipeline({
    policy: { minimumConfidence: 0.7, humanApprovalRequired: true },
    clock: now,
  });
  const seen = new Set<string>();
  const telemetry: unknown[] = [];
  const runtime = createSignalRuntime({
    runtimeName: "signal-reference-lab",
    bindings: { inProcess: true },
    requireMutationAuthorization: true,
    observabilityPort: {
      emit(context) {
        telemetry.push(context);
      },
    },
  });

  const publish = async (
    name: string,
    request: CaseRequest,
    payload: Record<string, unknown>,
  ) => {
    const event: LabEvent = {
      id: `${name}:${request.id}:${events.length + 1}`,
      name,
      requestId: request.id,
      tenantId: request.tenantId,
      occurredAt: now().toISOString(),
      payload,
    };
    await runtime.publish(name, event, context("reference-lab", event.id));
    events.push(event);
    return event;
  };

  const query = {
    name: "lab.request.get.v1",
    kind: "query" as const,
    description: "Read a request within its tenant boundary.",
    inputSchema: z.object({ requestId: z.string(), tenantId: z.string() }),
    resultSchema: z.object({ request: z.any().nullable() }),
    handler: (input: { requestId: string; tenantId: string }) => {
      const item = requests.get(input.requestId);
      return {
        request:
          item?.tenantId === input.tenantId ? structuredClone(item) : null,
      };
    },
  };

  const submit = {
    name: "lab.request.submit.v1",
    kind: "mutation" as const,
    idempotency: "required" as const,
    description: "Create a case request exactly once for a supplied idempotency key.",
    authorize: authorizeMutation,
    inputSchema: requestInput,
    resultSchema: z.object({ request: z.any() }),
    async handler(input: z.infer<typeof requestInput>) {
      const id = `case-${hash(`${input.tenantId}:${input.title}:${input.description}`)}`;
      const existing = requests.get(id);
      if (existing) return { request: structuredClone(existing) };
      const request: CaseRequest = {
        id,
        tenantId: input.tenantId,
        title: input.title,
        description: input.description,
        status: "received",
        createdAt: now().toISOString(),
        evidence: [],
      };
      requests.set(id, request);
      await publish("lab.request.received.v1", request, {
        title: request.title,
      });
      return { request: structuredClone(request) };
    },
  };

  const addEvidence = {
    name: "lab.evidence.add.v1",
    kind: "mutation" as const,
    idempotency: "required" as const,
    description: "Attach sourced evidence and run Signal's decision assessment.",
    authorize: authorizeMutation,
    inputSchema: evidenceInput,
    resultSchema: z.object({ evidence: z.any(), assessment: z.any() }),
    async handler(input: z.infer<typeof evidenceInput>) {
      const request = requireTenant(requests, input.requestId, input.tenantId);
      const evidence: Evidence = {
        id: `evidence-${hash(`${input.requestId}:${input.source}:${input.description}`)}`,
        ...input,
        observedAt: now().toISOString(),
      };
      if (!request.evidence.some((item) => item.id === evidence.id)) {
        request.evidence.push(evidence);
      }
      request.assessment = assess(request, now());
      request.status = "assessed";
      await publish("lab.request.assessed.v1", request, {
        evidenceCount: request.evidence.length,
        confidence: request.assessment.confidence,
        recommendation: request.assessment.recommendation,
        semanticState: request.assessment.semanticState.word,
        commitmentStatus: request.assessment.commitment.status,
      });
      return { evidence, assessment: request.assessment };
    },
  };

  const decide = {
    name: "lab.decision.record.v1",
    kind: "mutation" as const,
    idempotency: "required" as const,
    description: "Record an accountable decision after assessment.",
    authorize: authorizeMutation,
    inputSchema: decisionInput,
    resultSchema: z.object({ decision: z.any() }),
    async handler(input: z.infer<typeof decisionInput>) {
      const request = requireTenant(requests, input.requestId, input.tenantId);
      if (!request.assessment) {
        throw new Error("An assessment is required before a decision.");
      }
      if (
        request.assessment.recommendation === "investigate" &&
        input.approve
      ) {
        throw new Error(
          "Insufficient verified evidence: approval is blocked.",
        );
      }
      const decision: Decision = {
        id: `decision-${hash(`${request.id}:${input.actor}:${input.rationale}`)}`,
        result: input.approve ? "approved" : "rejected",
        rationale: input.rationale,
        actor: input.actor,
        decidedAt: now().toISOString(),
      };
      request.decision = decision;
      request.status = input.approve ? "approved" : "rejected";

      const record = createDecisionRecord({
        decisionId: decision.id,
        source: "signal-reference-lab",
        appId: "signal-reference-lab",
        domain: "case-management",
        timestamp: decision.decidedAt,
        version: "v1",
        observation: {
          requestId: request.id,
          title: request.title,
          evidence: request.evidence,
        },
        assessment: request.assessment.signalAssessment,
        coherence: {
          score: Math.round(request.assessment.confidence * 100),
          status: request.assessment.risk > 0.55 ? "tension" : "stable",
          contradictions: [],
          consensusLevel: Math.round(request.assessment.confidence * 100),
          actionAllowed: input.approve,
          actionScale: input.approve ? 1 : 0,
          trustAdjustment: 0,
          agencyAdjustment: 0,
          confidenceAdjustment: 0,
          explanation: [request.assessment.rationale],
        },
        action: { result: decision.result, actor: decision.actor },
        humanSummary: decision.rationale,
        retentionTier: "hot",
      });
      await memory.saveDecisionRecord(record);
      agency.runAgencyCycle({
        decision: {
          decisionId: decision.id,
          kind: "case-decision",
          confidence: request.assessment.confidence,
          rationale: decision.rationale,
          expectedOutcome:
            "The recorded decision will be reviewed against an observed outcome.",
        },
        sizing: {
          size: request.assessment.commitment.totalRecommended,
          unit: "case-capacity",
        },
        action: input.approve
          ? { kind: "authorize-case-action", performedAt: decision.decidedAt }
          : undefined,
        approvalGranted: input.approve,
        blockReasons: request.assessment.commitment.blockedBy,
      });
      await publish("lab.decision.recorded.v1", request, {
        decisionId: decision.id,
        result: decision.result,
        actor: decision.actor,
      });
      return { decision };
    },
  };

  const executeAction = {
    name: "lab.action.execute.v1",
    kind: "mutation" as const,
    idempotency: "required" as const,
    description: "Execute an explicitly approved case action exactly once.",
    authorize: authorizeMutation,
    inputSchema: actionInput,
    resultSchema: z.object({ action: z.any() }),
    async handler(input: z.infer<typeof actionInput>) {
      const request = requireTenant(requests, input.requestId, input.tenantId);
      if (!request.decision || request.decision.result !== "approved") {
        throw new Error(
          "An approved decision is required before action execution.",
        );
      }
      if (request.action) return { action: structuredClone(request.action) };
      const action: CaseAction = {
        id: `action-${hash(`${request.id}:${input.kind}:${input.actor}`)}`,
        kind: input.kind,
        executedBy: input.actor,
        executedAt: now().toISOString(),
        result: "completed",
      };
      request.action = action;
      request.status = "executed";
      await publish("lab.action.executed.v1", request, {
        actionId: action.id,
        kind: action.kind,
        actor: action.executedBy,
      });
      return { action };
    },
  };

  const outcome = {
    name: "lab.outcome.record.v1",
    kind: "mutation" as const,
    idempotency: "required" as const,
    description: "Record the observed outcome after an approved action.",
    authorize: authorizeMutation,
    inputSchema: outcomeInput,
    resultSchema: z.object({ outcome: z.any() }),
    async handler(input: z.infer<typeof outcomeInput>) {
      const request = requireTenant(requests, input.requestId, input.tenantId);
      if (!request.decision || !request.action) {
        throw new Error(
          "An approved decision and executed action are required before recording an outcome.",
        );
      }
      const recordedAt = now().toISOString();
      const learningReview = reviewDecisionOutcome({
        decisionId: request.decision.id,
        reviewId: `review-${hash(`${request.id}:${input.result}:${input.notes}`)}`,
        reviewedAt: recordedAt,
        whatHappened: input.notes,
        why: `Outcome classified as ${input.result} after the recorded decision.`,
        lessons: [
          `Review future comparable requests against this observed outcome: ${input.result}.`,
        ],
      });
      const result: Outcome = {
        id: `outcome-${hash(`${request.id}:${input.result}:${input.notes}`)}`,
        result: input.result,
        notes: input.notes,
        recordedAt,
        learningReview,
      };
      request.outcome = result;
      request.status = "reviewed";
      await memory.saveDecisionReview({
        reviewId: learningReview.reviewId,
        decisionId: request.decision.id,
        appId: "signal-reference-lab",
        domain: "case-management",
        timestamp: recordedAt,
        version: "v1",
        source: "signal-reference-lab",
        reviewedAt: recordedAt,
        classification:
          input.result === "success"
            ? "correct"
            : input.result === "failure"
              ? "wrong"
              : "inconclusive",
        whatWasRecommended: request.decision.result,
        whyRecommended: request.decision.rationale,
        whatHappened: input.notes,
        lesson: learningReview.learning.whatShouldChange,
        confidenceAdjustment: 0,
        trustAdjustment: 0,
        metadata: { outcome: input.result },
      });
      agency.runAgencyCycle({
        decision: {
          decisionId: request.decision.id,
          kind: "case-decision",
          confidence: request.assessment?.confidence ?? 0,
          rationale: request.decision.rationale,
        },
        outcome: {
          success:
            input.result === "success"
              ? true
              : input.result === "failure"
                ? false
                : null,
          outcomeLabel:
            input.result === "success"
              ? "positive"
              : input.result === "failure"
                ? "negative"
                : input.result === "partial"
                  ? "neutral"
                  : "unknown",
        },
      });
      await publish("lab.outcome.recorded.v1", request, {
        outcomeId: result.id,
        result: result.result,
      });
      return { outcome: result };
    },
  };

  for (const operation of [
    query,
    submit,
    addEvidence,
    decide,
    executeAction,
    outcome,
  ]) {
    if (operation.kind === "query") {
      runtime.registerQuery(operation as SignalQueryDefinition);
    } else {
      runtime.registerMutation(operation as SignalMutationDefinition);
    }
  }

  for (const name of [
    "lab.request.received.v1",
    "lab.request.assessed.v1",
    "lab.decision.recorded.v1",
    "lab.action.executed.v1",
    "lab.outcome.recorded.v1",
  ]) {
    runtime.registerEvent({
      name,
      kind: "event",
      description: `Reference Lab lifecycle event: ${name}`,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.object({ accepted: z.boolean() }),
      handler: () => ({ accepted: true }),
    } as SignalEventDefinition);
    runtime.subscribe(
      name,
      (envelope) => {
        if (!seen.has(envelope.messageId)) seen.add(envelope.messageId);
      },
      { consumerId: "reference-lab-journal", replaySafe: true },
    );
  }

  return {
    runtime,
    events,
    memory,
    agency,
    listTelemetry() {
      return [...telemetry];
    },
    listAgencyTraces() {
      return agency.memory.list();
    },
    async listDecisionRecords() {
      return memory.listDecisionRecords();
    },
    async listDecisionReviews() {
      return memory.listDecisionReviews();
    },
    listRequests(tenantId: string) {
      return [...requests.values()]
        .filter((item) => item.tenantId === tenantId)
        .map((item) => structuredClone(item));
    },
    submitRequest(input: z.infer<typeof requestInput>) {
      const key = hash(JSON.stringify(input));
      const inFlight = inFlightSubmissions.get(key);
      if (inFlight) return inFlight.then((request) => structuredClone(request));
      const operation = (async () => {
        const result = await runtime.mutation<
          z.infer<typeof requestInput>,
          { request: CaseRequest }
        >("lab.request.submit.v1", input, {
          ...context("lab-ui"),
          idempotencyKey: `submit:${key}`,
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.result.request as CaseRequest;
      })();
      inFlightSubmissions.set(key, operation);
      return operation.then(
        (request) => structuredClone(request),
        (error) => { throw error; },
      ).finally(() => inFlightSubmissions.delete(key));
    },
    async addEvidence(input: z.infer<typeof evidenceInput>) {
      const result = await runtime.mutation<
        z.infer<typeof evidenceInput>,
        { evidence: Evidence; assessment: Assessment }
      >("lab.evidence.add.v1", input, {
        ...context("lab-ui"),
        idempotencyKey: `evidence:${hash(JSON.stringify(input))}`,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.result as { evidence: Evidence; assessment: Assessment };
    },
    async decide(input: z.infer<typeof decisionInput>) {
      const result = await runtime.mutation<
        z.infer<typeof decisionInput>,
        { decision: Decision }
      >("lab.decision.record.v1", input, {
        ...context("lab-ui"),
        idempotencyKey: `decision:${hash(JSON.stringify(input))}`,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.result.decision as Decision;
    },
    async executeAction(input: z.infer<typeof actionInput>) {
      const result = await runtime.mutation<
        z.infer<typeof actionInput>,
        { action: CaseAction }
      >("lab.action.execute.v1", input, {
        ...context("lab-ui"),
        idempotencyKey: `action:${hash(JSON.stringify(input))}`,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.result.action as CaseAction;
    },
    async recordOutcome(input: z.infer<typeof outcomeInput>) {
      const result = await runtime.mutation<
        z.infer<typeof outcomeInput>,
        { outcome: Outcome }
      >("lab.outcome.record.v1", input, {
        ...context("lab-ui"),
        idempotencyKey: `outcome:${hash(JSON.stringify(input))}`,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.result.outcome as Outcome;
    },
    async getRequest(requestId: string, tenantId: string) {
      const result = await runtime.query<
        { requestId: string; tenantId: string },
        { request: CaseRequest | null }
      >(
        "lab.request.get.v1",
        { requestId, tenantId },
        context("lab-ui"),
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result.request as CaseRequest | null;
    },
  };
}

function requireTenant(
  store: Map<string, CaseRequest>,
  id: string,
  tenantId: string,
): CaseRequest {
  const item = store.get(id);
  if (!item || item.tenantId !== tenantId) throw new Error("Request not found.");
  return item;
}

function context(system: string, causationId?: string) {
  return {
    auth: { subject: system, scopes: ["lab:write"] },
    causationId,
    source: {
      system,
      transport: "in-process",
      runtime: "signal-reference-lab",
    },
    meta: { scenario: "reference-lifecycle" },
  };
}

function authorizeMutation(_input: unknown, execution: SignalExecutionContext) {
  if (!execution.request.auth?.subject || !execution.request.auth.scopes?.includes("lab:write")) {
    throw new Error("Trusted lab:write authorization is required.");
  }
}

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) {
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  }
  return (result >>> 0).toString(36);
}
