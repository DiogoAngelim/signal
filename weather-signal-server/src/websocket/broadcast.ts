import { WebSocket } from "ws";
import { nowIso } from "../utils/time.js";

export interface WebsocketMessage {
  channel: string;
  type: string;
  timestamp: string;
  data: unknown;
}

export interface WebsocketSubscription {
  channel: string;
  regionId?: string;
}

interface ClientState {
  subscriptions: WebsocketSubscription[];
}

export class WebsocketBroadcastService {
  private clients = new Map<WebSocket, ClientState>();
  private heartbeatHandle?: NodeJS.Timeout;

  addClient(socket: WebSocket): void {
    this.clients.set(socket, { subscriptions: [] });
  }

  removeClient(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  setSubscriptions(socket: WebSocket, subscriptions: WebsocketSubscription[]): void {
    const state = this.clients.get(socket);
    if (!state) {
      return;
    }
    state.subscriptions = subscriptions;
  }

  addSubscription(socket: WebSocket, subscription: WebsocketSubscription): void {
    const state = this.clients.get(socket);
    if (!state) {
      return;
    }
    state.subscriptions = state.subscriptions.filter(
      (sub) => sub.channel !== subscription.channel || sub.regionId !== subscription.regionId
    );
    state.subscriptions.push(subscription);
  }

  removeSubscription(socket: WebSocket, subscription: WebsocketSubscription): void {
    const state = this.clients.get(socket);
    if (!state) {
      return;
    }
    state.subscriptions = state.subscriptions.filter(
      (sub) => !(sub.channel === subscription.channel && sub.regionId === subscription.regionId)
    );
  }

  broadcast(channel: string, type: string, data: unknown, regionId?: string): void {
    const message: WebsocketMessage = {
      channel,
      type,
      timestamp: nowIso(),
      data
    };
    const payload = JSON.stringify(message);
    for (const [socket, state] of this.clients.entries()) {
      if (socket.readyState !== WebSocket.OPEN) {
        this.clients.delete(socket);
        continue;
      }
      if (!matchesSubscription(state.subscriptions, channel, regionId)) {
        continue;
      }
      socket.send(payload);
    }
  }

  startHeartbeat(intervalMs = 25_000): void {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
    }
    this.heartbeatHandle = setInterval(() => {
      this.broadcast("system", "heartbeat", { status: "ok" });
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
    }
  }
}

function matchesSubscription(
  subscriptions: WebsocketSubscription[],
  channel: string,
  regionId?: string
): boolean {
  if (subscriptions.length === 0) {
    return false;
  }
  return subscriptions.some((sub) => {
    if (sub.channel !== channel) {
      return false;
    }
    if (sub.regionId && regionId) {
      return sub.regionId === regionId;
    }
    if (sub.regionId && !regionId) {
      return false;
    }
    return true;
  });
}
