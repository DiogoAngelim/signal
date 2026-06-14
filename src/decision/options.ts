/**
 * @signal/decision — Options Module
 *
 * ALWAYS generates ≥2 options: fast/low-cost, conservative, and default.
 * Collapsed from: @signal/decision (prediction, simulation), @signal/commitment
 */

import type { Intent, Option, OptionCategory, ResourceConstraint } from "./types";

/**
 * Generate competing options from an intent.
 * HARD RULE: Always produces ≥2 options (fast + conservative + default).
 */
export function generateOptions(intent: Intent): Option[] {
  const baseOptions: Option[] = [
    generateFastOption(intent),
    generateConservativeOption(intent),
    generateDefaultOption(intent),
  ];

  // Deduplicate by category (keep first of each)
  const seen = new Set<OptionCategory>();
  const options: Option[] = [];
  for (const option of baseOptions) {
    if (!seen.has(option.category)) {
      seen.add(option.category);
      options.push(option);
    }
  }

  return options;
}

/**
 * Validate that options meet the minimum requirement of ≥2.
 */
export function validateOptions(options: Option[]): Option[] {
  if (options.length < 2) {
    throw new Error(
      `Decision requires ≥2 options, but only ${options.length} were generated. ` +
      "This is a hard invariant violation.",
    );
  }
  return options;
}

// ─── Option Generators ──────────────────────────────────────────

function generateFastOption(intent: Intent): Option {
  const riskConstraint = findConstraint(intent, "risk");
  const timeConstraint = findConstraint(intent, "time");
  const moneyConstraint = findConstraint(intent, "money");

  // Fast option: low cost, higher risk, quick
  // Risk can exceed constraint (1.2x) — constraint evaluation will flag violations
  const estimatedRisk = riskConstraint ? riskConstraint.limit * 1.2 : 0.5;
  const estimatedCost = moneyConstraint ? moneyConstraint.limit * 0.3 : 0.3;
  const timeRequired = timeConstraint ? timeConstraint.limit * 0.3 : 0.3;

  return {
    id: `opt-fast-${slugify(intent.goal)}`,
    label: `Fast: ${intent.goal}`,
    category: "fast",
    description: `Quick execution of "${intent.goal}" with lower cost but higher risk tolerance.`,
    estimatedValue: 0.6,
    estimatedCost,
    estimatedRisk,
    timeRequired,
    resourceRequired: 0.3,
    constraints: intent.constraints,
    reversible: true,
  };
}

function generateConservativeOption(intent: Intent): Option {
  const riskConstraint = findConstraint(intent, "risk");
  const timeConstraint = findConstraint(intent, "time");
  const moneyConstraint = findConstraint(intent, "money");

  // Conservative: lower risk, higher cost, slower
  const estimatedRisk = riskConstraint ? riskConstraint.limit * 0.2 : 0.15;
  const estimatedCost = moneyConstraint ? moneyConstraint.limit * 0.7 : 0.7;
  const timeRequired = timeConstraint ? timeConstraint.limit * 0.8 : 0.8;

  return {
    id: `opt-conservative-${slugify(intent.goal)}`,
    label: `Conservative: ${intent.goal}`,
    category: "conservative",
    description: `Careful execution of "${intent.goal}" with reduced risk but higher resource commitment.`,
    estimatedValue: 0.7,
    estimatedCost,
    estimatedRisk,
    timeRequired,
    resourceRequired: 0.7,
    constraints: intent.constraints,
    reversible: true,
  };
}

function generateDefaultOption(intent: Intent): Option {
  const riskConstraint = findConstraint(intent, "risk");
  const timeConstraint = findConstraint(intent, "time");
  const moneyConstraint = findConstraint(intent, "money");

  // Default: balanced
  const estimatedRisk = riskConstraint ? riskConstraint.limit * 0.4 : 0.3;
  const estimatedCost = moneyConstraint ? moneyConstraint.limit * 0.5 : 0.5;
  const timeRequired = timeConstraint ? timeConstraint.limit * 0.5 : 0.5;

  return {
    id: `opt-default-${slugify(intent.goal)}`,
    label: `Default: ${intent.goal}`,
    category: "default",
    description: `Balanced execution of "${intent.goal}" with moderate risk and resource commitment.`,
    estimatedValue: 0.65,
    estimatedCost,
    estimatedRisk,
    timeRequired,
    resourceRequired: 0.5,
    constraints: intent.constraints,
    reversible: true,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function findConstraint(
  intent: Intent,
  type: ResourceConstraint["type"],
): ResourceConstraint | undefined {
  return intent.constraints.find((c) => c.type === type);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}