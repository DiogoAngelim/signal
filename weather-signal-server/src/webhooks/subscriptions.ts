import { z } from "zod";
import type { WebhookSubscription } from "../types/index.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

export const webhookSubscriptionInputSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).optional(),
  regionIds: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional()
});

export type WebhookSubscriptionInput = z.infer<typeof webhookSubscriptionInputSchema>;

export function createWebhookSubscription(
  input: WebhookSubscriptionInput
): WebhookSubscription {
  return {
    id: createId(),
    url: input.url,
    createdAt: nowIso(),
    enabled: true,
    events: input.events,
    regionIds: input.regionIds,
    headers: input.headers
  };
}
