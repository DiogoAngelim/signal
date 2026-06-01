import { createClimateForecastClient, createNoaaProvider, createOpenMeteoProvider } from "@signal/climate-forecast";
import { createGuidanceWorkflow } from "./workflow";
import { createUnavailableMemoryGateway } from "./memory-gateway";
import { createDemoPlaceAdapter, createNominatimAdapter, createPhotonAdapter, createPlaceService } from "./place";

export function createBrowserEmergencyAwarenessClient() {
  const places = createPlaceService([
    createNominatimAdapter(),
    createPhotonAdapter(),
    createDemoPlaceAdapter()
  ]);
  const forecast = createClimateForecastClient({
    provider: createOpenMeteoProvider(),
    fallbackProviders: [createNoaaProvider()],
    timeoutMs: 7000,
    retries: 2,
    freshForMs: 20 * 60 * 1000,
    staleAfterMs: 2 * 60 * 60 * 1000
  });
  return createGuidanceWorkflow({
    places,
    forecast,
    memory: createUnavailableMemoryGateway()
  });
}
