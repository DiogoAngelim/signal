import type { IncomingMessage, ServerResponse } from "node:http";

export async function toRequest(req: IncomingMessage): Promise<Request> {
  const origin = "http://127.0.0.1";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (value != null) {
      headers.set(key, value);
    }
  }
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : (await readBody(req)).toString();
  return new Request(`${origin}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body,
  });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export async function writeResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
