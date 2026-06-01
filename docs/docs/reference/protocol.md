---
title: Protocol Reference
---

# Protocol Reference

A Signal message is an envelope.

```json
{
  "protocol": "signal.v1",
  "kind": "query",
  "name": "note.get.v1",
  "messageId": "msg_123",
  "timestamp": "2026-05-31T12:00:00.000Z",
  "payload": {
    "noteId": "note_1001"
  }
}
```

Important fields:

- `protocol`: protocol version
- `kind`: `query`, `mutation`, or `event`
- `name`: operation name such as `post.publish.v1`
- `messageId`: unique message id
- `timestamp`: when the envelope was created
- `payload`: the operation input
- `context`: request metadata such as correlation id
- `delivery`: transport delivery metadata
- `auth`: caller identity data
- `meta`: extra structured metadata

Operation names should read like this:

```txt
resource.action.v1
```

Examples:

```txt
note.get.v1
post.publish.v1
post.published.v1
```

## What You Learned

Signal messages are named, versioned envelopes.

## Next Recommended Page

[Errors](errors.md)

Estimated reading time: 4 minutes.
