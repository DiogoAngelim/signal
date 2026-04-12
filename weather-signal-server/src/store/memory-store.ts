import type {
  ForecastSnapshot,
  NormalizedEvent,
  OfficialAlert,
  PolicyDecision,
  ProviderHealth,
  Region,
  ResultRecord,
  RiskScore,
  WebhookDeliveryLog,
  WebhookSubscription
} from "../types/index.js";
import { stableStringify } from "../utils/json.js";
import type { WeatherStore } from "./types.js";

export interface StoreConfig {
  eventRetentionLimit: number;
  decisionRetentionLimit: number;
  resultRetentionLimit: number;
  deliveryLogRetentionLimit: number;
}

export class InMemoryStore implements WeatherStore {
  private regions: Region[] = [];
  private forecasts = new Map<string, ForecastSnapshot>();
  private alertsByRegion = new Map<string, Map<string, OfficialAlert>>();
  private alertHistory = new Map<string, OfficialAlert>();
  private risks = new Map<string, RiskScore>();
  private decisions: PolicyDecision[] = [];
  private events: NormalizedEvent[] = [];
  private providerHealth = new Map<string, ProviderHealth>();
  private webhookSubscriptions = new Map<string, WebhookSubscription>();
  private webhookDeliveryLogs: WebhookDeliveryLog[] = [];
  private results: ResultRecord[] = [];

  constructor(private readonly config: StoreConfig) { }

  setRegions(regions: Region[]): void {
    this.regions = regions;
  }

  getRegions(): Region[] {
    return [...this.regions];
  }

  getRegion(regionId: string): Region | undefined {
    return this.regions.find((region) => region.id === regionId);
  }

  setForecast(snapshot: ForecastSnapshot): void {
    this.forecasts.set(snapshot.regionId, snapshot);
  }

  getForecast(regionId: string): ForecastSnapshot | undefined {
    return this.forecasts.get(regionId);
  }

  listForecasts(): ForecastSnapshot[] {
    return Array.from(this.forecasts.values());
  }

  upsertAlert(alert: OfficialAlert): {
    changed: boolean;
    isDuplicate: boolean;
    previous?: OfficialAlert;
  } {
    const historyKey = `${alert.provider}:${alert.providerEventId}`;
    const previous = this.alertHistory.get(historyKey);
    const previousPayload = previous ? stripAlertRaw(previous) : undefined;
    const nextPayload = stripAlertRaw(alert);
    const isDuplicate = previousPayload
      ? stableStringify(previousPayload) === stableStringify(nextPayload)
      : false;

    if (previous) {
      const previousTimestamp = toTimestamp(previous.updatedAt ?? previous.sentAt);
      const nextTimestamp = toTimestamp(alert.updatedAt ?? alert.sentAt);
      if (previousTimestamp && nextTimestamp && nextTimestamp < previousTimestamp) {
        return { changed: false, isDuplicate: true, previous };
      }
    }

    this.alertHistory.set(historyKey, alert);

    const regionMap = this.alertsByRegion.get(alert.regionId) ?? new Map<string, OfficialAlert>();
    if (alert.status === "cancelled") {
      const removed = regionMap.delete(alert.providerEventId);
      this.alertsByRegion.set(alert.regionId, regionMap);
      return { changed: removed || !isDuplicate, isDuplicate, previous };
    }

    const existing = regionMap.get(alert.providerEventId);
    regionMap.set(alert.providerEventId, alert);
    this.alertsByRegion.set(alert.regionId, regionMap);
    return { changed: !existing || !isDuplicate, isDuplicate, previous: existing };
  }

  getAlerts(regionId: string): OfficialAlert[] {
    return Array.from(this.alertsByRegion.get(regionId)?.values() ?? []);
  }

  listActiveAlerts(): OfficialAlert[] {
    const alerts: OfficialAlert[] = [];
    for (const regionMap of this.alertsByRegion.values()) {
      alerts.push(...regionMap.values());
    }
    return alerts;
  }

  setRisk(risk: RiskScore): void {
    this.risks.set(risk.regionId, risk);
  }

  getRisk(regionId: string): RiskScore | undefined {
    return this.risks.get(regionId);
  }

  listRisks(): RiskScore[] {
    return Array.from(this.risks.values());
  }

  addDecision(decision: PolicyDecision): void {
    this.decisions.unshift(decision);
    this.decisions = this.decisions.slice(0, this.config.decisionRetentionLimit);
  }

  listDecisions(regionId?: string, limit = this.config.decisionRetentionLimit): PolicyDecision[] {
    const decisions = regionId
      ? this.decisions.filter((decision) => decision.regionId === regionId)
      : this.decisions;
    return decisions.slice(0, limit);
  }

  addEvent(event: NormalizedEvent): void {
    this.events.unshift(event);
    this.events = this.events.slice(0, this.config.eventRetentionLimit);
  }

  listEvents(limit = this.config.eventRetentionLimit): NormalizedEvent[] {
    return this.events.slice(0, limit);
  }

  setProviderHealth(health: ProviderHealth): void {
    this.providerHealth.set(health.provider, health);
  }

  getProviderHealth(provider: string): ProviderHealth | undefined {
    return this.providerHealth.get(provider);
  }

  listProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  addWebhookSubscription(subscription: WebhookSubscription): void {
    this.webhookSubscriptions.set(subscription.id, subscription);
  }

  getWebhookSubscription(id: string): WebhookSubscription | undefined {
    return this.webhookSubscriptions.get(id);
  }

  deleteWebhookSubscription(id: string): boolean {
    return this.webhookSubscriptions.delete(id);
  }

  listWebhookSubscriptions(): WebhookSubscription[] {
    return Array.from(this.webhookSubscriptions.values());
  }

  addWebhookDeliveryLog(log: WebhookDeliveryLog): void {
    this.webhookDeliveryLogs.unshift(log);
    this.webhookDeliveryLogs = this.webhookDeliveryLogs.slice(
      0,
      this.config.deliveryLogRetentionLimit
    );
  }

  listWebhookDeliveryLogs(limit = this.config.deliveryLogRetentionLimit): WebhookDeliveryLog[] {
    return this.webhookDeliveryLogs.slice(0, limit);
  }

  addResultRecord(record: ResultRecord): void {
    this.results.unshift(record);
    this.results = this.results.slice(0, this.config.resultRetentionLimit);
  }

  listResultRecords(limit = this.config.resultRetentionLimit): ResultRecord[] {
    return this.results.slice(0, limit);
  }
}

function toTimestamp(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

function stripAlertRaw(alert: OfficialAlert): OfficialAlert {
  return { ...alert, raw: undefined };
}
