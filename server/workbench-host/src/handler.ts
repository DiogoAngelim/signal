import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import {
  createSignalRuntime,
} from "@signal/sdk-node";
import {
  createPostgresWorkbenchOutcomeSink,
  createWorkbenchConnector,
  subscribeToSignalEvents,
  workbenchSignalEventSchema,
  type WorkbenchSignalEvent,
} from "@signal/workbench-connector";

const EVENT_NAME = "workbench.signal.lifecycle.v2";
const MAX_BODY_BYTES = 65_536;
const runtime = createSignalRuntime({ runtimeName: "signal-workbench-connector-host" });

runtime.registerEvent({
  name: EVENT_NAME,
  kind: "event",
  inputSchema: workbenchSignalEventSchema,
  resultSchema: workbenchSignalEventSchema,
  async handler(event) {
    return event;
  },
});

type Connector = ReturnType<typeof createWorkbenchConnector>;
let connector: Connector | undefined;
let publishingSubscribed = false;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getConnector(): Connector {
  if (connector) return connector;
  const instance = createWorkbenchConnector({
    baseUrl: requiredEnv("WORKBENCH_BASE_URL"),
    ownerId: requiredEnv("WORKBENCH_OWNER_ID"),
    token: requiredEnv("WORKBENCH_SIGNAL_TOKEN"),
  });
  if (!publishingSubscribed) {
    subscribeToSignalEvents(
      runtime,
      instance,
      [EVENT_NAME],
      (envelope) => workbenchSignalEventSchema.parse(envelope.payload) as WorkbenchSignalEvent,
    );
    publishingSubscribed = true;
  }
  connector = instance;
  return instance;
}

function authorized(request: IncomingMessage, secretName: string): boolean {
  const expected = process.env[secretName] ?? "";
  const suppliedHeader = request.headers.authorization ?? "";
  const supplied = suppliedHeader.startsWith("Bearer ") ? suppliedHeader.slice(7) : "";
  if (expected.length < 32 || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { statusCode: 413 });
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 });
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

export async function handleWorkbenchHostRequest(request: IncomingMessage, response: ServerResponse, endpoint: string): Promise<void> {

  if (request.method === "GET" && endpoint === "/health") {
    // Liveness only. Do not expose credential/configuration presence to anonymous clients.
    send(response, 200, { status: "ok", probe: "liveness" });
    return;
  }

  if (request.method === "POST" && endpoint === "/events") {
    if (!authorized(request, "SIGNAL_INGEST_SECRET")) {
      send(response, 401, { message: "Unauthorized." });
      return;
    }
    try {
      const input = workbenchSignalEventSchema.parse(await readJson(request));
      getConnector();
      const result = await runtime.execute<WorkbenchSignalEvent>({
        kind: "event",
        name: EVENT_NAME,
        payload: input,
        context: {
          source: {
            system: "signal",
            transport: "http",
            runtime: runtime.runtimeName,
          },
        },
      });
      if (!result.ok) {
        send(response, result.error.retryable ? 503 : 400, {
          message: result.error.retryable ? "Signal event delivery unavailable." : "Signal event rejected.",
        });
        return;
      }
      send(response, 202, {
        accepted: true,
        eventId: input.eventId,
        sourceRevision: input.sourceRevision,
      });
    } catch (error) {
      const status = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : error instanceof ZodError ? 400 : 503;
      send(response, Number.isInteger(status) && status >= 400 && status < 600 ? status : 503, {
        message: status === 413 ? "Request body is too large." : status === 400 ? "Invalid Signal event." : "Signal event unavailable.",
      });
    }
    return;
  }

  if ((request.method === "POST" || request.method === "GET") && endpoint === "/sync/outcomes") {
    if (!authorized(request, "CRON_SECRET")) {
      send(response, 401, { message: "Unauthorized." });
      return;
    }
    let sink: ReturnType<typeof createPostgresWorkbenchOutcomeSink> | undefined;
    try {
      const workbench = getConnector();
      sink = createPostgresWorkbenchOutcomeSink({
        connectionString: requiredEnv("SIGNAL_WORKBENCH_DATABASE_URL"),
        maxConnections: 2,
        applicationName: "signal-workbench-outcome-sync",
      });
      const result = await workbench.syncOutcomes({ sink, maxPages: 1, pageSize: 50 });
      send(response, 200, {
        pages: result.pages,
        accepted: result.accepted,
        duplicates: result.duplicates,
        cursor: result.cursor,
      });
    } catch (error) {
      send(response, 503, {
        message: "Outcome synchronization unavailable.",
      });
    } finally {
      await sink?.close().catch(() => undefined);
    }
    return;
  }

  send(response, 404, { message: "Not found." });
}
