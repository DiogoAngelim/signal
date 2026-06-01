import type {
  AdapterCollectionResult,
  AttentionLevel,
  Briefing,
  BriefingItem,
  EvidenceSource,
  FreshnessStatus,
  ObservationCategory,
  SafetyAction,
  SafetyObservation,
  SafetyRisk,
  SourceReliability
} from "../contracts.js";
import { attentionLabels } from "../contracts.js";

const attentionRank: Record<AttentionLevel, number> = {
  normal: 0,
  notice: 1,
  warning: 2,
  urgency: 3,
  emergency: 4
};

const categoryPriority: Record<ObservationCategory, number> = {
  official_alert: 100,
  weather: 80,
  air_quality: 70,
  mosquito: 55,
  pollen: 45,
  source_status: 20
};

export function createBriefingFromObservations(input: {
  collection: AdapterCollectionResult;
  generatedAt?: string;
  envelopeId?: string;
  generatedEventId?: string;
  memoryRecordId?: string;
}): Briefing {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const risks = interpretRisks(input.collection.observations);
  const items = risks.map((risk, index) => itemFromRisk(risk, input.collection.sources, index + 1));
  const attentionLevel = items.reduce<AttentionLevel>(
    (highest, item) => attentionRank[item.attentionLevel] > attentionRank[highest] ? item.attentionLevel : highest,
    "normal"
  );
  const id = createBriefingId(input.collection.region.id, generatedAt, items);
  const degraded = input.collection.degraded || input.collection.sources.some((source) => source.status !== "available");
  return {
    id,
    region: input.collection.region,
    generatedAt,
    attentionLevel,
    attentionLabel: attentionLabels[attentionLevel],
    summary: summaryFor(input.collection.region.name, attentionLevel, items.length, degraded),
    itemCountText: itemCountText(items.length),
    items,
    degraded,
    degradedMessage: degraded
      ? "Some sources are unavailable right now. We are showing what can still be supported."
      : undefined,
    sources: input.collection.sources,
    operation: {
      name: "aware.briefing.get.v1",
      envelopeId: input.envelopeId,
      generatedEventId: input.generatedEventId
    },
    decisionMemory: {
      scope: "examples/aware",
      enabled: Boolean(input.memoryRecordId),
      recordId: input.memoryRecordId,
      note: input.memoryRecordId
        ? "Briefing interpretation was recorded in the example-scoped decision memory store."
        : "Decision memory is scoped to examples/aware and can be enabled by the runtime."
    }
  };
}

export function interpretRisks(observations: readonly SafetyObservation[]): SafetyRisk[] {
  const actionable = observations.filter((observation) => observation.severity > 0 || observation.missing || observation.degraded);
  return actionable
    .map((observation) => riskFromObservation(observation))
    .sort((left, right) =>
      attentionRank[right.attentionLevel] - attentionRank[left.attentionLevel]
      || right.score - left.score
      || categoryPriority[right.category] - categoryPriority[left.category]
      || left.title.localeCompare(right.title)
    );
}

function riskFromObservation(observation: SafetyObservation): SafetyRisk {
  const copy = copyForObservation(observation);
  return {
    id: riskId(observation),
    category: observation.category,
    title: copy.title,
    attentionLevel: observation.attentionHint,
    score: observation.severity * 25 + categoryPriority[observation.category] / 10,
    meaning: copy.meaning,
    primaryAction: copy.action,
    reasons: copy.reasons,
    observations: [observation],
    sourceIds: [observation.source.id],
    reliability: reliabilityFor([observation.source]),
    freshness: freshnessFor([observation.source]),
    fallbackBehavior: observation.missing || observation.degraded
      ? "Evidence is limited, so this guidance is cautious."
      : "If this source becomes unavailable, Aware keeps the item cautious and asks people to check official local guidance."
  };
}

function itemFromRisk(risk: SafetyRisk, allSources: readonly EvidenceSource[], rank: number): BriefingItem {
  const sources = allSources.filter((source) => risk.sourceIds.includes(source.id));
  const observation = risk.observations[0];
  const copy = detailCopy(risk, observation);
  return {
    id: risk.id,
    title: risk.title,
    icon: iconFor(risk),
    attentionLevel: risk.attentionLevel,
    attentionLabel: attentionLabels[risk.attentionLevel],
    meaning: risk.meaning,
    primaryAction: risk.primaryAction,
    whyThisMatters: copy.why,
    whatYouCanDo: copy.actions,
    whenItMatters: copy.when,
    plainLanguageExplanation: copy.explanation,
    fallbackBehavior: risk.fallbackBehavior,
    reliability: reliabilityFor(sources),
    freshnessStatus: freshnessFor(sources),
    updatedAt: latestUpdatedAt(sources),
    sources,
    technicalDetails: technicalDetailsFor(risk.observations),
    rank
  };
}

