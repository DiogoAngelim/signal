export type StatusLevel = "Calm" | "Watch" | "Warning" | "Critical";

export interface Alert {
  id: string;
  message: string;
  severity: StatusLevel;
  issuedAt: string;
}

export interface ForecastPoint {
  hour: string;   // e.g. "6am", "12pm"
  riskScore: number;
  label: StatusLevel;
}

export interface RegionEvent {
  id: string;
  description: string;
  timestamp: string;
}

export interface Region {
  id: string;
  name: string;
  country: string;
  countryFlag: string;
  status: StatusLevel;
  riskScore: number;       // 0–100
  topConcern: string;
  summary: string;         // 1-2 sentences, plain language
  riskDrivers: string[];   // 2-3 strings
  alerts: Alert[];
  recentEvents: RegionEvent[];
  lastUpdated: string;     // ISO string
  forecastPoints: ForecastPoint[];
  trend: "improving" | "worsening" | "stable";
}

export const MOCK_REGIONS: Region[] = [
  {
    id: "juiz-de-fora",
    name: "Juiz de Fora",
    country: "Brazil",
    countryFlag: "🇧🇷",
    status: "Calm",
    riskScore: 14,
    topConcern: "Routine afternoon convective showers",
    summary: "Typical summer afternoon showers are expected. No significant weather risk. Normal operations recommended.",
    riskDrivers: ["Isolated afternoon showers possible", "Temperatures near seasonal average", "No active alerts"],
    alerts: [],
    recentEvents: [
      { id: "jdf-e1", description: "Status confirmed as Calm — routine monitoring", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 14, label: "Calm" },
      { hour: "3pm", riskScore: 20, label: "Calm" },
      { hour: "6pm", riskScore: 18, label: "Calm" },
      { hour: "9pm", riskScore: 10, label: "Calm" },
      { hour: "Mid", riskScore: 8, label: "Calm" },
      { hour: "6am", riskScore: 10, label: "Calm" },
    ],
    trend: "stable",
  },
  {
    id: "sao-paulo",
    name: "São Paulo",
    country: "Brazil",
    countryFlag: "🇧🇷",
    status: "Watch",
    riskScore: 38,
    topConcern: "Severe thunderstorm risk this evening",
    summary: "A line of strong thunderstorms is expected to move through the metro area between 5–9pm. Lightning and localized street flooding are the main concerns.",
    riskDrivers: ["Severe thunderstorm watch effective 4PM–10PM", "Lightning risk elevated in the afternoon", "Urban drainage may cause localized flooding"],
    alerts: [
      { id: "sp-1", message: "Severe Thunderstorm Watch — Greater São Paulo Metro, 4PM–10PM", severity: "Watch", issuedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
    ],
    recentEvents: [
      { id: "sp-e1", description: "Thunderstorm Watch issued by INMET", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
      { id: "sp-e2", description: "Status elevated from Calm to Watch", timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
    ],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    forecastPoints: [
      { hour: "Now", riskScore: 38, label: "Watch" },
      { hour: "3pm", riskScore: 50, label: "Watch" },
      { hour: "6pm", riskScore: 62, label: "Warning" },
      { hour: "9pm", riskScore: 45, label: "Watch" },
      { hour: "Mid", riskScore: 22, label: "Calm" },
      { hour: "6am", riskScore: 12, label: "Calm" },
    ],
    trend: "worsening",
  },
  ...buildSoutheastBrazilRegions(),
  ...buildMinorBrazilRegions(),
];

interface DemoRegionConfig {
  id: string;
  name: string;
  status: StatusLevel;
  riskScore: number;
  topConcern: string;
  summary: string;
  riskDrivers: string[];
  trend: "improving" | "worsening" | "stable";
  alertMessage?: string;
  updatedMinutesAgo?: number;
}

function buildSoutheastBrazilRegions(): Region[] {
  const configs: DemoRegionConfig[] = [
    {
      id: "rio-de-janeiro",
      name: "Rio de Janeiro",
      status: "Warning",
      riskScore: 62,
      topConcern: "Heavy showers and coastal wind across the metro coastline",
      summary: "A moist onshore flow is supporting repeated downpours from the South Zone into Baixada Fluminense. Short-notice flooding and transport delays are possible this evening.",
      riskDrivers: ["Localized rain bursts over flood-prone corridors", "Windy coastal conditions along exposed waterfront districts", "Traffic disruption risk during the evening commute"],
      trend: "worsening",
      alertMessage: "Urban flooding advisory in effect for Rio low-lying neighborhoods"
    },
    {
      id: "belo-horizonte",
      name: "Belo Horizonte",
      status: "Watch",
      riskScore: 37,
      topConcern: "Late-day thunderstorms over the metro hills",
      summary: "Storm development around the Serra do Curral may bring lightning and short periods of intense rain late in the day. Most activity should remain scattered rather than widespread.",
      riskDrivers: ["Elevated lightning potential after 4PM", "Brief heavy rain over steep terrain", "Localized runoff in dense urban areas"],
      trend: "worsening"
    },
    {
      id: "campinas",
      name: "Campinas",
      status: "Watch",
      riskScore: 41,
      topConcern: "Severe cell development west of the city",
      summary: "The Campinas metro is under a modest severe thunderstorm signal, with the highest risk during the evening commute. Operators should expect isolated but sharp impacts.",
      riskDrivers: ["Storm line approaching from the interior", "Potential for gusty outflow winds", "Short-duration rain rates may overwhelm drainage"],
      trend: "worsening",
      alertMessage: "Severe thunderstorm watch for Campinas metro through tonight"
    },
    {
      id: "santos",
      name: "Santos",
      status: "Warning",
      riskScore: 58,
      topConcern: "High surf and drainage flooding near the waterfront",
      summary: "Persistent onshore flow is elevating surf and slowing runoff into coastal channels. Conditions favor localized street flooding close to the seafront and port access roads.",
      riskDrivers: ["High tide amplifying drainage pressure", "Repeated coastal showers", "Port-area logistics may see temporary slowdowns"],
      trend: "worsening",
      alertMessage: "Coastal flood advisory active for Santos shoreline districts"
    },
    {
      id: "sao-jose-dos-campos",
      name: "São José dos Campos",
      status: "Watch",
      riskScore: 34,
      topConcern: "Storm line crossing the Paraíba Valley",
      summary: "Convective cells moving through the valley may bring lightning, brief gusts, and isolated pooling on major roads. The risk is notable but still localized.",
      riskDrivers: ["Valley convergence supporting thunderstorm growth", "Reduced visibility in heavier showers", "Localized gusts on exposed corridors"],
      trend: "stable"
    },
    {
      id: "sorocaba",
      name: "Sorocaba",
      status: "Watch",
      riskScore: 32,
      topConcern: "Localized lightning and brief heavy rain",
      summary: "Storms near Sorocaba are expected to remain scattered, but a few cells may produce sharp rainfall bursts. Normal operations can continue with monitoring.",
      riskDrivers: ["Scattered thunderstorm activity late afternoon", "Lightning risk elevated during cell passage", "Minor drainage backups possible"],
      trend: "stable"
    },
    {
      id: "ribeirao-preto",
      name: "Ribeirão Preto",
      status: "Warning",
      riskScore: 60,
      topConcern: "Heat stress and isolated severe storms",
      summary: "Extreme daytime heat is combining with unstable air to create a more volatile late-day thunderstorm setup. Outdoor operations should be reviewed carefully.",
      riskDrivers: ["Heat index well above seasonal norms", "Storms may develop explosively near sunset", "Strong downdrafts possible with collapsing cells"],
      trend: "worsening",
      alertMessage: "Heat and severe storm advisory in effect for Ribeirão Preto"
    },
    {
      id: "sao-jose-do-rio-preto",
      name: "São José do Rio Preto",
      status: "Warning",
      riskScore: 64,
      topConcern: "Extreme heat with gusty evening storm risk",
      summary: "A strong heat dome remains in place, and any storms that do form later today may produce powerful gust fronts. Utility and outdoor teams should remain alert.",
      riskDrivers: ["High heat stress across the metro area", "Potential for strong outflow winds", "Rapid weather shifts expected after peak heating"],
      trend: "worsening",
      alertMessage: "Heat alert remains active with evening storm potential"
    },
    {
      id: "bauru",
      name: "Bauru",
      status: "Watch",
      riskScore: 36,
      topConcern: "Convective showers with localized wind gusts",
      summary: "Bauru remains in a moderate convective pattern this afternoon, with brief stronger cells possible. Impacts should stay short-lived but noticeable.",
      riskDrivers: ["Moderate instability over central São Paulo state", "Brief gusts during storm passage", "Spotty heavy rain reducing road visibility"],
      trend: "stable"
    },
    {
      id: "niteroi",
      name: "Niterói",
      status: "Warning",
      riskScore: 55,
      topConcern: "Gusty coastal weather and rough seas",
      summary: "Marine exposure and repeated showers are increasing short-term disruption risk along the bay-facing districts. Ferry and shoreline operations should stay alert.",
      riskDrivers: ["Strong sea breeze and coastal gusts", "Rougher marine conditions in exposed zones", "Localized street flooding in shoreline neighborhoods"],
      trend: "worsening",
      alertMessage: "Coastal conditions advisory active for Niterói waterfront"
    },
    {
      id: "petropolis",
      name: "Petrópolis",
      status: "Warning",
      riskScore: 57,
      topConcern: "Slope saturation and landslide watch",
      summary: "Mountain-top rainfall totals are gradually saturating the ground, raising concern in hillside areas. Local authorities should watch for rapid deterioration.",
      riskDrivers: ["Ongoing rainfall over elevated terrain", "Higher runoff and slope instability risk", "Road access may degrade quickly in the hills"],
      trend: "worsening",
      alertMessage: "Landslide watch active for hillside communities"
    },
    {
      id: "campos-dos-goytacazes",
      name: "Campos dos Goytacazes",
      status: "Warning",
      riskScore: 52,
      topConcern: "Flood-prone streets and river response",
      summary: "Repeated showers around Campos are increasing pressure on drainage channels and low-lying roads. Conditions warrant active monitoring through the evening.",
      riskDrivers: ["Rainfall clustered around flood-sensitive neighborhoods", "Water levels rising in urban channels", "Commuter routes may see brief closures"],
      trend: "worsening",
      alertMessage: "Localized flood advisory issued for Campos low-lying sectors"
    },
    {
      id: "volta-redonda",
      name: "Volta Redonda",
      status: "Watch",
      riskScore: 29,
      topConcern: "Routine monitoring with isolated showers",
      summary: "Volta Redonda is in a relatively manageable pattern, with only isolated shower activity expected. No significant operational disruption is currently indicated.",
      riskDrivers: ["Scattered showers possible through evening", "Low-end lightning threat", "Most impacts should remain brief and local"],
      trend: "stable"
    },
    {
      id: "uberlandia",
      name: "Uberlândia",
      status: "Watch",
      riskScore: 31,
      topConcern: "Heat-driven thunderstorms late afternoon",
      summary: "The Uberlândia metro is expected to see heat-driven convection, with modest risk for gusts and brief heavy rain. Monitoring remains appropriate.",
      riskDrivers: ["Afternoon heating driving storm development", "Localized downpours possible", "Potential for temporary traffic slowdowns"],
      trend: "stable"
    },
    {
      id: "uberaba",
      name: "Uberaba",
      status: "Watch",
      riskScore: 28,
      topConcern: "Localized thunderstorm pockets",
      summary: "Uberaba remains under a lower-end convective setup with small, slow-moving cells. Most of the city should remain operational with routine caution.",
      riskDrivers: ["Pockets of convective buildup nearby", "Short-lived lightning threat", "Low but non-zero runoff concern"],
      trend: "stable"
    },
    {
      id: "vitoria",
      name: "Vitória",
      status: "Watch",
      riskScore: 40,
      topConcern: "Onshore wind and squally showers",
      summary: "Vitória is seeing a more active coastal pattern, with gusty marine air and intermittent showers. Impacts are manageable but worth monitoring closely.",
      riskDrivers: ["Onshore wind strengthening near the coast", "Intermittent showers over dense urban areas", "Temporary marine transport disruption possible"],
      trend: "worsening",
      alertMessage: "Coastal weather watch active for Greater Vitória"
    },
    {
      id: "vila-velha",
      name: "Vila Velha",
      status: "Watch",
      riskScore: 43,
      topConcern: "Coastal surf and drainage pressure",
      summary: "Vila Velha is exposed to a rougher sea state and repeated showers near the beachfront. Water accumulation may occur in vulnerable urban sections.",
      riskDrivers: ["Repeated coastal showers", "Surf and tide complicating drainage", "Localized ponding near beachside avenues"],
      trend: "worsening",
      alertMessage: "Beachfront drainage advisory in effect for Vila Velha"
    },
    {
      id: "serra",
      name: "Serra",
      status: "Watch",
      riskScore: 35,
      topConcern: "Passing showers and gusty sea breeze",
      summary: "A moderate marine pattern is supporting showers and occasional gusts across Serra. Most effects should remain short-lived, though repeated cells may slow traffic.",
      riskDrivers: ["Sea breeze boundary active this afternoon", "Intermittent gusts during showers", "Spot flooding possible in isolated corridors"],
      trend: "stable"
    },
    {
      id: "linhares",
      name: "Linhares",
      status: "Calm",
      riskScore: 23,
      topConcern: "Routine convective monitoring",
      summary: "Linhares is in a relatively calm weather window, with only a small chance of isolated showers. Normal operations are recommended with standard observation.",
      riskDrivers: ["Low-end afternoon shower chance", "No active official alerts", "Weather pattern remains generally stable"],
      trend: "stable"
    },
    {
      id: "cachoeiro-de-itapemirim",
      name: "Cachoeiro de Itapemirim",
      status: "Watch",
      riskScore: 33,
      topConcern: "Evening storms moving in from the interior",
      summary: "Storms drifting toward Cachoeiro may create a brief period of heavier rain and lightning late today. The setup is not severe everywhere, but some neighborhoods may see quick impacts.",
      riskDrivers: ["Interior storms drifting toward the metro area", "Elevated lightning risk at day’s end", "Minor urban runoff in heavier cells"],
      trend: "worsening"
    }
  ];

  return configs.map(createDemoRegion);
}

function buildMinorBrazilRegions(): Region[] {
  const configs: DemoRegionConfig[] = [
    {
      id: "teofilo-otoni",
      name: "Teófilo Otoni",
      status: "Watch",
      riskScore: 31,
      topConcern: "Brief evening storms over inland valleys",
      summary: "Scattered inland thunderstorms may brush Teófilo Otoni late in the day with short bursts of rain and lightning. Impacts should stay localized but noticeable.",
      riskDrivers: ["Localized convective buildup over surrounding hills", "Short-duration downpours possible", "Reduced visibility on regional roadways"],
      trend: "stable"
    },
    {
      id: "colatina",
      name: "Colatina",
      status: "Watch",
      riskScore: 30,
      topConcern: "Warm afternoon instability near the Doce valley",
      summary: "Conditions around Colatina support isolated showers and a few thunderstorms later this afternoon. Monitoring is recommended, though widespread disruption is unlikely.",
      riskDrivers: ["Valley humidity supporting isolated storms", "Low-end runoff risk in urban pockets", "Lightning risk increases after peak heating"],
      trend: "stable"
    },
    {
      id: "araxa",
      name: "Araxá",
      status: "Calm",
      riskScore: 24,
      topConcern: "Routine convective monitoring",
      summary: "Araxá remains under a relatively calm weather pattern with only low-end shower chances. Most city operations can proceed normally.",
      riskDrivers: ["Light afternoon instability", "No active alerts", "Weather pattern remains broadly stable"],
      trend: "stable"
    },
    {
      id: "paracatu",
      name: "Paracatu",
      status: "Watch",
      riskScore: 29,
      topConcern: "Heat-driven showers across western Minas",
      summary: "Localized convective pockets may form around Paracatu late in the afternoon. The setup is modest, but a few heavier cells may briefly affect transport corridors.",
      riskDrivers: ["Late-day heat instability", "Brief downpours possible", "Localized gusts with isolated cells"],
      trend: "stable"
    },
    {
      id: "ubatuba",
      name: "Ubatuba",
      status: "Warning",
      riskScore: 54,
      topConcern: "Coastal rain bands and slope runoff",
      summary: "Persistent moisture along the coast is increasing runoff pressure on hillside neighborhoods in Ubatuba. Travel conditions may worsen quickly under heavier bands.",
      riskDrivers: ["Repeated coastal showers", "Slope runoff in elevated neighborhoods", "Road conditions degrade under stronger rain bands"],
      trend: "worsening",
      alertMessage: "Coastal rain advisory active for Ubatuba hillside sectors"
    },
    {
      id: "guaruja",
      name: "Guarujá",
      status: "Watch",
      riskScore: 39,
      topConcern: "Marine gusts and temporary beachfront flooding",
      summary: "Guarujá is seeing a moderate coastal weather pattern with gusty onshore flow and brief drainage stress near seafront avenues. Impacts are manageable but active.",
      riskDrivers: ["Marine gusts along exposed districts", "Beachfront drainage sensitivity", "Short-lived urban flooding possible"],
      trend: "worsening",
      alertMessage: "Beachfront drainage watch active for Guarujá"
    },
    {
      id: "itatiaia",
      name: "Itatiaia",
      status: "Watch",
      riskScore: 33,
      topConcern: "Mountain storms near the Serra da Mantiqueira",
      summary: "Storms over the mountain corridor near Itatiaia may trigger lightning and brief heavy rain. Outdoor and park-facing activity should remain alert to quick changes.",
      riskDrivers: ["Terrain-enhanced thunderstorm formation", "Sudden rain near mountain access roads", "Elevated lightning risk in exposed areas"],
      trend: "worsening"
    },
    {
      id: "cabo-frio",
      name: "Cabo Frio",
      status: "Watch",
      riskScore: 35,
      topConcern: "Coastal gusts and scattered showers",
      summary: "Cabo Frio remains under a breezy coastal setup with periods of scattered rain. Most effects should stay short-lived, though exposed marine areas may be more affected.",
      riskDrivers: ["Onshore wind strengthening late afternoon", "Intermittent showers along the coast", "Marine transport may see brief slowdowns"],
      trend: "stable"
    },
    {
      id: "diamantina",
      name: "Diamantina",
      status: "Calm",
      riskScore: 22,
      topConcern: "Low-end shower chance over elevated terrain",
      summary: "Diamantina is in a relatively quiet pattern with only isolated shower development expected. Monitoring remains routine.",
      riskDrivers: ["Minor terrain-driven convection", "No active warnings in effect", "Limited operational disruption expected"],
      trend: "stable"
    },
    {
      id: "barra-do-garcaas",
      name: "Barra do Garças",
      status: "Watch",
      riskScore: 34,
      topConcern: "Evening thunderstorms spreading across the interior",
      summary: "Storms drifting over the interior may bring lightning and heavier rain pockets to Barra do Garças tonight. Conditions remain manageable but deserve attention.",
      riskDrivers: ["Storm clusters moving in from nearby interior zones", "Localized heavier rain bursts", "Temporary transport disruption risk"],
      trend: "worsening"
    },
    {
      id: "santarem",
      name: "Santarém",
      status: "Warning",
      riskScore: 56,
      topConcern: "River humidity fueling repeated heavy showers",
      summary: "High moisture around Santarém is supporting repeated heavy showers and a stronger flood-prone pattern in low-lying areas. Urban drainage should be monitored closely.",
      riskDrivers: ["High river-basin humidity", "Repeated heavy showers through the day", "Low-lying neighborhoods more exposed to runoff"],
      trend: "worsening",
      alertMessage: "Localized flood watch active for low-lying sectors in Santarém"
    },
    {
      id: "parintins",
      name: "Parintins",
      status: "Watch",
      riskScore: 37,
      topConcern: "Amazon convection intensifying after midday",
      summary: "Convective activity is expected to intensify around Parintins in the afternoon, bringing lightning and short-lived heavy rain. River operations may need closer observation.",
      riskDrivers: ["Amazon basin instability increasing this afternoon", "Lightning risk near exposed transport routes", "Localized rain bursts may limit visibility"],
      trend: "worsening"
    },
    {
      id: "itabuna",
      name: "Itabuna",
      status: "Watch",
      riskScore: 32,
      topConcern: "Warm, unstable air over southern Bahia",
      summary: "Itabuna is under a modest convective setup with localized thunderstorm potential. Most impacts should remain brief, though runoff is possible in sensitive corridors.",
      riskDrivers: ["Southern Bahia humidity supporting showers", "Short-lived thunderstorm cells", "Localized drainage backups possible"],
      trend: "stable"
    },
    {
      id: "caruaru",
      name: "Caruaru",
      status: "Calm",
      riskScore: 20,
      topConcern: "Routine dry-season monitoring",
      summary: "Caruaru remains under mostly manageable conditions with only isolated shower risk. No major disruption signals are currently present.",
      riskDrivers: ["Mostly stable air mass", "Low-end shower probability", "No active weather alerts"],
      trend: "stable"
    },
    {
      id: "juazeiro-do-norte",
      name: "Juazeiro do Norte",
      status: "Watch",
      riskScore: 27,
      topConcern: "Heat and isolated storms near the Chapada",
      summary: "The Juazeiro do Norte area may see a few isolated storms develop near the escarpment later in the day. The overall setup remains moderate.",
      riskDrivers: ["Heat-driven instability", "Localized storm formation near higher terrain", "Brief gusts possible with isolated cells"],
      trend: "stable"
    },
    {
      id: "mossoro",
      name: "Mossoró",
      status: "Calm",
      riskScore: 19,
      topConcern: "Hot but broadly stable conditions",
      summary: "Mossoró is experiencing a mostly stable weather window with minimal storm potential. Heat remains the main operational consideration.",
      riskDrivers: ["Persistent heat through the afternoon", "Very low rainfall probability", "No active alerts in effect"],
      trend: "stable"
    },
    {
      id: "dourados",
      name: "Dourados",
      status: "Watch",
      riskScore: 34,
      topConcern: "Interior storm cells and reduced visibility",
      summary: "Dourados may see evening thunderstorms with a few heavier pockets capable of lowering visibility and slowing road traffic. Conditions warrant active observation.",
      riskDrivers: ["Interior storm cells crossing transport corridors", "Brief heavier rainfall bursts", "Localized gusts with stronger cells"],
      trend: "worsening"
    },
    {
      id: "chapeco",
      name: "Chapecó",
      status: "Watch",
      riskScore: 33,
      topConcern: "Southern frontal moisture increasing rain chances",
      summary: "Chapecó remains in a frontal moisture pattern that supports scattered rain and a few thunderstorms. Major disruption is not expected, but conditions are unsettled.",
      riskDrivers: ["Frontal moisture supporting scattered rain", "Localized thunderstorm risk", "Wet roads may affect regional travel"],
      trend: "stable"
    },
    {
      id: "bage",
      name: "Bagé",
      status: "Watch",
      riskScore: 30,
      topConcern: "Windy southern plains conditions",
      summary: "Bagé is under a breezier pattern with passing showers and lower-end frontal instability. Open-area operations should plan for windier conditions.",
      riskDrivers: ["Wind exposure across the plains", "Passing rain bands", "Cool frontal boundary raising instability slightly"],
      trend: "stable"
    }
  ];

  return configs.map(createDemoRegion);
}

function createDemoRegion(config: DemoRegionConfig): Region {
  const alertSeverity = config.status === "Critical"
    ? "Critical"
    : config.status === "Warning"
      ? "Warning"
      : "Watch";

  return {
    id: config.id,
    name: config.name,
    country: "Brazil",
    countryFlag: "🇧🇷",
    status: config.status,
    riskScore: config.riskScore,
    topConcern: config.topConcern,
    summary: config.summary,
    riskDrivers: config.riskDrivers,
    alerts: config.alertMessage
      ? [
        {
          id: `${config.id}-1`,
          message: config.alertMessage,
          severity: alertSeverity,
          issuedAt: minutesAgo((config.updatedMinutesAgo ?? 12) + 18),
        }
      ]
      : [],
    recentEvents: [
      {
        id: `${config.id}-e1`,
        description: `${config.name} monitoring cycle refreshed`,
        timestamp: minutesAgo((config.updatedMinutesAgo ?? 12) + 35),
      },
      {
        id: `${config.id}-e2`,
        description: config.alertMessage ?? `${config.topConcern} added to active watchlist`,
        timestamp: minutesAgo((config.updatedMinutesAgo ?? 12) + 12),
      },
      {
        id: `${config.id}-e3`,
        description: `Risk score updated to ${config.riskScore}`,
        timestamp: minutesAgo(config.updatedMinutesAgo ?? 12),
      },
    ],
    lastUpdated: minutesAgo(config.updatedMinutesAgo ?? 12),
    forecastPoints: buildForecastPoints(config.riskScore, config.trend),
    trend: config.trend,
  };
}

function buildForecastPoints(
  baseScore: number,
  trend: "improving" | "worsening" | "stable"
): ForecastPoint[] {
  const trendDeltas =
    trend === "worsening"
      ? [0, 6, 12, 10, 4, -8]
      : trend === "improving"
        ? [0, 4, 0, -8, -14, -18]
        : [0, 4, 2, -2, -6, -8];

  const hours = ["Now", "3pm", "6pm", "9pm", "Mid", "6am"];

  return hours.map((hour, index) => {
    const score = clampRiskScore(baseScore + trendDeltas[index]);
    return {
      hour,
      riskScore: score,
      label: statusFromRiskScore(score),
    };
  });
}

function statusFromRiskScore(score: number): StatusLevel {
  if (score >= 80) return "Critical";
  if (score >= 55) return "Warning";
  if (score >= 30) return "Watch";
  return "Calm";
}

function clampRiskScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - 1000 * 60 * minutes).toISOString();
}
