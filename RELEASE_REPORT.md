# Signal Framework Release Report

## Version changes
- @digelim/signal: 0.1.0 → 1.0.0
- @digelim/adapter: 0.1.0 → 1.0.0
- @digelim/pulse: 0.1.0 → 1.0.0
- @digelim/core: 0.1.0 → 1.0.0
- @digelim/intent: new → 1.0.0
- @digelim/app: new → 1.0.0
- @digelim/source: new → 1.0.0
- @digelim/sense: new → 1.0.0
- @digelim/action: new → 1.0.0
- @digelim/result: new → 1.0.0

## Publish status
- Publish attempted: no
- Reason: npm registry credentials unavailable (npm whoami returned 401)

## Suggested publish order
1. @digelim/signal
2. @digelim/intent
3. @digelim/source
4. @digelim/pulse
5. @digelim/core
6. @digelim/action
7. @digelim/result
8. @digelim/sense
9. @digelim/app
10. @digelim/adapter

## Commands to publish
1. npm login
2. pnpm -r --sort --filter ./packages/** publish --access public

## Verification summary
- build: pnpm -r --sort run build
- test: pnpm -r --sort run test
- lint: pnpm -r --sort run lint
