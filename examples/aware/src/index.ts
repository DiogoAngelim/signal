export {
  createAwareApiService,
  handleAwareApiRequest,
} from "./api.js";
export {
  collectSafetyObservations,
  createDefaultAwareAdapters,
  createFixtureAwareAdapters,
  createRegionService,
} from "./adapters.js";
export {
  attentionLabels,
  attentionLevels,
  safetyActions,
} from "./contracts.js";
export {
  AWARE_FIXTURE_IDS,
  awareFixtureCatalog,
  fixtureRegions,
} from "./fixtures.js";
export {
  AWARE_OPERATION_NAMES,
  createAwareSignalApp,
  createBriefingFromObservations,
  listAwareOperationContracts,
} from "./signal.js";
export type {
  AdapterCollectionResult,
  AttentionLevel,
  Briefing,
  BriefingItem,
  EvidenceSource,
  FixtureScenarioId,
  Region,
  SafetyAction,
  SafetyObservation,
  SafetyRisk,
} from "./contracts.js";
