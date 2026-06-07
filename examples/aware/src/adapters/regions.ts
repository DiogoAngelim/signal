import { Buffer } from "node:buffer";
import type { Region } from "../contracts.js";
import { fixtureRegions } from "../fixtures.js";

export type RegionService = {
  search(query: string, limit?: number): Promise<Region[]>;
  get(regionId: string): Region | undefined;
  all(): Region[];
};

export type RegionServiceOptions = {
  regions?: readonly Region[];
  fetcher?: typeof fetch;
  addressLookup?: boolean;
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
  road?: string;
  house_number?: string;
};

type NominatimResult = {
  place_id?: number;
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function rankRegion(region: Region, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const label = normalize(`${region.name} ${region.adminArea} ${region.country}`);
  if (normalize(region.name) === q) return 100;
  if (normalize(region.name).startsWith(q)) return 90;
  if (label.includes(q)) return 70;
  if (region.searchTerms.some((term) => normalize(term) === q)) return 85;
  if (region.searchTerms.some((term) => normalize(term).includes(q))) return 60;
  return 0;
}

export function createRegionService(options: readonly Region[] | RegionServiceOptions = fixtureRegions): RegionService {
  const config: RegionServiceOptions = isRegionArray(options) ? { regions: options } : options;
  const fetcher = config.fetcher ?? globalThis.fetch;
  const addressLookup = config.addressLookup ?? true;
  const regions = config.regions ?? fixtureRegions;
  const ordered = [...regions];
  const dynamicRegions = new Map<string, Region>();
  return {
    async search(query: string, limit = 8): Promise<Region[]> {
      const q = normalize(query);
      if (!q) return [];
      const catalogResults = ordered
        .map((region) => ({ region, rank: rankRegion(region, q) }))
        .filter((entry) => entry.rank > 0)
        .sort((left, right) => right.rank - left.rank || left.region.name.localeCompare(right.region.name))
        .slice(0, limit)
        .map((entry) => entry.region);
      if (!addressLookup || catalogResults.length > 0 || !fetcher) {
        return catalogResults;
      }
      const addressResults = await searchAddressApi(q, limit, fetcher).catch(() => []);
      for (const region of addressResults) {
        dynamicRegions.set(region.id, region);
      }
      return dedupeRegions(addressResults).slice(0, limit);
    },
    get(regionId: string): Region | undefined {
      return ordered.find((region) => region.id === regionId) ?? dynamicRegions.get(regionId) ?? regionFromAddressId(regionId);
    },
    all(): Region[] {
      return [...ordered, ...dynamicRegions.values()];
    }
  };
}

function isRegionArray(value: readonly Region[] | RegionServiceOptions): value is readonly Region[] {
  return Array.isArray(value);
}

async function searchAddressApi(query: string, limit: number, fetcher: typeof fetch): Promise<Region[]> {
  if (limit <= 0) return [];
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(Math.min(limit, 8))
  });
  const response = await fetchWithTimeout(
    `https:
    {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Signal Aware Example address lookup"
      }
    },
    fetcher
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as NominatimResult[];
  return payload
    .map(toRegion)
    .filter((region): region is Region => Boolean(region));
}

async function fetchWithTimeout(url: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    return await fetcher(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function toRegion(result: NominatimResult): Region | undefined {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const address = result.address ?? {};
  const locality = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county;
  const adminArea = address.state ?? address.region ?? address.county ?? "Nearby area";
  const country = address.country ?? "Unknown country";
  const name = locality ?? firstDisplayPart(result.display_name) ?? "Selected area";
  const idBasis = `${result.place_id ?? result.osm_id ?? result.display_name ?? `${latitude},${longitude}`}`;
  const fixtureId = fixtureForAddress(address, latitude);
  const regionBase = {
    name,
    adminArea,
    country,
    latitude,
    longitude,
    timezone: "auto",
    defaultFixtureId: fixtureId
  };
  return {
    id: addressRegionId(regionBase, idBasis),
    name,
    adminArea,
    country,
    latitude,
    longitude,
    timezone: "auto",
    searchTerms: [
      result.display_name ?? "",
      name,
      adminArea,
      country,
      address.road ?? "",
      address.house_number ?? ""
    ].filter(Boolean),
    defaultFixtureId: fixtureId
  };
}

function addressRegionId(region: Omit<Region, "id" | "searchTerms">, idBasis: string): string {
  const encoded = Buffer.from(JSON.stringify({
    n: region.name,
    a: region.adminArea,
    c: region.country,
    lat: roundCoordinate(region.latitude),
    lon: roundCoordinate(region.longitude),
    tz: region.timezone,
    fx: region.defaultFixtureId,
    h: smallHash(idBasis)
  }), "utf8").toString("base64url");
  return `address-${slug(region.name)}--${encoded}`;
}

function regionFromAddressId(regionId: string): Region | undefined {
  const marker = "--";
  if (!regionId.startsWith("address-") || !regionId.includes(marker)) return undefined;
  const encoded = regionId.slice(regionId.indexOf(marker) + marker.length);
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      n?: string;
      a?: string;
      c?: string;
      lat?: number;
      lon?: number;
      tz?: string;
      fx?: Region["defaultFixtureId"];
    };
    if (!payload.n || !payload.a || !payload.c || typeof payload.lat !== "number" || typeof payload.lon !== "number") {
      return undefined;
    }
    return {
      id: regionId,
      name: payload.n,
      adminArea: payload.a,
      country: payload.c,
      latitude: payload.lat,
      longitude: payload.lon,
      timezone: payload.tz ?? "auto",
      searchTerms: [payload.n, payload.a, payload.c],
      defaultFixtureId: payload.fx ?? "normal-day"
    };
  } catch {
    return undefined;
  }
}

function firstDisplayPart(value?: string): string | undefined {
  return value?.split(",").map((part) => part.trim()).find(Boolean);
}

function fixtureForAddress(address: NominatimAddress, latitude: number): Region["defaultFixtureId"] {
  const text = `${address.state ?? ""} ${address.region ?? ""} ${address.country ?? ""}`.toLowerCase();
  if (/arizona|nevada|desert/.test(text)) return "heat-warning-day";
  if (/florida|puerto rico|caribbean/.test(text)) return "multiple-simultaneous-risks";
  if (/texas|louisiana|gulf/.test(text)) return "heavy-rain-flood-risk-day";
  if (/new york|new jersey/.test(text)) return "poor-air-quality-day";
  if (Math.abs(latitude) < 24) return "mosquito-activity-warning";
  return "normal-day";
}

function dedupeRegions(regions: readonly Region[]): Region[] {
  const seen = new Set<string>();
  const unique: Region[] = [];
  for (const region of regions) {
    const key = `${region.id}:${region.latitude.toFixed(3)}:${region.longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(region);
  }
  return unique;
}

function slug(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "region";
}

function smallHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, "0").slice(0, 7);
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
