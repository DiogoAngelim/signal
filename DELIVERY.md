# Delivery

Signal is packaged as a small, focused framework with documentation, examples, tests, and a clear public API.

## Included

- core framework code
- database abstraction and adapters
- event transport and event bus
- HTTP handler and validation
- authentication and access control
- shared utilities
- documentation set
- runnable example
- production-style test scenario

## What The Docs Cover

- `README.md` gives the overview and quick start
- `START_HERE.md` gives the reading order
- `QUICK_REFERENCE.md` gives the API cheat sheet
- `ARCHITECTURE.md` explains the layers
- `DESIGN.md` explains the trade-offs
- `EXTENDING.md` shows how to add custom pieces

## What To Do Next

1. Read `START_HERE.md`.
2. Run `npm run test`.
3. Copy the pattern from `EXAMPLE.ts`.
4. Add your first collection.
5. Swap in your real database and transport.

## Practical Deployment Targets

- Vercel
- Fly.io
- AWS Lambda
- Cloudflare Workers
- Express
- Fastify
- Hono
- Raw Node.js HTTP servers

## Design Summary

- explicit operations
- stateless runtime behavior
- immutable configuration
- deterministic error handling
- database-agnostic persistence
- transport-agnostic events

