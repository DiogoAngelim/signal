import { createInMemoryForecastCache } from "./cache";
import type {
  ForecastCache,
  ForecastClientOptions,
  ForecastGetOptions,
  ForecastProvider,
  ForecastProviderName,
  ForecastRequest,
  NormalizedForecast,
  ProviderHealth,
} from "./types";
import { forecastCacheKey, freshnessFrom, mergeWarnings, nowIso } from "./utils";

type ProviderRuntime = {
  failureCount: number;
  circuitOpenUntil?: number;
  health?: ProviderHealth;
};

export class ClimateForecastClient {
  private readonly provider: ForecastProvider;
  private readonly fallbackProviders: ForecastProvider[];
  private readonly cache: ForecastCache;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly freshForMs: number;
  private readonly staleAfterMs: number;
  private readonly failureThreshold: number;
  private readonly circuitOpenMs: number;
  private readonly fetch?: typeof fetch;
  private readonly now: () => Date;
  private readonly runtimes = new Map<ForecastProviderName, ProviderRuntime>();

  constructor(options: ForecastClientOptions) {
    this.provider = options.provider;
    this.fallbackProviders = options.fallbackProviders ?? [];
    this.cache = options.cache ?? createInMemoryForecastCache();
    this.timeoutMs = options.timeoutMs ?? 7000;
    this.retries = options.retries ?? 1;
    this.backoffMs = options.backoffMs ?? 150;
    this.freshForMs = options.freshForMs ?? 30 * 60 * 1000;
    this.staleAfterMs = options.staleAfterMs ?? 3 * 60 * 60 * 1000;
    this.failureThreshold = options.circuitBreaker?.failureThreshold ?? 3;
    this.circuitOpenMs = options.circuitBreaker?.openMs ?? 60 * 1000;
    this.fetch = options.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getForecast(input: ForecastGetOptions): Promise<NormalizedForecast> {
    const key = forecastCacheKey(input);
    const cached = await this.cache.get(key);
    if (cached && !input.forceRefresh) {
      return this.withCurrentFreshness(cached, "cache");
    }

    const providers = [this.provider, ...this.fallbackProviders];
    const errors: string[] = [];
    for (const provider of providers) {
      if (this.circuitOpen(provider)) {
        errors.push(`${provider.source} is temporarily unavailable.`);
        continue;
      }
      try {
        const forecast = await this.fetchWithRetry(provider, input);
        const normalized = this.withCurrentFreshness(forecast, "provider");
        await this.cache.set(key, normalized);
        this.noteSuccess(provider);
        return normalized;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider request failed.";
        errors.push(`${provider.source}: ${message}`);
        this.noteFailure(provider, message);
      }
    }

    if (cached) {
      return {
        ...this.withCurrentFreshness(cached, "cache"),
        degraded: true,
        stale: true,
        warnings: mergeWarnings(cached.warnings, [
          "Fresh forecast information is missing; showing the last available forecast.",
          ...errors
        ]),
        missingInformation: mergeWarnings(cached.missingInformation, ["fresh forecast"])
      };
    }

    return this.missingForecast(input, errors);
  }

  async refresh(input: ForecastRequest): Promise<NormalizedForecast> {
    return this.getForecast({ ...input, forceRefresh: true });
  }

  async providerHealth(): Promise<ProviderHealth[]> {
    const providers = [this.provider, ...this.fallbackProviders];
    const checkedAt = nowIso(this.now);
    return Promise.all(providers.map(async (provider) => {
      const runtime = this.runtime(provider);
      if (this.circuitOpen(provider)) {
        const health = {
          provider: provider.name,
          healthy: false,
          status: "circuit-open" as const,
          checkedAt,
          failureCount: runtime.failureCount,
          circuitOpenUntil: runtime.circuitOpenUntil ? new Date(runtime.circuitOpenUntil).toISOString() : undefined,
          message: "Provider circuit is open after repeated failures."
        };
        runtime.health = health;
        return health;
      }
      if (!provider.health) {
        return runtime.health ?? {
          provider: provider.name,
          healthy: runtime.failureCount === 0,
          status: runtime.failureCount === 0 ? "unknown" : "degraded",
          checkedAt,
          failureCount: runtime.failureCount
        };
      }
      const health = await provider.health({
        fetch: this.fetch,
        timeoutMs: this.timeoutMs,
        now: this.now
      });
      runtime.health = { ...health, failureCount: Math.max(health.failureCount, runtime.failureCount) };
      return runtime.health;
    }));
  }

  private async fetchWithRetry(provider: ForecastProvider, input: ForecastRequest): Promise<NormalizedForecast> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        return await provider.getForecast(input, {
          fetch: this.fetch,
          timeoutMs: this.timeoutMs,
          now: this.now
        });
      } catch (error) {
        lastError = error;
        if (attempt < this.retries) await delay(this.backoffMs * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Forecast provider failed.");
  }

  private withCurrentFreshness(forecast: NormalizedForecast, source: "cache" | "provider"): NormalizedForecast {
    const freshness = freshnessFrom(forecast.freshness.fetchedAt, this.now(), this.freshForMs, this.staleAfterMs);
    const stale = freshness.state === "stale" || freshness.state === "outdated";
    return {
      ...forecast,
      freshness,
      fromCache: source === "cache" || forecast.fromCache,
      stale,
      warnings: stale
        ? mergeWarnings(forecast.warnings, [freshness.state === "outdated" ? "Last update is outdated." : "Last update is getting old."])
        : forecast.warnings,
      missingInformation: freshness.state === "outdated"
        ? mergeWarnings(forecast.missingInformation, ["fresh forecast"])
        : forecast.missingInformation
    };
  }

  private missingForecast(input: ForecastRequest, errors: readonly string[]): NormalizedForecast {
    const fetchedAt = nowIso(this.now);
    const freshness = freshnessFrom(fetchedAt, this.now(), this.freshForMs, this.staleAfterMs);
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: input.timezone ?? "auto",
      hours: input.hours ?? 48,
      correlationId: input.correlationId ?? `forecast:missing:${fetchedAt}`,
      provider: "fallback",
      source: "Signal climate forecast fallback",
      hourly: [],
      summary: {
        nextHours: 0,
        totalPrecipitationMm: 0,
        maxHourlyPrecipitationMm: 0,
        maxPrecipitationProbabilityPercent: 0,
        maxWindSpeedKph: 0,
        weatherCodes: []
      },
      confidence: 0,
      freshness: { ...freshness, state: "missing", score: 0 },
      warnings: mergeWarnings(["Information is missing."], errors),
      missingInformation: ["forecast"],
      stale: true,
      fromCache: false,
      degraded: true
    };
  }

