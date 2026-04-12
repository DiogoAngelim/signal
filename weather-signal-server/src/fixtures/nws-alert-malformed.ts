export const nwsAlertMalformedFixture = {
  type: "FeatureCollection",
  features: [
    {
      id: "https://api.weather.gov/alerts/bad",
      properties: {
        event: null,
        severity: 42,
        certainty: "",
        urgency: "",
        headline: 123,
        description: null,
        sent: "not-a-date",
        messageType: "Alert"
      }
    }
  ]
};
