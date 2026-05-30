import { clamp, mean } from "../math/statistics";

export type DiscoveryAccountabilityStatus = "immature" | "developing" | "reliable" | "trusted";

export type DiscoveryAccountabilityEvent = {
  id?: string;
  detectedAt?: string | number | Date;
  confirmedAt?: string | number | Date;
  rejectedAt?: string | number | Date;
  outcome?: "positive" | "negative" | "neutral" | "unknown" | "missed" | "rejected" | string;
  profitScore?: number;
  valueScore?: number;
  confidence?: number;
  maturity?: number;
  novelty?: number;
  recurrence?: number;
  wasEarly?: boolean;
  wasFalseDiscovery?: boolean;
  wasMissedOpportunity?: boolean;
  wasRejected?: boolean;
};

export type DiscoveryAccountabilityInput = {
  discovery?: {
    status?: string;
    confidence?: number;
    maturity?: number;
    novelty?: number;
    trust?: number;
    opportunities?: Array<{ confidence?: number; maturity?: number; novelty?: number }>;
  } | null;
  events?: DiscoveryAccountabilityEvent[];
  rejectedOutcomes?: DiscoveryAccountabilityEvent[];
  missedOpportunities?: DiscoveryAccountabilityEvent[];
  now?: string | number | Date;
};

export type DiscoveryAccountabilityResult = {
  accountabilityScore: number;
  maturity: number;
  earlyDetectionAccuracy: number;
  falseDiscoveryRate: number;
  missedOpportunityRate: number;
  noveltyToProfitConversion: number;
  discoveryDecay: number;
  confirmationLatency: number;
  status: DiscoveryAccountabilityStatus;
  blockers: string[];
  unlockConditions: string[];
  explanation: string;
  audit: Record<string, unknown>;
};

/**
 * Makes Discovery statistically accountable instead of merely descriptive.
 *
 * @example
 * const accountability = evaluateDiscoveryAccountability({
 *   discovery: { status: "emerging", confidence: 54, maturity: 38 },
 *   events: [{ wasEarly: true, outcome: "positive", profitScore: 72 }],
 * });
 * accountability.status; // usually "immature" or "developing"
 */
export function evaluateDiscoveryAccountability(
  input: DiscoveryAccountabilityInput = {},
): DiscoveryAccountabilityResult {
  const events = [...(input.events ?? []), ...(input.rejectedOutcomes ?? []), ...(input.missedOpportunities ?? [])];
  const discovered = events.filter((event) => !event.wasMissedOpportunity);
  const positives = events.filter(isPositive);
  const early = discovered.filter((event) => event.wasEarly || confirmationLatencyDays(event) <= 3);
  const earlyPositive = early.filter(isPositive);
  const falseDiscoveries = discovered.filter((event) => event.wasFalseDiscovery || isNegative(event));
  const missed = events.filter((event) => event.wasMissedOpportunity || normalized(event.outcome) === "missed");
  const novel = discovered.filter((event) => score(event.novelty, 0) >= 55);
  const profitableNovel = novel.filter((event) => score(event.profitScore ?? event.valueScore, 0) >= 55 || isPositive(event));
  const confirmationLatencies = discovered.map(confirmationLatencyDays).filter(Number.isFinite);
  const currentMaturity = score(input.discovery?.maturity, mean(input.discovery?.opportunities?.map((item) => score(item.maturity, 0)) ?? []));
  const sampleMaturity = clamp(discovered.length * 8);
  const maturity = roundScore(mean([currentMaturity, sampleMaturity].filter(Number.isFinite)));
  const earlyDetectionAccuracy = pct(earlyPositive.length, early.length, input.discovery?.confidence ?? 35);
  const falseDiscoveryRate = pct(falseDiscoveries.length, discovered.length, 0);
  const missedOpportunityRate = pct(missed.length, missed.length + positives.length, 0);
  const noveltyToProfitConversion = pct(profitableNovel.length, novel.length, score(input.discovery?.trust, 35));
  const discoveryDecay = decayFor(discovered, input.now);
  const confirmationLatency = roundScore(mean(confirmationLatencies.length ? confirmationLatencies : [0]));
  const accountabilityScore = roundScore(
    earlyDetectionAccuracy * 0.22 +
      (100 - falseDiscoveryRate) * 0.18 +
      (100 - missedOpportunityRate) * 0.16 +
      noveltyToProfitConversion * 0.16 +
      (100 - discoveryDecay) * 0.12 +
      maturity * 0.16,
  );
  const status = statusFor(accountabilityScore, maturity);
  const blockers = blockersFor({
    input,
    maturity,
    falseDiscoveryRate,
    missedOpportunityRate,
    noveltyToProfitConversion,
    confirmationLatency,
  });
  const unlockConditions = unlockConditionsFor(blockers);

  return {
    accountabilityScore,
    maturity,
    earlyDetectionAccuracy,
    falseDiscoveryRate,
    missedOpportunityRate,
    noveltyToProfitConversion,
    discoveryDecay,
    confirmationLatency,
    status,
    blockers,
    unlockConditions,
    explanation: explanationFor(status, accountabilityScore, maturity, blockers),
    audit: {
      eventCount: events.length,
      discoveredCount: discovered.length,
      positiveCount: positives.length,
      falseDiscoveryCount: falseDiscoveries.length,
      missedCount: missed.length,
      novelCount: novel.length,
      formulas: [
        "accountabilityScore rewards early accuracy, low false discoveries, low missed opportunities, novelty conversion, low decay, and maturity",
        "status requires both accountability score and maturity so emerging discoveries remain capacity-limited",
      ],
    },
  };
}

