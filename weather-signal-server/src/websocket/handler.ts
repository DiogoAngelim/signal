import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";
import { WebsocketBroadcastService } from "./broadcast.js";
import { nowIso } from "../utils/time.js";

const messageSchema = z.object({
  action: z.enum(["subscribe", "unsubscribe", "ping"]),
  channel: z.string().optional(),
  regionId: z.string().optional()
});

export function registerWebsocket(app: FastifyInstance, broadcaster: WebsocketBroadcastService) {
  app.get("/ws", { websocket: true }, (connection) => {
    const socket = connection.socket as WebSocket;
    broadcaster.addClient(socket);

    socket.on("message", (raw) => {
      const message = parseMessage(raw);
      if (!message) {
        return;
      }
      if (message.action === "ping") {
        socket.send(
          JSON.stringify({
            channel: "system",
            type: "pong",
            timestamp: nowIso(),
            data: { status: "ok" }
          })
        );
        return;
      }
      if (!message.channel) {
        return;
      }
      if (message.action === "subscribe") {
        broadcaster.addSubscription(socket, {
          channel: message.channel,
          regionId: message.regionId
        });
      }
      if (message.action === "unsubscribe") {
        broadcaster.removeSubscription(socket, {
          channel: message.channel,
          regionId: message.regionId
        });
      }
    });

    socket.on("close", () => {
      broadcaster.removeClient(socket);
    });
  });
}

function parseMessage(raw: unknown): z.infer<typeof messageSchema> | null {
  if (!raw) {
    return null;
  }
  const text = raw instanceof Buffer ? raw.toString("utf-8") : String(raw);
  try {
    const parsed = messageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
