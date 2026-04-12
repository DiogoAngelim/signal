import { describe, expect, it, vi } from "vitest";
import { WebhookDeliveryService } from "../src/webhooks/delivery.js";
import { InMemoryStore } from "../src/store/index.js";
import { loadEnv } from "../src/config/env.js";
import { createLogger } from "../src/logger.js";

const env = loadEnv({ WEBHOOK_RETRY_COUNT: "1", WEBHOOK_TIMEOUT_MS: "1000" });
const logger = createLogger(env);

function createStore() {
  return new InMemoryStore({
    eventRetentionLimit: 10,
    decisionRetentionLimit: 10,
    resultRetentionLimit: 10,
    deliveryLogRetentionLimit: 10
  });
}

describe("webhook delivery", () => {
  it("retries on failure", async () => {
    const originalFetch = global.fetch;
    const store = createStore();
    store.addWebhookSubscription({
      id: "sub-1",
      url: "https://example.com/webhook",
      createdAt: new Date().toISOString(),
      enabled: true
    });

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    global.fetch = fetchMock as typeof fetch;

    const service = new WebhookDeliveryService(store, env, logger);
    await service.deliver("weather.alert.issued", { payload: true }, "nyc");

    const logs = store.listWebhookDeliveryLogs();
    global.fetch = originalFetch;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logs[0]?.status).toBe("delivered");
  });
});
