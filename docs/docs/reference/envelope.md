---
title: Envelope
---

# Envelope

Every public Signal message uses the standard envelope.

## Required Fields

- `protocol`
- `kind`
- `name`
- `messageId`
- `timestamp`
- `payload`

## Optional Sections

- `source`
- `context`
- `delivery`
- `auth`
- `meta`

## Context Fields Recognized By The Reference Runtime

- `correlationId`
- `causationId`
- `idempotencyKey`
- `deadlineAt`
- `traceId`
- `trace`

## Delivery Fields Recognized By The Reference Runtime

- `mode`
- `attempt`
- `consumerId`
- `replayed`
- `subscription`
- `transportMessageId`
