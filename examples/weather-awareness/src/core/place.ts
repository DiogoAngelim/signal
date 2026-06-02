import type { AreaPolygon, BoundingBox, Coordinate, GeoJsonGeometry, PlaceSearchResult, ResolvedPlace } from "./types";
import { commonWarnings } from "./metadata";

export type PlaceSearchOptions = {
  limit?: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

export type AddressAdapter = {
  name: PlaceSearchResult["provider"];
  search(query: string, options?: PlaceSearchOptions): Promise<PlaceSearchResult[]>;
};

export type PlaceServiceOptions = {
  adapters: AddressAdapter[];
};

export class PlaceService {
  constructor(private readonly options: PlaceServiceOptions) {}

  async search(query: string, options: PlaceSearchOptions = {}): Promise<PlaceSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const results: PlaceSearchResult[] = [];
    for (const adapter of this.options.adapters) {
      try {
        const found = await adapter.search(trimmed, options);
        results.push(...found);
        if (results.length >= (options.limit ?? 6)) break;
      } catch {
        continue;
      }
    }
    return dedupePlaces(results).slice(0, options.limit ?? 6);
  }

  resolve(candidate: PlaceSearchResult): ResolvedPlace {
    return resolvePlace(candidate);
  }
}

export function createPlaceService(adapters: AddressAdapter[]): PlaceService {
  return new PlaceService({ adapters });
}

