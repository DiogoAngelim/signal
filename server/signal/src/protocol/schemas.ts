export const signalEnvelopeJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://signal.dev/schemas/signal-envelope.schema.json",
  title: "Signal Envelope",
  type: "object",
  required: [
    "protocol",
    "kind",
    "name",
    "messageId",
    "timestamp",
    "traceId",
    "payload",
  ],
  properties: {
    protocol: { const: "signal.v1" },
    kind: { enum: ["query", "mutation", "event"] },
    name: {
      type: "string",
      pattern:
        "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*\\.[a-z][a-z0-9-]*\\.v[1-9][0-9]*$",
    },
    messageId: { type: "string", minLength: 1 },
    timestamp: { type: "string", format: "date-time" },
    traceId: { type: "string", minLength: 1 },
    source: { type: "object", additionalProperties: true },
    context: { type: "object", additionalProperties: true },
    delivery: { type: "object", additionalProperties: true },
    auth: {
      type: "object",
      properties: {
        actor: { type: "object", additionalProperties: true },
        subject: { type: "string" },
        scopes: {
          type: "array",
          items: { type: "string" },
        },
      },
      additionalProperties: true,
    },
    payload: {},
    meta: {
      type: "object",
      properties: {
        idempotencyKey: { type: "string" },
        replay: { type: "boolean" },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

export const signalErrorJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://signal.dev/schemas/error.schema.json",
  title: "Signal Error",
  type: "object",
  required: ["code", "category", "message"],
  properties: {
    code: {
      enum: [
        "VALIDATION_ERROR",
        "POLICY_REJECTED",
        "EXECUTION_FAILED",
        "TIMEOUT",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "IDEMPOTENCY_CONFLICT",
        "INTERNAL_ERROR",
        "RETRYABLE_ERROR",
        "UNSUPPORTED_OPERATION",
      ],
    },
    category: {
      enum: [
        "validation",
        "policy",
        "execution",
        "timeout",
        "authorization",
        "idempotency",
        "runtime",
        "capability",
      ],
    },
    message: { type: "string" },
    traceId: { type: "string" },
    messageId: { type: "string" },
    retryable: { type: "boolean" },
    details: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
};

export const signalResultJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://signal.dev/schemas/result.schema.json",
  title: "Signal Result",
  oneOf: [
    {
      type: "object",
      required: ["ok", "result"],
      properties: {
        ok: { const: true },
        result: {},
        meta: {
          type: "object",
          properties: {
            outcome: {
              enum: ["completed", "replayed"],
            },
            durationMs: {
              type: "number",
              minimum: 0,
            },
            context: { type: "object", additionalProperties: true },
            idempotency: { type: "object", additionalProperties: true },
            replay: { type: "object", additionalProperties: true },
            deadline: { type: "object", additionalProperties: true },
            delivery: { type: "object", additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    {
      type: "object",
      required: ["ok", "error"],
      properties: {
        ok: { const: false },
        error: { $ref: "https://signal.dev/schemas/error.schema.json" },
      },
      additionalProperties: true,
    },
  ],
};

export const signalCapabilitiesJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://signal.dev/schemas/capabilities.schema.json",
  title: "Signal Capabilities",
  type: "object",
  required: [
    "protocol",
    "version",
    "queries",
    "mutations",
    "publishedEvents",
    "subscribedEvents",
  ],
  properties: {
    protocol: { const: "signal.v1" },
    version: { const: "v1" },
    queries: { type: "array" },
    mutations: { type: "array" },
    publishedEvents: { type: "array" },
    subscribedEvents: { type: "array" },
    features: { type: "object", additionalProperties: true },
    bindings: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
};
