export const nwsAlertDuplicateFixture = {
  type: "FeatureCollection",
  features: [
    {
      id: "https://api.weather.gov/alerts/123",
      properties: {
        id: "NWS-ALERT-001",
        event: "Flash Flood Warning",
        severity: "Severe",
        certainty: "Observed",
        urgency: "Immediate",
        headline: "Flash Flood Warning issued",
        description: "Heavy rainfall is producing flash flooding.",
        instruction: "Move to higher ground now.",
        sent: "2024-01-01T01:00:00Z",
        effective: "2024-01-01T01:00:00Z",
        onset: "2024-01-01T01:10:00Z",
        ends: "2024-01-01T06:00:00Z",
        updated: "2024-01-01T01:00:00Z",
        status: "Actual",
        messageType: "Alert"
      }
    }
  ]
};
