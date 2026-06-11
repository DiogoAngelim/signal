import type { PerceptionLayerDefinition, PerceptionLayerKey } from "../types";

export const PERCEPTION_LAYER_ORDER: PerceptionLayerKey[] = [
  "survival",
  "emotion",
  "conviction",
  "harmony",
  "information",
  "intuition",
  "macroContext",
  "selfAwareness",
];

export const PERCEPTION_LAYER_DEFINITIONS: Record<
  PerceptionLayerKey,
  PerceptionLayerDefinition
> = {
  survival: {
    key: "survival",
    label: "Survival",
    meaning:
      "Structural fragility, liquidity stress, tail pressure, and instability.",
  },
  emotion: {
    key: "emotion",
    label: "Emotion",
    meaning:
      "Crowd acceleration, panic/euphoria, concentration, and behavioral turbulence.",
  },
  conviction: {
    key: "conviction",
    label: "Conviction",
    meaning:
      "Directional authority, signal agreement, trend quality, and consistency.",
  },
  harmony: {
    key: "harmony",
    label: "Harmony",
    meaning: "Participation, breadth, synchronization, and system balance.",
  },
  information: {
    key: "information",
    label: "Information",
    meaning:
      "Freshness, propagation quality, confirmation, and shock absorption.",
  },
  intuition: {
    key: "intuition",
    label: "Intuition",
    meaning: "Latent structure, anomaly emergence, and transition probability.",
  },
  macroContext: {
    key: "macroContext",
    label: "Macro Context",
    meaning:
      "Long-cycle pressure, capital rotation, and environmental gravity.",
  },
  selfAwareness: {
    key: "selfAwareness",
    label: "Agency Level",
    meaning:
      "Action authority, agency calibration, data reliability, uncertainty, and residual overfit risk.",
  },
};

export function classifyPerceptionLayer(
  key: PerceptionLayerKey,
  score: number,
) {
  const classifications: Record<
    PerceptionLayerKey,
    [string, string, string, string]
  > = {
    survival: [
      "Stable geometry",
      "Pressure building",
      "Structural stress",
      "Critical instability",
    ],
    emotion: [
      "Calm flow",
      "Warming crowd",
      "Overheated emotion",
      "Explosive psychology",
    ],
    conviction: [
      "Scattered signal",
      "Forming bias",
      "Coherent projection",
      "Focused authority",
    ],
    harmony: [
      "Fragmented field",
      "Partial alignment",
      "Synchronized market",
      "Balanced ecosystem",
    ],
    information: [
      "Signal gaps",
      "Uneven transfer",
      "Coherent propagation",
      "Efficient absorption",
    ],
    intuition: [
      "Dormant topology",
      "Hidden activity",
      "Transition forming",
      "Regime emergence",
    ],
    macroContext: [
      "Clear atmosphere",
      "Macro drift",
      "Environmental pressure",
      "Dense gravity",
    ],
    selfAwareness: [
      "Dormant agency",
      "Review-gated agency",
      "Controlled agency",
      "Active agency",
    ],
  };
  return classifications[key][
    score >= 75 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0
  ];
}
