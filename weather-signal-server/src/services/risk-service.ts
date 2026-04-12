import type { Logger } from "pino";
import { computeRiskScore } from "../scoring/engine.js";
import { createNormalizedEvent } from "../normalization/event.js";
import { InMemoryStore } from "../store/index.js";
import { createDedupeKey } from "../utils/dedupe.js";
import { EventService } from "./event-service.js";
import { WebsocketBroadcastService } from "../websocket/broadcast.js";

export class RiskService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly eventService: EventService,
    private readonly websocket: WebsocketBroadcastService,
    private readonly logger: Logger
  ) { }

  compute(regionIds?: string[]): string[] {
    const targets = regionIds && regionIds.length > 0 ? regionIds : this.store.getRegions().map((r) => r.id);
    const updated: string[] = [];

    for (const regionId of targets) {
      const region = this.store.getRegion(regionId);
      if (!region) {
        continue;
      }
      const forecast = this.store.getForecast(regionId);
      const alerts = this.store.getAlerts(regionId);
      const risk = computeRiskScore({
        region,
        forecast: forecast
          ? {
            fetchedAt: forecast.fetchedAt,
            precipitationMmNext6h: forecast.metrics.precipitationMmNext6h,
            precipitationMmNext24h: forecast.metrics.precipitationMmNext24h,
            windGustKphMax: forecast.metrics.windGustKphMax,
            temperatureCMax: forecast.metrics.temperatureCMax,
            temperatureCMin: forecast.metrics.temperatureCMin
          }
          : undefined,
        alerts
      });

      const previous = this.store.getRisk(regionId);
      const dedupeKey = createDedupeKey([
        regionId,
        risk.precipitationRisk.score,
        risk.floodRisk.score,
        risk.windRisk.score,
        risk.heatRisk.score,
        risk.stormRisk.score,
        risk.landslideRisk.score,
        risk.compositeRisk.score
      ]);
      const unchanged =
        previous &&
        createDedupeKey([
          regionId,
          previous.precipitationRisk.score,
          previous.floodRisk.score,
          previous.windRisk.score,
          previous.heatRisk.score,
          previous.stormRisk.score,
          previous.landslideRisk.score,
          previous.compositeRisk.score
        ]) === dedupeKey;

      this.store.setRisk(risk);

      if (unchanged) {
        continue;
      }

      const event = createNormalizedEvent({
        name: "weather.risk.computed",
        provider: "risk-engine",
        regionId,
        payload: risk,
        dedupeKey,
        confidence: risk.dataConfidence
      });

      this.eventService.publish(event);
      this.websocket.broadcast("weather.risks", "computed", risk, regionId);
      updated.push(regionId);
    }

    this.logger.info({ count: updated.length }, "Risk scores computed");
    return updated;
  }
}
