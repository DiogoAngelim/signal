import { describe, expect, it } from "vitest";
import { createFixtureAwareAdapters } from "../src/adapters.js";
import { createAwareApiService, handleAwareApiRequest } from "../src/api.js";

const now = () => new Date("2026-06-01T12:30:00.000Z");

describe("Aware API", () => {
  it("returns UI-ready region search results", async () => {
    const service = createAwareApiService({
      adapters: createFixtureAwareAdapters("normal-day"),
      now,
    });
    const response = await handleAwareApiRequest(
      new Request("http://aware.test/api/regions/search?q=Seattle"),
      service,
    );
    const body = (await response.json()) as {
      ok: true;
      data: { regions: Array<{ id: string; name: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.regions[0]).toMatchObject({
      id: "seattle-wa",
      name: "Seattle",
    });
  });

  it("returns a briefing shape without raw provider payloads", async () => {
    const service = createAwareApiService({
      adapters: createFixtureAwareAdapters("poor-air-quality-day"),
      now,
    });
    const response = await handleAwareApiRequest(
      new Request("http://aware.test/api/regions/new-york-ny/briefing"),
      service,
    );
    const body = (await response.json()) as {
      ok: true;
      data: {
        briefing: { items: unknown[]; sources: unknown[]; summary: string };
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.briefing.summary).toContain("Taking action soon");
    expect(body.data.briefing.items.length).toBeGreaterThan(0);
    expect(body.data.briefing).not.toHaveProperty("providerResponse");
  });

  it("lists sources for generated briefings", async () => {
    const service = createAwareApiService({
      adapters: createFixtureAwareAdapters("source-unavailable"),
      now,
    });
    const briefingResponse = await handleAwareApiRequest(
      new Request("http://aware.test/api/regions/miami-fl/briefing"),
      service,
    );
    const briefingBody = (await briefingResponse.json()) as {
      ok: true;
      data: { briefing: { id: string } };
    };

    const response = await handleAwareApiRequest(
      new Request(
        `http://aware.test/api/briefings/${briefingBody.data.briefing.id}/sources`,
      ),
      service,
    );
    const body = (await response.json()) as {
      ok: true;
      data: { sources: Array<{ status: string }> };
    };

    expect(response.status).toBe(200);
    expect(
      body.data.sources.some((source) => source.status === "unavailable"),
    ).toBe(true);
  });

  it("records feedback through the idempotent mutation endpoint", async () => {
    const service = createAwareApiService({
      adapters: createFixtureAwareAdapters("strong-uv-day"),
      now,
    });
    const briefingResponse = await handleAwareApiRequest(
      new Request("http://aware.test/api/regions/miami-fl/briefing"),
      service,
    );
    const briefingBody = (await briefingResponse.json()) as {
      ok: true;
      data: { briefing: { id: string } };
    };
    const request = new Request("http://aware.test/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "api-feedback-key",
      },
      body: JSON.stringify({
        briefingId: briefingBody.data.briefing.id,
        helpful: true,
      }),
    });

    const response = await handleAwareApiRequest(request, service);
    const body = (await response.json()) as {
      ok: true;
      data: { feedback: { status: string } };
    };

    expect(response.status).toBe(201);
    expect(body.data.feedback.status).toBe("recorded");
  });
});
