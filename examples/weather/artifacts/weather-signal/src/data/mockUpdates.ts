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
    regionId: "rio-de-janeiro",
    regionName: "Rio de Janeiro",
    message: "Rio flood-prone corridors moved to Warning posture",
    status: "Warning",
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: "u2",
    regionId: "ribeirao-preto",
    regionName: "Ribeirão Preto",
    message: "Heat stress advisory extended through early evening",
    status: "Warning",
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
    regionId: "petropolis",
    regionName: "Petrópolis",
    message: "Slope saturation watch remains elevated",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "u5",
    regionId: "campinas",
    regionName: "Campinas",
    message: "Campinas severe thunderstorm watch activated",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "u6",
    regionId: "vitoria",
    regionName: "Vitória",
    message: "Onshore wind advisory issued for Greater Vitória",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "u7",
    regionId: "santos",
    regionName: "Santos",
    message: "Coastal drainage pressure rising near the waterfront",
    status: "Warning",
    timestamp: new Date(Date.now() - 1000 * 60 * 72).toISOString(),
  },
  {
    id: "u8",
    regionId: "belo-horizonte",
    regionName: "Belo Horizonte",
    message: "Late-day thunderstorm window opened over metro hills",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 84).toISOString(),
  },
  {
    id: "u9",
    regionId: "sao-jose-do-rio-preto",
    regionName: "São José do Rio Preto",
    message: "Extreme heat remains the primary operational concern",
    status: "Warning",
    timestamp: new Date(Date.now() - 1000 * 60 * 96).toISOString(),
  },
  {
    id: "u10",
    regionId: "juiz-de-fora",
    regionName: "Juiz de Fora",
    message: "Routine monitoring — Calm",
    status: "Calm",
    timestamp: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
  },
  {
    id: "u11",
    regionId: "santarem",
    regionName: "Santarém",
    message: "Low-lying neighborhoods moved into localized flood watch",
    status: "Warning",
    timestamp: new Date(Date.now() - 1000 * 60 * 126).toISOString(),
  },
  {
    id: "u12",
    regionId: "ubatuba",
    regionName: "Ubatuba",
    message: "Coastal runoff concern increased along hillside roads",
    status: "Warning",
    timestamp: new Date(Date.now() - 1000 * 60 * 138).toISOString(),
  },
  {
    id: "u13",
    regionId: "colatina",
    regionName: "Colatina",
    message: "Doce valley convection remains under watch",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
  },
  {
    id: "u14",
    regionId: "itabuna",
    regionName: "Itabuna",
    message: "Southern Bahia shower clusters drifted over the metro area",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 164).toISOString(),
  },
  {
    id: "u15",
    regionId: "chapeco",
    regionName: "Chapecó",
    message: "Frontal moisture keeping western Santa Catarina unsettled",
    status: "Watch",
    timestamp: new Date(Date.now() - 1000 * 60 * 176).toISOString(),
  },
];
