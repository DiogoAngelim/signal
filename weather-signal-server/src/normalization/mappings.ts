import type { Certainty, Severity, Urgency } from "../types/index.js";

const severityMap: Record<string, Severity> = {
  extreme: "extreme",
  severe: "severe",
  moderate: "moderate",
  minor: "minor",
  info: "info",
  unknown: "info"
};

const certaintyMap: Record<string, Certainty> = {
  observed: "observed",
  likely: "likely",
  possible: "possible",
  unlikely: "unlikely",
  unknown: "unknown"
};

const urgencyMap: Record<string, Urgency> = {
  immediate: "immediate",
  expected: "expected",
  future: "future",
  past: "past",
  unknown: "unknown"
};

export function mapSeverity(input?: string | null): Severity {
  if (!input) {
    return "info";
  }
  const normalized = input.trim().toLowerCase();
  return severityMap[normalized] ?? "info";
}

export function mapCertainty(input?: string | null): Certainty {
  if (!input) {
    return "unknown";
  }
  const normalized = input.trim().toLowerCase();
  return certaintyMap[normalized] ?? "unknown";
}

export function mapUrgency(input?: string | null): Urgency {
  if (!input) {
    return "unknown";
  }
  const normalized = input.trim().toLowerCase();
  return urgencyMap[normalized] ?? "unknown";
}
