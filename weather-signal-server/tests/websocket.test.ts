import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { loadEnv } from "../src/config/env.js";
import { createLogger } from "../src/logger.js";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store/index.js";
import { WebsocketBroadcastService } from "../src/websocket/broadcast.js";
import { WebhookDeliveryService } from "../src/webhooks/delivery.js";
import {
  AlertService,
  DecisionService,
  EventService,
  ForecastService,
  PollingService,
  ProviderHealthService,
  ReplayService,
  RiskService
} from "../src/services/index.js";

const env = loadEnv({ DEMO_MODE: "true" });
const logger = createLogger(env);

describe("websocket broadcast", () => {
  it("delivers subscribed messages", async () => {
    const store = new InMemoryStore({
      eventRetentionLimit: 50,
      decisionRetentionLimit: 50,
      resultRetentionLimit: 50,
      deliveryLogRetentionLimit: 50
    });
    store.setRegions([
      {
        id: "nyc",
        name: "New York City",
        country: "US",
        latitude: 40.7128,
        longitude: -74.006,
        timezone: "America/New_York"
      }
    ]);

    const websocket = new WebsocketBroadcastService();
    const webhookDeliveryService = new WebhookDeliveryService(store, env, logger);
    const eventService = new EventService(store, websocket, webhookDeliveryService, logger);
    const forecastService = new ForecastService(store, eventService, logger);
    const alertService = new AlertService(store, eventService, websocket, logger);
    const riskService = new RiskService(store, eventService, websocket, logger);
    const decisionService = new DecisionService(store, eventService, websocket, logger);
    const pollingService = new PollingService(
      [],
      store.getRegions(),
      forecastService,
      alertService,
      riskService,
      decisionService,
      new ProviderHealthService(store),
      websocket,
      logger,
      { forecastIntervalMs: 60_000, alertIntervalMs: 60_000 }
    );
    const replayService = new ReplayService(store);

    const app = buildApp({
      logger,
      routes: { store, pollingService, replayService, riskService, decisionService },
      websocket: { broadcaster: websocket }
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Missing address");
    }

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const messagePromise = new Promise((resolve) => {
      ws.on("message", (raw) => {
        resolve(raw.toString());
      });
    });

    await new Promise<void>((resolve) => ws.on("open", resolve));
    ws.send(JSON.stringify({ action: "subscribe", channel: "weather.risks", regionId: "nyc" }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    websocket.broadcast("weather.risks", "computed", { regionId: "nyc", score: 0.8 }, "nyc");

    const message = await messagePromise;
    const parsed = JSON.parse(String(message));
    expect(parsed.channel).toBe("weather.risks");
    expect(parsed.type).toBe("computed");

    ws.close();
    await app.close();
  });
});
