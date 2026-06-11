import { clamp, mean } from "../math/statistics";
import type {
  DiscoveryFinding,
  OpportunityOutcomeRecord,
  OpportunityType,
} from "../types";

const MIN_SUPPORT = 2;

export class OpportunityExplorer {
  private readonly records: OpportunityOutcomeRecord[] = [];

  record(record: OpportunityOutcomeRecord) {
    this.records.push(record);
    return this;
  }

  all() {
    return this.records.slice();
  }

  analyze() {
    return analyzeOpportunityOutcomes(this.records);
  }
}

export function analyzeOpportunityOutcomes(
  records: OpportunityOutcomeRecord[],
): DiscoveryFinding[] {
  if (!records.length) return [];

  const findings = [
    ...featureFindings(records),
    ...blockedFindings(records),
    ...almostQualifiedFindings(records),
  ];

  return findings.sort((left, right) => {
    const confidenceDelta = right.confidence - left.confidence;

    return confidenceDelta === 0
      ? left.findingId.localeCompare(right.findingId)
      : confidenceDelta;
  });
}

function featureFindings(
  records: OpportunityOutcomeRecord[],
): DiscoveryFinding[] {
  const winners = records.filter((record) => record.outcome === "winning");
  if (winners.length < MIN_SUPPORT) return [];

  const features = new Set(
    winners.flatMap((record) => Object.keys(record.features ?? {})),
  );
  const findings: DiscoveryFinding[] = [];

  for (const feature of features) {
    const winnerPresence = winners.filter((record) =>
      Boolean(record.features?.[feature]),
    ).length;
    const allPresence = records.filter((record) =>
      Boolean(record.features?.[feature]),
    ).length;
    if (winnerPresence < MIN_SUPPORT) continue;

    const support = round((winnerPresence / winners.length) * 100);
    const precision = round((winnerPresence / Math.max(1, allPresence)) * 100);
    if (support < 60) continue;

    findings.push({
      findingId: `feature:${feature}`,
      pattern: `${feature} recurs before successful outcomes`,
      support,
      confidence: round(mean([support, precision])),
      explanation: `${feature} appeared in ${winnerPresence} of ${winners.length} winning opportunities.`,
      recommendations: [
        `Increase discovery weight when ${feature} is present.`,
      ],
      feedsOpportunityTypes: typesFor(
        records.filter((record) => Boolean(record.features?.[feature])),
      ),
    });
  }

  return findings;
}

function blockedFindings(
  records: OpportunityOutcomeRecord[],
): DiscoveryFinding[] {
  const blocked = records.filter((record) => record.outcome === "blocked");
  if (blocked.length < MIN_SUPPORT) return [];

  const types = typesFor(blocked);
  return [
    {
      findingId: "blocked:recurrence",
      pattern: "blocked opportunities recur with similar evidence",
      support: round((blocked.length / records.length) * 100),
      confidence: round(clamp(45 + blocked.length * 8)),
      explanation: `${blocked.length} blocked opportunities should remain visible for follow-up analysis.`,
      recommendations: [
        "Keep blocked candidates in progression tracking instead of discarding them.",
      ],
      feedsOpportunityTypes: types,
    },
  ];
}

function almostQualifiedFindings(
  records: OpportunityOutcomeRecord[],
): DiscoveryFinding[] {
  const almost = records.filter(
    (record) => record.outcome === "almost-qualified",
  );
  if (almost.length < MIN_SUPPORT) return [];

  return [
    {
      findingId: "almost-qualified:persistence",
      pattern: "almost-qualified opportunities deserve progression tracking",
      support: round((almost.length / records.length) * 100),
      confidence: round(clamp(50 + almost.length * 7)),
      explanation: `${almost.length} almost-qualified opportunities may become actionable if their evidence persists.`,
      recommendations: [
        "Track score progression for near-threshold candidates.",
      ],
      feedsOpportunityTypes: typesFor(almost),
    },
  ];
}

function typesFor(records: OpportunityOutcomeRecord[]): OpportunityType[] {
  const types = records.map((record) => record.candidate.type);
  return Array.from(new Set(types)).sort();
}

function round(value: number) {
  return Number(value.toFixed(2));
}
