export const nwsAlertUpdatedFixture = {
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
        headline: "Flash Flood Warning updated",
        description: "Flooding persists with additional rainfall.",
        instruction: "Avoid flooded roads.",
        sent: "2024-01-01T02:00:00Z",
        effective: "2024-01-01T01:00:00Z",
        onset: "2024-01-01T01:10:00Z",
        ends: "2024-01-01T08:00:00Z",
        updated: "2024-01-01T02:00:00Z",
        status: "Actual",
        messageType: "Update"
      }
    }
  ]
};
