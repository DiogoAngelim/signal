import { loadEnv } from "./config/env.js";
import { loadRegions } from "./config/regions.js";
import { createLogger } from "./logger.js";
import type { Provider } from "./providers/index.js";
import { OpenMeteoProvider, NwsProvider } from "./providers/index.js";
import { InMemoryStore } from "./store/index.js";
import { buildApp } from "./app.js";
import {
  AlertService,
  DecisionService,
  EventService,
  ForecastService,
  PollingService,
  ProviderHealthService,
  ReplayService,
  RiskService
} from "./services/index.js";
import { WebsocketBroadcastService } from "./websocket/broadcast.js";
import { WebhookDeliveryService } from "./webhooks/delivery.js";

const env = loadEnv();
const logger = createLogger(env);
const regions = loadRegions(env.REGION_CONFIG_PATH);

const store = new InMemoryStore({
  eventRetentionLimit: env.EVENT_RETENTION_LIMIT,
  decisionRetentionLimit: env.EVENT_RETENTION_LIMIT,
  resultRetentionLimit: env.EVENT_RETENTION_LIMIT,
  deliveryLogRetentionLimit: env.EVENT_RETENTION_LIMIT
});
store.setRegions(regions);

const providers: Provider[] = [];
if (env.ENABLE_PROVIDER_OPENMETEO) {
  providers.push(
    new OpenMeteoProvider({
      demoMode: env.DEMO_MODE,
      timeoutMs: 8000,
      batchSize: env.PROVIDER_BATCH_SIZE,
      batchDelayMs: env.PROVIDER_BATCH_DELAY_MS
    })
  );
}
if (env.ENABLE_PROVIDER_NWS) {
  providers.push(
    new NwsProvider({
      demoMode: env.DEMO_MODE,
      timeoutMs: 8000,
      batchSize: env.PROVIDER_BATCH_SIZE,
      batchDelayMs: env.PROVIDER_BATCH_DELAY_MS
    })
  );
}

const websocket = new WebsocketBroadcastService();
websocket.startHeartbeat();

const providerHealthService = new ProviderHealthService(store);
const webhookDeliveryService = new WebhookDeliveryService(store, env, logger);
const eventService = new EventService(store, websocket, webhookDeliveryService, logger);
const forecastService = new ForecastService(store, eventService, logger);
const alertService = new AlertService(store, eventService, websocket, logger);
const riskService = new RiskService(store, eventService, websocket, logger);
const decisionService = new DecisionService(store, eventService, websocket, logger);
const replayService = new ReplayService(store);

const pollingService = new PollingService(
  providers,
  regions,
  forecastService,
  alertService,
  riskService,
  decisionService,
  providerHealthService,
  websocket,
  logger,
  {
    forecastIntervalMs: env.FORECAST_POLL_INTERVAL_MS,
    alertIntervalMs: env.ALERT_POLL_INTERVAL_MS
  }
);

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

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    pollingService.start();
    logger.info(`Weather Signal server listening on ${env.HOST}:${env.PORT}`);
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
};

void start();

process.on("SIGINT", async () => {
  pollingService.stop();
  websocket.stopHeartbeat();
  await app.close();
  process.exit(0);
});
