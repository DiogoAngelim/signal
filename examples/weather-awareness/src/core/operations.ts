import type { ClimateForecastClient } from "@signal/climate-forecast";
import { z } from "zod";
import { generateGuidance } from "./guidance";
import { createRiskMapLayer } from "./map-layer";
import { commonWarnings, correlationId, freshnessScore } from "./metadata";
import { PlaceService } from "./place";
import { evaluateRiskZones } from "./risk";
import type {
  GuidanceResult,
  MapLayerResult,
  MemoryGateway,
  ProviderHealthResult,
  ResolvedPlace,
  RiskEvaluationResult
} from "./types";

export type EmergencyAwarenessOperationsOptions = {
  places: PlaceService;
  forecast: ClimateForecastClient;
  memory?: MemoryGateway;
};

export type EmergencyAwarenessOperationDefinition = {
  name: string;
  kind: "query";
  description: string;
  inputSchema: z.ZodTypeAny;
  resultSchema: z.ZodTypeAny;
  handler(input: unknown): Promise<unknown>;
};

export const EMERGENCY_AWARENESS_OPERATION_NAMES = [
  "place.search.v1",
  "place.resolve.v1",
  "forecast.get.v1",
  "risk.zones.evaluate.v1",
  "risk.map.layer.v1",
  "risk.guidance.generate.v1",
  "provider.health.v1"
] as const;

const anyRecord = z.record(z.string(), z.unknown());

