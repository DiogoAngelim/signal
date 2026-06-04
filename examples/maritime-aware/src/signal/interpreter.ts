import type {
  AdapterCollectionResult,
  ConfidenceLevel,
  EvidenceSource,
  FreshnessStatus,
  GuidanceLevel,
  MaritimeBriefing,
  MaritimeMatter,
  MaritimeObservation,
  MaritimeRisk,
  MatterStatus
} from "../contracts.js";
import { guidanceLabels, maritimeMatters } from "../contracts.js";

const guidanceRank: Record<GuidanceLevel, number> = {
  steady: 0,
  notice: 1,
  watch: 2,
  act: 3,
  urgent: 4
};

const matterPriority: Record<MaritimeMatter, number> = {
  "Human Safety": 100,
  Navigation: 90,
  "Critical Infrastructure": 80,
  "Port Operations": 70,
  "Trade Flow": 65,
  "Marine Environment": 60,
  "Fishing Resources": 50
};

export function createMaritimeBriefingFromContext(input: {
  collection: AdapterCollectionResult;
  generatedAt?: string;
  envelopeId?: string;
  generatedEventId?: string;
  memoryRecordId?: string;
}): MaritimeBriefing {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const risks = interpretMaritimeRisks(input.collection.observations);
  const guidanceLevel = risks.reduce<GuidanceLevel>(
    (highest, risk) => guidanceRank[risk.guidanceLevel] > guidanceRank[highest] ? risk.guidanceLevel : highest,
    input.collection.degraded ? "watch" : "steady"
  );
  const whatMatters = assessMatterStatuses(input.collection.observations);
  const id = createBriefingId(input.collection.area.id, generatedAt, risks);
  const degraded = input.collection.degraded;

  return {
    id,
    area: input.collection.area,
    generatedAt,
    guidanceLevel,
    guidanceLabel: guidanceLabels[guidanceLevel],
    summary: summaryFor(input.collection.area.name, guidanceLevel, risks, degraded),
    currentSituation: currentSituationFor(input.collection, guidanceLevel, risks),
    whatMatters,
    risks,
    vessels: input.collection.vessels,
    clusters: input.collection.clusters,
    vesselSummary: vesselSummaryFor(input.collection),
    whatYouCanDo: actionsFor(risks, degraded),
    remainsUnclear: remainsUnclearFor(input.collection, risks),
    watchNext: watchNextFor(risks, input.collection),
    sources: input.collection.sources,
    degraded,
    degradedMessage: degraded
      ? "Some evidence is limited or stale, so the guidance is intentionally cautious."
      : undefined,
    operation: {
      name: "maritime.guide.get.v1",
      envelopeId: input.envelopeId,
      generatedEventId: input.generatedEventId
    },
    decisionMemory: {
      scope: "examples/maritime-aware",
      enabled: Boolean(input.memoryRecordId),
      recordId: input.memoryRecordId,
      note: input.memoryRecordId
        ? "This guide was recorded in Signal decision memory with area, evidence, uncertainty, action, and watch-next context."
        : "Decision memory is scoped to examples/maritime-aware and can be enabled by the runtime."
    }
  };
}

export function interpretMaritimeRisks(observations: readonly MaritimeObservation[]): MaritimeRisk[] {
  return observations
    .filter((observation) => observation.severity > 0 || observation.missing || observation.degraded)
    .map((observation) => riskFromObservation(observation))
    .sort((left, right) =>
      guidanceRank[right.guidanceLevel] - guidanceRank[left.guidanceLevel]
      || right.severity - left.severity
      || matterPriority[right.whatMatters] - matterPriority[left.whatMatters]
      || left.title.localeCompare(right.title)
    )
    .map((risk, index) => ({ ...risk, rank: index + 1 }));
}

export function assessMatterStatuses(observations: readonly MaritimeObservation[]): MatterStatus[] {
  return maritimeMatters.map((matter) => {
    const relevant = observations.filter((observation) => observation.whatMatters === matter);
    const maxSeverity = relevant.reduce((max, observation) => Math.max(max, observation.severity), 0);
    const degraded = relevant.some((observation) => observation.degraded || observation.missing);
    const status: MatterStatus["status"] = degraded
      ? "unclear"
      : maxSeverity >= 3
        ? "attention"
        : maxSeverity >= 1
          ? "changing"
          : "healthy";
    return {
      matter,
      status,
      summary: matterSummary(matter, status, relevant),
      evidenceIds: relevant.map((observation) => observation.id)
    };
  });
}