export const scoreDiscoveryAccountability = evaluateDiscoveryAccountability;

function blockersFor(input: {
  input: DiscoveryAccountabilityInput;
  maturity: number;
  falseDiscoveryRate: number;
  missedOpportunityRate: number;
  noveltyToProfitConversion: number;
  confirmationLatency: number;
}) {
  return unique([
    input.maturity < 45 ? "Discovery maturity is still immature." : "",
    normalized(input.input.discovery?.status) === "emerging" && score(input.input.discovery?.confidence, 0) < 60
      ? "Emerging discovery has not yet earned statistical confidence."
      : "",
    input.falseDiscoveryRate > 35 ? "False discovery rate is too high." : "",
    input.missedOpportunityRate > 35 ? "Missed opportunity rate is too high." : "",
    input.noveltyToProfitConversion < 45 ? "Novel discoveries are not converting to profitable outcomes yet." : "",
    input.confirmationLatency > 7 ? "Confirmation latency is too slow for early discovery claims." : "",
  ]);
}

function unlockConditionsFor(blockers: string[]) {
  if (!blockers.length) return ["Maintain accountability with fresh accepted and rejected discovery outcomes."];
  return blockers.map((blocker) => {
    if (blocker.includes("maturity")) return "Raise discovery maturity with more confirmed outcome samples.";
    if (blocker.includes("Emerging")) return "Confirm emerging discoveries with recurrence or profitable follow-through.";
    if (blocker.includes("False")) return "Lower false discoveries by tracking rejected and invalidated candidates.";
    if (blocker.includes("Missed")) return "Review rejected discoveries that later became profitable opportunities.";
    if (blocker.includes("Novel")) return "Require novelty evidence to convert into measured profit or value.";
    return "Reduce confirmation latency with faster post-detection validation.";
  });
}

function explanationFor(status: DiscoveryAccountabilityStatus, accountabilityScore: number, maturity: number, blockers: string[]) {
  if (blockers.length) {
    return `Discovery accountability is ${status}: ${blockers[0]}`;
  }
  return `Discovery accountability is ${status} with score ${accountabilityScore}/100 and maturity ${maturity}/100.`;
}

function statusFor(scoreValue: number, maturity: number): DiscoveryAccountabilityStatus {
  if (scoreValue >= 82 && maturity >= 78) return "trusted";
  if (scoreValue >= 68 && maturity >= 62) return "reliable";
  if (scoreValue >= 48 && maturity >= 40) return "developing";
  return "immature";
}

function isPositive(event: DiscoveryAccountabilityEvent) {
  const outcome = normalized(event.outcome);
  return outcome === "positive" || outcome === "success" || score(event.profitScore ?? event.valueScore, 0) >= 55;
}

function isNegative(event: DiscoveryAccountabilityEvent) {
  const outcome = normalized(event.outcome);
  return outcome === "negative" || outcome === "failure" || outcome === "invalidated" || event.wasFalseDiscovery === true;
}

function confirmationLatencyDays(event: DiscoveryAccountabilityEvent) {
  const detected = toTime(event.detectedAt);
  const confirmed = toTime(event.confirmedAt ?? event.rejectedAt);
  if (detected == null || confirmed == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (confirmed - detected) / 86_400_000);
}

function decayFor(events: DiscoveryAccountabilityEvent[], nowInput: DiscoveryAccountabilityInput["now"]) {
  if (!events.length) return 70;
  const now = toTime(nowInput) ?? Date.now();
  const ages = events.map((event) => {
    const timestamp = toTime(event.confirmedAt ?? event.rejectedAt ?? event.detectedAt) ?? now;
    return Math.max(0, (now - timestamp) / 86_400_000);
  });
  return roundScore(Math.min(100, mean(ages) * 3));
}

function pct(numerator: number, denominator: number, fallback: number) {
  return denominator > 0 ? roundScore((numerator / denominator) * 100) : roundScore(fallback);
}

function score(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Math.round(clamp(Number.isFinite(numeric) ? numeric : fallback));
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/_/g, " ");
}

function toTime(value: unknown) {
  if (value == null || value === "") return null;
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