export function createNominatimAdapter(input: {
  endpoint?: string;
  email?: string;
  fetch?: typeof fetch;
} = {}): AddressAdapter {
  return {
    name: "nominatim",
    async search(query: string, options: PlaceSearchOptions = {}) {
      const url = new URL(input.endpoint ?? "https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("polygon_geojson", "1");
      url.searchParams.set("limit", String(options.limit ?? 6));
      if (input.email) url.searchParams.set("email", input.email);
      const response = await (options.fetch ?? input.fetch ?? fetch)(url, {
        signal: options.signal,
        headers: { "accept": "application/json" }
      });
      if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
      const rows = await response.json() as Array<Record<string, unknown>>;
      return rows.map((row): PlaceSearchResult => ({
        id: `nominatim:${String(row["osm_type"] ?? "place")}:${String(row["osm_id"] ?? row["place_id"] ?? row["display_name"])}`,
        provider: "nominatim",
        label: String(row["display_name"] ?? query),
        coordinates: {
          latitude: numberFrom(row["lat"], 0),
          longitude: numberFrom(row["lon"], 0)
        },
        region: regionFromAddress(objectFrom(row["address"])),
        boundingBox: boundingBoxFromNominatim(row["boundingbox"]),
        geometry: geometryFrom(row["geojson"]),
        metadata: row
      }));
    }
  };
}

export function createPhotonAdapter(input: {
  endpoint?: string;
  fetch?: typeof fetch;
} = {}): AddressAdapter {
  return {
    name: "photon",
    async search(query: string, options: PlaceSearchOptions = {}) {
      const url = new URL(input.endpoint ?? "https://photon.komoot.io/api/");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", String(options.limit ?? 6));
      const response = await (options.fetch ?? input.fetch ?? fetch)(url, { signal: options.signal });
      if (!response.ok) throw new Error(`Photon returned ${response.status}`);
      const body = await response.json() as { features?: Array<Record<string, unknown>> };
      return (body.features ?? []).map((feature): PlaceSearchResult => {
        const properties = objectFrom(feature["properties"]);
        const geometry = geometryFrom(feature["geometry"]);
        const coordinates = coordinateFromGeometry(geometry) ?? { latitude: 0, longitude: 0 };
        return {
          id: `photon:${String(properties["osm_type"] ?? "feature")}:${String(properties["osm_id"] ?? properties["name"] ?? coordinates.latitude)}`,
          provider: "photon",
          label: photonLabel(properties, query),
          coordinates,
          region: [properties["city"], properties["state"], properties["country"]].map(String).filter(Boolean).join(", ") || undefined,
          boundingBox: boundingBoxFromPhotonExtent(properties["extent"]),
          geometry,
          metadata: feature
        };
      });
    }
  };
}

export function createPeliasAdapter(input: {
  endpoint: string;
  apiKey?: string;
  fetch?: typeof fetch;
}): AddressAdapter {
  return {
    name: "pelias",
    async search(query: string, options: PlaceSearchOptions = {}) {
      const url = new URL("/v1/search", input.endpoint.replace(/\/$/, ""));
      url.searchParams.set("text", query);
      url.searchParams.set("size", String(options.limit ?? 6));
      if (input.apiKey) url.searchParams.set("api_key", input.apiKey);
      const response = await (options.fetch ?? input.fetch ?? fetch)(url, { signal: options.signal });
      if (!response.ok) throw new Error(`Pelias returned ${response.status}`);
      const body = await response.json() as { features?: Array<Record<string, unknown>> };
      return (body.features ?? []).map((feature): PlaceSearchResult => {
        const properties = objectFrom(feature["properties"]);
        const geometry = geometryFrom(feature["geometry"]);
        const coordinates = coordinateFromGeometry(geometry) ?? { latitude: 0, longitude: 0 };
        return {
          id: `pelias:${String(properties["gid"] ?? properties["id"] ?? properties["label"] ?? coordinates.latitude)}`,
          provider: "pelias",
          label: String(properties["label"] ?? properties["name"] ?? query),
          coordinates,
          region: [properties["locality"], properties["region"], properties["country"]].map(String).filter(Boolean).join(", ") || undefined,
          boundingBox: boundingBoxFromPelias(properties["bbox"] ?? feature["bbox"]),
          geometry,
          metadata: feature
        };
      });
    }
  };
}

export function createDemoPlaceAdapter(): AddressAdapter {
  const demo: PlaceSearchResult[] = [
    demoPlace("demo:miami", "Miami, Florida, United States", 25.7617, -80.1918, "Miami-Dade County, Florida"),
    demoPlace("demo:new-orleans", "New Orleans, Louisiana, United States", 29.9511, -90.0715, "Orleans Parish, Louisiana"),
    demoPlace("demo:houston", "Houston, Texas, United States", 29.7604, -95.3698, "Harris County, Texas"),
    demoPlace("demo:rio", "Rio de Janeiro, Brazil", -22.9068, -43.1729, "Rio de Janeiro"),
    demoPlace("demo:jakarta", "Jakarta, Indonesia", -6.2088, 106.8456, "Jakarta")
  ];
  return {
    name: "demo",
    async search(query: string, options: PlaceSearchOptions = {}) {
      const normalized = query.toLowerCase();
      return demo
        .filter((place) => place.label.toLowerCase().includes(normalized) || place.region?.toLowerCase().includes(normalized))
        .slice(0, options.limit ?? 6);
    }
  };
}

export function resolvePlace(candidate: PlaceSearchResult): ResolvedPlace {
  const boundary = polygonFromGeometry(candidate.geometry, candidate.id) ?? polygonFromBoundingBox(candidate.boundingBox, `${candidate.id}:boundary`);
  const box = candidate.boundingBox ?? boundingBoxFromPolygon(boundary) ?? boundingBoxAround(candidate.coordinates, 0.08);
  const grid = generateApproximateGrid(box, candidate.id);
  const hasKnownArea = Boolean(polygonFromGeometry(candidate.geometry, candidate.id) || candidate.boundingBox);
  const missingInformation = hasKnownArea ? [] : ["known boundary"];
  const warnings = hasKnownArea ? [] : ["Approximate area"];
  return {
    ...candidate,
    boundary,
    grid: boundary && !boundary.approximate ? [boundary, ...grid] : grid,
    precisionLabel: hasKnownArea ? "Known area" : "Approximate area",
    warnings,
    missingInformation
  };
}

export function generateApproximateGrid(box: BoundingBox, seed: string, rows = 3, columns = 3): AreaPolygon[] {
  const cells: AreaPolygon[] = [];
  const latStep = (box.maxLatitude - box.minLatitude) / rows;
  const lonStep = (box.maxLongitude - box.minLongitude) / columns;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const minLatitude = box.minLatitude + latStep * row;
      const maxLatitude = minLatitude + latStep;
      const minLongitude = box.minLongitude + lonStep * column;
      const maxLongitude = minLongitude + lonStep;
      cells.push({
        id: `${seed}:cell:${row + 1}-${column + 1}`,
        label: `Area ${row + 1}-${column + 1}`,
        approximate: true,
        coordinates: rectangle(minLatitude, minLongitude, maxLatitude, maxLongitude)
      });
    }
  }
  return cells;
}

