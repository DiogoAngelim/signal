import { BRAZIL_MUNICIPALITIES, type BrazilMunicipality } from "@/data/brazilMunicipalities";
import type { ForecastPoint, Region, StatusLevel } from "@/types/weather";

const REGION_CONCERNS: Record<
  string,
  Record<StatusLevel, { concern: string; summary: string; drivers: string[] }>
> = {
  "Centro-Oeste": {
    Calm: {
      concern: "Routine dry-season and isolated shower monitoring",
      summary: "Conditions remain manageable, with only localized heat and short-lived convection expected over the next cycle.",
      drivers: ["Seasonal heat remains within expected range", "No widespread severe signal is active", "Routine municipal monitoring remains sufficient"]
    },
    Watch: {
      concern: "Late-day thunderstorm watch for interior convection",
      summary: "Heat-driven instability may trigger isolated but sharp thunderstorms late in the day, especially around exposed corridors.",
      drivers: ["Afternoon instability is elevated", "Localized lightning risk may affect open areas", "Brief drainage pressure is possible during stronger cells"]
    },
    Warning: {
      concern: "Heavy downpours and gust fronts across urban corridors",
      summary: "Short-duration intense cells may bring disruptive rainfall rates, lightning, and abrupt wind shifts into the municipality.",
      drivers: ["Storm outflows may reach dense urban zones", "Localized flooding remains the main operational risk", "Transport routes may see fast-changing visibility"]
    },
    Critical: {
      concern: "Severe storm response posture for flash-flood and wind risk",
      summary: "Conditions favor a higher-impact storm cluster with the potential for flash flooding, service interruptions, and sharp wind damage.",
      drivers: ["Multiple severe hazards may overlap", "Drainage systems may be rapidly overwhelmed", "Emergency coordination should stay on standby"]
    }
  },
  Nordeste: {
    Calm: {
      concern: "Routine coastal and convective monitoring",
      summary: "Typical seasonal weather is expected, with manageable showers and no broad disruptive signal at this time.",
      drivers: ["Background moisture remains seasonally normal", "No large-scale severe alert is active", "Localized impacts should remain brief"]
    },
    Watch: {
      concern: "Onshore showers and localized thunderstorm watch",
      summary: "Moist coastal flow and inland heating may combine to produce scattered downpours and lightning across the municipality.",
      drivers: ["Moisture transport is supporting repeated showers", "Localized lightning remains possible", "Low-lying streets could briefly accumulate water"]
    },
    Warning: {
      concern: "Flood-prone streets and repeated rain bands",
      summary: "Persistent showers may produce drainage stress and localized flooding, especially in low-lying neighborhoods and coastal access routes.",
      drivers: ["Repeated rain bands may train over the same area", "Urban runoff may intensify quickly", "Transport delays are possible in flood-prone corridors"]
    },
    Critical: {
      concern: "Escalated flood and coastal-impact response",
      summary: "A more organized rain signal may produce widespread disruption, with flooding, service interruptions, and rapid deterioration in exposed zones.",
      drivers: ["Rainfall may persist across multiple hours", "Critical corridors may become intermittently inaccessible", "Protective actions should be ready to scale quickly"]
    }
  },
  Norte: {
    Calm: {
      concern: "Routine river-basin and convective monitoring",
      summary: "The municipality remains under routine watch with only isolated shower activity and no concentrated hazard signal.",
      drivers: ["River response remains stable", "Storm activity is expected to stay scattered", "No active municipal alert is indicated"]
    },
    Watch: {
      concern: "Convective watch for humid Amazon basin conditions",
      summary: "Deep tropical moisture supports scattered thunderstorms, with the greatest risk centered on localized downpours and lightning.",
      drivers: ["High ambient moisture supports storm growth", "Lightning risk increases during stronger cells", "Localized stream rises are possible in vulnerable areas"]
    },
    Warning: {
      concern: "High-rainfall watch for river and drainage response",
      summary: "Repeated heavy showers may trigger rapid water accumulation and short-notice flooding in vulnerable neighborhoods.",
      drivers: ["Rainfall efficiency is elevated", "Small waterways may respond quickly", "Road access may deteriorate under repeated cells"]
    },
    Critical: {
      concern: "Escalated flood-response posture for saturated ground",
      summary: "An organized rainfall cluster may drive rapid flooding and broader disruption across saturated areas and river-adjacent corridors.",
      drivers: ["Ground saturation limits absorption", "Hydrologic response may accelerate quickly", "Emergency operations should prepare for broader impacts"]
    }
  },
  Sudeste: {
    Calm: {
      concern: "Routine monitoring for scattered showers and urban runoff",
      summary: "Weather impacts remain low, with only isolated showers and normal municipal operations expected.",
      drivers: ["Background instability remains modest", "No significant severe signal is active", "Urban drainage conditions remain manageable"]
    },
    Watch: {
      concern: "Localized thunderstorm watch for metro and hillside corridors",
      summary: "Scattered storms may bring lightning, brief heavy rain, and short-lived disruption to roads and exposed districts.",
      drivers: ["Late-day instability supports thunderstorm growth", "Localized lightning remains the primary near-term hazard", "Short drainage backups are possible under stronger cells"]
    },
    Warning: {
      concern: "Heavy rain and drainage pressure in dense urban areas",
      summary: "Repeated cells may trigger street flooding, transport delays, and sharper operational impacts across vulnerable corridors.",
      drivers: ["Urban flood risk is elevated", "Travel times may deteriorate quickly", "Repeated storm passages may extend disruption"]
    },
    Critical: {
      concern: "Escalated flash-flood and landslide response posture",
      summary: "The municipality faces a higher-impact setup with severe rain rates and the potential for broader disruption in low-lying and steep terrain areas.",
      drivers: ["Flash-flood risk is elevated across urban corridors", "Slope instability may worsen in exposed terrain", "Emergency response teams should remain ready"]
    }
  },
  Sul: {
    Calm: {
      concern: "Routine frontal monitoring with low immediate risk",
      summary: "Only limited short-term impacts are expected, with routine monitoring sufficient for the current cycle.",
      drivers: ["No concentrated severe forcing is active", "Background showers should remain scattered", "Operations can continue normally with monitoring"]
    },
    Watch: {
      concern: "Frontal instability watch for gusty showers",
      summary: "Passing instability may support gusty showers and lightning, especially near exposed rural and transport corridors.",
      drivers: ["A weak frontal signal remains nearby", "Wind shifts may briefly affect exposed routes", "Lightning remains possible during stronger cells"]
    },
    Warning: {
      concern: "Frontal rain bands and strong gust potential",
      summary: "More organized instability may bring disruptive rain bursts and wind impacts capable of affecting mobility and utilities.",
      drivers: ["Frontal forcing supports repeated rain bands", "Strong gusts may accompany embedded cells", "Localized service interruptions are possible"]
    },
    Critical: {
      concern: "Severe frontal response for widespread disruption risk",
      summary: "The municipality may see a more intense frontal passage with broader impacts to transport, power, and emergency operations.",
      drivers: ["Multiple hazards may arrive in quick succession", "Winds and rainfall may disrupt critical services", "Preparedness actions should remain elevated"]
    }
  }
};