  private circuitOpen(provider: ForecastProvider): boolean {
    const openUntil = this.runtime(provider).circuitOpenUntil;
    return typeof openUntil === "number" && openUntil > this.now().getTime();
  }

  private noteSuccess(provider: ForecastProvider): void {
    const runtime = this.runtime(provider);
    runtime.failureCount = 0;
    runtime.circuitOpenUntil = undefined;
    runtime.health = {
      provider: provider.name,
      healthy: true,
      status: "ok",
      checkedAt: nowIso(this.now),
      failureCount: 0
    };
  }

  private noteFailure(provider: ForecastProvider, message: string): void {
    const runtime = this.runtime(provider);
    runtime.failureCount += 1;
    if (runtime.failureCount >= this.failureThreshold) {
      runtime.circuitOpenUntil = this.now().getTime() + this.circuitOpenMs;
    }
    runtime.health = {
      provider: provider.name,
      healthy: false,
      status: runtime.circuitOpenUntil ? "circuit-open" : "failing",
      checkedAt: nowIso(this.now),
      failureCount: runtime.failureCount,
      ...(runtime.circuitOpenUntil ? { circuitOpenUntil: new Date(runtime.circuitOpenUntil).toISOString() } : {}),
      message
    };
  }

  private runtime(provider: ForecastProvider): ProviderRuntime {
    const existing = this.runtimes.get(provider.name);
    if (existing) return existing;
    const created = { failureCount: 0 };
    this.runtimes.set(provider.name, created);
    return created;
  }
}

export function createClimateForecastClient(options: ForecastClientOptions): ClimateForecastClient {
  return new ClimateForecastClient(options);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
