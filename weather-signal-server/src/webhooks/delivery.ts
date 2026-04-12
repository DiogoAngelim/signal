import type { Logger } from "pino";
import type { WebhookDeliveryLog, WebhookSubscription } from "../types/index.js";
import type { Env } from "../config/env.js";
import { InMemoryStore } from "../store/index.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { createId } from "../utils/ids.js";
import { nowIso, sleep } from "../utils/time.js";

export class WebhookDeliveryService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly env: Env,
    private readonly logger: Logger
  ) { }

  async deliver(eventName: string, event: unknown, regionId?: string): Promise<void> {
    const subscriptions = this.store.listWebhookSubscriptions().filter((subscription) =>
      matches(subscription, eventName, regionId)
    );
    await Promise.all(
      subscriptions.map((subscription) => this.deliverToSubscription(subscription, eventName, event))
    );
  }

  private async deliverToSubscription(
    subscription: WebhookSubscription,
    eventName: string,
    event: unknown
  ): Promise<void> {
    const attempts = this.env.WEBHOOK_RETRY_COUNT + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const payload = {
          event,
          deliveredAt: nowIso(),
          attempt
        };
        const response = await fetchWithTimeout(
          subscription.url,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(subscription.headers ?? {})
            },
            body: JSON.stringify(payload)
          },
          this.env.WEBHOOK_TIMEOUT_MS
        );

        if (!response.ok) {
          throw new Error(`Webhook responded with ${response.status}`);
        }

        this.recordDelivery(subscription.id, eventName, "delivered", attempt, response.status);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Webhook delivery failed";
        this.logger.warn({ subscriptionId: subscription.id, eventName, attempt, message });
        if (attempt === attempts) {
          this.recordDelivery(subscription.id, eventName, "failed", attempt, undefined, message);
          return;
        }
        await sleep(backoff(attempt));
      }
    }
  }

  private recordDelivery(
    subscriptionId: string,
    eventName: string,
    status: WebhookDeliveryLog["status"],
    attempt: number,
    responseStatus?: number,
    error?: string
  ): void {
    this.store.addWebhookDeliveryLog({
      id: createId(),
      subscriptionId,
      eventName,
      status,
      attempt,
      responseStatus,
      deliveredAt: nowIso(),
      error
    });
  }
}

function matches(subscription: WebhookSubscription, eventName: string, regionId?: string): boolean {
  if (!subscription.enabled) {
    return false;
  }
  if (subscription.events && subscription.events.length > 0) {
    if (!subscription.events.includes(eventName)) {
      return false;
    }
  }
  if (subscription.regionIds && subscription.regionIds.length > 0) {
    if (!regionId || !subscription.regionIds.includes(regionId)) {
      return false;
    }
  }
  return true;
}

function backoff(attempt: number): number {
  return Math.min(10_000, 500 * 2 ** (attempt - 1));
}