function copyForObservation(observation: SafetyObservation): {
  title: string;
  meaning: string;
  action: SafetyAction;
  reasons: string[];
} {
  if (observation.category === "source_status") {
    return {
      title: "Some evidence is limited",
      meaning: "Evidence is limited, so this guidance is cautious.",
      action: "Monitor",
      reasons: [observation.plainLanguage]
    };
  }

  if (observation.signal === "official_alert.weather") {
    return {
      title: observation.severity >= 4 ? "Official alert needs immediate attention" : "Official alert may affect plans",
      meaning: observation.severity >= 3 ? "Taking action soon is recommended." : "May affect outdoor plans today.",
      action: observation.severity >= 4 ? "Shelter" : observation.severity >= 3 ? "Protect" : "Monitor",
      reasons: [observation.plainLanguage, "Official alert feeds are treated as high-priority evidence."]
    };
  }

  if (observation.signal === "weather.heavy_rain") {
    return {
      title: "Heavy rain may affect routes",
      meaning: observation.severity >= 3 ? "Taking action soon is recommended." : "May affect outdoor plans today.",
      action: observation.severity >= 3 ? "Delay Activity" : "Prepare",
      reasons: [observation.plainLanguage, "Low-lying roads and outdoor plans can change quickly during heavy rain."]
    };
  }

  if (observation.signal === "weather.heat") {
    return {
      title: "Heat may affect the day",
      meaning: observation.severity >= 3 ? "Taking action soon is recommended." : "May affect outdoor plans today.",
      action: observation.severity >= 3 ? "Reduce Exposure" : "Prepare",
      reasons: [observation.plainLanguage, "Heat can make errands, travel, and outdoor work harder."]
    };
  }

  if (observation.signal === "weather.uv") {
    return {
      title: "Sun exposure may be strong",
      meaning: "Worth knowing, no major action needed.",
      action: "Reduce Exposure",
      reasons: [observation.plainLanguage, "Short outdoor plans can still add up when sun exposure is strong."]
    };
  }

  if (observation.signal === "air_quality.particles") {
    return {
      title: "Air may be harder to breathe",
      meaning: observation.severity >= 3 ? "Taking action soon is recommended." : "May affect outdoor plans today.",
      action: "Reduce Exposure",
      reasons: [observation.plainLanguage, "Reducing exposure may be reasonable, especially for sensitive groups."]
    };
  }

  if (observation.signal === "environmental_exposure.pollen") {
    return {
      title: "Pollen or irritants may be noticeable",
      meaning: "Worth knowing, no major action needed.",
      action: "Monitor",
      reasons: [observation.plainLanguage, "Exposure conditions can affect comfort during outdoor time."]
    };
  }

  if (observation.signal === "mosquito.placeholder_activity") {
    return {
      title: "Mosquito activity may be worth noticing",
      meaning: observation.severity >= 2 ? "May affect outdoor plans today." : "Worth knowing, no major action needed.",
      action: observation.severity >= 2 ? "Protect" : "Monitor",
      reasons: [observation.plainLanguage, "This is a regional placeholder, not an individual medical prediction."]
    };
  }

  return {
    title: "Conditions may affect plans",
    meaning: observation.plainLanguage,
    action: "Observe",
    reasons: [observation.plainLanguage]
  };
}

