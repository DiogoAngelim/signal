# Reference Server

This app runs the Signal Node.js reference runtime behind the HTTP binding.

## What It Demonstrates

- in-process runtime registration
- `GET /signal/capabilities`
- `POST /signal/query/:name`
- `POST /signal/mutation/:name`
- generic example operations from `packages/examples`
- PostgreSQL-backed idempotency when `DATABASE_URL` is set

## Registered Surface

- `note.get.v1`
- `post.get.v1`
- `post.publish.v1`
- `post.published.v1`

## Run

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

## Environment

- `SIGNAL_HTTP_PORT`
- `DATABASE_URL`
