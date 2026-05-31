---
title: Stocks-Optimizer
---

# Stocks-Optimizer

Stocks-Optimizer is the flagship Signal implementation in this repository. It
uses Signal decision and memory packages to turn market evidence into auditable
decision records.

Signal stays generic. Stocks-Optimizer owns the market data, strategy,
readiness, sizing, execution, API, stream, webhook, and deployment concerns.

## What It Demonstrates

- decision records with evidence and outcomes
- decision memory backed by Postgres or in-memory storage
- REST reads and signed signal ingestion
- Server-Sent Events for live signal distribution
- signed webhooks with retries and dead-letter recovery
- migration validation before deployment
- opt-in Binance Spot execution gates

## Main Paths

```text
examples/stocks-optimizer/
examples/stocks-optimizer/src/artifacts/api-server/
examples/stocks-optimizer/src/artifacts/signal-markets/
examples/stocks-optimizer/src/artifacts/binance-execution-worker/
examples/stocks-optimizer/docs/
```

## Integration Docs

- `examples/stocks-optimizer/docs/signal-distribution-api.md`
- `examples/stocks-optimizer/docs/binance-execution.md`
- `examples/stocks-optimizer/ENVIRONMENT.md`

## Safety Boundary

The Signal protocol does not make trading decisions. Stocks-Optimizer translates
market evidence into Signal decision inputs, records the decision evidence, and
exposes integration surfaces for consumers.

Do not move market-specific logic into Signal Core, Signal Runtime, or the
protocol specification.
