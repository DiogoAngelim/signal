import { clamp, mean, numeric } from "../math/statistics";
import type {
  DetectedNeed,
  NeedCategory,
  NeedDetectionInput,
  NeedDetectionOptions,
} from "../types";

const DEFAULT_OPTIONS: Required<NeedDetectionOptions> = {
  minSeverity: 35,
  targetOpportunityDensity: 25,
  targetParticipation: 55,
};

const RECOMMENDATIONS: Record<NeedCategory, string[]> = {
  "discover-opportunities": [
    "Expand the candidate search before changing risk limits.",
    "Prioritize improving candidates over already-obvious decisions.",
  ],
  "gather-evidence": [
    "Collect fresher or more independent evidence before committing capacity.",
    "Reduce dependence on low-confidence observations.",
  ],
  "reduce-exposure": [
    "Preserve optionality until risk pressure normalizes.",
    "Use hard risk gates before considering additional participation.",
  ],
  "increase-participation": [
    "Use graduated participation while alignment remains constructive.",
    "Prefer opportunities with persistent evidence and clear constraints.",
  ],
  wait: [
    "Avoid new action until conflicting evidence resolves.",
    "Track which contradiction must clear before the next decision.",
  ],
  maintain: [
    "Continue monitoring the objective with current controls intact.",
    "No additional intervention is required on this cycle.",
  ],
};

export function detectNeeds(
  input: NeedDetectionInput,
  options: NeedDetectionOptions = {},
): DetectedNeed[] {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const perceptionScore = score(input.perception?.compositeScore, 50);
  const perceptionConfidence = score(input.perception?.confidence, 50);
  const agreement = score(input.perception?.agreement, 50);
  const uncertainty = score(
    input.diagnostics?.uncertainty,
    100 - perceptionConfidence,
  );
  const trust = score(input.diagnostics?.trust, perceptionConfidence);
  const synchronization = score(input.synchronization?.score, 50);
  const readiness = score(
    input.executionReadiness?.readinessScore,
    perceptionScore,
  );
  const executionSuitability = score(
    input.executionReadiness?.executionSuitability,
    readiness,
  );
  const riskSuggestion = score(
    input.executionReadiness?.riskAdjustedExposureSuggestion,
    executionSuitability,
  );
  const contradictionDensity = score(
    input.diagnostics?.contradictionDensity,
    0,
  );

  const contradictionCount = input.diagnostics?.contradictions?.length ?? 0;
  const rankingCount = input.rankings?.length ?? 0;
  const emergingCount =
    input.rankings?.filter((ranking) => ranking.emerging).length ?? 0;
  const candidateCount = input.opportunities?.length ?? 0;
  const explicitDensity =
    input.opportunityDensity == null
      ? undefined
      : score(input.opportunityDensity, 0);
  const opportunityDensity =
    explicitDensity ??
    clamp(
      candidateCount * 8 + emergingCount * 5 + Math.min(rankingCount, 8) * 2,
    );
  const health = mean([
    perceptionScore,
    perceptionConfidence,
    agreement,
    trust,
    synchronization,
  ]);
  const needs: DetectedNeed[] = [];

  pushNeed(
    needs,
    {
      category: "discover-opportunities",
      severity: clamp(
        settings.targetOpportunityDensity -
          opportunityDensity +
          Math.max(0, health - 50) * 0.5,
      ),
      confidence: mean([perceptionConfidence, trust, synchronization]),
      explanation:
        "The objective has acceptable operating conditions, but the candidate surface is not dense enough to deploy capital confidently.",
    },
    settings,
  );

  pushNeed(
    needs,
    {
      category: "gather-evidence",
      severity: clamp(
        uncertainty * 0.72 +
          Math.max(0, 55 - perceptionConfidence) * 0.34 +
          Math.max(0, 55 - synchronization) * 0.28,
      ),
      confidence: mean([100 - uncertainty, synchronization, trust]),
      explanation:
        "The system lacks enough reliable evidence to convert observations into a higher-conviction action.",
    },
    settings,
  );

  pushNeed(
    needs,
    {
      category: "reduce-exposure",
      severity: clamp(
        Math.max(0, 45 - riskSuggestion) * 1.55 +
          Math.max(0, 45 - layerScore(input, "survival")) * 0.72,
      ),
      confidence: mean([perceptionConfidence, trust, 100 - uncertainty]),
      explanation:
        "Risk-adjusted participation capacity is below the level required for additional exposure.",
    },
    settings,
  );

  pushNeed(
    needs,
    {
      category: "increase-participation",
      severity: clamp(
        (health - settings.targetParticipation) * 1.05 +
          Math.max(0, readiness - 55) * 0.5 +
          Math.max(0, opportunityDensity - 10) * 0.42,
      ),
      confidence: mean([
        perceptionConfidence,
        agreement,
        trust,
        synchronization,
      ]),
      explanation:
        "Alignment, confidence, and operating reliability are strong enough to support graduated participation.",
    },
    settings,
  );

  pushNeed(
    needs,
    {
      category: "wait",
      severity: clamp(
        contradictionDensity * 1.25 +
          contradictionCount * 8 +
          Math.max(0, 50 - agreement) * 0.8,
      ),
      confidence: mean([perceptionConfidence, trust, clamp(100 - agreement)]),
      explanation:
        "Conflicting observations are strong enough that action should wait for clearer alignment.",
    },
    settings,
  );

  if (!needs.length) {
    pushNeed(
      needs,
      {
        category: "maintain",
        severity: settings.minSeverity,
        confidence: mean([perceptionConfidence, trust, synchronization]),
        explanation:
          "No blocker is materially preventing the current objective.",
      },
      { ...settings, minSeverity: 0 },
    );
  }

  return needs.sort((left, right) => {
    const severityDelta = right.severity - left.severity;
    return severityDelta === 0
      ? left.needId.localeCompare(right.needId)
      : severityDelta;
  });
}

function pushNeed(
  needs: DetectedNeed[],
  item: Omit<DetectedNeed, "needId" | "recommendations">,
  options: Required<NeedDetectionOptions>,
) {
  const severity = round(clamp(item.severity));
  if (severity < options.minSeverity) return;

  needs.push({
    needId: `${item.category}:${severity}`,
    category: item.category,
    severity,
    confidence: round(clamp(item.confidence)),
    explanation: item.explanation,
    recommendations: RECOMMENDATIONS[item.category],
  });
}

function layerScore(input: NeedDetectionInput, key: string) {
  const layers = input.perception?.layers as
    | Record<string, { score?: number }>
    | undefined;
  return score(layers?.[key]?.score, 50);
}

function score(value: unknown, fallback: number) {
  return clamp(numeric(value, fallback));
}

function round(value: number) {
  return Number(value.toFixed(2));
}
