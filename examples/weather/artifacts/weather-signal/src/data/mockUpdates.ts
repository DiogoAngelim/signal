import type { StatusLevel } from "@/types/weather";
import { MOCK_REGIONS } from "@/data/mockRegions";

export interface LiveUpdate {
  id: string;
  regionId: string;
  regionName: string;
  message: string;
  status: StatusLevel;
  timestamp: string;
}

const FEATURED_REGION_NAMES = [
  "São Paulo",
  "Rio de Janeiro",
  "Belo Horizonte",
  "Brasília",
  "Salvador",
  "Fortaleza",
  "Manaus",
  "Belém",
  "Curitiba",
  "Recife",
  "Goiânia",
  "Porto Alegre",
  "Florianópolis",
  "São Luís",
  "Fernando de Noronha"
];

export const MOCK_UPDATES: LiveUpdate[] = FEATURED_REGION_NAMES
  .map((name) => MOCK_REGIONS.find((region) => region.name === name))
  .filter((region): region is NonNullable<typeof region> => Boolean(region))
  .map((region, index) => ({
    id: `u-${index + 1}`,
    regionId: region.id,
    regionName: region.name,
    message: describeRegionUpdate(region),
    status: region.status,
    timestamp: new Date(Date.now() - (index * 17 + 8) * 60 * 1000).toISOString()
  }));

function describeRegionUpdate(region: (typeof MOCK_REGIONS)[number]): string {
  switch (region.status) {
    case "Critical":
      return `${region.name} moved into critical response posture for ${region.topConcern.toLowerCase()}`;
    case "Warning":
      return `${region.name} remains under warning for ${region.topConcern.toLowerCase()}`;
    case "Watch":
      return `${region.name} is on watch for ${region.topConcern.toLowerCase()}`;
    default:
      return `${region.name} remains calm with routine monitoring active`;
  }
}
