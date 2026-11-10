import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { createReferenceLab } from "../examples/signal-reference-lab/dist/src/signal-app.js";
import { runEvaluation } from "../examples/signal-reference-lab/dist/src/evaluation.js";

type VercelRequest = AsyncIterable<Buffer | string> & {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type VercelResponse = {
  setHeader(name: string, value: string | string[]): void;
  status(code: number): { json(body: unknown): void };
};
const SESSION_COOKIE = "__Host-signal_reference_lab";
const SESSION_SECONDS = 8 * 60 * 60;
const TENANT_ID = "reference-lab";
const ACTOR_ID = "authenticated-operator";
let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: true },
  });
  return pool;
}

async function ensureSchema() {
  schemaReady ??= (async () => {
    await database().query(`
      CREATE TABLE IF NOT EXISTS reference_lab_auth_attempts (
        ip_hash text PRIMARY KEY,
        window_started_at timestamptz NOT NULL DEFAULT now(),
        attempts integer NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS reference_lab_state (
        id text PRIMARY KEY CHECK (id = 'main'),
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  })();
  return schemaReady;
}

function sign(value: string): string {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return createHmac("sha256", key).update(value).digest("base64url");
}

function sessionCookie(value: string, maxAge: number) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function authenticated(req: VercelRequest): boolean {
  const cookieHeader = req.headers.cookie;
  const raw = (typeof cookieHeader === "string" ? cookieHeader : "").split(";").map((part) => part.trim()).find((part) => part.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return false;
  const [expiryText, nonce, signature] = raw.split(".");
  if (!expiryText || !nonce || !signature) return false;
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`${expiryText}.${nonce}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sameOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return false;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
    return parsed.host === host && parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function readBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body as Record<string, unknown>;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 32_768) throw new Error("Request body exceeds 32 KB.");
    chunks.push(part);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("A JSON object is required.");
  return parsed as Record<string, unknown>;
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

async function withLab<T>(work: (client: PoolClient, app: ReturnType<typeof createReferenceLab>) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('signal-reference-lab-state'))");
    const loaded = await client.query("SELECT payload FROM reference_lab_state WHERE id = 'main' FOR UPDATE");
    const state = loaded.rows[0]?.payload ?? { requests: [], events: [] };
    const app = createReferenceLab({ initialRequests: state.requests ?? [], initialEvents: state.events ?? [] });
    const result = await work(client, app);
    const next = app.exportState();
    await client.query(
      `INSERT INTO reference_lab_state (id, payload, updated_at)
       VALUES ('main', $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [JSON.stringify(next)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = "/" + (Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path ?? ""));
    if (req.method === "POST" && path === "/auth/login") {
      if (!sameOrigin(req)) return json(res, 403, { error: "Request origin rejected." });
      const body = await readBody(req);
      const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
      const ipHash = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(ip).digest("hex");
      const attempts = await database().query(
        `INSERT INTO reference_lab_auth_attempts (ip_hash, window_started_at, attempts)
         VALUES ($1, now(), 1)
         ON CONFLICT (ip_hash) DO UPDATE SET
           attempts = CASE WHEN reference_lab_auth_attempts.window_started_at < now() - ($2 * interval '1 minute') THEN 1 ELSE reference_lab_auth_attempts.attempts + 1 END,
           window_started_at = CASE WHEN reference_lab_auth_attempts.window_started_at < now() - ($2 * interval '1 minute') THEN now() ELSE reference_lab_auth_attempts.window_started_at END
         RETURNING attempts`, [ipHash, 15],
      );
      if (Number(attempts.rows[0]?.attempts ?? 0) > 10) return json(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
      const expected = process.env.LAB_ACCESS_PASSWORD ?? "";
      const supplied = typeof body.password === "string" ? body.password : "";
      if (expected.length < 24) return json(res, 503, { error: "Access password is not configured securely." });
      const expectedHash = createHash("sha256").update(expected).digest();
      const suppliedHash = createHash("sha256").update(supplied).digest();
      if (!timingSafeEqual(expectedHash, suppliedHash)) return json(res, 401, { error: "Incorrect access password." });
      const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const nonce = randomBytes(18).toString("base64url");
      const payload = `${expiry}.${nonce}`;
      res.setHeader("Set-Cookie", sessionCookie(`${payload}.${sign(payload)}`, SESSION_SECONDS));
      return json(res, 200, { authenticated: true, expiresAt: expiry });
    }
    if (req.method === "POST" && path === "/auth/logout") {
      if (!sameOrigin(req)) return json(res, 403, { error: "Request origin rejected." });
      res.setHeader("Set-Cookie", sessionCookie("", 0));
      return json(res, 200, { authenticated: false });
    }
    if (req.method === "GET" && path === "/auth/me") {
      return authenticated(req) ? json(res, 200, { authenticated: true }) : json(res, 401, { error: "Authentication required." });
    }
    if (!authenticated(req)) return json(res, 401, { error: "Authentication required." });
    if (req.method !== "GET" && !sameOrigin(req)) return json(res, 403, { error: "Request origin rejected." });
    if (req.method === "GET" && path === "/evaluate") return json(res, 200, await runEvaluation());
    if (req.method === "GET" && path === "/requests") {
      const result = await withLab(async (_client, app) => ({
        requests: app.listRequests(TENANT_ID),
        events: app.events.filter((event) => event.tenantId === TENANT_ID),
      }));
      return json(res, 200, result);
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const result = await withLab(async (_client, app) => {
        if (path === "/requests") return app.submitRequest({
          tenantId: TENANT_ID,
          title: String(body.title ?? ""),
          description: String(body.description ?? ""),
        });
        const requestId = String(body.requestId ?? "");
        if (path === "/evidence") return app.addEvidence({
          requestId, tenantId: TENANT_ID,
          description: String(body.description ?? "Independent evidence reviewed."),
          source: String(body.source ?? "manual-review"),
          confidence: Number(body.confidence ?? 0.8),
          verified: body.verified === true,
        });
        if (path === "/decisions") return app.decide({
          requestId, tenantId: TENANT_ID, actor: ACTOR_ID,
          approve: body.approve === true,
          rationale: String(body.rationale ?? ""),
        });
        if (path === "/actions") return app.executeAction({
          requestId, tenantId: TENANT_ID, actor: ACTOR_ID,
          kind: String(body.kind ?? "approved-action"),
        });
        if (path === "/outcomes") return app.recordOutcome({
          requestId, tenantId: TENANT_ID,
          result: ["success", "failure", "partial", "unknown"].includes(String(body.result)) ? body.result as "success" | "failure" | "partial" | "unknown" : "unknown",
          notes: String(body.notes ?? ""),
        });
        throw new Error("Route not found.");
      });
      return json(res, 200, { result });
    }
    return json(res, 404, { error: "Route not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = /not found/i.test(message) ? 404 : /approval|insufficient|verified|required/i.test(message) ? 409 : 400;
    return json(res, status, { error: message });
  }
}
