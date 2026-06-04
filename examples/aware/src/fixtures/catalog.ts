import type { AwareFixtureScenario, FixtureScenarioId, Region } from "../contracts.js";

export const AWARE_FIXTURE_IDS = [
  "normal-day",
  "strong-uv-day",
  "heat-warning-day",
  "heavy-rain-flood-risk-day",
  "poor-air-quality-day",
  "mosquito-activity-warning",
  "multiple-simultaneous-risks",
  "source-unavailable"
] as const satisfies readonly FixtureScenarioId[];

export const fixtureRegions: Region[] = [
  {
    id: "miami-fl",
    name: "Miami",
    adminArea: "Florida",
    country: "United States",
    latitude: 25.7617,
    longitude: -80.1918,
    timezone: "America/New_York",
    searchTerms: ["miami", "miami-dade", "florida", "south florida"],
    defaultFixtureId: "multiple-simultaneous-risks"
  },
  {
    id: "phoenix-az",
    name: "Phoenix",
    adminArea: "Arizona",
    country: "United States",
    latitude: 33.4484,
    longitude: -112.074,
    timezone: "America/Phoenix",
    searchTerms: ["phoenix", "maricopa", "arizona", "valley"],
    defaultFixtureId: "heat-warning-day"
  },
  {
    id: "seattle-wa",
    name: "Seattle",
    adminArea: "Washington",
    country: "United States",
    latitude: 47.6062,
    longitude: -122.3321,
    timezone: "America/Los_Angeles",
    searchTerms: ["seattle", "king county", "washington", "puget sound"],
    defaultFixtureId: "normal-day"
  },
  {
    id: "houston-tx",
    name: "Houston",
    adminArea: "Texas",
    country: "United States",
    latitude: 29.7604,
    longitude: -95.3698,
    timezone: "America/Chicago",
    searchTerms: ["houston", "harris county", "texas", "gulf coast"],
    defaultFixtureId: "heavy-rain-flood-risk-day"
  },
  {
    id: "new-york-ny",
    name: "New York",
    adminArea: "New York",
    country: "United States",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: "America/New_York",
    searchTerms: ["new york", "nyc", "manhattan", "brooklyn", "queens"],
    defaultFixtureId: "poor-air-quality-day"
  },
  {
    id: "san-juan-pr",
    name: "San Juan",
    adminArea: "Puerto Rico",
    country: "United States",
    latitude: 18.4655,
    longitude: -66.1057,
    timezone: "America/Puerto_Rico",
    searchTerms: ["san juan", "puerto rico", "pr"],
    defaultFixtureId: "mosquito-activity-warning"
  }
];

