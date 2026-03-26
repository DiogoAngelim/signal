# Signal

Signal is a transport-agnostic application protocol for versioned queries, explicit mutations, and immutable events.

## What Lives Where

- [Protocol specs](spec/) define the contract.
- [Reference packages](packages/) implement the contract in TypeScript.
- [Reference server](apps/reference-server/) shows the HTTP binding and the runtime together.
- [Docs site](docs/) explains the protocol for adoption.
- [Examples](packages/examples/) show the domain flows end to end.

## Protocol In One Envelope

```json
{
  "protocol": "signal.v1",
  "kind": "mutation",
  "name": "payment.capture.v1",
  "messageId": "7c1f2a6f-7ec1-4f89-8e0f-9d0f4a97c9a1",
  "timestamp": "2026-03-25T12:00:00.000Z",
  "payload": {
    "paymentId": "pay_1001",
    "amount": 120,
    "currency": "USD"
  }
}
```

## Mutation Flow

1. A client sends `payment.capture.v1` with an idempotency key.
2. The runtime validates the input and checks the idempotency store.
3. The mutation either executes once or replays the stored result.
4. The mutation emits `payment.captured.v1` with causation metadata.

## Start Reading

- [Introduction](docs/docs/introduction.md)
- [Envelope reference](docs/docs/reference/envelope.md)
- [Quickstart](docs/docs/guides/quickstart.md)
- [RFC-0001: Protocol core](spec/RFC-0001-signal-protocol-core.md)
- [RFC-0002: HTTP binding](spec/RFC-0002-signal-http-binding.md)
- [Reference server runbook](apps/reference-server/README.md)
- [Payment capture example](packages/examples/payment-capture/README.md)

## Repository Layout

- `spec/` holds the public RFCs.
- `schemas/` holds JSON Schema artifacts for public protocol documents.
- `packages/protocol` holds envelope, naming, result, capability, and error validation.
- `packages/runtime` holds the Node reference runtime.
- `packages/binding-http` holds the HTTP binding.
- `packages/idempotency-postgres` holds the PostgreSQL idempotency store.
- `packages/sdk-node` holds convenience helpers for Node applications.
- `packages/examples` holds runnable example flows.
- `apps/reference-server` holds the runnable HTTP reference server.
- `docs/` holds the Docusaurus documentation site.
- `landing/` holds the public homepage.

## Local Development

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

The reference server uses the PostgreSQL-backed idempotency store when `DATABASE_URL` is set. Without it, the server falls back to the in-memory store so the protocol flow can still be exercised locally.
