---
title: Versioning
---

# Versioning

## What It Is

Versioning is part of the public name of every Signal operation.

## Rules

- Version suffixes are mandatory.
- Breaking changes require a new version.
- A new version is a new name, not an in-place change.

## How It Is Used

Use names like `payment.capture.v1` and `user.profile.v1`. Publish `v2` only when the contract changes in a breaking way.

## What To Avoid

- implicit version negotiation
- silent breaking changes
- unversioned operations
