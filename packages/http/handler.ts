/**
 * Signal HTTP Handler
 * 
 * Serverless-friendly HTTP handler for Vercel, Fly, etc.
 * Works with any HTTP framework (Express, Hono, Fastify, etc.)
 */

import { Signal } from "../core/Signal";
import { SignalRouter } from "./router";

/**
 * Create a Signal HTTP handler
 * 
 * Usage:
 *   const handler = createHandler(signal);
 *   app.post("/signal/query", handler);
 *   app.post("/signal/mutation", handler);
 */
export function createHandler(signal: Signal, basePath = "/signal") {
  const router = new SignalRouter(signal, basePath);

  /**
   * Handler function for various frameworks
   */
  return async (req: any, res: any) => {
    try {
      // Parse request format
      const method = req.method || "GET";
      const path = req.url || req.path || "/";
      const headers = normalizeHeaders(req.headers || {});
      const body = await parseBody(req);

      // Route request
      const response = await router.route({
        method,
        path,
        headers,
        body,
      });

      // Send response
      if (res.status) {
        // Express/Fastify style
        const statusCode = response.ok ? 200 : response.error?.code === "VALIDATION_ERROR" ? 400 : 500;
        res.status(statusCode).json(response);
        return;
      } else if (res.writeHead) {
        // Node.js http style
        const statusCode = response.ok ? 200 : 500;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      } else {
        // Serverless style (Vercel, Fly)
        const statusCode = response.ok ? 200 : 500;
        return {
          statusCode,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (res.status) {
        res.status(500).json({
          ok: false,
          error: { code: "INTERNAL_ERROR", message },
        });
        return;
      } else if (res.writeHead) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: "INTERNAL_ERROR", message },
          })
        );
        return;
      } else {
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: false,
            error: { code: "INTERNAL_ERROR", message },
          }),
        };
      }
    }
  };
}

/**
 * Normalize headers to lowercase
 */
function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/**
 * Parse request body
 */
async function parseBody(req: any): Promise<Record<string, any> | undefined> {
  // Already parsed (Express, Fastify with middleware)
  if (req.body) {
    return req.body;
  }

  // Node.js http module
  if (req.on) {
    return new Promise((resolve, reject) => {
      let data = "";

      req.on("data", (chunk: any) => {
        data += chunk;
      });

      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : undefined);
        } catch (error) {
          reject(error);
        }
      });

      req.on("error", reject);
    });
  }

  return undefined;
}
