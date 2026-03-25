# Start Here

This page is the fastest way to get oriented.

## Recommended Reading Order

1. Open `EXAMPLE.ts` first to see the framework in motion.
2. Read `README.md` for the short overview and quick start.
3. Use `QUICK_REFERENCE.md` when you need the API names.
4. Read `ARCHITECTURE.md` if you want to understand the layers.
5. Read `DESIGN.md` if you want the reasoning behind the design.
6. Read `EXTENDING.md` when you want to add custom pieces.

## If You Want To...

- Build something quickly: start with `EXAMPLE.ts`
- Understand the mental model: read `README.md`
- Find an API fast: open `QUICK_REFERENCE.md`
- Learn how it is wired together: open `ARCHITECTURE.md`
- Learn the trade-offs: open `DESIGN.md`
- Extend Signal: open `EXTENDING.md`

## Project Snapshot

```
signal/
├── README.md
├── START_HERE.md
├── QUICK_REFERENCE.md
├── ARCHITECTURE.md
├── DESIGN.md
├── EXTENDING.md
├── FEATURES.md
├── IMPLEMENTATION.md
├── DELIVERY.md
├── WELCOME.md
├── COMPLETION_SUMMARY.md
├── EXAMPLE.ts
├── index.ts
└── packages/
```

## Quick Commands

```bash
npm install
npm run build
npm run test
```

## Core Ideas

- **Named operations**: `posts.list`, `posts.create`
- **Collections**: group related queries and mutations
- **Queries**: read-only operations
- **Mutations**: write operations and event emission
- **Idempotency**: repeated mutation requests can replay stored results
- **Versioning**: explicit expected versions prevent stale writes
- **Events**: replay-safe and dedupable per consumer
- **Context**: immutable data passed into handlers
- **Access rules**: declarative checks run before execution

## Good First Tasks

1. Copy the pattern from `EXAMPLE.ts`.
2. Add one collection.
3. Add one public query.
4. Add one authenticated mutation.
5. Run `npm run test`.

## Common Questions

- **Is Signal full-stack?** No. It is backend-only.
- **Does it keep server state?** No. It is designed to be stateless.
- **Can I swap databases?** Yes. The database layer is abstracted.
- **Can I use my own transport?** Yes. The transport layer is swappable.
- **Can I deploy serverless?** Yes. That is a primary target.
- **Can I retry writes safely?** Yes, if you provide an idempotency key.
- **Can I avoid duplicate event work?** Yes, with per-consumer dedupe support in the transport.
