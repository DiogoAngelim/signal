import type { ClimateForecastClient } from "@signal/climate-forecast";
import { generateGuidance } from "./guidance";
import { createRiskMapLayer } from "./map-layer";
import type { MemoryGateway, PlaceSearchResult } from "./types";
import type { PlaceService } from "./place";
import { evaluateRiskZones } from "./risk";

export function createGuidanceWorkflow(input: {
  places: PlaceService;
  forecast: ClimateForecastClient;
  memory?: MemoryGateway;
}) {
  return {
    searchPlaces(query: string) {
      return input.places.search(query, { limit: 6 });
    },
    async watchPlace(candidate: PlaceSearchResult) {
      const place = input.places.resolve(candidate);
      const forecast = await input.forecast.getForecast({
        latitude: place.coordinates.latitude,
        longitude: place.coordinates.longitude,
        hours: 48
      });
      const evaluation = await evaluateRiskZones({ place, forecast, memory: input.memory });
      const layer = createRiskMapLayer(evaluation);
      const guidance = await generateGuidance({ evaluation, forecast, memory: input.memory });
      const health = await input.forecast.providerHealth();
      return { place, forecast, evaluation, layer, guidance, health };
    },
    async refreshPlace(candidate: PlaceSearchResult) {
      const place = input.places.resolve(candidate);
      const forecast = await input.forecast.getForecast({
        latitude: place.coordinates.latitude,
        longitude: place.coordinates.longitude,
        hours: 48,
        forceRefresh: true
      });
      const evaluation = await evaluateRiskZones({ place, forecast, memory: input.memory });
      const layer = createRiskMapLayer(evaluation);
      const guidance = await generateGuidance({ evaluation, forecast, memory: input.memory });
      const health = await input.forecast.providerHealth();
      return { place, forecast, evaluation, layer, guidance, health };
    }
  };
}
