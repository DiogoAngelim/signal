import { describe, expect, it } from "vitest";
import { createClimateForecastClient, createInMemoryForecastCache, createNoaaProvider, createOpenMeteoProvider } from "../src";
import type { ForecastProvider, NormalizedForecast } from "../src";
import { asNumber, clamp, freshnessFrom, mergeWarnings, summarizeHours } from "../src/utils";

describe("climate forecast client", () => {
  it("serves cache first and marks stale forecasts safely", async () => {
    let now = new Date("2026-06-01T12:00:00.000Z");
    let calls = 0;
    const provider = fakeProvider(async () => {
      calls += 1;
      return forecast({ fetchedAt: now.toISOString(), confidence: 80 });
    });
    const client = createClimateForecastClient({
      provider,
      cache: createInMemoryForecastCache(),
      freshForMs: 1_000,
      staleAfterMs: 10_000,
      now: () => now
    });

    const first = await client.getForecast({ latitude: 25, longitude: -80 });
    now = new Date("2026-06-01T12:00:03.000Z");
    const second = await client.getForecast({ latitude: 25, longitude: -80 });

    expect(calls).toBe(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.stale).toBe(true);
    expect(second.warnings).toContain("Last update is getting old.");
  });

  it("returns missing information instead of normal when providers fail", async () => {
    const client = createClimateForecastClient({
      provider: fakeProvider(async () => {
        throw new Error("timeout");
      }),
      retries: 0,
      circuitBreaker: { failureThreshold: 1, openMs: 30_000 },
      now: () => new Date("2026-06-01T12:00:00.000Z")
    });

    const result = await client.getForecast({ latitude: 29.95, longitude: -90.07 });
    const [health] = await client.providerHealth();

    expect(result.degraded).toBe(true);
    expect(result.missingInformation).toContain("forecast");
    expect(result.warnings.join(" ")).toContain("Information is missing");
    expect(health?.status).toBe("circuit-open");
  });

  it("uses stale cached data as degraded fallback when refresh fails", async () => {
    let now = new Date("2026-06-01T12:00:00.000Z");
    let calls = 0;
    const client = createClimateForecastClient({
      provider: fakeProvider(async () => {
        calls += 1;
        if (calls > 1) throw new Error("provider offline");
        return forecast({ fetchedAt: now.toISOString(), confidence: 70 });
      }),
      retries: 0,
      freshForMs: 1_000,
      staleAfterMs: 2_000,
      now: () => now
    });

    await client.getForecast({ latitude: 25, longitude: -80 });
    now = new Date("2026-06-01T12:00:05.000Z");
    const result = await client.getForecast({ latitude: 25, longitude: -80, forceRefresh: true });

    expect(result.fromCache).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.freshness.state).toBe("outdated");
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Fresh forecast information is missing; showing the last available forecast.",
      "Fake Forecast: provider offline"
    ]));
    expect(result.missingInformation).toContain("fresh forecast");
  });

  it("reports default and failing provider health when a provider has no health check", async () => {
    const provider = fakeProvider(async () => {
      throw new Error("temporary outage");
    });
    const client = createClimateForecastClient({
      provider,
      retries: 0,
      circuitBreaker: { failureThreshold: 2, openMs: 30_000 },
      now: () => new Date("2026-06-01T12:00:00.000Z")
    });

    const before = await client.providerHealth();
    await client.getForecast({ latitude: 25, longitude: -80 });
    const after = await client.providerHealth();

    expect(before[0]).toMatchObject({
      provider: "open-meteo",
      healthy: true,
      status: "unknown",
      failureCount: 0
    });
    expect(after[0]).toMatchObject({
      provider: "open-meteo",
      healthy: false,
      status: "failing",
      failureCount: 1,
      message: "temporary outage"
    });
  });

  it("clears in-memory cache records", async () => {
    const cache = createInMemoryForecastCache();
    await cache.set("forecast", forecast({
      fetchedAt: "2026-06-01T12:00:00.000Z",
      confidence: 80
    }));

    expect(await cache.get("forecast")).toBeDefined();
    cache.clear();
    expect(await cache.get("forecast")).toBeUndefined();
  });

  it("falls back to NOAA when the primary provider fails", async () => {
    const noaa = createNoaaProvider({ endpoint: "https://api.weather.test" });
    const client = createClimateForecastClient({
      provider: fakeProvider(async () => {
        throw new Error("primary unavailable");
      }),
      fallbackProviders: [noaa],
      retries: 0,
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/points/25,-80")) {
          return jsonResponse({
            properties: {
              forecastGridData: "https://api.weather.test/gridpoints/MFL/1,2"
            }
          });
        }
        if (url.includes("/gridpoints/MFL/1,2")) {
          return jsonResponse({
            properties: {
              updateTime: "2026-06-01T11:00:00+00:00",
              temperature: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT3H", value: 28 }] },
              relativeHumidity: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT3H", value: 72 }] },
              quantitativePrecipitation: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT3H", value: 6 }] },
              probabilityOfPrecipitation: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT3H", value: 80 }] },
              windSpeed: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT3H", value: 24 }] },
              weather: {
                values: [{
                  validTime: "2026-06-01T12:00:00+00:00/PT3H",
                  value: [{ weather: "rain_showers", intensity: "moderate" }]
                }]
              }
            }
          });
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }
    });

    const result = await client.getForecast({ latitude: 25, longitude: -80, hours: 3 });

    expect(result.provider).toBe("noaa");
    expect(result.degraded).toBe(false);
    expect(result.summary.totalPrecipitationMm).toBe(6);
    expect(result.summary.maxPrecipitationProbabilityPercent).toBe(80);
    expect(result.warnings).toEqual([]);
  });

  it("normalizes NOAA weather variants and missing grid fields", async () => {
    const noaa = createNoaaProvider({ endpoint: "https://api.weather.test" });
    const result = await noaa.getForecast(
      { latitude: 25, longitude: -80, hours: 5 },
      {
        now: () => new Date("2026-06-01T12:15:00.000Z"),
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("/points/25,-80")) {
            return jsonResponse({
              properties: {
                forecastGridData: "https://api.weather.test/gridpoints/MFL/1,2"
              }
            });
          }
          return jsonResponse({
            properties: {
              updateTime: "2026-06-01T11:00:00+00:00",
              temperature: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT5H", value: 28 }] },
              relativeHumidity: { values: [{ validTime: "2026-06-01T12:00:00+00:00/PT5H", value: 72 }] },
              weather: {
                values: [
                  { validTime: "2026-06-01T12:00:00+00:00/PT1H", value: [{ weather: "thunderstorm", intensity: "heavy" }] },
                  { validTime: "2026-06-01T13:00:00+00:00/PT1H", value: [{ weather: "snow", intensity: "light" }] },
                  { validTime: "2026-06-01T14:00:00+00:00/PT1H", value: [{ weather: "rain_showers", intensity: "heavy" }] },
                  { validTime: "2026-06-01T15:00:00+00:00/PT1H", value: [{ weather: "fog", intensity: "moderate" }] },
                  { validTime: "2026-06-01T16:00:00+00:00/PT1H", value: [{ weather: "overcast", intensity: "light" }] }
                ]
              }
            }
          });
        }
      }
    );

    expect(result.hourly.map((hour) => hour.weatherCode)).toEqual([95, 71, 65, 45, 3]);
    expect(result.missingInformation).toEqual(expect.arrayContaining([
      "precipitation",
      "chance of precipitation",
      "wind speed"
    ]));
    expect(result.warnings).toEqual(["Some forecast details are missing from the NOAA response."]);
    expect(result.confidence).toBe(58);
  });

  it("fails loudly for unusable NOAA responses and reports health", async () => {
    const noaa = createNoaaProvider({ endpoint: "https://api.weather.test" });

    await expect(noaa.getForecast(
      { latitude: 25, longitude: -80 },
      { fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response }
    )).rejects.toThrow("NOAA points returned 503");

    await expect(noaa.getForecast(
      { latitude: 25, longitude: -80 },
      { fetch: async () => jsonResponse({ properties: {} }) }
    )).rejects.toThrow("NOAA grid forecast is unavailable");

    const gridFailure = createNoaaProvider({ endpoint: "https://api.weather.test" });
    await expect(gridFailure.getForecast(
      { latitude: 25, longitude: -80 },
      {
        fetch: async (input) => String(input).includes("/points/")
          ? jsonResponse({ properties: { forecastGridData: "https://api.weather.test/grid" } })
          : ({ ok: false, status: 500, json: async () => ({}) }) as Response
      }
    )).rejects.toThrow("NOAA grid forecast returned 500");

    const healthy = await noaa.health?.({
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response
    });
    const degraded = await noaa.health?.({
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response
    });
    const failing = await noaa.health?.({
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async () => {
        throw new Error("network down");
      }
    });

    expect(healthy).toMatchObject({ healthy: true, status: "ok", failureCount: 0 });
    expect(degraded).toMatchObject({ healthy: false, status: "degraded", failureCount: 1 });
    expect(degraded?.message).toContain("429");
    expect(failing).toMatchObject({ healthy: false, status: "failing", message: "network down" });
  });

  it("normalizes Open-Meteo hourly data", async () => {
    const provider = createOpenMeteoProvider({ endpoint: "https://example.test/forecast" });
    const result = await provider.getForecast(
      { latitude: 52.52, longitude: 13.41, hours: 2 },
      {
        now: () => new Date("2026-06-01T12:00:00.000Z"),
        fetch: async () => ({
          ok: true,
          json: async () => ({
            timezone: "Europe/Berlin",
            current: { time: "2026-06-01T12:00" },
            hourly: {
              time: ["2026-06-01T12:00", "2026-06-01T13:00"],
              temperature_2m: [21, 22],
              relative_humidity_2m: [60, 65],
              precipitation: [1.2, 0.4],
              precipitation_probability: [80, 60],
              wind_speed_10m: [22, 24],
              weather_code: [61, 61]
            }
          })
        } as Response)
      }
    );

    expect(result.provider).toBe("open-meteo");
    expect(result.hourly).toHaveLength(2);
    expect(result.summary.totalPrecipitationMm).toBe(1.6);
    expect(result.confidence).toBeGreaterThan(70);
    expect(result.missingInformation).toEqual([]);
  });

  it("handles Open-Meteo error, missing data, and health states", async () => {
    const provider = createOpenMeteoProvider({ endpoint: "https://example.test/forecast", forecastDays: 1 });

    await expect(provider.getForecast(
      { latitude: 52.52, longitude: 13.41 },
      { fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response }
    )).rejects.toThrow("Open-Meteo returned 502");

    const missing = await provider.getForecast(
      { latitude: 52.52, longitude: 13.41, hours: 2 },
      {
        now: () => new Date("2026-06-01T12:00:00.000Z"),
        fetch: async () => jsonResponse({
          hourly: {
            time: ["2026-06-01T12:00", "2026-06-01T13:00"],
            temperature_2m: ["not-a-number", 22]
          }
        })
      }
    );
    expect(missing.missingInformation).toEqual(expect.arrayContaining([
      "precipitation",
      "chance of precipitation",
      "wind speed",
      "weather condition"
    ]));
    expect(missing.warnings).toEqual(["Some forecast details are missing from the provider response."]);

    const ok = await provider.health?.({
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response
    });
    const degraded = await provider.health?.({
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response
    });
    const failing = await provider.health?.({
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      fetch: async () => {
        throw "offline";
      }
    });

    expect(ok).toMatchObject({ healthy: true, status: "ok", failureCount: 0 });
    expect(degraded).toMatchObject({ healthy: false, status: "degraded", failureCount: 1 });
    expect(degraded?.message).toContain("503");
    expect(failing).toMatchObject({ healthy: false, status: "failing", message: "Health check failed." });
  });

  it("covers utility edge cases", () => {
    expect(clamp(Number.NaN, 10, 20)).toBe(10);
    expect(clamp(30, 10, 20)).toBe(20);
    expect(asNumber("3.5")).toBe(3.5);
    expect(asNumber("nope")).toBeUndefined();
    expect(mergeWarnings([" a ", ""], undefined, ["a", "b"])).toEqual(["a", "b"]);
    expect(freshnessFrom("not-a-date", new Date("2026-06-01T12:00:00.000Z")).state).toBe("missing");
    expect(summarizeHours([], 0)).toMatchObject({
      nextHours: 0,
      totalPrecipitationMm: 0,
      weatherCodes: []
    });
  });
});

function fakeProvider(handler: () => Promise<NormalizedForecast>): ForecastProvider {
  return {
    name: "open-meteo",
    source: "Fake Forecast",
    getForecast: handler
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

function forecast(input: { fetchedAt: string; confidence: number }): NormalizedForecast {
  return {
    latitude: 25,
    longitude: -80,
    hours: 48,
    provider: "open-meteo",
    source: "Fake Forecast",
    hourly: [],
    summary: {
      nextHours: 24,
      totalPrecipitationMm: 12,
      maxHourlyPrecipitationMm: 3,
      maxPrecipitationProbabilityPercent: 70,
      maxWindSpeedKph: 28,
      weatherCodes: [61]
    },
    confidence: input.confidence,
    freshness: {
      fetchedAt: input.fetchedAt,
      expiresAt: input.fetchedAt,
      ageMs: 0,
      state: "fresh",
      score: 100
    },
    warnings: [],
    missingInformation: [],
    stale: false,
    fromCache: false,
    degraded: false,
    correlationId: "forecast:test"
  };
}
