import { loadEnv } from "./config/env.js";
import { loadRegions } from "./config/regions.js";
import { createLogger } from "./logger.js";
import type { Provider } from "./providers/index.js";
import { OpenMeteoProvider, NwsProvider } from "./providers/index.js";
import { InMemoryStore } from "./store/index.js";
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

const command = process.argv[2];
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

async function run() {
  if (!command) {
    logger.error("Missing command. Use smoke | poll:forecast | poll:alerts | replay");
    process.exit(1);
  }

  if (command === "smoke") {
    await pollingService.runForecastPoll();
    await pollingService.runAlertPoll();
    const risks = riskService.compute();
    const decisions = decisionService.compute(risks);
    logger.info({ risks, decisions }, "Smoke run completed");
    return;
  }

  if (command === "poll:forecast") {
    const result = await pollingService.runForecastPoll();
    logger.info({ result }, "Forecast poll complete");
    return;
  }

  if (command === "poll:alerts") {
    const result = await pollingService.runAlertPoll();
    logger.info({ result }, "Alert poll complete");
    return;
  }

  if (command === "replay") {
    const events = replayService.getRecent(20);
    logger.info({ count: events.length }, "Replay buffer");
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  logger.error({ command }, "Unknown command");
  process.exit(1);
}

void run();
