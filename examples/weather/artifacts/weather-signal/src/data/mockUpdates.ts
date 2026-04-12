import type { StatusLevel } from "@/types/weather";

export interface LiveUpdate {
  id: string;
  regionId: string;
  regionName: string;
  message: string;
  status: StatusLevel;
  timestamp: string;
}

export const MOCK_UPDATES: LiveUpdate[] = [
  {
    id: "u1",
    regionId: "houston",
    regionName: "Houston",
    message: "Houston elevated to Warning",
    status: "Warning",
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: "u2",
    regionId: "miami",
    regionName: "Miami",
    message: "Mandatory evacuation zone A in effect",
    status: "Critical",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "u3",
    regionId: "sao-paulo",
    regionName: "São Paulo",
    message: "São Paulo status: Watch",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "u4",
    regionId: "nyc",
    regionName: "New York City",
    message: "Coastal Flood Advisory issued",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "u5",
    regionId: "juiz-de-fora",
    regionName: "Juiz de Fora",
    message: "Routine monitoring — Calm",
    status: "Calm",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "u6",
    regionId: "lisbon",
    regionName: "Lisbon",
    message: "Lisbon status: Calm",
    status: "Calm",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];