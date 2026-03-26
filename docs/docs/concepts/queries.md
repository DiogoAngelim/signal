---
title: Queries
---

# Queries

## What It Is

A query is a read-only operation. It must not change durable state and must not emit domain events.

## Rules

- Queries MUST be safe to retry.
- Queries MUST use a versioned name.
- Queries MUST return a standard result envelope.

## How It Is Used

Define a query with an input schema and a result schema, then register it on the runtime. Execute it through the HTTP binding or the in-process binding.

## What To Avoid

- hidden writes
- event emission from query handlers
- names without a version suffix