function riskFromObservation(observation: MaritimeObservation): MaritimeRisk {
  const guidanceLevel = guidanceLevelFor(observation);
  return {
    id: `${observation.id}:risk`,
    title: titleFor(observation),
    whatMatters: observation.whatMatters,
    threat: observation.threat,
    severity: observation.severity,
    guidanceLevel,
    guidanceLabel: guidanceLabels[guidanceLevel],
    meaning: meaningFor(observation, guidanceLevel),
    evidence: observation.evidence,
    confidence: confidenceFor(observation),
    uncertainty: uncertaintyFor(observation),
    suggestedAction: observation.suggestedAction,
    watchNext: observation.watchNext,
    sourceIds: [observation.source.id],
    freshness: freshnessFor([observation.source]),
    fallbackBehavior: observation.degraded || observation.missing
      ? "Evidence is limited, so the guide keeps this item cautious and visible."
      : "If this evidence becomes unavailable, the guide will lower confidence and ask for a source check.",
    rank: 0
  };
}

function guidanceLevelFor(observation: MaritimeObservation): GuidanceLevel {
  if (observation.missing || observation.freshness === "missing") return "watch";
  if (observation.degraded || observation.freshness === "stale") return observation.severity >= 3 ? "act" : "watch";
  if (observation.severity >= 4) return "urgent";
  if (observation.severity >= 3) return "act";
  if (observation.severity >= 2) return "watch";
  if (observation.severity >= 1) return "notice";
  return "steady";
}

function confidenceFor(observation: MaritimeObservation): ConfidenceLevel {
  if (observation.missing) return "low";
  if (observation.degraded || observation.freshness === "stale") return "limited";
  return observation.confidence;
}

function uncertaintyFor(observation: MaritimeObservation): string[] {
  const base = [...observation.uncertainty];
  if (observation.freshness === "stale") base.unshift("Some evidence is older than ideal.");
  if (observation.missing) base.unshift("A source that would normally help is not available.");
  return dedupe(base.length ? base : ["The evidence is useful, but some uncertainty remains."]);
}

function titleFor(observation: MaritimeObservation): string {
  if (observation.missing || observation.degraded) return "Some evidence is limited";
  if (observation.signal === "weather.strong_wind") return "Wind may affect the area";
  if (observation.signal === "weather.poor_visibility") return "Visibility may affect navigation";
  if (observation.signal === "ocean.rough_sea") return "Sea conditions may be harder";
  if (observation.signal === "vessels.congestion") return "Vessel movement is busy";
  if (observation.signal === "vessels.route_conflict") return "Routes may need attention";
  if (observation.signal === "port.congestion") return "Port movement may slow down";
  if (observation.signal === "incidents.environmental_notice") return "Marine environment deserves attention";
  return observation.threat;
}

function meaningFor(observation: MaritimeObservation, guidanceLevel: GuidanceLevel): string {
  if (observation.missing || observation.degraded) return observation.plainLanguage;
  if (guidanceLevel === "urgent") return "Immediate attention may be reasonable.";
  if (guidanceLevel === "act") return "A reasonable next action should be considered soon.";
  if (guidanceLevel === "watch") return "This deserves attention, but the evidence does not ask for alarm.";
  if (guidanceLevel === "notice") return "Worth noticing, with no major action suggested.";
  return observation.plainLanguage;
}

function matterSummary(
  matter: MaritimeMatter,
  status: MatterStatus["status"],
  observations: readonly MaritimeObservation[]
): string {
  if (status === "unclear") return `${matter} has limited evidence right now.`;
  if (status === "attention") {
    const top = [...observations].sort((left, right) => right.severity - left.severity)[0];
    return top ? `${matter} needs attention because ${top.plainLanguage.toLowerCase()}` : `${matter} needs attention.`;
  }
  if (status === "changing") return `${matter} is changing, but not in an alarming way.`;
  return `${matter} looks steady from the available evidence.`;
}

