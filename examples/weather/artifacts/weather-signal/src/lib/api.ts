import type { Alert, LiveUpdate, ProviderHealthView, Region, RegionEvent, StatusLevel } from "@/types/weather";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
const wsBaseOverride = import.meta.env.VITE_WS_BASE_URL as string | undefined;

interface ApiResponse<T> {
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta?: Record<string, unknown>;
}

interface BackendRegion {
  id: string;
  name: string;
  country: string;
  state?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  criticalityWeight?: number;
  tags?: string[];
}

interface BackendRiskScore {
  regionId: string;
  computedAt: string;
  dataConfidence: number;
  precipitationRisk: RiskComponent;
  floodRisk: RiskComponent;
  windRisk: RiskComponent;
  heatRisk: RiskComponent;
  stormRisk: RiskComponent;
  landslideRisk: RiskComponent;
  compositeRisk: RiskComponent;
}

interface RiskComponent {
  score: number;
  level: "low" | "guarded" | "elevated" | "high" | "critical";
  topDrivers: Array<{ name: string; weight: number; value: number | string | boolean }>;
}

interface BackendAlert {
  provider: string;
  providerEventId: string;
  regionId: string;
  hazards: string[];
  severity: "info" | "minor" | "moderate" | "severe" | "extreme";
  certainty: string;
  urgency: string;
  status: "active" | "cancelled" | "unknown";
  headline?: string;
  description?: string;
  instruction?: string;
  sentAt?: string;
  effectiveAt?: string;
  onsetAt?: string;
  endsAt?: string;
  updatedAt?: string;
}

interface BackendForecast {
  regionId: string;
  provider: string;
  fetchedAt: string;
  validFrom: string;
  validTo: string;
  metrics: {
    precipitationMmNext6h: number;
    precipitationMmNext24h: number;
    windGustKphMax: number;
    temperatureCMax: number;
    temperatureCMin: number;
    weatherCodeMax?: number;
  };
}

interface BackendEvent {
  name: string;
  timestamp: string;
  messageId: string;
  source: {
    regionId?: string;
    provider?: string;
  };
  payload: unknown;
}

interface BackendDecision {
  regionId: string;
  decision: string;
  confidence: number;
  reasons: string[];
  generatedAt: string;
}

export async function fetchRegions(): Promise<Region[]> {
  const regions = await request<BackendRegion[]>("/regions");
  const [risks, alerts, forecasts, decisions, events] = await Promise.all([
    requestSafe<BackendRiskScore[]>("/risk/latest", []),
    requestSafe<BackendAlert[]>("/alerts/active", []),
    requestSafe<BackendForecast[]>("/forecast/latest", []),
    requestSafe<BackendDecision[]>("/decisions/recent", []),
    requestSafe<BackendEvent[]>("/events/recent", [])
  ]);

  const riskMap = mapByRegion(risks);
  const alertMap = mapByRegion(alerts);
  const forecastMap = mapByRegion(forecasts);
  const decisionMap = mapByRegion(decisions);
  const eventMap = mapEventsByRegion(events);

  return regions.map((region) =>
    toRegionView(
      region,
      riskMap.get(region.id)?.[0],
      alertMap.get(region.id) ?? [],
      forecastMap.get(region.id)?.[0],
      decisionMap.get(region.id)?.[0],
      eventMap.get(region.id) ?? []
    )
  );
}

export async function fetchRegion(id: string): Promise<Region | null> {
  try {
    const region = await request<BackendRegion>(`/regions/${id}`);
    const [risk, alerts, forecast, decisions, events] = await Promise.all([
      requestSafe<BackendRiskScore | undefined>(`/regions/${id}/risk`, undefined),
      requestSafe<BackendAlert[]>(`/regions/${id}/alerts`, []),
      requestSafe<BackendForecast | undefined>(`/regions/${id}/forecast`, undefined),
      requestSafe<BackendDecision[]>(`/regions/${id}/decisions`, []),
      requestSafe<BackendEvent[]>(`/events/recent`, [])
    ]);

    const regionEvents = (events ?? []).filter((event) => event.source?.regionId === id);

    return toRegionView(
      region,
      risk ?? undefined,
      alerts ?? [],
      forecast ?? undefined,
      decisions?.[0],
      regionEvents
    );
  } catch {
    return null;
  }
}