const FORECAST_LABELS = ["Now", "3h", "6h", "12h", "18h", "24h"];

export const MOCK_REGIONS: Region[] = BRAZIL_MUNICIPALITIES.map(buildRegion);

function buildRegion(municipality: BrazilMunicipality): Region {
  const hash = stableHash(municipality.id);
  const riskScore = 12 + (hash % 73);
  const status = riskToStatus(riskScore);
  const concernSet = REGION_CONCERNS[municipality.region] ?? REGION_CONCERNS.Sudeste;
  const concern = concernSet[status];
  const trend = hash % 3 === 0 ? "stable" : hash % 3 === 1 ? "worsening" : "improving";
  const updatedMinutesAgo = hash % 60;
  const alertIssuedMinutesAgo = 4 + (hash % 40);
  const summary = `${municipality.name}, ${municipality.state}, is under ${status.toLowerCase()} monitoring. ${concern.summary}`;
  const topConcern = concern.concern;
  const riskDrivers = [
    ...concern.drivers,
    `${municipality.region} operational profile`,
  ].slice(0, 3);

  return {
    id: municipality.id,
    name: municipality.name,
    country: "Brazil",
    countryFlag: "🇧🇷",
    latitude: municipality.latitude,
    longitude: municipality.longitude,
    timezone: municipality.timezone,
    state: municipality.state,
    tags: [municipality.stateCode, municipality.region],
    status,
    riskScore,
    topConcern,
    summary,
    riskDrivers,
    alerts:
      status === "Calm"
        ? []
        : [
            {
              id: `${municipality.id}-alert-1`,
              message: `${status} advisory active for ${municipality.name}`,
              severity: status,
              issuedAt: minutesAgo(alertIssuedMinutesAgo)
            }
          ],
    recentEvents: [
      {
        id: `${municipality.id}-event-1`,
        description: `${municipality.name} monitoring cycle refreshed`,
        timestamp: minutesAgo(updatedMinutesAgo)
      },
      {
        id: `${municipality.id}-event-2`,
        description: `${status} posture confirmed for ${municipality.state}`,
        timestamp: minutesAgo(updatedMinutesAgo + 18)
      }
    ],
    lastUpdated: minutesAgo(updatedMinutesAgo),
    forecastPoints: buildForecastPoints(riskScore, trend),
    trend
  };
}

function buildForecastPoints(riskScore: number, trend: Region["trend"]): ForecastPoint[] {
  const deltas =
    trend === "worsening"
      ? [0, 6, 10, 8, 3, -4]
      : trend === "improving"
        ? [0, -4, -8, -10, -6, -3]
        : [0, 2, 1, -1, 0, -2];

  return FORECAST_LABELS.map((hour, index) => {
    const nextRisk = clamp(riskScore + deltas[index], 0, 100);
    return {
      hour,
      riskScore: nextRisk,
      label: riskToStatus(nextRisk)
    };
  });
}

function riskToStatus(riskScore: number): StatusLevel {
  if (riskScore >= 72) return "Critical";
  if (riskScore >= 50) return "Warning";
  if (riskScore >= 28) return "Watch";
  return "Calm";
}

function stableHash(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
