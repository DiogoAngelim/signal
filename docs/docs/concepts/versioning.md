---
title: Versioning
---

# Versioning

## What It Is

Versioning is part of the public name of every Signal operation. It is not optional metadata.

## Rules

- Version suffixes are mandatory.
- Breaking changes require a new version.
- A new version is a new name, not an in-place change.
- Unversioned public operations are non-compliant.
- Backward-compatible evolution MAY stay on the same version when the contract remains valid.

## How It Is Used

Use names like `payment.capture.v1` and `user.profile.v1`. Publish `v2` only when the contract changes in a breaking way.

Example:

- `payment.status.v1` returns the current payment state
- `payment.status.v2` may add or reshape required fields, making the older contract invalid for new consumers

When the change is not breaking, prefer to keep the same version and evolve the schema safely.

## What To Avoid

- implicit version negotiation
- silent breaking changes
- unversioned operations
- changing the meaning of an existing name without creating a new version

## Example

`payment.capture.v1` can become `payment.capture.v2` when the payload shape changes in a breaking way. Until then, `v1` remains the public contract for that behavior.