export async function fetchProviderHealth(): Promise<ProviderHealthView[]> {
  return requestSafe<ProviderHealthView[]>("/providers/health", []);
}

export async function fetchRecentUpdates(): Promise<LiveUpdate[]> {
  const events = await requestSafe<BackendEvent[]>("/events/recent", []);
  const regionMap = await loadRegionNameMap();
  return (events ?? []).map((event) => toLiveUpdate(event, regionMap)).filter(Boolean) as LiveUpdate[];
}

export async function subscribeToUpdates(
  cb: (update: LiveUpdate) => void
): Promise<() => void> {
  const regionMap = await loadRegionNameMap();
  const wsUrl = buildWsUrl("/ws");
  const socket = new WebSocket(wsUrl);

  const onMessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(String(event.data)) as {
        channel: string;
        type: string;
        timestamp: string;
        data: unknown;
      };
      const update = messageToUpdate(message, regionMap);
      if (update) {
        cb(update);
      }
    } catch {
      return;
    }
  };

  const onOpen = () => {
    ["weather.alerts", "weather.risks", "weather.decisions", "weather.events"].forEach(
      (channel) => {
        socket.send(JSON.stringify({ action: "subscribe", channel }));
      }
    );
  };

  socket.addEventListener("open", onOpen);
  socket.addEventListener("message", onMessage);

  return () => {
    socket.removeEventListener("open", onOpen);
    socket.removeEventListener("message", onMessage);
    socket.close();
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const body = (await response.json()) as ApiResponse<T>;
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.data;
}

async function requestSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await request<T>(path);
  } catch {
    return fallback;
  }
}

function buildApiUrl(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalized}`;
}

function buildWsUrl(path: string): string {
  if (wsBaseOverride) {
    return `${wsBaseOverride.replace(/\/$/, "")}${path}`;
  }
  if (apiBase.startsWith("http")) {
    const url = new URL(apiBase);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}${path}`;
  }
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
}

function mapByRegion<T extends { regionId?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items ?? []) {
    const regionId = item.regionId;
    if (!regionId) {
      continue;
    }
    const current = map.get(regionId) ?? [];
    current.push(item);
    map.set(regionId, current);
  }
  return map;
}

function mapEventsByRegion(events: BackendEvent[]): Map<string, BackendEvent[]> {
  const map = new Map<string, BackendEvent[]>();
  for (const event of events ?? []) {
    const regionId = event.source?.regionId;
    if (!regionId) {
      continue;
    }
    const current = map.get(regionId) ?? [];
    current.push(event);
    map.set(regionId, current);
  }
  return map;
}

function toRegionView(
  region: BackendRegion,
  risk?: BackendRiskScore,
  alerts: BackendAlert[] = [],
  forecast?: BackendForecast,
  decision?: BackendDecision,
  events: BackendEvent[] = []
): Region {
  const riskScore = Math.round((risk?.compositeRisk.score ?? 0) * 100);
  const status = mapRiskToStatus(risk, decision);
  const updatedAt = risk?.computedAt ?? forecast?.fetchedAt ?? new Date().toISOString();
  const drivers = buildDrivers(risk);
  const trend = buildTrend(forecast, riskScore);
  const topConcern = buildTopConcern(alerts, risk, decision);
  const summary = buildSummary(status, alerts);
  const alertItems = alerts.map(toAlertView);
  const recentEvents = toRegionEvents(events, alerts);
  const forecastPoints = buildForecastPoints(riskScore, forecast);

  return {
    id: region.id,
    name: region.name,
    country: countryName(region.country),
    countryFlag: countryFlag(region.country),
    latitude: region.latitude,
    longitude: region.longitude,
    timezone: region.timezone,
    state: region.state,
    tags: region.tags,
    status,
    riskScore,
    topConcern,
    summary,
    riskDrivers: drivers,
    alerts: alertItems,
    recentEvents,
    lastUpdated: updatedAt,
    forecastPoints,
    trend
  };
}

function buildDrivers(risk?: BackendRiskScore): string[] {
  if (!risk) {
    return ["No risk drivers available yet"];
  }
  const drivers = [
    ...risk.precipitationRisk.topDrivers,
    ...risk.floodRisk.topDrivers,
    ...risk.windRisk.topDrivers,
    ...risk.heatRisk.topDrivers,
    ...risk.stormRisk.topDrivers,
    ...risk.landslideRisk.topDrivers,
    ...risk.compositeRisk.topDrivers
  ];

  return drivers
    .sort((a, b) => b.weight - a.weight)
    .map((driver) => formatDriver(driver.name, driver.value))
    .filter(Boolean)
    .slice(0, 3);
}

