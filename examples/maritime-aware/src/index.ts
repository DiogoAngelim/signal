export {
  createMaritimeApiService,
  handleMaritimeApiRequest
} from "./api.js";
export {
  collectMaritimeContext,
  createDefaultMaritimeAdapters,
  createFixtureMaritimeAdapters,
  createMaritimeAreaService,
  createCustomMaritimeArea
} from "./adapters.js";
export {
  confidenceLevels,
  freshnessStatuses,
  guidanceLabels,
  guidanceLevels,
  maritimeMatters,
  vesselFreshnessStatuses
} from "./contracts.js";
export {
  MARITIME_FIXTURE_IDS,
  fixtureAreas,
  getMaritimeFixture,
  maritimeAreaPresets,
  maritimeFixtureCatalog
} from "./fixtures.js";
export {
  clusterVessels,
  interpolateVesselPosition,
  normalizeVesselTrack,
  normalizeVesselTracks,
  projectToMap,
  projectVesselPosition,
  vesselFreshness
} from "./map/vessels.js";
export {
  MARITIME_OPERATION_NAMES,
  assessMatterStatuses,
  createMaritimeBriefingFromContext,
  createMaritimeSignalApp,
  interpretMaritimeRisks,
  listMaritimeOperationContracts
} from "./signal.js";
export type {
  AdapterCollectionResult,
  BoundingBox,
  ConfidenceLevel,
  Coordinate,
  EvidenceSource,
  FeedbackInput,
  FeedbackResult,
  FixtureScenarioId,
  FreshnessStatus,
  GuidanceLevel,
  MaritimeArea,
  MaritimeBriefing,
  MaritimeFixtureScenario,
  MaritimeMatter,
  MaritimeObservation,
  MaritimeReviewInput,
  MaritimeReviewResult,
  MaritimeRisk,
  MatterStatus,
  ObservationCategory,
  VesselClass,
  VesselCluster,
  VesselFreshnessStatus,
  VesselSnapshot,
  VesselTrack
} from "./contracts.js";
