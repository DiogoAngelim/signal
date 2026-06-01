import type { Briefing, FeedbackInput, Region } from "../contracts.js";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type AwareBrowserClient = {
  searchRegions(query: string): Promise<Region[]>;
  getBriefing(regionId: string): Promise<Briefing>;
  sendFeedback(input: FeedbackInput): Promise<void>;
};

export function createAwareBrowserClient(basePath = "/api"): AwareBrowserClient {
  return {
    async searchRegions(query) {
      const response = await requestJson<{ regions: Region[] }>(`${basePath}/regions/search?q=${encodeURIComponent(query)}`);
      return response.regions;
    },
    async getBriefing(regionId) {
      const response = await requestJson<{ briefing: Briefing }>(`${basePath}/regions/${encodeURIComponent(regionId)}/briefing`);
      return response.briefing;
    },
    async sendFeedback(input) {
      await requestJson<{ feedback: unknown }>(`${basePath}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {})
        },
        body: JSON.stringify(input)
      });
    }
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.ok) {
    throw new Error(body.error.message);
  }
  return body.data;
}