function detailCopy(risk: SafetyRisk, observation?: SafetyObservation): {
  why: string[];
  actions: string[];
  when: string;
  explanation: string;
} {
  const followGuidance = "Follow local official guidance if it differs from this briefing.";
  if (!observation || risk.category === "source_status") {
    return {
      why: ["A missing source can reduce confidence in the full picture."],
      actions: ["Check again later.", followGuidance],
      when: "Until the source is available again.",
      explanation: "Some sources are unavailable right now. Aware is showing only what can still be supported."
    };
  }
  if (observation.signal === "official_alert.weather") {
    return {
      why: risk.reasons,
      actions: ["Keep plans flexible.", "Check local official instructions.", followGuidance],
      when: observation.validUntil ? "While the official alert is active." : "Until the alert source updates.",
      explanation: "Official alerts are prioritized because they may contain protective guidance for the region."
    };
  }
  if (observation.signal === "weather.heavy_rain") {
    return {
      why: risk.reasons,
      actions: ["Avoid optional travel through low-lying areas.", "Delay outdoor activity if conditions worsen.", followGuidance],
      when: "Most relevant for outdoor plans and travel today.",
      explanation: "Heavy rain can change road and outdoor conditions quickly."
    };
  }
  if (observation.signal === "weather.heat") {
    return {
      why: risk.reasons,
      actions: ["Move harder outdoor activity to cooler parts of the day.", "Plan shade and water breaks.", followGuidance],
      when: "Most relevant during the warmest part of the day.",
      explanation: "Heat guidance is cautious because people and neighborhoods experience heat differently."
    };
  }
  if (observation.signal === "weather.uv") {
    return {
      why: risk.reasons,
      actions: ["Use shade for longer outdoor time.", "Consider protective clothing or sunscreen.", followGuidance],
      when: "Most relevant around midday and early afternoon.",
      explanation: "Sun exposure guidance is about reducing exposure, not making a promise about outdoor time."
    };
  }
  if (observation.signal === "air_quality.particles") {
    return {
      why: risk.reasons,
      actions: ["Consider shorter outdoor exertion.", "Keep windows closed if local conditions worsen.", followGuidance],
      when: "Most relevant during outdoor exertion today.",
      explanation: "Air guidance is regional and does not predict any individual health outcome."
    };
  }
  if (observation.signal === "environmental_exposure.pollen") {
    return {
      why: risk.reasons,
      actions: ["Monitor how conditions change.", "Reducing exposure may be reasonable if you are sensitive.", followGuidance],
      when: "Most relevant for outdoor time today.",
      explanation: "Environmental exposure evidence is limited and should be treated as a comfort signal."
    };
  }
  if (observation.signal === "mosquito.placeholder_activity") {
    return {
      why: risk.reasons,
      actions: ["Avoid standing water where practical.", "Use locally recommended bite prevention.", followGuidance],
      when: "Most relevant around dawn, dusk, and standing water.",
      explanation: "This placeholder describes regional conditions only and does not diagnose or predict illness."
    };
  }
  return {
    why: risk.reasons,
    actions: ["Observe conditions.", followGuidance],
    when: "Today.",
    explanation: risk.meaning
  };
}

function iconFor(risk: SafetyRisk): BriefingItem["icon"] {
  const signal = risk.observations[0]?.signal;
  if (signal === "weather.heat" || signal === "weather.uv") return "sun";
  if (signal === "weather.heavy_rain") return "cloud-rain";
  if (signal === "air_quality.particles") return "wind";
  if (signal === "environmental_exposure.pollen") return "leaf";
  if (signal === "official_alert.weather") return "shield";
  if (signal === "mosquito.placeholder_activity") return "droplets";
  return "info";
}

function technicalDetailsFor(observations: readonly SafetyObservation[]) {
  return observations.flatMap((observation) =>
    Object.entries(observation.details).map(([label, value]) => ({
      label,
      value: value == null ? "not available" : String(value)
    }))
  );
}

function reliabilityFor(sources: readonly EvidenceSource[]): SourceReliability {
  if (!sources.length) return "limited";
  if (sources.some((source) => source.reliability === "limited" || source.status !== "available")) return "limited";
  if (sources.some((source) => source.reliability === "medium")) return "medium";
  return "high";
}

function freshnessFor(sources: readonly EvidenceSource[]): FreshnessStatus {
  if (!sources.length) return "missing";
  if (sources.some((source) => source.freshness === "missing")) return "missing";
  if (sources.some((source) => source.freshness === "stale")) return "stale";
  if (sources.some((source) => source.freshness === "recent")) return "recent";
  return "fresh";
}

function latestUpdatedAt(sources: readonly EvidenceSource[]): string {
  const latest = [...sources].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return latest?.updatedAt ?? new Date(0).toISOString();
}

function summaryFor(regionName: string, level: AttentionLevel, itemCount: number, degraded: boolean): string {
  if (degraded && itemCount > 0) {
    return "Evidence is limited, so this guidance is cautious.";
  }
  if (level === "emergency") return "Immediate protective action may be needed. Follow local official guidance.";
  if (level === "urgency") return "Taking action soon is recommended.";
  if (level === "warning") return "Some conditions may affect plans today.";
  if (level === "notice") return `Today there ${itemCount === 1 ? "is 1 thing" : `are ${itemCount} things`} worth knowing.`;
  return `Nothing unusual requires attention in ${regionName} right now.`;
}

function itemCountText(count: number): string {
  if (count === 0) return "Nothing unusual requires attention.";
  if (count === 1) return "Today there is 1 thing worth knowing.";
  return `Today there are ${count} things worth knowing.`;
}

function riskId(observation: SafetyObservation): string {
  return observation.id.replaceAll(":", "-");
}

function createBriefingId(regionId: string, generatedAt: string, items: readonly BriefingItem[]): string {
  const day = generatedAt.slice(0, 10);
  const signals = items.map((item) => `${item.id}:${item.attentionLevel}`).join("|");
  return `aware-${regionId}-${day}-${smallHash(signals || "normal")}`;
}

function smallHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, "0").slice(0, 7);
}
