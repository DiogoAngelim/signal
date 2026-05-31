import crypto from "node:crypto";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";
import { incrementSignalCounter } from "./signal-metrics.js";

export class ApiProblem extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiProblem";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function requestIdFor(req: Request): string {
  const existing = String(req.headers["x-request-id"] ?? "").trim();
  const requestId = existing || crypto.randomUUID();
  (req as any).requestId = requestId;
  return requestId;
}

export function getRequestId(req: Request): string {
  return String((req as any).requestId ?? req.headers["x-request-id"] ?? crypto.randomUUID());
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = requestIdFor(req);
  res.setHeader("X-Request-Id", requestId);
  next();
}

export function secureHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
}

export function sendApiError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  incrementSignalCounter("signal.http.error", { status, code });
  res.status(status).json({
    error: {
      code,
      message,
      ...(details == null ? {} : { details }),
      requestId: getRequestId(req),
    },
  });
}

export const apiErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error instanceof ApiProblem) {
    sendApiError(req, res, error.status, error.code, error.message, error.details);
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  sendApiError(
    req,
    res,
    500,
    "internal_error",
    "The signal API could not complete the request.",
    isProduction ? undefined : { message: error instanceof Error ? error.message : String(error) },
  );
};

export function createSignalCorsOptions(): CorsOptions {
  const rawOrigins = String(process.env.SIGNAL_API_CORS_ORIGINS ?? process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!rawOrigins.length && process.env.NODE_ENV !== "production") {
    return { origin: true, credentials: false };
  }

  const allowed = new Set(rawOrigins);

  return {
    credentials: false,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowed.has(origin));
    },
  };
}
