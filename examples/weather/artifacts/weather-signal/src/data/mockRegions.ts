export type StatusLevel = "Calm" | "Watch" | "Warning" | "Critical";

export interface Alert {
  id: string;
  message: string;
  severity: StatusLevel;
  issuedAt: string;
}

export interface ForecastPoint {
  hour: string;   // e.g. "6am", "12pm"
  riskScore: number;
  label: string;  // e.g. "Calm", "Watch"
}

export interface RegionEvent {
  id: string;
  description: string;
  timestamp: string;
}

export interface Region {
  id: string;
  name: string;
  country: string;
  countryFlag: string;
  status: StatusLevel;
  riskScore: number;       // 0–100
  topConcern: string;
  summary: string;         // 1-2 sentences, plain language
  riskDrivers: string[];   // 2-3 strings
  alerts: Alert[];
  recentEvents: RegionEvent[];
  lastUpdated: string;     // ISO string
  forecastPoints: ForecastPoint[];
  trend: "improving" | "worsening" | "stable";
}

export const MOCK_REGIONS: Region[] = [
  {
    id: "nyc",
    name: "New York City",
    country: "United States",
    countryFlag: "🇺🇸",
    status: "Watch",
    riskScore: 42,
    topConcern: "Strong winds and coastal flooding risk",
    summary: "A rapidly intensifying low-pressure system is bringing gusty winds and some coastal flooding risk to lower Manhattan. Most daily activities can continue with caution.",
    riskDrivers: ["Wind gusts up to 55 mph expected by evening", "Coastal flood advisory in effect for Lower Manhattan", "Flight delays likely at JFK and LGA"],
    alerts: [
      { id: "nyc-1", message: "Coastal Flood Advisory — Lower Manhattan, 6PM–Midnight", severity: "Watch", issuedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    ],
    recentEvents: [
      { id: "nyc-e1", description: "Wind advisory upgraded to Watch status", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
      { id: "nyc-e2", description: "NWS issued coastal flood advisory for Lower Manhattan", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
      { id: "nyc-e3", description: "Status updated from Calm to Watch", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 42, label: "Watch" },
      { hour: "3pm", riskScore: 58, label: "Warning" },
      { hour: "6pm", riskScore: 65, label: "Warning" },
      { hour: "9pm", riskScore: 70, label: "Warning" },
      { hour: "Mid", riskScore: 48, label: "Watch" },
      { hour: "6am", riskScore: 22, label: "Calm" },
    ],
    trend: "worsening",
  },
  {
    id: "miami",
    name: "Miami",
    country: "United States",
    countryFlag: "🇺🇸",
    status: "Warning",
    riskScore: 71,
    topConcern: "Tropical storm watch in effect",
    summary: "A developing tropical system is approaching the Florida coast. Conditions will deteriorate rapidly through tonight. Preparation is strongly advised.",
    riskDrivers: ["Tropical storm watch effective until further notice", "Heavy rain and storm surge expected 6–24 hrs", "Mandatory evacuation in effect for Zone A"],
    alerts: [
      { id: "mia-1", message: "Tropical Storm Watch — Broward & Miami-Dade Counties", severity: "Warning", issuedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
      { id: "mia-2", message: "Zone A Mandatory Evacuation Order in Effect", severity: "Critical", issuedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
    ],
    recentEvents: [
      { id: "mia-e1", description: "Tropical Storm Watch issued by NHC", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
      { id: "mia-e2", description: "Status elevated from Watch to Warning", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
      { id: "mia-e3", description: "Mandatory evacuation order issued for Zone A", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
      { id: "mia-e4", description: "Risk score updated: 58 → 71", timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 71, label: "Warning" },
      { hour: "3pm", riskScore: 80, label: "Critical" },
      { hour: "6pm", riskScore: 88, label: "Critical" },
      { hour: "9pm", riskScore: 90, label: "Critical" },
      { hour: "Mid", riskScore: 75, label: "Warning" },
      { hour: "6am", riskScore: 55, label: "Warning" },
    ],
    trend: "worsening",
  },
  {
    id: "houston",
    name: "Houston",
    country: "United States",
    countryFlag: "🇺🇸",
    status: "Warning",
    riskScore: 63,
    topConcern: "Flash flood emergency in Harris County",
    summary: "Slow-moving thunderstorms are producing extreme rainfall totals across the metro area. Roads in low-lying areas are impassable. Avoid non-essential travel.",
    riskDrivers: ["Rainfall totals of 6–10 inches in last 12 hours", "Flash Flood Emergency for Harris County", "Multiple road closures across I-10 corridor"],
    alerts: [
      { id: "hou-1", message: "Flash Flood Emergency — Harris County", severity: "Critical", issuedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
    ],
    recentEvents: [
      { id: "hou-e1", description: "Flash Flood Warning upgraded to Emergency", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
      { id: "hou-e2", description: "Multiple road closures reported on I-10", timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
      { id: "hou-e3", description: "Rainfall exceeded 8 inches in Katy area", timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 63, label: "Warning" },
      { hour: "3pm", riskScore: 70, label: "Warning" },
      { hour: "6pm", riskScore: 55, label: "Warning" },
      { hour: "9pm", riskScore: 40, label: "Watch" },
      { hour: "Mid", riskScore: 28, label: "Watch" },
      { hour: "6am", riskScore: 15, label: "Calm" },
    ],
    trend: "improving",
  },
  {
    id: "juiz-de-fora",
    name: "Juiz de Fora",
    country: "Brazil",
    countryFlag: "🇧🇷",
    status: "Calm",
    riskScore: 14,
    topConcern: "Routine afternoon convective showers",
    summary: "Typical summer afternoon showers are expected. No significant weather risk. Normal operations recommended.",
    riskDrivers: ["Isolated afternoon showers possible", "Temperatures near seasonal average", "No active alerts"],
    alerts: [],
    recentEvents: [
      { id: "jdf-e1", description: "Status confirmed as Calm — routine monitoring", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 14, label: "Calm" },
      { hour: "3pm", riskScore: 20, label: "Calm" },
      { hour: "6pm", riskScore: 18, label: "Calm" },
      { hour: "9pm", riskScore: 10, label: "Calm" },
      { hour: "Mid", riskScore: 8, label: "Calm" },
      { hour: "6am", riskScore: 10, label: "Calm" },
    ],
    trend: "stable",
  },
  {
    id: "sao-paulo",
    name: "São Paulo",
    country: "Brazil",
    countryFlag: "🇧🇷",
    status: "Watch",
    riskScore: 38,
    topConcern: "Severe thunderstorm risk this evening",
    summary: "A line of strong thunderstorms is expected to move through the metro area between 5–9pm. Lightning and localized street flooding are the main concerns.",
    riskDrivers: ["Severe thunderstorm watch effective 4PM–10PM", "Lightning risk elevated in the afternoon", "Urban drainage may cause localized flooding"],
    alerts: [
      { id: "sp-1", message: "Severe Thunderstorm Watch — Greater São Paulo Metro, 4PM–10PM", severity: "Watch", issuedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
    ],
    recentEvents: [
      { id: "sp-e1", description: "Thunderstorm Watch issued by INMET", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
      { id: "sp-e2", description: "Status elevated from Calm to Watch", timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 38, label: "Watch" },
      { hour: "3pm", riskScore: 50, label: "Watch" },
      { hour: "6pm", riskScore: 62, label: "Warning" },
      { hour: "9pm", riskScore: 45, label: "Watch" },
      { hour: "Mid", riskScore: 22, label: "Calm" },
      { hour: "6am", riskScore: 12, label: "Calm" },
    ],
    trend: "worsening",
  },
  {
    id: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    countryFlag: "🇵🇹",
    status: "Calm",
    riskScore: 8,
    topConcern: "Clear skies, no active concerns",
    summary: "Lisbon is experiencing excellent weather with no active threats. Conditions are expected to remain stable through the week.",
    riskDrivers: ["Clear skies and mild temperatures", "Light westerly breeze", "No active weather warnings"],
    alerts: [],
    recentEvents: [
      { id: "lis-e1", description: "Routine monitoring — all clear", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 8, label: "Calm" },
      { hour: "3pm", riskScore: 10, label: "Calm" },
      { hour: "6pm", riskScore: 12, label: "Calm" },
      { hour: "9pm", riskScore: 9, label: "Calm" },
      { hour: "Mid", riskScore: 7, label: "Calm" },
      { hour: "6am", riskScore: 8, label: "Calm" },
    ],
    trend: "stable",
  },
];