function dedupePlaces(results: readonly PlaceSearchResult[]): PlaceSearchResult[] {
  const seen = new Set<string>();
  const deduped: PlaceSearchResult[] = [];
  for (const result of results) {
    const key = `${Math.round(result.coordinates.latitude * 1000)}:${Math.round(result.coordinates.longitude * 1000)}:${result.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function demoPlace(id: string, label: string, latitude: number, longitude: number, region: string): PlaceSearchResult {
  return {
    id,
    provider: "demo",
    label,
    coordinates: { latitude, longitude },
    region,
    boundingBox: boundingBoxAround({ latitude, longitude }, 0.12),
    metadata: { demo: true }
  };
}

function boundingBoxFromNominatim(value: unknown): BoundingBox | undefined {
  const entries = Array.isArray(value) ? value.map(Number) : [];
  if (entries.length !== 4 || entries.some((entry) => !Number.isFinite(entry))) return undefined;
  const [south, north, west, east] = entries as [number, number, number, number];
  return { minLatitude: south, maxLatitude: north, minLongitude: west, maxLongitude: east };
}

function boundingBoxFromPhotonExtent(value: unknown): BoundingBox | undefined {
  const entries = Array.isArray(value) ? value.map(Number) : [];
  if (entries.length !== 4 || entries.some((entry) => !Number.isFinite(entry))) return undefined;
  const [minLon, maxLat, maxLon, minLat] = entries as [number, number, number, number];
  return { minLatitude: minLat, minLongitude: minLon, maxLatitude: maxLat, maxLongitude: maxLon };
}

function boundingBoxFromPelias(value: unknown): BoundingBox | undefined {
  const entries = Array.isArray(value) ? value.map(Number) : [];
  if (entries.length !== 4 || entries.some((entry) => !Number.isFinite(entry))) return undefined;
  const [minLon, minLat, maxLon, maxLat] = entries as [number, number, number, number];
  return { minLatitude: minLat, minLongitude: minLon, maxLatitude: maxLat, maxLongitude: maxLon };
}

function polygonFromGeometry(geometry: GeoJsonGeometry | undefined, seed: string): AreaPolygon | undefined {
  if (!geometry) return undefined;
  if (geometry.type === "Polygon") {
    const ring = coordinatesFromRing((geometry.coordinates as unknown[])[0]);
    if (ring.length >= 4) return { id: `${seed}:boundary`, label: "Known area", coordinates: ring, approximate: false };
  }
  if (geometry.type === "MultiPolygon") {
    const firstPolygon = (geometry.coordinates as unknown[])[0] as unknown[] | undefined;
    const ring = coordinatesFromRing(firstPolygon?.[0]);
    if (ring.length >= 4) return { id: `${seed}:boundary`, label: "Known area", coordinates: ring, approximate: false };
  }
  return undefined;
}

function polygonFromBoundingBox(box: BoundingBox | undefined, id: string): AreaPolygon | undefined {
  if (!box) return undefined;
  return {
    id,
    label: "Approximate area",
    approximate: true,
    coordinates: rectangle(box.minLatitude, box.minLongitude, box.maxLatitude, box.maxLongitude)
  };
}

function coordinatesFromRing(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!Array.isArray(entry)) return undefined;
      const longitude = entry[0];
      const latitude = entry[1];
      return { longitude: numberFrom(longitude, NaN), latitude: numberFrom(latitude, NaN) };
    })
    .filter((entry): entry is Coordinate => {
      if (!entry) return false;
      return Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude);
    });
}

function coordinateFromGeometry(geometry: GeoJsonGeometry | undefined): Coordinate | undefined {
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return undefined;
  return {
    longitude: numberFrom(geometry.coordinates[0], 0),
    latitude: numberFrom(geometry.coordinates[1], 0)
  };
}

function geometryFrom(value: unknown): GeoJsonGeometry | undefined {
  const object = objectFrom(value);
  const type = object["type"];
  if (type === "Point" || type === "Polygon" || type === "MultiPolygon") {
    return { type, coordinates: object["coordinates"] };
  }
  return undefined;
}

function boundingBoxFromPolygon(polygon: AreaPolygon | undefined): BoundingBox | undefined {
  if (!polygon?.coordinates.length) return undefined;
  const latitudes = polygon.coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = polygon.coordinates.map((coordinate) => coordinate.longitude);
  return {
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes)
  };
}

function boundingBoxAround(coordinate: Coordinate, radiusDegrees: number): BoundingBox {
  return {
    minLatitude: coordinate.latitude - radiusDegrees,
    maxLatitude: coordinate.latitude + radiusDegrees,
    minLongitude: coordinate.longitude - radiusDegrees,
    maxLongitude: coordinate.longitude + radiusDegrees
  };
}

function rectangle(minLatitude: number, minLongitude: number, maxLatitude: number, maxLongitude: number): Coordinate[] {
  return [
    { latitude: minLatitude, longitude: minLongitude },
    { latitude: minLatitude, longitude: maxLongitude },
    { latitude: maxLatitude, longitude: maxLongitude },
    { latitude: maxLatitude, longitude: minLongitude },
    { latitude: minLatitude, longitude: minLongitude }
  ];
}

function regionFromAddress(address: Record<string, unknown>): string | undefined {
  return [address["city"] ?? address["town"] ?? address["village"], address["state"], address["country"]]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ") || undefined;
}

function photonLabel(properties: Record<string, unknown>, fallback: string): string {
  const main = String(properties["name"] ?? fallback);
  return [main, properties["city"], properties["state"], properties["country"]]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberFrom(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
