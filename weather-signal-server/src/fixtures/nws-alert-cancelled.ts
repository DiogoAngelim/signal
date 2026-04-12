export const nwsAlertCancelledFixture = {
  type: "FeatureCollection",
  features: [
    {
      id: "https://api.weather.gov/alerts/123",
      properties: {
        id: "NWS-ALERT-001",
        event: "Flash Flood Warning",
        severity: "Moderate",
        certainty: "Possible",
        urgency: "Expected",
        headline: "Flash Flood Warning cancelled",
        description: "The threat has diminished.",
        instruction: "Stay alert.",
        sent: "2024-01-01T03:00:00Z",
        effective: "2024-01-01T01:00:00Z",
        onset: "2024-01-01T01:10:00Z",
        ends: "2024-01-01T03:00:00Z",
        updated: "2024-01-01T03:00:00Z",
        status: "Actual",
        messageType: "Cancel"
      }
    }
  ]
};
