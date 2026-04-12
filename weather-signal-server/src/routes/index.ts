import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PollingService, ReplayService, RiskService, DecisionService } from "../services/index.js";
import { InMemoryStore } from "../store/index.js";
import { AppError } from "../utils/errors.js";
import { ok } from "./response.js";
import { createWebhookSubscription, webhookSubscriptionInputSchema } from "../webhooks/subscriptions.js";
import { nowIso } from "../utils/time.js";

const regionParamSchema = z.object({
  regionId: z.string().min(1)
});

const replayQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

export interface RouteContext {
  store: InMemoryStore;
  pollingService: PollingService;
  replayService: ReplayService;
  riskService: RiskService;
  decisionService: DecisionService;
}

export function registerRoutes(app: FastifyInstance, context: RouteContext) {
  app.get("/health", async () => ok({ status: "ok", timestamp: nowIso() }));
  app.get("/ready", async () => ok({ status: "ready", timestamp: nowIso() }));

  app.get("/api/providers/health", async () => ok(context.store.listProviderHealth()));

  app.get("/api/regions", async () => ok(context.store.getRegions(), { count: context.store.getRegions().length }));

  app.get("/api/regions/:regionId", async (request) => {
    const params = regionParamSchema.parse(request.params);
    const region = context.store.getRegion(params.regionId);
    if (!region) {
      throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
    }
    return ok(region, { regionId: params.regionId });
  });

  app.get("/api/regions/:regionId/forecast", async (request) => {
    const params = regionParamSchema.parse(request.params);
    const forecast = context.store.getForecast(params.regionId);
    if (!forecast) {
      throw new AppError("Forecast not found", 404, "FORECAST_NOT_FOUND");
    }
    return ok(forecast, { regionId: params.regionId });
  });

  app.get("/api/forecast/latest", async () =>
    ok(context.store.listForecasts(), { count: context.store.listForecasts().length })
  );

  app.get("/api/regions/:regionId/alerts", async (request) => {
    const params = regionParamSchema.parse(request.params);
    return ok(context.store.getAlerts(params.regionId), {
      regionId: params.regionId,
      count: context.store.getAlerts(params.regionId).length
    });
  });

  app.get("/api/alerts/active", async () =>
    ok(context.store.listActiveAlerts(), { count: context.store.listActiveAlerts().length })
  );

  app.get("/api/regions/:regionId/risk", async (request) => {
    const params = regionParamSchema.parse(request.params);
    const risk = context.store.getRisk(params.regionId);
    if (!risk) {
      throw new AppError("Risk score not found", 404, "RISK_NOT_FOUND");
    }
    return ok(risk, { regionId: params.regionId });
  });

  app.get("/api/risk/latest", async () =>
    ok(context.store.listRisks(), { count: context.store.listRisks().length })
  );

  app.get("/api/regions/:regionId/decisions", async (request) => {
    const params = regionParamSchema.parse(request.params);
    const decisions = context.store.listDecisions(params.regionId);
    return ok(decisions, { regionId: params.regionId, count: decisions.length });
  });

  app.get("/api/decisions/recent", async () =>
    ok(context.store.listDecisions(), { count: context.store.listDecisions().length })
  );

  app.get("/api/events/recent", async () =>
    ok(context.store.listEvents(), { count: context.store.listEvents().length })
  );

  app.get("/api/events/replay", async (request) => {
    const query = replayQuerySchema.parse(request.query);
    const events = context.replayService.getRecent(query.limit);
    return ok(events, { count: events.length });
  });

  app.get("/api/webhooks", async () =>
    ok(context.store.listWebhookSubscriptions(), {
      count: context.store.listWebhookSubscriptions().length
    })
  );

  app.post("/api/webhooks", async (request) => {
    const input = webhookSubscriptionInputSchema.parse(request.body ?? {});
    const subscription = createWebhookSubscription(input);
    context.store.addWebhookSubscription(subscription);
    return ok(subscription);
  });

  app.delete("/api/webhooks/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const removed = context.store.deleteWebhookSubscription(params.id);
    if (!removed) {
      throw new AppError("Webhook subscription not found", 404, "WEBHOOK_NOT_FOUND");
    }
    return ok({ id: params.id });
  });

  app.post(
    "/api/poll/forecast",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000
        }
      }
    },
    async () => {
      const result = await context.pollingService.runForecastPoll();
      return ok(result, { timestamp: nowIso() });
    }
  );

  app.post(
    "/api/poll/alerts",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000
        }
      }
    },
    async () => {
      const result = await context.pollingService.runAlertPoll();
      return ok(result, { timestamp: nowIso() });
    }
  );

  app.post(
    "/api/recompute/risk",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60_000
        }
      }
    },
    async () => {
      const updated = context.riskService.compute();
      return ok({ updatedRegions: updated }, { timestamp: nowIso() });
    }
  );

  app.post(
    "/api/recompute/decisions",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60_000
        }
      }
    },
    async () => {
      const regionIds = context.store.getRegions().map((region) => region.id);
      const updated = context.decisionService.compute(regionIds);
      return ok({ updatedRegions: updated }, { timestamp: nowIso() });
    }
  );
}
