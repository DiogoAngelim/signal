import type { Logger } from "pino";
import type { NormalizedEvent } from "../types/index.js";
import { InMemoryStore } from "../store/index.js";
import { WebhookDeliveryService } from "../webhooks/delivery.js";
import { WebsocketBroadcastService } from "../websocket/broadcast.js";

export class EventService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly websocket: WebsocketBroadcastService,
    private readonly webhooks: WebhookDeliveryService,
    private readonly logger: Logger
  ) { }

  publish(event: NormalizedEvent): void {
    this.store.addEvent(event);
    this.websocket.broadcast("weather.events", event.name, event, event.source.regionId);
    void this.webhooks.deliver(event.name, event, event.source.regionId).catch((error) => {
      this.logger.warn({ error }, "Webhook delivery failed");
    });
  }
}
