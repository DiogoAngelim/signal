---
title: Define Your First Query
---

# Define Your First Query

Use a versioned name, an input schema, and a result schema.

## Steps

1. Choose a name such as `user.profile.v1`.
2. Define the input schema.
3. Define the result schema.
4. Register the handler.
5. Execute it in-process or through HTTP.

## Avoid

- writes inside the query handler
- implicit naming
- skipping the result schema