function summaryFor(areaName: string, level: GuidanceLevel, risks: readonly MaritimeRisk[], degraded: boolean): string {
  if (degraded) return `Evidence around ${areaName} is limited, so this guide stays cautious.`;
  if (!risks.length || level === "steady") return `${areaName} looks steady from the available evidence.`;
  const top = risks[0];
  if (level === "urgent") return `${areaName} needs immediate attention because ${top?.threat.toLowerCase()}.`;
  if (level === "act") return `${areaName} deserves action soon because ${top?.threat.toLowerCase()}.`;
  if (level === "watch") return `${areaName} deserves attention because ${top?.threat.toLowerCase()}.`;
  return `${areaName} has a few changes worth noticing.`;
}

function currentSituationFor(collection: AdapterCollectionResult, level: GuidanceLevel, risks: readonly MaritimeRisk[]): string {
  if (collection.degraded) {
    return "The useful picture is incomplete. The guide is showing supported evidence and marking what remains unclear.";
  }
  if (!risks.length || level === "steady") {
    return "The area looks calm. Vessel movement and environmental context do not point to a clear concern.";
  }
  const top = risks.slice(0, 2).map((risk) => risk.threat.toLowerCase()).join(" and ");
  return `The area is understandable, but ${top} deserve attention.`;
}

function vesselSummaryFor(collection: AdapterCollectionResult): string {
  if (!collection.vessels.length) return "No fresh vessel movement is visible in the mock feed.";
  const stale = collection.vessels.filter((vessel) => vessel.stale).length;
  const active = collection.vessels.length - stale;
  const clusters = collection.clusters.length;
  const clusterText = clusters ? ` ${clusters} cluster${clusters === 1 ? "" : "s"} make the map easier to scan.` : "";
  return `${active} vessels look active and ${stale} look stale or offline.${clusterText}`.trim();
}

function actionsFor(risks: readonly MaritimeRisk[], degraded: boolean): string[] {
  if (!risks.length && !degraded) {
    return [
      "Keep the area in view if your plans depend on it.",
      "Check again when weather, traffic, or port timing changes."
    ];
  }
  return dedupe([
    ...risks.slice(0, 3).map((risk) => risk.suggestedAction),
    degraded ? "Treat the guide as cautious until stale or missing evidence refreshes." : "Use the map as context, not as a vessel tracking tool."
  ]);
}

function remainsUnclearFor(collection: AdapterCollectionResult, risks: readonly MaritimeRisk[]): string[] {
  const degradedSources = collection.sources
    .filter((source) => source.status !== "available")
    .map((source) => `${source.name}: ${source.note}`);
  return dedupe([
    ...degradedSources,
    ...risks.flatMap((risk) => risk.uncertainty).slice(0, 6),
    "The guide does not infer intent, compliance, or responsibility from vessel movement."
  ]).slice(0, 8);
}

function watchNextFor(risks: readonly MaritimeRisk[], collection: AdapterCollectionResult): string[] {
  const sourceWatch = collection.degraded ? ["Watch whether stale or missing sources refresh."] : [];
  const riskWatch = risks.map((risk) => risk.watchNext);
  const vesselWatch = collection.vessels.length
    ? ["Watch whether vessel clusters spread out or move toward the same route."]
    : [];
  return dedupe([...sourceWatch, ...riskWatch, ...vesselWatch]).slice(0, 6);
}

function freshnessFor(sources: readonly EvidenceSource[]): FreshnessStatus {
  const rank: Record<FreshnessStatus, number> = { fresh: 0, recent: 1, stale: 2, missing: 3 };
  return sources.reduce<FreshnessStatus>(
    (worst, source) => rank[source.freshness] > rank[worst] ? source.freshness : worst,
    "fresh"
  );
}

function createBriefingId(areaId: string, generatedAt: string, risks: readonly MaritimeRisk[]): string {
  const seed = `${areaId}:${generatedAt}:${risks.map((risk) => risk.id).join("|")}`;
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `maritime-${areaId}-${generatedAt.slice(0, 10)}-${Math.abs(hash).toString(36)}`;
}

function dedupe(lines: readonly string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}