export const awareFixtureCatalog: Record<FixtureScenarioId, AwareFixtureScenario> = {
  "normal-day": {
    id: "normal-day",
    label: "Normal day",
    regionId: "seattle-wa",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 0,
      rainSeverity: 0,
      uvSeverity: 0,
      maxTemperatureC: 21,
      precipitationMm: 1,
      uvIndex: 4
    },
    airQuality: {
      severity: 0,
      usAqi: 38,
      pm25: 7
    },
    pollen: {
      severity: 0,
      index: 2,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 0,
      headline: "No active official weather alerts found in the fixture.",
      urgency: "none"
    },
    mosquito: {
      severity: 0,
      activityIndex: 2,
      rationale: "Cooler temperatures and little standing-water signal."
    }
  },
  "strong-uv-day": {
    id: "strong-uv-day",
    label: "Strong UV day",
    regionId: "miami-fl",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 1,
      rainSeverity: 0,
      uvSeverity: 2,
      maxTemperatureC: 31,
      precipitationMm: 3,
      uvIndex: 10
    },
    airQuality: {
      severity: 0,
      usAqi: 44,
      pm25: 8
    },
    pollen: {
      severity: 1,
      index: 4,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 0,
      headline: "No active official weather alerts found in the fixture.",
      urgency: "none"
    },
    mosquito: {
      severity: 1,
      activityIndex: 4,
      rationale: "Warm, humid conditions can support mosquito activity."
    }
  },
  "heat-warning-day": {
    id: "heat-warning-day",
    label: "Heat warning day",
    regionId: "phoenix-az",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 3,
      rainSeverity: 0,
      uvSeverity: 2,
      maxTemperatureC: 43,
      precipitationMm: 0,
      uvIndex: 9
    },
    airQuality: {
      severity: 1,
      usAqi: 83,
      pm25: 15
    },
    pollen: {
      severity: 0,
      index: 2,
      dominant: "olive"
    },
    officialAlerts: {
      severity: 2,
      headline: "Heat advisory in effect for the afternoon.",
      urgency: "moderate"
    },
    mosquito: {
      severity: 0,
      activityIndex: 1,
      rationale: "Very dry conditions reduce the placeholder activity signal."
    }
  },
  "heavy-rain-flood-risk-day": {
    id: "heavy-rain-flood-risk-day",
    label: "Heavy rain and flood risk day",
    regionId: "houston-tx",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 0,
      rainSeverity: 3,
      uvSeverity: 0,
      maxTemperatureC: 27,
      precipitationMm: 82,
      uvIndex: 3
    },
    airQuality: {
      severity: 0,
      usAqi: 42,
      pm25: 7
    },
    pollen: {
      severity: 1,
      index: 4,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 3,
      headline: "Flash flood warning for parts of the region.",
      urgency: "severe"
    },
    mosquito: {
      severity: 2,
      activityIndex: 6,
      rationale: "Recent heavy rain can leave standing water."
    }
  },
  "poor-air-quality-day": {
    id: "poor-air-quality-day",
    label: "Poor air quality day",
    regionId: "new-york-ny",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 0,
      rainSeverity: 0,
      uvSeverity: 1,
      maxTemperatureC: 24,
      precipitationMm: 0,
      uvIndex: 6
    },
    airQuality: {
      severity: 3,
      usAqi: 178,
      pm25: 58
    },
    pollen: {
      severity: 1,
      index: 5,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 0,
      headline: "No active official weather alerts found in the fixture.",
      urgency: "none"
    },
    mosquito: {
      severity: 0,
      activityIndex: 2,
      rationale: "The placeholder signal is low for this fixture."
    }
  },
  "mosquito-activity-warning": {
    id: "mosquito-activity-warning",
    label: "Mosquito activity warning",
    regionId: "san-juan-pr",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 1,
      rainSeverity: 1,
      uvSeverity: 1,
      maxTemperatureC: 30,
      precipitationMm: 14,
      uvIndex: 7
    },
    airQuality: {
      severity: 0,
      usAqi: 36,
      pm25: 6
    },
    pollen: {
      severity: 0,
      index: 2,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 0,
      headline: "No active official weather alerts found in the fixture.",
      urgency: "none"
    },
    mosquito: {
      severity: 2,
      activityIndex: 7,
      rationale: "Warm temperatures and recent rain support a cautious placeholder signal."
    }
  },
  "multiple-simultaneous-risks": {
    id: "multiple-simultaneous-risks",
    label: "Multiple simultaneous risks",
    regionId: "miami-fl",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 2,
      rainSeverity: 2,
      uvSeverity: 2,
      maxTemperatureC: 34,
      precipitationMm: 36,
      uvIndex: 10
    },
    airQuality: {
      severity: 1,
      usAqi: 86,
      pm25: 16
    },
    pollen: {
      severity: 2,
      index: 7,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 2,
      headline: "Strong thunderstorms may affect travel later today.",
      urgency: "moderate"
    },
    mosquito: {
      severity: 2,
      activityIndex: 7,
      rationale: "Warm, wet conditions can increase exposure around standing water."
    }
  },
  "source-unavailable": {
    id: "source-unavailable",
    label: "Source unavailable",
    regionId: "miami-fl",
    updatedAt: "2026-06-01T12:00:00.000Z",
    weather: {
      heatSeverity: 1,
      rainSeverity: 0,
      uvSeverity: 1,
      maxTemperatureC: 30,
      precipitationMm: 2,
      uvIndex: 7
    },
    airQuality: {
      severity: 0,
      usAqi: 44,
      pm25: 8
    },
    pollen: {
      severity: 0,
      index: 2,
      dominant: "grass"
    },
    officialAlerts: {
      severity: 0,
      headline: "Official alert source was unavailable in this fixture.",
      urgency: "none"
    },
    mosquito: {
      severity: 1,
      activityIndex: 4,
      rationale: "Warm conditions support a low placeholder signal."
    },
    unavailableSources: ["official_alert", "air_quality"]
  }
};

export function fixtureForRegion(region: Region, override?: FixtureScenarioId): AwareFixtureScenario {
  return awareFixtureCatalog[override ?? region.defaultFixtureId];
}