function formatDriver(name: string, value: number | string | boolean): string {
  const label = name.replace(/_/g, " ").replace(/\./g, " ");
  if (typeof value === "boolean") {
    return value ? label : "";
  }
  if (typeof value === "number") {
    return `${label}: ${value.toFixed(1)}`;
  }
  return `${label}: ${value}`;
}

function buildTopConcern(
  alerts: BackendAlert[],
  risk?: BackendRiskScore,
  decision?: BackendDecision
): string {
  if (alerts.length > 0) {
    const alert = alerts[0];
    return alert.headline ?? alert.description ?? `${alert.hazards?.[0] ?? "Active alert"}`;
  }
  if (decision) {
    return `Decision: ${decision.decision.replace(/_/g, " ").toLowerCase()}`;
  }
  if (risk) {
    return `Composite risk level is ${risk.compositeRisk.level}`;
  }
  return "Awaiting data";
}

function buildSummary(status: StatusLevel, alerts: BackendAlert[]): string {
  if (alerts.length > 0) {
    return `${alerts.length} active alert${alerts.length > 1 ? "s" : ""} - ${status} posture.`;
  }
  return `Composite status: ${status}. Monitoring continues.`;
}

function buildTrend(forecast?: BackendForecast, riskScore?: number): "improving" | "worsening" | "stable" {
  if (!forecast) {
    return "stable";
  }
  const precip = forecast.metrics.precipitationMmNext24h;
  if (precip > 40 || (riskScore ?? 0) > 70) {
    return "worsening";
  }
  if (precip < 10 && (riskScore ?? 0) < 30) {
    return "improving";
  }
  return "stable";
}

function buildForecastPoints(riskScore: number, forecast?: BackendForecast): Array<{
  hour: string;
  riskScore: number;
  label: StatusLevel;
}> {
  const steps = ["Now", "3h", "6h", "12h", "18h", "24h"];
  const precipFactor = forecast ? Math.min(20, (forecast.metrics.precipitationMmNext24h / 80) * 20) : 0;
  const windFactor = forecast ? Math.min(10, (forecast.metrics.windGustKphMax / 90) * 10) : 0;
  const delta = precipFactor + windFactor;

  return steps.map((hour, idx) => {
    const ratio = steps.length === 1 ? 0 : idx / (steps.length - 1);
    const score = clampScore(riskScore + delta * (ratio - 0.5));
    return {
      hour,
      riskScore: score,
      label: statusFromScore(score)
    };
  });
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusFromScore(score: number): StatusLevel {
  if (score >= 80) return "Critical";
  if (score >= 60) return "Warning";
  if (score >= 35) return "Watch";
  return "Calm";
}

function mapRiskToStatus(risk?: BackendRiskScore, decision?: BackendDecision): StatusLevel {
  if (decision) {
    const normalized = decision.decision.toLowerCase();
    if (normalized.includes("escalate") || normalized.includes("dispatch")) return "Critical";
    if (normalized.includes("warn")) return "Warning";
    if (normalized.includes("watch")) return "Watch";
  }
  switch (risk?.compositeRisk.level) {
    case "critical":
      return "Critical";
    case "high":
      return "Warning";
    case "elevated":
    case "guarded":
      return "Watch";
    default:
      return "Calm";
  }
}

function toAlertView(alert: BackendAlert): Alert {
  return {
    id: alert.providerEventId,
    message: alert.headline ?? alert.description ?? "Official alert active",
    severity: mapAlertSeverity(alert.severity),
    issuedAt: alert.sentAt ?? alert.effectiveAt ?? new Date().toISOString()
  };
}

function mapAlertSeverity(severity: BackendAlert["severity"]): StatusLevel {
  switch (severity) {
    case "extreme":
      return "Critical";
    case "severe":
      return "Warning";
    case "moderate":
      return "Watch";
    case "minor":
      return "Watch";
    default:
      return "Calm";
  }
}

function toRegionEvents(events: BackendEvent[], alerts: BackendAlert[]): RegionEvent[] {
  const items = events.slice(0, 6).map((event) => ({
    id: event.messageId,
    description: describeEvent(event, alerts),
    timestamp: event.timestamp
  }));
  return items;
}

function describeEvent(event: BackendEvent, alerts: BackendAlert[]): string {
  if (event.name.startsWith("weather.alert")) {
    const payload = event.payload as BackendAlert | undefined;
    return payload?.headline ?? payload?.description ?? "Alert updated";
  }
  if (event.name === "weather.risk.computed") {
    const payload = event.payload as BackendRiskScore | undefined;
    const score = payload ? Math.round(payload.compositeRisk.score * 100) : "";
    return `Risk recomputed${score ? `: ${score}` : ""}`;
  }
  if (event.name === "weather.decision.made") {
    const payload = event.payload as BackendDecision | undefined;
    return payload ? `Decision: ${payload.decision}` : "Decision updated";
  }
  if (event.name === "weather.forecast.updated") {
    return "Forecast updated";
  }
  if (alerts.length > 0) {
    return alerts[0].headline ?? "Alert activity detected";
  }
  return event.name.replace(/\./g, " ");
}

async function loadRegionNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const regions = await request<BackendRegion[]>("/regions");
    regions.forEach((region) => map.set(region.id, region.name));
  } catch {
    return map;
  }
  return map;
}

