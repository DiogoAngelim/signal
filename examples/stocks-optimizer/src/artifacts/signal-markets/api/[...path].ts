import type { VercelRequest, VercelResponse } from "@vercel/node";

const API_BASE =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.API_BASE_URL ||
  "https://tradingview-data.vercel.app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : String(req.query.path ?? "");

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") continue;

    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else if (value != null) {
      search.set(key, String(value));
    }
  }

  const upstreamUrl = `${API_BASE.replace(/\/$/, "")}/api/${rawPath}${
    search.toString() ? `?${search.toString()}` : ""
  }`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        accept: String(req.headers.accept ?? "application/json"),
        "content-type": String(
          req.headers["content-type"] ?? "application/json",
        ),
      },
      body:
        req.method && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
          ? JSON.stringify(req.body ?? {})
          : undefined,
    });

    const contentType =
      upstream.headers.get("content-type") ?? "application/json";
    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.send(text);
  } catch (error) {
    res.status(502).json({
      error: "UPSTREAM_API_FAILED",
      upstreamUrl,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