export function createEmergencyAwarenessOperations(
  options: EmergencyAwarenessOperationsOptions,
): EmergencyAwarenessOperationDefinition[] {
  return [
    {
      name: "place.search.v1",
      kind: "query",
      description: "Search for a city, neighborhood, region, or address.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(20).optional()
      }),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as { query: string; limit?: number };
        const places = await options.places.search(request.query, { limit: request.limit });
        return withMeta({
          places,
          confidence: places.length ? 80 : 15,
          freshness: 100,
          warnings: places.length ? [] : ["No matching place was found."],
          missingInformation: places.length ? [] : ["place"],
          source: "Signal Emergency Awareness",
          correlationId: correlationId("place.search", request.query)
        });
      }
    },
    {
      name: "place.resolve.v1",
      kind: "query",
      description: "Resolve coordinates, area, metadata, and approximate grids when needed.",
      inputSchema: z.object({
        place: anyRecord.optional(),
        query: z.string().optional()
      }),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as { place?: ResolvedPlace; query?: string };
        const candidate = request.place ?? (request.query ? (await options.places.search(request.query, { limit: 1 }))[0] : undefined);
        if (!candidate) {
          return withMeta({
            place: null,
            confidence: 0,
            freshness: 100,
            warnings: ["Information is missing."],
            missingInformation: ["place"],
            source: "Signal Emergency Awareness",
            correlationId: correlationId("place.resolve", request.query ?? "missing")
          });
        }
        const place = options.places.resolve(candidate);
        return withMeta({
          place,
          confidence: place.precisionLabel === "Known area" ? 86 : 62,
          freshness: 100,
          warnings: place.warnings,
          missingInformation: place.missingInformation,
          source: "Signal Emergency Awareness",
          correlationId: correlationId("place.resolve", place.id)
        });
      }
    },
    {
      name: "forecast.get.v1",
      kind: "query",
      description: "Get normalized climate forecast information with freshness and provider status.",
      inputSchema: z.object({
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().optional(),
        hours: z.number().int().positive().max(384).optional(),
        forceRefresh: z.boolean().optional(),
        correlationId: z.string().optional()
      }),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as {
          latitude: number;
          longitude: number;
          timezone?: string;
          hours?: number;
          forceRefresh?: boolean;
          correlationId?: string;
        };
        const forecast = await options.forecast.getForecast(request);
        return withMeta({
          forecast,
          confidence: forecast.confidence,
          freshness: freshnessScore(forecast.freshness),
          warnings: forecast.warnings,
          missingInformation: forecast.missingInformation,
          source: forecast.source,
          correlationId: forecast.correlationId
        });
      }
    },
    {
      name: "risk.zones.evaluate.v1",
      kind: "query",
      description: "Evaluate concern across drawable areas for a place.",
      inputSchema: z.object({
        place: anyRecord,
        forecast: anyRecord,
        correlationId: z.string().optional()
      }),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as { place: ResolvedPlace; forecast: Parameters<typeof evaluateRiskZones>[0]["forecast"]; correlationId?: string };
        const evaluation = await evaluateRiskZones({
          place: request.place,
          forecast: request.forecast,
          memory: options.memory,
          correlationId: request.correlationId
        });
        return withMeta({ evaluation, ...metaFromEvaluation(evaluation) });
      }
    },
    {
      name: "risk.map.layer.v1",
      kind: "query",
      description: "Return GeoJSON areas carrying concern, confidence, freshness, reasons, and actions.",
      inputSchema: z.object({
        place: anyRecord,
        forecast: anyRecord,
        correlationId: z.string().optional()
      }),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as { place: ResolvedPlace; forecast: Parameters<typeof evaluateRiskZones>[0]["forecast"]; correlationId?: string };
        const evaluation = await evaluateRiskZones({
          place: request.place,
          forecast: request.forecast,
          memory: options.memory,
          correlationId: request.correlationId
        });
        const layer = createRiskMapLayer(evaluation);
        return withMeta({ layer, ...metaFromLayer(layer) });
      }
    },
    {
      name: "risk.guidance.generate.v1",
      kind: "query",
      description: "Explain what is happening, why, confidence, and reasonable next steps.",
      inputSchema: z.object({
        evaluation: anyRecord,
        forecast: anyRecord,
        zoneId: z.string().optional()
      }),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as { evaluation: RiskEvaluationResult; forecast: Parameters<typeof generateGuidance>[0]["forecast"]; zoneId?: string };
        const guidance = await generateGuidance({
          evaluation: request.evaluation,
          forecast: request.forecast,
          memory: options.memory,
          zone: request.zoneId ? request.evaluation.zones.find((zone) => zone.id === request.zoneId) : undefined
        });
        return withMeta({ guidance, ...metaFromGuidance(guidance) });
      }
    },
    {
      name: "provider.health.v1",
      kind: "query",
      description: "Read forecast provider health and circuit-breaker state.",
      inputSchema: z.object({ correlationId: z.string().optional() }).optional().default({}),
      resultSchema: anyRecord,
      async handler(input) {
        const request = input as { correlationId?: string } | undefined;
        const providers = await options.forecast.providerHealth();
        const failing = providers.filter((provider) => !provider.healthy);
        const result: ProviderHealthResult = {
          providers,
          confidence: failing.length ? 45 : 90,
          freshness: 100,
          warnings: failing.map((provider) => provider.message ?? `${provider.provider} is not healthy.`),
          missingInformation: failing.length === providers.length ? ["provider"] : [],
          source: "Signal Emergency Awareness",
          correlationId: request?.correlationId ?? correlationId("provider.health")
        };
        return withMeta(result);
      }
    }
  ];
}

export function listEmergencyAwarenessOperations() {
  return EMERGENCY_AWARENESS_OPERATION_NAMES.map((name) => ({
    kind: "query" as const,
    name,
    version: "v1",
    idempotent: true,
    replaySafe: true
  }));
}

function withMeta<T extends Record<string, unknown>>(value: T): T {
  return value;
}

function metaFromEvaluation(evaluation: RiskEvaluationResult) {
  return {
    confidence: evaluation.confidence,
    freshness: evaluation.freshness,
    warnings: evaluation.warnings,
    missingInformation: evaluation.missingInformation,
    source: evaluation.source,
    correlationId: evaluation.correlationId
  };
}

function metaFromLayer(layer: MapLayerResult) {
  return {
    confidence: layer.confidence,
    freshness: layer.freshness,
    warnings: layer.warnings,
    missingInformation: layer.missingInformation,
    source: layer.source,
    correlationId: layer.correlationId
  };
}

function metaFromGuidance(guidance: GuidanceResult) {
  return {
    confidence: guidance.confidence.value,
    freshness: 100,
    warnings: commonWarnings(guidance.warnings),
    missingInformation: guidance.missingInformation,
    source: guidance.source,
    correlationId: guidance.correlationId
  };
}
