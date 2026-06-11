import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ApiProblem, sendApiError } from "../observability/signal-http.js";
import { incrementSignalCounter } from "../observability/signal-metrics.js";
import {
  type ApiKeyRecord,
  SIGNAL_API_SCOPES,
  type SignalApiScope,
  type SignalReplayStore,
  getSignalStore,
  publicApiKey,
} from "../storage/signal-store.js";
import {
  constantTimeEqual,
  hmacSha256,
  signIngestionPayload,
  signWebhookPayload,
} from "./signal-secrets.js";

export type { SignalApiScope };
export { constantTimeEqual, signIngestionPayload, signWebhookPayload };

export type AuthenticatedSignalClient = {
  keyId: string;
  prefix: string;
  scopes: SignalApiScope[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
};

export type SignalSecurityConfig = {
  rateLimitMax: number;
  rateLimitWindowMs: number;
  signatureSecret?: string;
  requireEmitSignature: boolean;
  signatureToleranceMs: number;
  allowPrivateWebhookTargets: boolean;
};

export type CreateApiKeyInput = {
  name?: string;
  scopes: SignalApiScope[];
  expiresAt?: string;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  rotatedFromKeyId?: string;
};

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function loadSignalSecurityConfig(): SignalSecurityConfig {
  return {
    rateLimitMax: positiveInt(process.env.SIGNAL_API_RATE_LIMIT_MAX, 120),
    rateLimitWindowMs: positiveInt(
      process.env.SIGNAL_API_RATE_LIMIT_WINDOW_MS,
      60_000,
    ),
    signatureSecret:
      process.env.SIGNAL_INGESTION_SIGNING_SECRET?.trim() || undefined,
    requireEmitSignature: process.env.SIGNAL_REQUIRE_EMIT_SIGNATURE === "true",
    signatureToleranceMs: positiveInt(
      process.env.SIGNAL_SIGNATURE_TOLERANCE_MS,
      5 * 60_000,
    ),
    allowPrivateWebhookTargets:
      process.env.NODE_ENV !== "production" &&
      process.env.SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS === "true",
  };
}

export function requireSignalScopes(requiredScopes: SignalApiScope[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await authenticateSignalRequest(req);

    if (auth.ok === false) {
      incrementSignalCounter("signal.auth.failure", { code: auth.code });
      sendApiError(req, res, auth.status, auth.code, auth.message);
      return;
    }

    if (!hasAllScopes(auth.client.scopes, requiredScopes)) {
      incrementSignalCounter("signal.auth.failure", {
        code: "insufficient_scope",
      });
      sendApiError(
        req,
        res,
        403,
        "insufficient_scope",
        "The API key is missing a required signal API scope.",
      );
      return;
    }

    (req as any).signalAuth = auth.client;
    next();
  };
}

export function requireSignalRoles(requiredScopes: SignalApiScope[]) {
  return requireSignalScopes(requiredScopes);
}

export function signalRateLimit(scope = "default") {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = loadSignalSecurityConfig();
    const auth = (req as any).signalAuth as
      | AuthenticatedSignalClient
      | undefined;
    const limit = auth?.rateLimitMax ?? config.rateLimitMax;
    const windowMs = auth?.rateLimitWindowMs ?? config.rateLimitWindowMs;
    const identity =
      auth?.keyId ?? req.ip ?? req.socket.remoteAddress ?? "anonymous";
    const key = `${scope}:${identity}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - 1)));
      res.setHeader(
        "X-RateLimit-Reset",
        String(Math.ceil((now + windowMs) / 1000)),
      );
      next();
      return;
    }

    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000)),
    );

    if (bucket.count > limit) {
      incrementSignalCounter("signal.rate_limited", { scope });
      sendApiError(
        req,
        res,
        429,
        "rate_limited",
        "Too many signal API requests. Retry after the reset time.",
      );
      return;
    }

    next();
  };
}

export async function authenticateSignalRequest(
  req: Request,
): Promise<
  | { ok: true; client: AuthenticatedSignalClient }
  | { ok: false; status: number; code: string; message: string }
> {
  const presented = extractApiKey(req);

  if (!presented) {
    await auditAuthFailure("auth.missing", "missing_api_key");
    return {
      ok: false,
      status: 401,
      code: "missing_api_key",
      message:
        "Signal API authentication requires a bearer token or X-API-Key.",
    };
  }

  const persisted = await authenticatePersistedKey(presented);
  if (persisted) return { ok: true, client: persisted };

  const bootstrap = await authenticateBootstrapKey(presented);
  if (bootstrap) return { ok: true, client: bootstrap };

  await auditAuthFailure("auth.invalid", "invalid_api_key");
  return {
    ok: false,
    status: 401,
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

export async function verifySignedIngestionRequest(input: {
  headers: Request["headers"];
  body: string;
  replayStore: SignalReplayStore;
  required?: boolean;
}): Promise<
  | { ok: true; skipped?: boolean }
  | { ok: false; status: number; code: string; message: string }
> {
  const config = loadSignalSecurityConfig();
  const signature = String(
    input.headers["x-stocks-optimizer-signature"] ?? "",
  ).trim();
  const timestamp = String(
    input.headers["x-stocks-optimizer-timestamp"] ?? "",
  ).trim();
  const required = input.required ?? config.requireEmitSignature;

  if (!signature && !required) {
    return { ok: true, skipped: true };
  }

  if (!config.signatureSecret) {
    return {
      ok: false,
      status: 503,
      code: "signature_secret_missing",
      message:
        "Signal ingestion signing is enabled but SIGNAL_INGESTION_SIGNING_SECRET is not configured.",
    };
  }

  if (!signature || !timestamp) {
    return {
      ok: false,
      status: 401,
      code: "missing_signature",
      message:
        "Signed signal ingestion requires timestamp and signature headers.",
    };
  }

  const parsedTimestamp = Date.parse(timestamp);
  if (
    !Number.isFinite(parsedTimestamp) ||
    Math.abs(Date.now() - parsedTimestamp) > config.signatureToleranceMs
  ) {
    return {
      ok: false,
      status: 401,
      code: "stale_signature",
      message:
        "The signal ingestion signature timestamp is outside the allowed replay window.",
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
  const accepted = await input.replayStore.consumeReplayKey(
    replayKey,
    config.signatureToleranceMs,
  );

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

export async function createManagedApiKey(
  input: CreateApiKeyInput,
  actor?: string,
) {
  const secret = generateApiKeySecret();
  const parsed = parseManagedApiKey(secret);
  const store = getSignalStore();
  const record = await store.createApiKey({
    prefix: parsed.prefix,
    name: input.name,
    secretHash: hashApiKey(secret),
    scopes: normalizeScopes(input.scopes),
    expiresAt: input.expiresAt,
    rateLimitMax: input.rateLimitMax,
    rateLimitWindowMs: input.rateLimitWindowMs,
    rotatedFromKeyId: input.rotatedFromKeyId,
  });
  await store.appendSecretRotation({
    subjectType: "api_key",
    subjectId: record.id,
    action: input.rotatedFromKeyId ? "rotated" : "created",
    previousSubjectId: input.rotatedFromKeyId,
    actor,
  });
  await store.appendAudit({
    action: input.rotatedFromKeyId ? "api_key.rotated" : "api_key.created",
    actor,
    metadata: {
      keyId: record.id,
      prefix: record.prefix,
      scopes: record.scopes,
      rotatedFromKeyId: input.rotatedFromKeyId,
    },
  });
  return {
    apiKey: publicApiKey(record),
    secret,
  };
}

export async function rotateManagedApiKey(
  id: string,
  input: { graceSeconds?: number },
  actor?: string,
) {
  const store = getSignalStore();
  const existing = await store.getApiKey(id);
  if (!existing)
    throw new ApiProblem(404, "api_key_not_found", "API key was not found.");
  if (existing.revokedAt)
    throw new ApiProblem(
      409,
      "api_key_revoked",
      "Revoked API keys cannot be rotated.",
    );

  const rotated = await createManagedApiKey(
    {
      name: existing.name ? `${existing.name} rotation` : undefined,
      scopes: existing.scopes,
      expiresAt: existing.expiresAt,
      rateLimitMax: existing.rateLimitMax,
      rateLimitWindowMs: existing.rateLimitWindowMs,
      rotatedFromKeyId: existing.id,
    },
    actor,
  );
  const graceSeconds = Math.max(0, input.graceSeconds ?? 0);
  const graceExpiresAt =
    graceSeconds > 0
      ? new Date(Date.now() + graceSeconds * 1000).toISOString()
      : new Date().toISOString();
  await store.updateApiKey(existing.id, {
    expiresAt: graceExpiresAt,
    ...(graceSeconds === 0 ? { revokedAt: graceExpiresAt } : {}),
  });
  await store.appendSecretRotation({
    subjectType: "api_key",
    subjectId: rotated.apiKey.id,
    action: "rotated",
    previousSubjectId: existing.id,
    graceExpiresAt,
    actor,
  });
  return {
    ...rotated,
    previousKeyGraceExpiresAt: graceExpiresAt,
  };
}

export async function revokeManagedApiKey(id: string, actor?: string) {
  const revokedAt = new Date().toISOString();
  const store = getSignalStore();
  const updated = await store.updateApiKey(id, { revokedAt });
  if (!updated)
    throw new ApiProblem(404, "api_key_not_found", "API key was not found.");
  await store.appendSecretRotation({
    subjectType: "api_key",
    subjectId: id,
    action: "revoked",
    actor,
  });
  await store.appendAudit({
    action: "api_key.revoked",
    actor,
    metadata: { keyId: id, prefix: updated.prefix },
  });
  return publicApiKey(updated);
}

export function assertProductionAuthReady() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SIGNAL_API_ALLOW_DEV_KEY !== "false"
  ) {
    throw new ApiProblem(
      503,
      "auth_not_configured",
      "Production signal API must set SIGNAL_API_ALLOW_DEV_KEY=false.",
    );
  }
}

export function resetSignalRateLimitersForTests() {
  rateBuckets.clear();
}

export function normalizeScopes(input: unknown): SignalApiScope[] {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(/[|+,]/);
  const scopes = new Set<SignalApiScope>();

  for (const value of raw) {
    const normalized = String(value).trim();
    if (!normalized) continue;
    if (normalized === "admin") {
      for (const scope of SIGNAL_API_SCOPES) scopes.add(scope);
      continue;
    }
    if (normalized === "reader") {
      scopes.add("signals:read");
      scopes.add("signals:stream");
      continue;
    }
    if (normalized === "emitter") {
      scopes.add("signals:emit");
      continue;
    }
    if (normalized === "webhook_admin") {
      scopes.add("webhooks:read");
      scopes.add("webhooks:write");
      continue;
    }
    if (normalized === "auditor") {
      scopes.add("audit:read");
      continue;
    }
    if (SIGNAL_API_SCOPES.includes(normalized as SignalApiScope)) {
      scopes.add(normalized as SignalApiScope);
    }
  }

  return Array.from(scopes);
}

export function hashApiKey(secret: string) {
  return `sha256=${hmacSha256(apiKeyPepper(), secret)}`;
}

function verifyApiKey(
  secret: string,
  record: Pick<ApiKeyRecord, "secretHash">,
) {
  return constantTimeEqual(hashApiKey(secret), record.secretHash);
}

async function authenticatePersistedKey(
  secret: string,
): Promise<AuthenticatedSignalClient | null> {
  const parsed = parseManagedApiKey(secret);
  if (!parsed) return null;

  const store = getSignalStore();
  const record = await store.getApiKeyByPrefix(parsed.prefix);
  if (!record || !verifyApiKey(secret, record)) return null;

  if (record.revokedAt) {
    await auditAuthFailure("auth.revoked", "revoked_api_key", record.id);
    return null;
  }

  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
    await auditAuthFailure("auth.expired", "expired_api_key", record.id);
    return null;
  }

  const usedAt = new Date().toISOString();
  await store.recordApiKeyUse(record.id, usedAt);
  await store.appendAudit({
    action: "api_key.used",
    actor: record.id,
    metadata: { prefix: record.prefix },
  });

  return {
    keyId: record.id,
    prefix: record.prefix,
    scopes: record.scopes,
    rateLimitMax: record.rateLimitMax,
    rateLimitWindowMs: record.rateLimitWindowMs,
  };
}

async function authenticateBootstrapKey(
  secret: string,
): Promise<AuthenticatedSignalClient | null> {
  for (const candidate of bootstrapKeys()) {
    const matches = candidate.secretHash
      ? constantTimeEqual(hashApiKey(secret), candidate.secretHash)
      : constantTimeEqual(secret, candidate.secret ?? "");
    if (!matches) continue;

    return {
      keyId: candidate.id,
      prefix: candidate.prefix,
      scopes: candidate.scopes,
      rateLimitMax: candidate.rateLimitMax,
      rateLimitWindowMs: candidate.rateLimitWindowMs,
    };
  }
  return null;
}

function bootstrapKeys(): Array<{
  id: string;
  prefix: string;
  secret?: string;
  secretHash?: string;
  scopes: SignalApiScope[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}> {
  const keys: Array<{
    id: string;
    prefix: string;
    secret?: string;
    secretHash?: string;
    scopes: SignalApiScope[];
    rateLimitMax?: number;
    rateLimitWindowMs?: number;
  }> = [];
  const bootstrapHash = process.env.SIGNAL_BOOTSTRAP_ADMIN_KEY_HASH?.trim();
  const bootstrapPrefix =
    process.env.SIGNAL_BOOTSTRAP_ADMIN_KEY_PREFIX?.trim() || "bootstrap";
  if (bootstrapHash) {
    keys.push({
      id: "bootstrap-admin",
      prefix: bootstrapPrefix,
      secretHash: bootstrapHash,
      scopes: [...SIGNAL_API_SCOPES],
    });
  }

  if (process.env.NODE_ENV !== "production") {
    const rawKeys =
      process.env.SIGNAL_API_KEYS ??
      process.env.STOCKS_OPTIMIZER_API_KEYS ??
      "";
    rawKeys
      .split(",")
      .map((entry, index) => parsePlaintextApiKeyEntry(entry, index))
      .filter(
        (
          entry,
        ): entry is NonNullable<ReturnType<typeof parsePlaintextApiKeyEntry>> =>
          Boolean(entry),
      )
      .forEach((entry) => keys.push(entry));

    if (process.env.SIGNAL_API_ALLOW_DEV_KEY !== "false") {
      keys.push({
        id: "development",
        prefix: "dev",
        secret: "dev-signal-key",
        scopes: [...SIGNAL_API_SCOPES],
      });
    }
  }

  return keys;
}

function parsePlaintextApiKeyEntry(entry: string, index: number) {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const separator = trimmed.indexOf(":");
  const secret = separator === -1 ? trimmed : trimmed.slice(0, separator);
  const rawScopes = separator === -1 ? "admin" : trimmed.slice(separator + 1);
  return {
    id: `env-key-${index + 1}`,
    prefix: `env-${index + 1}`,
    secret: secret.trim(),
    scopes: normalizeScopes(rawScopes),
  };
}

function parseManagedApiKey(secret: string): { prefix: string } | null {
  const match = /^sopt_([A-Za-z0-9_-]{10,32})_[A-Za-z0-9_-]{32,}$/.exec(secret);
  return match ? { prefix: match[1] } : null;
}

function generateApiKeySecret() {
  const prefix = crypto.randomBytes(9).toString("base64url");
  const secret = crypto.randomBytes(32).toString("base64url");
  return `sopt_${prefix}_${secret}`;
}

function hasAllScopes(actual: SignalApiScope[], required: SignalApiScope[]) {
  return required.every((scope) => actual.includes(scope));
}

async function auditAuthFailure(action: string, code: string, keyId?: string) {
  await getSignalStore()
    .appendAudit({
      action,
      actor: keyId,
      metadata: { code },
    })
    .catch(() => {});
}

function apiKeyPepper() {
  const configured = process.env.SIGNAL_API_KEY_HASH_PEPPER?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new ApiProblem(
      503,
      "api_key_pepper_missing",
      "Production requires SIGNAL_API_KEY_HASH_PEPPER.",
    );
  }
  return configured || "stocks-optimizer-local-api-key-pepper";
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
