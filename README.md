# What Is Signal?

Signal helps teams understand operational workflows through **Queries**,
**Mutations**, and **Events**.

Use Signal when you want one clear way to:

- observe current state with a Query
- describe an intentional change with a Mutation
- preserve what happened with an Event
- expose the same behavior through HTTP or another transport later

Here is the whole idea:

```txt
Application -> Source -> Signal -> Runtime -> Action -> Adapter -> Result
```

## Quick Start

Install dependencies:

```bash
pnpm install
```

Build the reference server and the packages it needs:

```bash
pnpm --filter @signal/reference-server... build
```

Start Signal:

```bash
pnpm --filter @signal/reference-server start
```

In another terminal, send your first Query:

```bash
curl -X POST http://127.0.0.1:3001/signal/query/note.get.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"noteId":"note_1001"}}'
```

Publish your first post. This Mutation also creates an Event:

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/post.publish.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "postId": "post_1001",
      "title": "Protocol first",
      "body": "Signal keeps transport and execution concerns separate."
    },
    "idempotencyKey": "publish-post_1001-001"
  }'
```

Observe the Event:

```bash
curl http://127.0.0.1:3001/signal/observed-events
```

## Where To Go

- New to the project: read [What Is Signal?](docs/docs/what-is-signal.md)
- Running locally: read [Quick Start](docs/docs/start/quick-start.md)
- Building your first app: read [Build Your First App](docs/docs/build/first-app.md)
- Looking for APIs: read [API Reference](docs/docs/reference/api.md)
- Contributing: read [Repository Map](docs/docs/contribute/repository-map.md)

## Repository Map

```txt
packages/protocol              Protocol names, envelopes, results, errors
packages/runtime               Query, Mutation, Event execution
packages/sdk-node              defineQuery, defineMutation, defineEvent helpers
packages/binding-http          HTTP routes for Signal runtimes
packages/idempotency-postgres  PostgreSQL idempotency store
packages/examples              Small runnable examples
apps/reference-server          Beginner-friendly HTTP server
docs                           Beginner docs
spec                           Protocol RFCs and fixtures
schemas                        Published JSON schemas
```

Some older or compatibility areas still exist. They are documented in the
repository map and were kept because imports, tests, workspace entries, or
deployment config still reference them.

## Validate

Core checks:

```bash
pnpm --filter @signal/protocol test
pnpm --filter @signal/runtime test
pnpm --filter @signal/sdk-node test
pnpm --filter @signal/binding-http test
pnpm --filter @signal/examples test
pnpm --filter @signal/reference-server test
pnpm --filter @signal/docs build
```

## License

MIT
