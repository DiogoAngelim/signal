import { describe, expect, it } from "vitest";
import { createMaritimeApiService, handleMaritimeApiRequest } from "../src/api.js";
import { createFixtureMaritimeAdapters } from "../src/adapters.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime API", () => {
  it("searches areas and returns guide briefings through HTTP handlers", async () => {
    const service = createMaritimeApiService({ now });
    const search = await handleMaritimeApiRequest(new Request("http://local.test/api/areas/search?q=Santos"), service);
    const searchBody = await search.json() as { ok: true; data: { areas: Array<{ id: string }> } };
    const areaId = searchBody.data.areas[0]!.id;
    const guide = await handleMaritimeApiRequest(new Request(`http://local.test/api/areas/${encodeURIComponent(areaId)}/guide`), service);
    const guideBody = await guide.json() as { ok: true; data: { briefing: { id: string; risks: unknown[] } } };

    expect(search.status).toBe(200);
    expect(areaId).toBe("santos-port-br");
    expect(guide.status).toBe(200);
    expect(guideBody.data.briefing.risks.length).toBeGreaterThan(0);
  });

  it("lists sources and records feedback", async () => {
    const service = createMaritimeApiService({
      adapters: createFixtureMaritimeAdapters("busy-port"),
      now
    });
    const guide = await service.app.getGuide("santos-port-br");
    const sources = await handleMaritimeApiRequest(new Request(`http://local.test/api/guides/${encodeURIComponent(guide.id)}/sources`), service);
    const feedback = await handleMaritimeApiRequest(new Request("http://local.test/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "api-feedback" },
      body: JSON.stringify({ briefingId: guide.id, helpful: true })
    }), service);

    expect(sources.status).toBe(200);
    expect(feedback.status).toBe(201);
  });

  it("returns not found for unknown areas", async () => {
    const response = await handleMaritimeApiRequest(
      new Request("http://local.test/api/areas/unknown-area/guide"),
      createMaritimeApiService({ now })
    );

    expect(response.status).toBe(404);
  });
});
