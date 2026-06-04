import type { BoundingBox, Coordinate, MaritimeArea } from "../contracts.js";
import { maritimeAreaPresets } from "../fixtures.js";

export type MaritimeAreaService = {
  search(query: string, limit?: number): Promise<MaritimeArea[]>;
  get(areaId: string): MaritimeArea | undefined;
  createCustomArea(input: {
    name: string;
    center: Coordinate;
    radiusKm?: number;
    method?: MaritimeArea["selection"]["method"];
    query?: string;
  }): MaritimeArea;
};

export function createMaritimeAreaService(areas: readonly MaritimeArea[] = maritimeAreaPresets): MaritimeAreaService {
  const areaMap = new Map(areas.map((area) => [area.id, area]));
  return {
    async search(query, limit = 8) {
      const trimmed = query.trim();
      if (!trimmed) return areas.slice(0, Math.min(limit, areas.length));

      const coordinate = parseCoordinateQuery(trimmed);
      if (coordinate) {
        return [
          createCustomMaritimeArea({
            name: `Custom area near ${coordinate.latitude.toFixed(2)}, ${coordinate.longitude.toFixed(2)}`,
            center: coordinate,
            radiusKm: 60,
            method: "coordinates",
            query: trimmed
          })
        ];
      }

      const terms = normalize(trimmed).split(/\s+/).filter(Boolean);
      const matches = areas
        .map((area) => ({ area, score: scoreArea(area, terms) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.area.name.localeCompare(right.area.name))
        .map((entry) => ({
          ...entry.area,
          selection: { method: "search" as const, query: trimmed }
        }));

      const fallback = createCustomMaritimeArea({
        name: `Custom maritime area for ${trimmed}`,
        center: pseudoCoordinate(trimmed),
        radiusKm: 80,
        method: "search",
        query: trimmed
      });

      return [...matches, fallback].slice(0, limit);
    },
    get(areaId) {
      if (areaMap.has(areaId)) return areaMap.get(areaId);
      if (areaId.startsWith("custom:")) return decodeCustomArea(areaId);
      return undefined;
    },
    createCustomArea(input) {
      return createCustomMaritimeArea(input);
    }
  };
}

export function createCustomMaritimeArea(input: {
  name: string;
  center: Coordinate;
  radiusKm?: number;
  method?: MaritimeArea["selection"]["method"];
  query?: string;
}): MaritimeArea {
  const radiusKm = input.radiusKm ?? 60;
  const id = `custom:${slugify(input.name)}:${input.center.latitude.toFixed(3)}:${input.center.longitude.toFixed(3)}:${radiusKm}`;
  return {
    id,
    name: input.name,
    type: "custom",
    label: "User-defined maritime area",
    center: input.center,
    bounds: boundsAround(input.center, radiusKm),
    radiusKm,
    searchTerms: [input.name, input.query ?? ""].filter(Boolean),
    fixtureId: "custom-area",
    userDefined: true,
    selection: {
      method: input.method ?? "map",
      query: input.query
    }
  };
}

export function parseCoordinateQuery(query: string): Coordinate | undefined {
  const match = query.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

function decodeCustomArea(areaId: string): MaritimeArea | undefined {
  const parts = areaId.split(":");
  const latitude = Number(parts.at(-3));
  const longitude = Number(parts.at(-2));
  const radiusKm = Number(parts.at(-1));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusKm)) return undefined;
  const name = parts.slice(1, -3).join(" ").replace(/-/g, " ") || "Custom maritime area";
  return createCustomMaritimeArea({
    name: titleCase(name),
    center: { latitude, longitude },
    radiusKm,
    method: "map"
  });
}

function scoreArea(area: MaritimeArea, terms: readonly string[]): number {
  const searchable = normalize([area.name, area.label, area.country, area.type, ...area.searchTerms].filter(Boolean).join(" "));
  return terms.reduce((score, term) => score + (searchable.includes(term) ? term.length : 0), 0);
}

function pseudoCoordinate(query: string): Coordinate {
  let hash = 0;
  for (const char of query) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const latitude = -55 + (Math.abs(hash) % 11000) / 100;
  const longitude = -170 + (Math.abs(hash * 31) % 34000) / 100;
  return {
    latitude: Number(latitude.toFixed(3)),
    longitude: Number(longitude.toFixed(3))
  };
}

function boundsAround(center: Coordinate, radiusKm: number): BoundingBox {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.max(0.25, Math.cos((center.latitude * Math.PI) / 180)));
  return {
    north: round(clamp(center.latitude + latitudeDelta, -90, 90)),
    south: round(clamp(center.latitude - latitudeDelta, -90, 90)),
    east: round(clamp(center.longitude + longitudeDelta, -180, 180)),
    west: round(clamp(center.longitude - longitudeDelta, -180, 180))
  };
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "area";
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(5));
}
