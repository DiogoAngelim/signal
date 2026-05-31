import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ApiProblem, sendApiError } from "../observability/signal-http.js";
import type { SignalReplayStore } from "../storage/signal-store.js";

export type SignalApiRole = "reader" | "emitter" | "webhook_admin" | "auditor" | "admin";

export type AuthenticatedSignalClient = {
  keyId: string;
  roles: SignalApiRole[];
};

export type SignalSecurityConfig = {
  apiKeys: Array<{ id: string; secret: string; roles: SignalApiRole[] }>;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  signatureSecret?: string;
  requireEmitSignature: boolean;
  signatureToleranceMs: number;
  allowPrivateWebhookTargets: boolean;
};

const ALL_ROLES: SignalApiRole[] = ["reader", "emitter", "webhook_admin", "auditor", "admin"];
const roleSet = new Set<SignalApiRole>(ALL_ROLES);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function loadSignalSecurityConfig(): SignalSecurityConfig {
  const keys = parseApiKeys(process.env.SIGNAL_API_KEYS ?? process.env.STOCKS_OPTIMIZER_API_KEYS ?? "");
  const adminSecret = process.env.ADMIN_SECRET?.trim();

  if (adminSecret) {
    keys.push({ id: "admin", secret: adminSecret, roles: ALL_ROLES });
  }

  if (process.env.NODE_ENV !== "production" && process.env.SIGNAL_API_ALLOW_DEV_KEY !== "false") {
    keys.push({ id: "development", secret: "dev-signal-key", roles: ALL_ROLES });
  }

  return {
    apiKeys: keys,
    rateLimitMax: positiveInt(process.env.SIGNAL_API_RATE_LIMIT_MAX, 120),
    rateLimitWindowMs: positiveInt(process.env.SIGNAL_API_RATE_LIMIT_WINDOW_MS, 60_000),
    signatureSecret: process.env.SIGNAL_INGESTION_SIGNING_SECRET?.trim() || undefined,
    requireEmitSignature: process.env.SIGNAL_REQUIRE_EMIT_SIGNATURE === "true",
    signatureToleranceMs: positiveInt(process.env.SIGNAL_SIGNATURE_TOLERANCE_MS, 5 * 60_000),
    allowPrivateWebhookTargets:
      process.env.NODE_ENV !== "production" &&
      process.env.SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS === "true",
  };
}

export function requireSignalRoles(requiredRoles: SignalApiRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = authenticateSignalRequest(req);

    if (auth.ok === false) {
      sendApiError(req, res, 401, auth.code, auth.message);
      return;
    }

    if (!hasAnyRole(auth.client.roles, requiredRoles)) {
      sendApiError(req, res, 403, "forbidden", "The API key is not allowed to use this signal API route.");
      return;
    }

    (req as any).signalAuth = auth.client;
    next();
  };
}

