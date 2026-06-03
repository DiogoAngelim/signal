# Signal

Signal makes dangerous backend operations explicit, replay-safe, and
auditable.

It is a production correctness standard for versioned **Queries**,
**Mutations**, and **Events**. It is not a framework replacement, workflow
engine, message broker, database, auth provider, API gateway, full-stack
platform, or payment network.

## Understand Signal Fast

In 10 seconds: Signal makes dangerous backend operations explicit,
replay-safe, and auditable.

In 30 seconds: applications define reads as Queries, dangerous state changes as
Mutations, and completed facts as Events. Signal gives those operations stable
names, schemas, idempotency, replay metadata, subscriber dedupe, audit evidence,
and certification.

In 5 minutes, a developer should be able to run the reference proof, execute a
dangerous mutation, retry it safely, observe replay, observe conflict, observe
emitted events, observe audit evidence, and run certification.

## Start Here

```bash
pnpm install
pnpm proof:reference
```

The proof executes `payment.capture.v1`, retries it with the same idempotency
key, forces an idempotency conflict, verifies redacted audit and outbox
evidence, checks subscriber dedupe, and runs `reference.certification.v1`.

To inspect the HTTP binding too:

```bash
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start
```

Then call the dangerous mutation:

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{"idempotencyKey":"tenant_acme:capture:readme","auth":{"actor":{"id":"ops_alice"},"subject":"tenant:tenant_acme","scopes":["payment:capture","tenant:tenant_acme"]},"payload":{"tenantId":"tenant_acme","authorizationId":"auth_readme","amountCents":12500,"currency":"USD","paymentMethod":{"token":"tok_live_secret","last4":"4242"},"risk":{"declared":true,"classification":"high","reason":"Customer-visible payment capture moves funds.","approvedBy":"ops_alice"}}}'
```

## Folder Shape

```txt
api/                 client/server interface packages
server/              backend packages and reference server
examples/            runnable examples and example-only integrations
packages/            reusable Signal domain packages
frontend/            reserved local frontend support, not a workspace package
docs/README.md       single documentation index
docs/constitution.md Signal standard and change rules
docs/*-audit.md      focused architecture and quality audits
spec/                protocol RFCs and contract assets
spec/contracts/      published schemas and shared fixtures
```

Core protocol/runtime code lives in `api/`. Backend implementation packages
live in `server/`. Example-only packages and runnable frontends live in
`examples/`. `frontend/` is reserved local support and is not currently a
pnpm workspace package. Published schemas and shared fixtures live together
under `spec/contracts/`. The landing app was removed.

`@signal/decision` owns the reusable decision-quality model: evidence
assessment, confidence caps, assumption and contradiction visibility, decision
journals, outcome reviews, learning records, and derived stewardship/governance
views. New application code should prefer `@signal/decision/core`; product apps
own their domain language, APIs, metrics, and UX.

## Common Commands

```bash
pnpm proof:reference
pnpm proof:reference:postgres # requires DATABASE_URL
pnpm db:migrate              # requires DATABASE_URL
pnpm release:library
pnpm test
pnpm typecheck
pnpm lint
pnpm verify:exports
pnpm -r --if-present --sort run test:coverage
```

Before production changes, run the non-example library surface when you are not
working on apps:

```bash
pnpm typecheck:library
pnpm lint:library
pnpm test:library
pnpm verify:exports
```

Read the full documentation in [docs/README.md](docs/README.md).

## Example App Links

- Aware: <https://aware-guide.vercel.app>
- Emergency Awareness: <https://weather-awareness.vercel.app>
- Stocks Optimizer: <https://stocks-optimizer.vercel.app>

## License

MIT
