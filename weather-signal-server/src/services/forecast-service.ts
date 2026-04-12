import type { Logger } from "pino";
import type { ProviderForecastResult } from "../providers/types.js";
import { createNormalizedEvent } from "../normalization/event.js";
import { InMemoryStore } from "../store/index.js";
import { createDedupeKey } from "../utils/dedupe.js";
import { EventService } from "./event-service.js";

export class ForecastService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly eventService: EventService,
    private readonly logger: Logger
  ) { }

  ingest(providerName: string, results: ProviderForecastResult[]): string[] {
    const updatedRegions: string[] = [];

    for (const result of results) {
      const previous = this.store.getForecast(result.regionId);
      this.store.setForecast(result.forecast);
      const dedupeKey = createDedupeKey([
        providerName,
        result.regionId,
        result.forecast.validFrom,
        result.forecast.validTo,
        result.forecast.metrics
      ]);

      const unchanged =
        previous &&
        createDedupeKey([
          providerName,
          previous.regionId,
          previous.validFrom,
          previous.validTo,
          previous.metrics
        ]) === dedupeKey;

      if (unchanged) {
        continue;
      }

      const event = createNormalizedEvent({
        name: "weather.forecast.updated",
        provider: providerName,
        regionId: result.regionId,
        fetchedAt: result.forecast.fetchedAt,
        payload: result.forecast,
        dedupeKey,
        rawIncluded: !!result.raw,
        confidence: 1
      });

      this.eventService.publish(event);
      updatedRegions.push(result.regionId);
    }

    this.logger.info({ provider: providerName, count: updatedRegions.length }, "Forecasts ingested");
    return updatedRegions;
  }
}
