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

export interface WeatherStore {
  setRegions(regions: Region[]): void;
  getRegions(): Region[];
  getRegion(regionId: string): Region | undefined;
  setForecast(snapshot: ForecastSnapshot): void;
  getForecast(regionId: string): ForecastSnapshot | undefined;
  listForecasts(): ForecastSnapshot[];
  upsertAlert(alert: OfficialAlert): {
    changed: boolean;
    isDuplicate: boolean;
    previous?: OfficialAlert;
  };
  getAlerts(regionId: string): OfficialAlert[];
  listActiveAlerts(): OfficialAlert[];
  setRisk(risk: RiskScore): void;
  getRisk(regionId: string): RiskScore | undefined;
  listRisks(): RiskScore[];
  addDecision(decision: PolicyDecision): void;
  listDecisions(regionId?: string, limit?: number): PolicyDecision[];
  addEvent(event: NormalizedEvent): void;
  listEvents(limit?: number): NormalizedEvent[];
  setProviderHealth(health: ProviderHealth): void;
  getProviderHealth(provider: string): ProviderHealth | undefined;
  listProviderHealth(): ProviderHealth[];
  addWebhookSubscription(subscription: WebhookSubscription): void;
  getWebhookSubscription(id: string): WebhookSubscription | undefined;
  deleteWebhookSubscription(id: string): boolean;
  listWebhookSubscriptions(): WebhookSubscription[];
  addWebhookDeliveryLog(log: WebhookDeliveryLog): void;
  listWebhookDeliveryLogs(limit?: number): WebhookDeliveryLog[];
  addResultRecord(record: ResultRecord): void;
  listResultRecords(limit?: number): ResultRecord[];
}
