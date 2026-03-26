---
title: HTTP Binding
---

# HTTP Binding

The HTTP binding transports Signal messages without redefining the protocol.

## Routes

- `GET /signal/capabilities`
- `POST /signal/query/:name`
- `POST /signal/mutation/:name`

## Request Body

- `payload`
- optional `idempotencyKey`
- optional `context`
- optional `delivery`
- optional `auth`
- optional `meta`
