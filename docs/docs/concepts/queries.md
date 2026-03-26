---
title: Queries
---

# Queries

Queries are read-only operations.

## Rules

- queries must use versioned names
- queries must validate input and result
- queries must not change durable state
- queries must not emit domain events
- queries may be retried safely

## Example

`note.get.v1` reads an existing note and returns the current state without side effects.
