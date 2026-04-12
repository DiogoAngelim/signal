import type { RiskLevel } from "../types/index.js";

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function toRiskLevel(score: number): RiskLevel {
  if (score >= 0.85) {
    return "critical";
  }
  if (score >= 0.7) {
    return "high";
  }
  if (score >= 0.5) {
    return "elevated";
  }
  if (score >= 0.25) {
    return "guarded";
  }
  return "low";
}
