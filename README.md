# Signal

Signal is a TypeScript workspace for defining operational behavior as
versioned **Queries**, **Mutations**, and **Events**. The repo is organized by
runtime ownership instead of by historical app names.

## Start Here

```bash
pnpm install
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start
```

Then call the reference server:

```bash
curl -X POST http://127.0.0.1:3001/signal/query/note.get.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"noteId":"note_1001"}}'
```

## Folder Shape

```txt
api/                 client/server interface packages
server/              backend packages and reference server
examples/            runnable examples and example-only integrations
packages/            reusable Signal domain packages
docs/README.md       single documentation index
spec/                protocol RFCs and contract assets
spec/contracts/      published schemas and shared fixtures
```

Core protocol/runtime code lives in `api/`. Backend implementation packages
live in `server/`. Example-only packages, including operation examples and
climate forecast, live in `examples/`. Published schemas and shared fixtures
live together under `spec/contracts/`. The landing app was removed.

`@signal/decision` also exposes Stewardship, a domain-agnostic layer for
turning memory, outcomes, governance, threats, protections, and uncertainty
into the smallest responsible next step.

## Common Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm verify:exports
pnpm -r --if-present --sort run test:coverage
```

Read the full documentation in [docs/README.md](docs/README.md).

## Example App Links

- Aware: <https://aware-guide.vercel.app>
- Emergency Awareness: <https://weather-awareness.vercel.app>
- Stocks Optimizer: <https://stocks-optimizer.vercel.app>

## License

MIT
