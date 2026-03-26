export const signalEnvelopeJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://signal.dev/schemas/signal-envelope.schema.json",
  title: "Signal Envelope",
  type: "object",
  required: ["protocol", "kind", "name", "messageId", "timestamp", "payload"],
  properties: {
    protocol: { const: "signal.v1" },
    kind: { enum: ["query", "mutation", "event"] },
    name: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*\\.[a-z][a-z0-9-]*\\.v[1-9][0-9]*$",
    },
    messageId: { type: "string", minLength: 1 },
    timestamp: { type: "string", format: "date-time" },
    source: { type: "object", additionalProperties: true },
    context: { type: "object", additionalProperties: true },
    delivery: { type: "object", additionalProperties: true },
    auth: { type: "object", additionalProperties: true },
    payload: {},
    meta: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
};

export const signalErrorJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://signal.dev/schemas/error.schema.json",
  title: "Signal Error",
  type: "object",
  required: ["code", "message"],
  properties: {
    code: {
      enum: [
        "BAD_REQUEST",
        "VALIDATION_ERROR",
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
    message: { type: "string" },
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
        meta: { type: "object", additionalProperties: true },
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
    bindings: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
};
