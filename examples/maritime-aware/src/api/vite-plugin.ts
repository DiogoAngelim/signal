import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMaritimeApiRequest } from "./handler.js";
import { createMaritimeApiService } from "./service.js";

type ViteLikePlugin = {
  name: string;
  configureServer(server: {
    middlewares: {
      use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>): void;
    };
  }): void;
};

export function maritimeAwareApiPlugin(): ViteLikePlugin {
  const service = createMaritimeApiService({
    now: () => new Date("2026-06-03T12:04:00.000Z")
  });
  return {
    name: "maritime-aware-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        try {
          const request = await toRequest(req);
          const response = await handleMaritimeApiRequest(request, service);
          await writeResponse(res, response);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            ok: false,
            error: {
              code: "REQUEST_FAILED",
              message: error instanceof Error ? error.message : "Maritime Aware API middleware failed."
            }
          }));
        }
      });
    }
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const origin = "http://127.0.0.1";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (value != null) {
      headers.set(key, value);
    }
  }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (await readBody(req)).toString();
  return new Request(`${origin}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body
  });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}
