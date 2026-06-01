import type { IncomingMessage, ServerResponse } from "node:http";
import { createAwareApiService, handleAwareApiRequest } from "../src/api/index.js";

const service = createAwareApiService();

export async function handleAwareNodeRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const request = await toRequest(req);
    const response = await handleAwareApiRequest(request, service);
    await writeResponse(res, response);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: {
        code: "REQUEST_FAILED",
        message: error instanceof Error ? error.message : "Aware API request failed."
      }
    }));
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "aware.local";
  const protocol = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (value != null) {
      headers.set(key, value);
    }
  }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (await readBody(req)).toString();
  return new Request(`${protocol}://${host}${req.url ?? "/"}`, {
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
  res.end(Buffer.from(await response.arrayBuffer()));
}
