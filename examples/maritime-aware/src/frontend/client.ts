import type { FeedbackInput, MaritimeArea, MaritimeBriefing, MaritimeReviewInput } from "../contracts.js";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type MaritimeBrowserClient = {
  searchAreas(query: string): Promise<MaritimeArea[]>;
  getGuide(areaId: string): Promise<MaritimeBriefing>;
  sendFeedback(input: FeedbackInput): Promise<void>;
  sendReview(input: MaritimeReviewInput): Promise<void>;
};

export function createMaritimeBrowserClient(basePath = "/api"): MaritimeBrowserClient {
  return {
    async searchAreas(query) {
      const response = await requestJson<{ areas: MaritimeArea[] }>(`${basePath}/areas/search?q=${encodeURIComponent(query)}`);
      return response.areas;
    },
    async getGuide(areaId) {
      const response = await requestJson<{ briefing: MaritimeBriefing }>(`${basePath}/areas/${encodeURIComponent(areaId)}/guide`);
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
    },
    async sendReview(input) {
      await requestJson<{ review: unknown }>(`${basePath}/reviews`, {
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