export function signalRateLimit(scope = "default") {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = loadSignalSecurityConfig();
    const auth = (req as any).signalAuth as AuthenticatedSignalClient | undefined;
    const identity = auth?.keyId ?? req.ip ?? req.socket.remoteAddress ?? "anonymous";
    const key = `${scope}:${identity}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
      next();
      return;
    }

    bucket.count += 1;
    const remaining = Math.max(0, config.rateLimitMax - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(config.rateLimitMax));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > config.rateLimitMax) {
      sendApiError(req, res, 429, "rate_limited", "Too many signal API requests. Retry after the reset time.");
      return;
    }

    next();
  };
}

export function authenticateSignalRequest(req: Request):
  | { ok: true; client: AuthenticatedSignalClient }
  | { ok: false; code: string; message: string } {
  const config = loadSignalSecurityConfig();
  const presented = extractApiKey(req);

  if (!presented) {
    return {
      ok: false,
      code: "missing_api_key",
      message: "Signal API authentication requires a bearer token or X-API-Key.",
    };
  }

  for (const key of config.apiKeys) {
    if (constantTimeEqual(presented, key.secret)) {
      return {
        ok: true,
        client: {
          keyId: key.id,
          roles: key.roles,
        },
      };
    }
  }

  return {
    ok: false,
    code: "invalid_api_key",
    message: "The provided signal API key is invalid.",
  };
}

export function extractApiKey(req: Request): string {
  const authorization = String(req.headers.authorization ?? "");
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const headerKey =
    req.headers["x-api-key"] ??
    req.headers["x-stocks-optimizer-key"] ??
    req.headers["x-signal-api-key"];

  if (headerKey) return String(headerKey).trim();

  const queryKey = req.query.apiKey ?? req.query.access_token;
  return queryKey == null ? "" : String(queryKey).trim();
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: string;
  event: string;
  deliveryId: string;
  body: string;
}) {
  return `sha256=${hmacSha256(input.secret, `${input.timestamp}.${input.event}.${input.deliveryId}.${input.body}`)}`;
}

export function signIngestionPayload(input: {
  secret: string;
  timestamp: string;
  body: string;
}) {
  return `sha256=${hmacSha256(input.secret, `${input.timestamp}.${input.body}`)}`;
}

export async function verifySignedIngestionRequest(input: {
  headers: Request["headers"];
  body: string;
  replayStore: SignalReplayStore;
  required?: boolean;
}): Promise<{ ok: true; skipped?: boolean } | { ok: false; status: number; code: string; message: string }> {
  const config = loadSignalSecurityConfig();
  const signature = String(input.headers["x-stocks-optimizer-signature"] ?? "").trim();
  const timestamp = String(input.headers["x-stocks-optimizer-timestamp"] ?? "").trim();
  const required = input.required ?? config.requireEmitSignature;

  if (!signature && !required) {
    return { ok: true, skipped: true };
  }

  if (!config.signatureSecret) {
    return {
      ok: false,
      status: 503,
      code: "signature_secret_missing",
      message: "Signal ingestion signing is enabled but SIGNAL_INGESTION_SIGNING_SECRET is not configured.",
    };
  }

  if (!signature || !timestamp) {
    return {
      ok: false,
      status: 401,
      code: "missing_signature",
      message: "Signed signal ingestion requires timestamp and signature headers.",
    };
  }

  const parsedTimestamp = Date.parse(timestamp);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > config.signatureToleranceMs) {
    return {
      ok: false,
      status: 401,
      code: "stale_signature",
      message: "The signal ingestion signature timestamp is outside the allowed replay window.",
    };
  }

  const expected = signIngestionPayload({
    secret: config.signatureSecret,
    timestamp,
    body: input.body,
  });

  if (!constantTimeEqual(signature, expected)) {
    return {
      ok: false,
      status: 401,
      code: "invalid_signature",
      message: "The signal ingestion signature is invalid.",
    };
  }

  const replayKey = `ingest:${timestamp}:${signature}`;
  const accepted = await input.replayStore.consumeReplayKey(replayKey, config.signatureToleranceMs);

  if (!accepted) {
    return {
      ok: false,
      status: 409,
      code: "replay_detected",
      message: "The signed signal ingestion request has already been accepted.",
    };
  }

  return { ok: true };
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const maxLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
    const paddedLeft = Buffer.alloc(maxLength);
    const paddedRight = Buffer.alloc(maxLength);
    leftBuffer.copy(paddedLeft);
    rightBuffer.copy(paddedRight);
    crypto.timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertProductionAuthReady() {
  const config = loadSignalSecurityConfig();
  if (process.env.NODE_ENV === "production" && !config.apiKeys.length) {
    throw new ApiProblem(
      503,
      "auth_not_configured",
      "Production signal API requires SIGNAL_API_KEYS, STOCKS_OPTIMIZER_API_KEYS, or ADMIN_SECRET.",
    );
  }
}

export function resetSignalRateLimitersForTests() {
  rateBuckets.clear();
}

function hmacSha256(secret: string, message: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function parseApiKeys(value: string): Array<{ id: string; secret: string; roles: SignalApiRole[] }> {
  return value
    .split(",")
    .map((entry, index) => parseApiKeyEntry(entry, index))
    .filter((entry): entry is { id: string; secret: string; roles: SignalApiRole[] } => Boolean(entry));
}

function parseApiKeyEntry(entry: string, index: number) {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const [secret, rawRoles] = trimmed.split(":", 2);
  const roles = rawRoles
    ? rawRoles
        .split(/[|+]/)
        .map((role) => role.trim())
        .filter((role): role is SignalApiRole => roleSet.has(role as SignalApiRole))
    : ALL_ROLES;

  return {
    id: `key-${index + 1}`,
    secret: secret.trim(),
    roles: roles.length ? roles : ALL_ROLES,
  };
}

function hasAnyRole(actual: SignalApiRole[], required: SignalApiRole[]) {
  if (actual.includes("admin")) return true;
  return required.some((role) => actual.includes(role));
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
