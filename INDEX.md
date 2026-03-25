# Documentation Index

Use this as the table of contents for the repo.

## Where To Start

1. `START_HERE.md` - best first stop
2. `EXAMPLE.ts` - runnable example
3. `README.md` - overview and quick start
4. `QUICK_REFERENCE.md` - API cheat sheet

## Learn The System

5. `ARCHITECTURE.md` - how the layers fit together
6. `DESIGN.md` - design principles and trade-offs
7. `FEATURES.md` - full feature list

## Build And Extend

8. `EXTENDING.md` - custom adapters, transport, logger, and middleware patterns
9. `IMPLEMENTATION.md` - what is currently built
10. `DELIVERY.md` - delivery summary and project status
11. `COMPLETION_SUMMARY.md` - final wrap-up
12. `WELCOME.md` - short project overview

## Code Layout

- `index.ts` exposes the public API
- `packages/core` contains orchestration, registry, lifecycle, and types
- `packages/db` contains the database abstraction and adapters
- `packages/transport` contains event transport and the event bus
- `packages/http` contains request handling and validation
- `packages/security` contains authentication and access control
- `packages/utils` contains shared utilities

## Fast Paths

- Need to ship something: read `EXAMPLE.ts`, then `README.md`
- Need to look up an API: open `QUICK_REFERENCE.md`
- Need to understand behavior: read `ARCHITECTURE.md`
- Need to add a custom adapter: read `EXTENDING.md`

