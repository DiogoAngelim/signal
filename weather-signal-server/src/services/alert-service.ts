import type { Logger } from "pino";
import type { ProviderAlertResult } from "../providers/types.js";
import type { OfficialAlert } from "../types/index.js";
import { createNormalizedEvent } from "../normalization/event.js";
import { InMemoryStore } from "../store/index.js";
import { createDedupeKey } from "../utils/dedupe.js";
import { EventService } from "./event-service.js";
import { WebsocketBroadcastService } from "../websocket/broadcast.js";

export interface AlertIngestionResult {
  updatedRegions: string[];
  cancellationRegions: string[];
  duplicateRegions: string[];
}

export class AlertService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly eventService: EventService,
    private readonly websocket: WebsocketBroadcastService,
    private readonly logger: Logger
  ) { }

  ingest(providerName: string, results: ProviderAlertResult[]): AlertIngestionResult {
    const updatedRegions: string[] = [];
    const cancellationRegions: string[] = [];
    const duplicateRegions: string[] = [];

    for (const result of results) {
      for (const alert of result.alerts) {
        const outcome = this.store.upsertAlert(alert);
        if (outcome.isDuplicate && !outcome.changed) {
          duplicateRegions.push(alert.regionId);
          continue;
        }

        const eventName = resolveEventName(alert, outcome.previous);
        const dedupeKey = createDedupeKey([
          providerName,
          alert.regionId,
          alert.providerEventId,
          alert.status,
          alert.updatedAt ?? alert.sentAt ?? ""
        ]);

        const event = createNormalizedEvent({
          name: eventName,
          provider: providerName,
          providerEventId: alert.providerEventId,
          regionId: alert.regionId,
          payload: alert,
          dedupeKey,
          rawIncluded: !!alert.raw,
          confidence: 1
        });

        this.eventService.publish(event);
        this.websocket.broadcast("weather.alerts", event.name, alert, alert.regionId);
        if (alert.status === "cancelled") {
          cancellationRegions.push(alert.regionId);
        }
        updatedRegions.push(alert.regionId);
      }
    }

    this.logger.info({ provider: providerName, count: updatedRegions.length }, "Alerts ingested");
    return { updatedRegions, cancellationRegions, duplicateRegions };
  }
}

function resolveEventName(alert: OfficialAlert, previous?: OfficialAlert): string {
  if (alert.status === "cancelled") {
    return "weather.alert.cancelled";
  }
  if (previous) {
    return "weather.alert.updated";
  }
  return "weather.alert.issued";
}
