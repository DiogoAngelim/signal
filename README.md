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
client/              frontend applications
server/              backend packages and reference server
examples/            runnable examples and example-only integrations
packages/            reusable Signal domain packages
docs/README.md       single documentation index
spec/                protocol RFCs
schemas/             published JSON schemas
```

Core protocol/runtime code lives in `api/`. Backend implementation packages
live in `server/`. Example-only packages, including climate forecast, live in
`examples/`. The landing app was removed.

## Common Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm verify:exports
pnpm -r --if-present --sort run test:coverage
```

Read the full documentation in [docs/README.md](docs/README.md).

## License

MIT
