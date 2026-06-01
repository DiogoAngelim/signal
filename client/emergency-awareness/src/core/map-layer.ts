import type { MapLayerFeature, MapLayerResult, RiskEvaluationResult, RiskZone } from "./types";

export function createRiskMapLayer(evaluation: RiskEvaluationResult): MapLayerResult {
  return {
    type: "FeatureCollection",
    features: evaluation.zones.map(zoneFeature),
    confidence: evaluation.confidence,
    freshness: evaluation.freshness,
    warnings: evaluation.warnings,
    missingInformation: evaluation.missingInformation,
    source: evaluation.source,
    correlationId: evaluation.correlationId
  };
}

function zoneFeature(zone: RiskZone): MapLayerFeature {
  return {
    type: "Feature",
    id: zone.id,
    geometry: {
      type: "Polygon",
      coordinates: [zone.coordinates.map((coordinate) => [coordinate.longitude, coordinate.latitude])]
    },
    properties: {
      label: zone.label,
      riskState: zone.riskState,
      riskScore: zone.riskScore,
      confidence: zone.confidence,
      freshness: zone.freshness,
      reason: zone.reason,
      recommendedAction: zone.recommendedAction,
      approximate: zone.approximate,
      warnings: zone.warnings,
      missingInformation: zone.missingInformation
    }
  };
}
