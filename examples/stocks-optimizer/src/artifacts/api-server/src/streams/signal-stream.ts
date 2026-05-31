import type { Request, Response } from "express";
import type { SignalFilters } from "../schemas/signal-api.js";
import { signalMatchesFilters, type SignalRecord, type SignalStorageAdapter } from "../storage/signal-store.js";

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

  async subscribe(req: Request, res: Response, filters: Partial<SignalFilters>) {
    const clientId = cryptoRandomId();
    const heartbeatMs = positiveInt(process.env.SIGNAL_STREAM_HEARTBEAT_MS, 15_000);

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

    req.on("close", () => {
      clearInterval(client.heartbeat);
      this.clients.delete(clientId);
    });

    await writeSse(res, {
      event: "ready",
      data: {
        clientId,
        connectedAt: new Date(client.connectedAt).toISOString(),
      },
    });

    const lastEventId = String(req.headers["last-event-id"] ?? req.query.lastEventId ?? "").trim();
    if (lastEventId) {
      await this.replay(client, lastEventId);
    }
  }

  async publish(record: SignalRecord) {
    const writes: Array<Promise<void>> = [];

    for (const client of this.clients.values()) {
      if (!signalMatchesFilters(record, client.filters)) continue;
      writes.push(writeSse(client.response, {
        id: String(record.sequence),
        event: "signal",
        data: responseForSignal(record),
      }));
    }

    await Promise.allSettled(writes);
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

  await new Promise<void>((resolve) => {
    res.once("drain", resolve);
    res.once("close", resolve);
  });
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
