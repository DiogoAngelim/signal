import type { FixtureScenarioId, MaritimeFixtureScenario } from "../contracts.js";
import { maritimeAreaPresets, maritimeFixtureCatalog } from "./catalog.js";

export { maritimeAreaPresets, maritimeFixtureCatalog } from "./catalog.js";

export const MARITIME_FIXTURE_IDS = Object.keys(maritimeFixtureCatalog) as FixtureScenarioId[];

export function getMaritimeFixture(fixtureId: FixtureScenarioId = "steady-harbor"): MaritimeFixtureScenario {
  return maritimeFixtureCatalog[fixtureId] ?? maritimeFixtureCatalog["steady-harbor"];
}

export const fixtureAreas = maritimeAreaPresets;
