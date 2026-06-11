import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import { positiveInt } from "../config/signal-environment.js";
import { ApiProblem } from "../observability/signal-http.js";
import {
  incrementSignalCounter,
  observeSignalLatency,
} from "../observability/signal-metrics.js";
import type { SignalFilters } from "../schemas/signal-api.js";
import {
  type SignalRecord,
  type SignalStorageAdapter,
  signalMatchesFilters,
} from "../storage/signal-store.js";

type StreamClient = {
  id: string;
  filters: Partial<SignalFilters>;
  response: Response;
  heartbeat: NodeJS.Timeout;
  connectedAt: number;
};

export class SignalStreamHub {
  private readonly clients = new Map<string, StreamClient>();

  constructor(private readonly store: SignalStorageAdapter) {}

  async subscribe(
    req: Request,
    res: Response,
    filters: Partial<SignalFilters>,
  ) {
    const maxClients = positiveInt(
      process.env.SIGNAL_STREAM_MAX_CLIENTS,
      1_000,
    );
    if (this.clients.size >= maxClients) {
      incrementSignalCounter("signal.stream.rejected", {
        reason: "max_clients",
      });
      throw new ApiProblem(
        503,
        "stream_overloaded",
        "Signal stream is at its configured client limit.",
      );
    }

    const clientId = cryptoRandomId();
    const heartbeatMs = positiveInt(
      process.env.SIGNAL_STREAM_HEARTBEAT_MS,
      15_000,
    );

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const client: StreamClient = {
      id: clientId,
      filters,
      response: res,
      connectedAt: Date.now(),
      heartbeat: setInterval(() => {
        void writeSse(res, {
          event: "heartbeat",
          data: { timestamp: new Date().toISOString() },
        });
      }, heartbeatMs),
    };

    this.clients.set(clientId, client);
    incrementSignalCounter("signal.stream.connected");

    req.on("close", () => {
      clearInterval(client.heartbeat);
      this.clients.delete(clientId);
      incrementSignalCounter("signal.stream.disconnected");
    });

    await writeSse(res, {
      event: "ready",
      data: {
        clientId,
        connectedAt: new Date(client.connectedAt).toISOString(),
      },
    });

    const lastEventId = String(
      req.headers["last-event-id"] ?? req.query.lastEventId ?? "",
    ).trim();
    if (lastEventId) {
      await this.replay(client, lastEventId);
    }
  }

  async publish(record: SignalRecord) {
    const startedAt = performance.now();
    const writes: Array<Promise<void>> = [];

    for (const client of this.clients.values()) {
      if (!signalMatchesFilters(record, client.filters)) continue;
      writes.push(
        writeSse(client.response, {
          id: String(record.sequence),
          event: "signal",
          data: responseForSignal(record),
        }),
      );
    }

    await Promise.allSettled(writes);
    observeSignalLatency("stream.fanout", performance.now() - startedAt);
  }

  clientCount() {
    return this.clients.size;
  }

  private async replay(client: StreamClient, cursor: string) {
    const replay = await this.store.listSignals({
      ...client.filters,
      after: cursor,
      limit: 100,
    });

    for (const record of replay.reverse()) {
      await writeSse(client.response, {
        id: String(record.sequence),
        event: "signal",
        data: responseForSignal(record),
      });
    }
  }
}

export function responseForSignal(record: SignalRecord) {
  return {
    signal: record.signal,
    trust: record.trust,
    acceptedAt: record.acceptedAt,
    sequence: record.sequence,
  };
}

async function writeSse(
  res: Response,
  input: {
    id?: string;
    event: string;
    data: unknown;
  },
) {
  const lines = [
    ...(input.id ? [`id: ${input.id}`] : []),
    `event: ${input.event}`,
    `data: ${JSON.stringify(input.data)}`,
  ];
  const payload = `${lines.join("\n")}\n\n`;

  if (res.destroyed || res.writableEnded) return;

  if (res.write(payload)) return;

  const timeoutMs = positiveInt(
    process.env.SIGNAL_STREAM_WRITE_TIMEOUT_MS,
    2_000,
  );
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      incrementSignalCounter("signal.stream.slow_consumer");
      res.destroy();
      resolve();
    }, timeoutMs);

    const done = () => {
      clearTimeout(timer);
      resolve();
    };

    res.once("drain", done);
    res.once("close", done);
  });
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
