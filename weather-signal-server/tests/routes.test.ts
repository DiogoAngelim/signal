import { describe, expect, it } from "vitest";
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

function buildTestApp() {
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
    routes: {
      store,
      pollingService,
      replayService,
      riskService,
      decisionService
    },
    websocket: {
      broadcaster: websocket
    }
  });

  return { app, store };
}

describe("REST endpoints", () => {
  it("responds to health and regions", async () => {
    const { app } = buildTestApp();
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const regions = await app.inject({ method: "GET", url: "/api/regions" });
    expect(regions.statusCode).toBe(200);

    await app.close();
  });
});
