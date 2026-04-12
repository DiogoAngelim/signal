import type { Logger } from "pino";
import type { Provider } from "../providers/types.js";
import type { Region } from "../types/index.js";
import { ProviderHealthService } from "./provider-health.js";
import { ForecastService } from "./forecast-service.js";
import { AlertService } from "./alert-service.js";
import { RiskService } from "./risk-service.js";
import { DecisionService, DecisionContext } from "./decision-service.js";
import { WebsocketBroadcastService } from "../websocket/broadcast.js";

interface PollingOptions {
  forecastIntervalMs: number;
  alertIntervalMs: number;
}

export class PollingService {
  private forecastHandle?: NodeJS.Timeout;
  private alertHandle?: NodeJS.Timeout;
  private forecastRunning = false;
  private alertRunning = false;

  constructor(
    private readonly providers: Provider[],
    private readonly regions: Region[],
    private readonly forecastService: ForecastService,
    private readonly alertService: AlertService,
    private readonly riskService: RiskService,
    private readonly decisionService: DecisionService,
    private readonly providerHealthService: ProviderHealthService,
    private readonly websocket: WebsocketBroadcastService,
    private readonly logger: Logger,
    private readonly options: PollingOptions
  ) { }

  start(): void {
    this.forecastHandle = setInterval(() => {
      void this.runForecastPoll();
    }, this.options.forecastIntervalMs);
    this.alertHandle = setInterval(() => {
      void this.runAlertPoll();
    }, this.options.alertIntervalMs);

    void this.runForecastPoll();
    void this.runAlertPoll();
  }

  stop(): void {
    if (this.forecastHandle) {
      clearInterval(this.forecastHandle);
    }
    if (this.alertHandle) {
      clearInterval(this.alertHandle);
    }
  }

  async runForecastPoll(): Promise<{ updatedRegions: string[] }> {
    if (this.forecastRunning) {
      this.logger.warn("Forecast poll skipped: previous run still active");
      return { updatedRegions: [] };
    }
    this.forecastRunning = true;
    const updatedRegions: string[] = [];

    try {
      const providers = this.providers.filter((provider) => provider.supportsForecasts());
      for (const provider of providers) {
        const start = Date.now();
        try {
          const results = await provider.fetchForecasts(this.regions);
          const updated = this.forecastService.ingest(provider.getName(), results);
          updatedRegions.push(...updated);
          const health = this.providerHealthService.recordSuccess(
            provider.getName(),
            Date.now() - start
          );
          this.websocket.broadcast("weather.providerHealth", "update", health);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Forecast provider failed";
          const health = this.providerHealthService.recordFailure(provider.getName(), message);
          this.websocket.broadcast("weather.providerHealth", "update", health);
          this.logger.warn({ provider: provider.getName(), error: message }, "Forecast provider error");
        }
      }

      const uniqueRegions = Array.from(new Set(updatedRegions));
      if (uniqueRegions.length > 0) {
        this.riskService.compute(uniqueRegions);
        this.decisionService.compute(uniqueRegions);
      }

      return { updatedRegions: uniqueRegions };
    } finally {
      this.forecastRunning = false;
    }
  }

  async runAlertPoll(): Promise<{ updatedRegions: string[] }> {
    if (this.alertRunning) {
      this.logger.warn("Alert poll skipped: previous run still active");
      return { updatedRegions: [] };
    }
    this.alertRunning = true;
    const updatedRegions: string[] = [];

    try {
      const providers = this.providers.filter((provider) => provider.supportsAlerts());
      const decisionContext = new Map<string, DecisionContext>();
      for (const provider of providers) {
        const start = Date.now();
        try {
          const results = await provider.fetchAlerts(this.regions);
          const ingestion = this.alertService.ingest(provider.getName(), results);
          updatedRegions.push(...ingestion.updatedRegions, ...ingestion.cancellationRegions);

          for (const regionId of ingestion.duplicateRegions) {
            decisionContext.set(regionId, { isDuplicate: true });
          }
          for (const regionId of ingestion.cancellationRegions) {
            decisionContext.set(regionId, { isCancellation: true });
          }

          const health = this.providerHealthService.recordSuccess(
            provider.getName(),
            Date.now() - start
          );
          this.websocket.broadcast("weather.providerHealth", "update", health);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Alert provider failed";
          const health = this.providerHealthService.recordFailure(provider.getName(), message);
          this.websocket.broadcast("weather.providerHealth", "update", health);
          this.logger.warn({ provider: provider.getName(), error: message }, "Alert provider error");
        }
      }

      const uniqueRegions = Array.from(new Set(updatedRegions));
      if (uniqueRegions.length > 0) {
        this.riskService.compute(uniqueRegions);
        this.decisionService.compute(uniqueRegions, decisionContext);
      }

      return { updatedRegions: uniqueRegions };
    } finally {
      this.alertRunning = false;
    }
  }
}
