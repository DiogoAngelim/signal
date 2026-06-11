import type { Region } from "../contracts.js";
import {
  type AdapterContext,
  type AdapterRunResult,
  type SafetyDataAdapter,
  createObservation,
  createSource,
  scenarioFor,
} from "./shared.js";

export function createMosquitoRiskAdapter(
  context: AdapterContext,
): SafetyDataAdapter {
  return {
    id: "mosquito-placeholder",
    category: "mosquito",
    async collect(region: Region): Promise<AdapterRunResult> {
      const scenario = scenarioFor(region, context);
      const source = createSource(
        {
          id: "aware-mosquito-placeholder",
          name: "Aware mosquito-borne disease placeholder",
          provider: "derived",
          updatedAt: scenario.updatedAt,
          reliability: "limited",
          note: "Local placeholder using weather-style conditions only; it is not a diagnosis or individual prediction.",
        },
        context.now(),
      );
      return {
        sources: [source],
        observations: [
          createObservation({
            id: `${region.id}:mosquito-placeholder`,
            region,
            category: "mosquito",
            signal: "mosquito.placeholder_activity",
            observedAt: scenario.updatedAt,
            validUntil: new Date(
              new Date(scenario.updatedAt).getTime() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            severity: scenario.mosquito.severity,
            source,
            plainLanguage:
              scenario.mosquito.severity > 0
                ? "Mosquito activity conditions may be worth noticing today."
                : "Mosquito activity does not stand out in the placeholder evidence.",
            details: {
              activityIndex: scenario.mosquito.activityIndex,
              rationale: scenario.mosquito.rationale,
              provider: "derived-fixture",
            },
          }),
        ],
      };
    },
  };
}
