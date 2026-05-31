---
title: Capabilities
---

# Capabilities

Capability documents describe the actual runtime surface.

## A Capability Document Includes

- registered queries
- registered mutations
- published events
- subscribed events
- feature metadata
- binding metadata

## Reference Runtime Features

- deadlines
- cancellation
- idempotency
- replay safety

## Signal Framework Capabilities

Framework modules can expose typed capability surfaces alongside protocol operations. `signal.legacy` publishes durable progression outputs and the `legacy.*` event catalog for achievements, badges, milestones, unlocks, titles, reputation, campaigns, prestige, and victories.