function messageToUpdate(
  message: { channel: string; type: string; timestamp: string; data: unknown },
  regionMap: Map<string, string>
): LiveUpdate | null {
  const timestamp = message.timestamp ?? new Date().toISOString();
  if (message.channel === "weather.alerts") {
    const alert = message.data as BackendAlert;
    return {
      id: alert.providerEventId ?? `${alert.regionId}-${timestamp}`,
      regionId: alert.regionId,
      regionName: regionMap.get(alert.regionId) ?? alert.regionId,
      message: alert.headline ?? alert.description ?? "Alert updated",
      status: mapAlertSeverity(alert.severity),
      timestamp
    };
  }
  if (message.channel === "weather.risks") {
    const risk = message.data as BackendRiskScore;
    const score = Math.round(risk.compositeRisk.score * 100);
    return {
      id: `${risk.regionId}-${timestamp}`,
      regionId: risk.regionId,
      regionName: regionMap.get(risk.regionId) ?? risk.regionId,
      message: `Risk updated: ${score}/100`,
      status: mapRiskToStatus(risk),
      timestamp
    };
  }
  if (message.channel === "weather.decisions") {
    const decision = message.data as BackendDecision;
    return {
      id: `${decision.regionId}-${timestamp}`,
      regionId: decision.regionId,
      regionName: regionMap.get(decision.regionId) ?? decision.regionId,
      message: `Decision: ${decision.decision}`,
      status: mapRiskToStatus(undefined, decision),
      timestamp
    };
  }
  if (message.channel === "weather.events") {
    const event = message.data as BackendEvent;
    const regionId = event.source?.regionId ?? "system";
    return {
      id: event.messageId,
      regionId,
      regionName: regionMap.get(regionId) ?? regionId,
      message: describeEvent(event, []),
      status: "Watch",
      timestamp
    };
  }
  return null;
}

function toLiveUpdate(event: BackendEvent, regionMap: Map<string, string>): LiveUpdate | null {
  const regionId = event.source?.regionId;
  if (!regionId) {
    return null;
  }
  return {
    id: event.messageId,
    regionId,
    regionName: regionMap.get(regionId) ?? regionId,
    message: describeEvent(event, []),
    status: "Watch",
    timestamp: event.timestamp
  };
}

function countryFlag(country: string): string {
  const normalized = country.trim().toUpperCase();
  const map: Record<string, string> = {
    US: "🇺🇸",
    USA: "🇺🇸",
    BRAZIL: "🇧🇷",
    BR: "🇧🇷",
    PORTUGAL: "🇵🇹",
    PT: "🇵🇹"
  };
  return map[normalized] ?? "🌍";
}

function countryName(country: string): string {
  const normalized = country.trim().toUpperCase();
  const map: Record<string, string> = {
    US: "United States",
    USA: "United States",
    BR: "Brazil",
    BRAZIL: "Brazil",
    PT: "Portugal",
    PORTUGAL: "Portugal"
  };
  return map[normalized] ?? country;
}