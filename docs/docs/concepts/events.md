---
title: Events
---

# Events

Events are immutable facts.

## Rules

- events must be versioned
- consumers must tolerate duplicate delivery
- consumers must be replay-safe
- the protocol does not guarantee global ordering
- correlation and causation metadata should be preserved

## Example

`post.published.v1` records that a post became visible. Consumers may project it, audit it, or forward it, but they must handle replay and duplication correctly.

## Legacy Events

Signal Legacy emits replay-safe progression events:

- `legacy.achievement.unlocked`
- `legacy.badge.earned`
- `legacy.milestone.reached`
- `legacy.unlock.granted`
- `legacy.title.changed`
- `legacy.reputation.updated`
- `legacy.campaign.completed`
- `legacy.prestige.unlocked`
- `legacy.victory.detected`

Each event carries a stable `idempotencyKey`. Consumers should apply each key once and treat `legacy.history` as the durable projection.
