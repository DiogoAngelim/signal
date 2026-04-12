# signal-protocol

Full-stack Signal demo library. Includes Express API routes and bundled client assets.

## Install

```
npm install signal-protocol
```

## Usage

```ts
import { createSignalServer } from "signal-protocol";

const app = createSignalServer({ serveClient: true });

app.listen(8080, () => {
  console.log("Signal demo running on http://localhost:8080");
});
```

## API

- `createSignalServer(options)` - creates an Express app with `/api` routes and optional static client.
- `createSignalApiRouter()` - API router with `/healthz`, `/signal`, `/signal/results`.
- `resolveClientDir()` - location of bundled client assets.

## Building for Publish

From the repo root:

```
pnpm -C packages/signal-protocol run prepack
```

This builds the client and server output in the package.
