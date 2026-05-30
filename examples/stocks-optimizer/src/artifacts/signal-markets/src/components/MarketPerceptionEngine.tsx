import { useEffect, useMemo, useRef } from "react";
import { Activity, Gauge, Layers, Radio, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import ReliabilityAuditPanel from "@/components/ReliabilityAuditPanel";
import {
  MARKET_LAYER_DEFINITIONS,
  type MarketLayerKey,
  type MarketStateSnapshot,
  type MarketTimeframeKey,
} from "@/lib/market-perception";

type MarketPerceptionEngineProps = {
  snapshot: MarketStateSnapshot | null;
  className?: string;
  agencyLevel?: {
    recommendation?: string | null;
    trustPct?: number | null;
    traceCount?: number | null;
    allowedActions?: number | null;
    blockedActions?: number | null;
    missingOutcomes?: number | null;
    dataReliabilityPct?: number | null;
    calibrationHealthPct?: number | null;
    overfitRiskPct?: number | null;
    reasons?: string[];
  } | null;
};

const LAYER_KEYS: MarketLayerKey[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
  "white",
];

const TIMEFRAME_KEYS: MarketTimeframeKey[] = ["intraday", "swing", "macro"];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mean(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function stdev(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function formatScore(value: number) {
  return `${Math.round(clamp(value))}`;
}

function formatRaw(value: number | string | null, unit?: string) {
  if (value == null || value === "") return "-";
  if (typeof value === "number") {
    if (unit === "%") return `${value.toFixed(1)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return value;
}

type LayerContributor = MarketStateSnapshot["layers"][MarketLayerKey]["contributors"][number];
type DisplayMetric = MarketStateSnapshot["metrics"][string];

function numericRaw(value: number | string | null) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayContributorScore(item: LayerContributor) {
  if (item.metricKey === "overfitRisk") {
    return numericRaw(item.raw) ?? item.value;
  }
  return item.contribution;
}

function displayMetricScore(metric: DisplayMetric) {
  if (metric.key === "overfitRisk") {
    return numericRaw(metric.raw) ?? metric.score;
  }
  return metric.score;
}

function formatMetricLayers(layers: MarketStateSnapshot["metrics"][string]["layers"]) {
  return layers
    .map((mapping) => MARKET_LAYER_DEFINITIONS[mapping.layer]?.label ?? String(mapping.layer))
    .join(", ");
}

function normalizeAgencyRecommendation(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function ratioOrPctToPct(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed <= 1 ? parsed * 100 : parsed);
}

function hasAgencyLevel(value: MarketPerceptionEngineProps["agencyLevel"]) {
  if (!value) return false;
  return Boolean(value.recommendation) || Number.isFinite(Number(value.trustPct));
}

function agencyClassification(value: NonNullable<MarketPerceptionEngineProps["agencyLevel"]>) {
  const recommendation = normalizeAgencyRecommendation(value.recommendation);
  const blockedActions = Number(value.blockedActions ?? 0);

  if (blockedActions > 0 || /blocked|block/.test(recommendation)) return "Commitment blocked";
  if (/human review|review/.test(recommendation)) return "Human review";
  if (/reduced|small|limited/.test(recommendation)) return "Reduced autonomy";
  if (/act|increase|participat/.test(recommendation)) return "Autonomy ready";
  if (/wait|maintain|hold|observe/.test(recommendation)) return "Observation only";
  return "Calibration pending";
}

function agencyMeaning(value: NonNullable<MarketPerceptionEngineProps["agencyLevel"]>) {
  const recommendation = normalizeAgencyRecommendation(value.recommendation) || "pending";
  const trust = Number(value.trustPct);
  const traceCount = Number(value.traceCount ?? 0);
  const blockedActions = Number(value.blockedActions ?? 0);
  const missingOutcomes = Number(value.missingOutcomes ?? 0);
  const overfitRiskPct = ratioOrPctToPct(value.overfitRiskPct);
  const parts = [`Agency recommendation: ${recommendation}.`];

  if (Number.isFinite(trust)) parts.push(`Trust ${Math.round(clamp(trust))}%.`);
  if (traceCount > 0) parts.push(`Traces ${Math.round(traceCount)}.`);
  parts.push(`Blocked actions ${Math.max(0, blockedActions)}.`);
  parts.push(`Missing outcomes ${Math.max(0, missingOutcomes)}.`);
  if (overfitRiskPct != null) parts.push(`Agency overfit risk ${Math.round(overfitRiskPct)}%.`);

  return parts.join(" ");
}

function agencyRecommendationScore(recommendation: string) {
  if (/blocked|block/.test(recommendation)) return 20;
  if (/human review|review/.test(recommendation)) return 35;
  if (/reduced|small|limited/.test(recommendation)) return 88;
  if (/act|increase|participat/.test(recommendation)) return 100;
  if (/wait|maintain|hold|observe/.test(recommendation)) return 72;
  return 55;
}

function agencySelfAwarenessScore(value: NonNullable<MarketPerceptionEngineProps["agencyLevel"]>) {
  const recommendation = normalizeAgencyRecommendation(value.recommendation);
  const trustPct = ratioOrPctToPct(value.trustPct) ?? 0;
  const traceCount = Math.max(0, Number(value.traceCount ?? 0));
  const allowedActions = Math.max(0, Number(value.allowedActions ?? 0));
  const blockedActions = Math.max(0, Number(value.blockedActions ?? 0));
  const missingOutcomes = Math.max(0, Number(value.missingOutcomes ?? 0));
  const actionCount = Math.max(traceCount, allowedActions + blockedActions, missingOutcomes);
  const dataReliabilityPct =
    ratioOrPctToPct(value.dataReliabilityPct) ??
    (actionCount > 0 ? clamp(100 - (missingOutcomes / actionCount) * 100) : 0);
  const calibrationHealthPct = ratioOrPctToPct(value.calibrationHealthPct) ?? trustPct;
  const agencyOverfitRiskPct = ratioOrPctToPct(value.overfitRiskPct);
  const outcomeCoveragePct = actionCount > 0 ? clamp(100 - (missingOutcomes / actionCount) * 100) : dataReliabilityPct;
  const policyClearancePct = actionCount > 0 ? clamp(100 - (blockedActions / actionCount) * 100) : 100;
  const traceCoveragePct = clamp((traceCount / 3) * 100);
  const overfitControlPct = agencyOverfitRiskPct == null ? Math.max(55, trustPct) : clamp(100 - agencyOverfitRiskPct);
  const recommendationPct = agencyRecommendationScore(recommendation);

  const weightedScore = clamp(
    dataReliabilityPct * 0.18 +
      calibrationHealthPct * 0.14 +
      overfitControlPct * 0.12 +
      outcomeCoveragePct * 0.16 +
      policyClearancePct * 0.16 +
      traceCoveragePct * 0.1 +
      trustPct * 0.08 +
      recommendationPct * 0.06,
  );
  const completeAgencyCoverage = traceCount >= 3 && missingOutcomes === 0 && blockedActions === 0;

  if (completeAgencyCoverage && /act|reduced|small|limited|increase|participat/.test(recommendation)) {
    return Math.max(weightedScore, /reduced|small|limited/.test(recommendation) ? 92 : 96);
  }

  return weightedScore;
}

function agencySynthesisDetail(value: NonNullable<MarketPerceptionEngineProps["agencyLevel"]>, score: number) {
  const dataReliability = ratioOrPctToPct(value.dataReliabilityPct);
  const calibration = ratioOrPctToPct(value.calibrationHealthPct);
  const overfitRisk = ratioOrPctToPct(value.overfitRiskPct);
  const traceCount = Math.max(0, Number(value.traceCount ?? 0));
  const allowedActions = Math.max(0, Number(value.allowedActions ?? 0));
  const blockedActions = Math.max(0, Number(value.blockedActions ?? 0));
  const missingOutcomes = Math.max(0, Number(value.missingOutcomes ?? 0));
  const parts = [`Agency-informed self-awareness ${Math.round(score)}/100.`];

  if (traceCount > 0) parts.push(`Trace coverage ${Math.round(traceCount)} decisions.`);
  if (dataReliability != null) parts.push(`Data reliability ${Math.round(dataReliability)}%.`);
  if (calibration != null) parts.push(`Calibration health ${Math.round(calibration)}%.`);
  if (overfitRisk != null) parts.push(`Agency overfit risk ${Math.round(overfitRisk)}%.`);
  parts.push(`Allowed ${Math.round(allowedActions)}, blocked ${Math.round(blockedActions)}, missing outcomes ${Math.round(missingOutcomes)}.`);

  return parts.join(" ");
}

function withAgencySynthesisContributor(
  contributors: MarketStateSnapshot["layers"]["white"]["contributors"],
  agencyLevel: NonNullable<MarketPerceptionEngineProps["agencyLevel"]>,
  score: number,
) {
  const contributor: LayerContributor = {
    metricKey: "agencyModuleSelfAwareness",
    label: "Agency-informed self-awareness",
    value: score,
    contribution: score,
    weight: 1.4,
    raw: score,
    unit: "%",
    detail: agencySynthesisDetail(agencyLevel, score),
    polarity: "direct",
  };

  return [
    contributor,
    ...contributors.filter((item) => item.metricKey !== contributor.metricKey),
  ].sort((a, b) => b.weight * b.contribution - a.weight * a.contribution);
}

function agencyMetricState(
  agencyLevel: NonNullable<MarketPerceptionEngineProps["agencyLevel"]>,
  score: number,
): DisplayMetric {
  return {
    key: "agencyModuleSelfAwareness",
    label: "Agency-informed self-awareness",
    description: "System self-awareness synthesized from agency self-diagnosis, trace coverage, policy clearance, and outcome coverage.",
    raw: score,
    unit: "%",
    score,
    confidence: 100,
    detail: agencySynthesisDetail(agencyLevel, score),
    normalization: {
      zScore: 0,
      zScoreNormalized: score,
      percentileScore: score,
      volatilityAdjustedScore: score,
      boundedScore: score,
    },
    layers: [{ layer: "white", weight: 1.4, polarity: "direct" }],
  };
}

function recomputeWithWhiteLayer(
  snapshot: MarketStateSnapshot,
  whiteLayer: MarketStateSnapshot["layers"]["white"],
): MarketStateSnapshot {
  const layers = {
    ...snapshot.layers,
    white: whiteLayer,
  };
  const layerScores = LAYER_KEYS.map((key) => layers[key].score);
  const dominantLayer = LAYER_KEYS.reduce(
    (best, key) => (layers[key].score > layers[best].score ? key : best),
    snapshot.dominantLayer,
  );
  const timeframe = (
    key: MarketTimeframeKey,
    values: number[],
  ): MarketStateSnapshot["timeframes"][MarketTimeframeKey] => ({
    ...snapshot.timeframes[key],
    score: clamp(mean(values)),
    agreement: clamp(100 - stdev(values) * 1.25),
  });

  return {
    ...snapshot,
    dominantLayer,
    compositeScore: clamp(mean(layerScores)),
    agreement: clamp(100 - stdev(layerScores) * 1.35),
    layers,
    timeframes: {
      ...snapshot.timeframes,
      intraday: timeframe("intraday", [layers.red.score, layers.orange.score, layers.blue.score, layers.white.score]),
      swing: timeframe("swing", [layers.yellow.score, layers.green.score, layers.indigo.score, layers.white.score]),
      macro: timeframe("macro", [layers.violet.score, layers.red.score, layers.green.score, layers.white.score]),
    },
  };
}

function applyAgencyLevel(
  snapshot: MarketStateSnapshot | null,
  agencyLevel: MarketPerceptionEngineProps["agencyLevel"],
): MarketStateSnapshot | null {
  if (!snapshot || !hasAgencyLevel(agencyLevel)) return snapshot;

  const whiteLayer = snapshot.layers.white;
  const agencyScore = agencySelfAwarenessScore(agencyLevel!);
  const displayScore = Math.max(whiteLayer.score, agencyScore);
  const nextSnapshot = recomputeWithWhiteLayer(snapshot, {
    ...whiteLayer,
    label: "System Self-Awareness",
    meaning: agencyMeaning(agencyLevel!),
    score: displayScore,
    classification: agencyClassification(agencyLevel!),
    contributors: withAgencySynthesisContributor(whiteLayer.contributors, agencyLevel!, agencyScore),
  });

  return {
    ...nextSnapshot,
    metrics: {
      ...nextSnapshot.metrics,
      agencyModuleSelfAwareness: agencyMetricState(agencyLevel!, agencyScore),
    },
  };
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorWithAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function wave(angle: number, time: number, seed: number) {
  return (
    Math.sin(angle * 2.7 + time * 0.9 + seed) * 0.5 +
    Math.sin(angle * 5.3 - time * 0.42 + seed * 1.7) * 0.32 +
    Math.sin(angle * 9.1 + time * 0.18 + seed * 0.4) * 0.18
  );
}

function drawDistortedRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  distortion: number,
  time: number,
  color: string,
  alpha: number,
  width: number,
  seed = 1,
) {
  const steps = 180;
  ctx.beginPath();

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const offset = wave(angle, time, seed) * distortion;
    const x = cx + Math.cos(angle) * (radius + offset);
    const y = cy + Math.sin(angle) * (radius + offset);

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawBrokenArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  alpha: number,
  time: number,
  fragments: number,
) {
  for (let index = 0; index < fragments; index += 1) {
    const start = (index / fragments) * Math.PI * 2 + time * 0.05;
    const span = Math.PI / fragments;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + span);
    ctx.strokeStyle = colorWithAlpha(color, alpha);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawAura(
  canvas: HTMLCanvasElement,
  snapshot: MarketStateSnapshot,
  currentScores: Record<MarketLayerKey, number>,
  time: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const layers = snapshot.layers;

  for (const key of LAYER_KEYS) {
    currentScores[key] += (layers[key].score - currentScores[key]) * 0.035;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  const violet = currentScores.violet / 100;
  const background = ctx.createRadialGradient(cx, cy, radius * 0.06, cx, cy, radius * 1.45);
  background.addColorStop(0, `rgba(248, 250, 252, ${0.06 + currentScores.white / 1400})`);
  background.addColorStop(0.24, `rgba(55, 165, 255, ${0.06 + currentScores.blue / 1200})`);
  background.addColorStop(0.58, `rgba(103, 85, 255, ${0.05 + violet * 0.16})`);
  background.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const timeframeRadii = [radius * 0.38, radius * 0.68, radius * 0.97];
  TIMEFRAME_KEYS.forEach((key, index) => {
    const state = snapshot.timeframes[key];
    const ringScore = state.score / 100;
    const conflict = (100 - state.agreement) / 100;
    const ringColor =
      key === "intraday"
        ? MARKET_LAYER_DEFINITIONS.blue.color
        : key === "swing"
          ? MARKET_LAYER_DEFINITIONS.yellow.color
          : MARKET_LAYER_DEFINITIONS.violet.color;

    drawDistortedRing(
      ctx,
      cx,
      cy,
      timeframeRadii[index],
      conflict * 18 + currentScores.red * 0.035,
      time,
      ringColor,
      0.18 + ringScore * 0.28,
      1.4 + ringScore * 2,
      index + 2,
    );
  });

  const red = currentScores.red;
  drawDistortedRing(
    ctx,
    cx,
    cy,
    radius * 1.05,
    red * 0.16,
    time,
    MARKET_LAYER_DEFINITIONS.red.color,
    0.16 + red / 260,
    2 + red / 28,
    8,
  );

  if (red > 46) {
    const fractureCount = Math.floor(5 + red / 9);
    for (let index = 0; index < fractureCount; index += 1) {
      const angle = (index / fractureCount) * Math.PI * 2 + wave(index, time, 3) * 0.22;
      const start = radius * (0.62 + (index % 3) * 0.08);
      const end = radius * (0.86 + red / 650);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
      ctx.lineTo(
        cx + Math.cos(angle + wave(angle, time, 9) * 0.08) * end,
        cy + Math.sin(angle + wave(angle, time, 9) * 0.08) * end,
      );
      ctx.strokeStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.red.color, (red - 35) / 170);
      ctx.lineWidth = 1 + red / 42;
      ctx.stroke();
    }
  }

  const blue = currentScores.blue;
  for (let index = 0; index < 5; index += 1) {
    const ripple = ((time * (0.1 + blue / 900) + index / 5) % 1) * radius * 1.12;
    const alpha = (1 - ripple / (radius * 1.12)) * (0.08 + blue / 360);
    if (blue > 45) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(12, ripple), 0, Math.PI * 2);
      ctx.strokeStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.blue.color, alpha);
      ctx.lineWidth = 1 + blue / 80;
      ctx.stroke();
    } else {
      drawBrokenArc(ctx, cx, cy, Math.max(12, ripple), MARKET_LAYER_DEFINITIONS.blue.color, alpha, time, 16);
    }
  }

  const orange = currentScores.orange;
  const particleCount = Math.floor(18 + orange * 0.42);
  for (let index = 0; index < particleCount; index += 1) {
    const seed = index * 2.399963;
    const drift = time * (0.08 + orange / 1200);
    const angle = seed + drift + wave(seed, time, 5) * (0.2 + orange / 210);
    const band = 0.2 + ((Math.sin(seed * 1.8) + 1) / 2) * 0.72;
    const particleRadius = radius * band + wave(seed, time, 10) * orange * 0.18;
    const size = 1 + orange / 38 + (index % 3);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * particleRadius, cy + Math.sin(angle) * particleRadius, size, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.orange.color, 0.08 + orange / 360);
    ctx.fill();
  }

  const yellow = currentScores.yellow;
  const beamCount = 9;
  const coherence = yellow / 100;
  for (let index = 0; index < beamCount; index += 1) {
    const base = (index / beamCount) * Math.PI * 2 - Math.PI / 2;
    const scatter = (1 - coherence) * wave(base, time, index + 4) * 0.5;
    const angle = base + scatter;
    const length = radius * (0.34 + coherence * 0.7);
    const inner = radius * 0.16;
    const gradient = ctx.createLinearGradient(
      cx + Math.cos(angle) * inner,
      cy + Math.sin(angle) * inner,
      cx + Math.cos(angle) * length,
      cy + Math.sin(angle) * length,
    );
    gradient.addColorStop(0, colorWithAlpha(MARKET_LAYER_DEFINITIONS.yellow.color, 0));
    gradient.addColorStop(1, colorWithAlpha(MARKET_LAYER_DEFINITIONS.yellow.color, 0.08 + yellow / 330));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1 + yellow / 26;
    ctx.stroke();
  }

  const green = currentScores.green;
  const orbitCount = 12;
  for (let index = 0; index < orbitCount; index += 1) {
    const sync = green / 100;
    const angle = (index / orbitCount) * Math.PI * 2 + time * (0.05 + sync * 0.05);
    const asymmetry = (1 - sync) * wave(angle, time, index) * radius * 0.18;
    const nodeRadius = radius * 0.73 + asymmetry;
    const x = cx + Math.cos(angle) * nodeRadius;
    const y = cy + Math.sin(angle) * nodeRadius * (0.82 + sync * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + green / 48, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.green.color, 0.12 + green / 330);
    ctx.fill();

    if (green > 50) {
      const nextAngle = ((index + 1) / orbitCount) * Math.PI * 2 + time * (0.05 + sync * 0.05);
      const nx = cx + Math.cos(nextAngle) * nodeRadius;
      const ny = cy + Math.sin(nextAngle) * nodeRadius * (0.82 + sync * 0.18);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.green.color, green / 600);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const indigo = currentScores.indigo;
  const hiddenNodes = 10;
  for (let index = 0; index < hiddenNodes; index += 1) {
    const angle = (index / hiddenNodes) * Math.PI * 2 + wave(index, time, 7) * 0.34;
    const nodeRadius = radius * (0.24 + ((index * 37) % 58) / 100);
    const x = cx + Math.cos(angle) * nodeRadius;
    const y = cy + Math.sin(angle) * nodeRadius;
    ctx.beginPath();
    ctx.arc(x, y, 1.8 + indigo / 55, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.indigo.color, 0.08 + indigo / 360);
    ctx.fill();

    if (indigo > 38 && index > 0) {
      const previousAngle = ((index - 1) / hiddenNodes) * Math.PI * 2 + wave(index - 1, time, 7) * 0.34;
      const previousRadius = radius * (0.24 + (((index - 1) * 37) % 58) / 100);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx + Math.cos(previousAngle) * previousRadius, cy + Math.sin(previousAngle) * previousRadius);
      ctx.strokeStyle = colorWithAlpha(MARKET_LAYER_DEFINITIONS.indigo.color, indigo / 720);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const white = currentScores.white;
  const flicker = (100 - white) / 100;
  const pulse = 1 + Math.sin(time * (1.1 + flicker * 3.5)) * 0.05 * flicker;
  const coreRadius = radius * (0.14 + white / 720) * pulse;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
  core.addColorStop(0, `rgba(255, 255, 255, ${0.36 + white / 210})`);
  core.addColorStop(0.42, `rgba(248, 250, 252, ${0.16 + white / 360})`);
  core.addColorStop(1, "rgba(248, 250, 252, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  const dominant = snapshot.layers[snapshot.dominantLayer];
  ctx.fillStyle = colorWithAlpha(dominant.color, 0.92);
  ctx.font = "600 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${dominant.label.toUpperCase()} ${Math.round(dominant.score)}`, cx, cy + radius * 1.28);
}

function MarketAuraCanvas({ snapshot }: { snapshot: MarketStateSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const initializedRef = useRef(false);
  const currentScoresRef = useRef<Record<MarketLayerKey, number>>({
    red: 0,
    orange: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    indigo: 0,
    violet: 0,
    white: 0,
  });

  useEffect(() => {
    snapshotRef.current = snapshot;

    if (!initializedRef.current) {
      for (const key of LAYER_KEYS) {
        currentScoresRef.current[key] = snapshot.layers[key].score;
      }
      initializedRef.current = true;
    }
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    let resizeFrame = 0;
    let dpr = 1;

    const resize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const rect = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, rect.width > 720 ? 1.6 : 1.25);
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext("2d");
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const animate = (now: number) => {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawAura(canvas, snapshotRef.current, currentScoresRef.current, now / 1000);
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(resizeFrame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-[420px] w-full rounded-lg bg-black md:h-[500px]"
      aria-label="Real-time market aura visualization"
    />
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={false}
        animate={{ width: `${clamp(value)}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 22 }}
      />
    </div>
  );
}

export default function MarketPerceptionEngine({ snapshot, className, agencyLevel }: MarketPerceptionEngineProps) {
  const displaySnapshot = useMemo(
    () => applyAgencyLevel(snapshot, agencyLevel),
    [snapshot, agencyLevel],
  );
  const topContributors = useMemo(() => {
    if (!displaySnapshot) return [];
    return displaySnapshot.layers[displaySnapshot.dominantLayer].contributors.slice(0, 5);
  }, [displaySnapshot]);

  if (!displaySnapshot) return null;

  const dominantLayer = displaySnapshot.layers[displaySnapshot.dominantLayer];
  const recentHistory = displaySnapshot.history.slice(-16);
  const rawMetrics = Object.values(displaySnapshot.metrics).sort((a, b) => b.score - a.score);

  return (
    <section
      className={cx(
        "mb-6 overflow-hidden rounded-xl border border-white/10 bg-[#080808] p-5 shadow-2xl shadow-black/30",
        className,
      )}
    >
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FDD000]">
            <Activity className="h-4 w-4" />
            Market perception engine
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {displaySnapshot.regime}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {dominantLayer.label} is the dominant layer at {formatScore(dominantLayer.score)}/100.
            Visual intensity is derived from normalized live metrics, rolling z-scores, percentile rank, and volatility-adjusted scaling.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-zinc-500">Composite</div>
            <div className="mt-1 text-lg font-semibold text-white">{formatScore(displaySnapshot.compositeScore)}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-zinc-500">Agreement</div>
            <div className="mt-1 text-lg font-semibold text-white">{formatScore(displaySnapshot.agreement)}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-zinc-500">Trust</div>
            <div className="mt-1 text-lg font-semibold text-white">{formatScore(displaySnapshot.confidence)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
        <div className="relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black">
          <MarketAuraCanvas snapshot={displaySnapshot} />
          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
            {TIMEFRAME_KEYS.map((key) => {
              const timeframe = displaySnapshot.timeframes[key];
              return (
                <div key={key} className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] text-zinc-300 backdrop-blur">
                  {timeframe.label} {formatScore(timeframe.score)} / sync {formatScore(timeframe.agreement)}
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Dominant layer</div>
              <div className="mt-1 text-sm font-semibold text-white">{dominantLayer.label}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Visual signal</div>
              <div className="mt-1 text-sm font-semibold text-white">{dominantLayer.visualSignal}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Last state</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {new Date(displaySnapshot.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="rounded-lg border border-white/10 bg-[#101010] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Gauge className="h-4 w-4 text-[#FDD000]" />
              Dominant contributors
            </div>
            <div className="space-y-3">
              {topContributors.map((item, index) => (
                <div key={`${item.metricKey}-${index}`}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-zinc-300">{item.label}</span>
                    <span className="text-zinc-500">{formatScore(displayContributorScore(item))}</span>
                  </div>
                  <ScoreBar value={displayContributorScore(item)} color={dominantLayer.color} />
                  <div className="mt-1 text-[11px] leading-4 text-zinc-500">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#101010] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-[#FDD000]" />
              State diagnostics
            </div>
            <div className="grid gap-3 text-xs">
              <div>
                <div className="mb-1 flex justify-between text-zinc-500">
                  <span>System self-awareness</span>
                  <span>{formatScore(displaySnapshot.layers.white.score)}/100</span>
                </div>
                <ScoreBar value={displaySnapshot.layers.white.score} color={displaySnapshot.layers.white.color} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-zinc-500">
                  <span>Structural danger</span>
                  <span>{formatScore(displaySnapshot.layers.red.score)}/100</span>
                </div>
                <ScoreBar value={displaySnapshot.layers.red.score} color={displaySnapshot.layers.red.color} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-zinc-500">
                  <span>Transition emergence</span>
                  <span>{formatScore(displaySnapshot.layers.indigo.score)}/100</span>
                </div>
                <ScoreBar value={displaySnapshot.layers.indigo.score} color={displaySnapshot.layers.indigo.color} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#101010] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Radio className="h-4 w-4 text-[#FDD000]" />
              State history
            </div>
            <div className="flex h-24 items-end gap-1">
              {recentHistory.map((point) => (
                <div
                  key={point.timestamp}
                  className="min-w-0 flex-1 rounded-t bg-[#FDD000]/70"
                  style={{ height: `${Math.max(8, point.compositeScore)}%` }}
                  title={`${point.regime}: ${Math.round(point.compositeScore)}`}
                />
              ))}
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">
              {recentHistory.length} persisted perception states in local audit memory.
            </div>
          </div>
        </div>
      </div>

      <ReliabilityAuditPanel reliability={displaySnapshot.reliability} />

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {LAYER_KEYS.map((key) => {
          const layer = displaySnapshot.layers[key];
          return (
            <details key={key} className="group rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: layer.color }} />
                    <span className="font-semibold text-white">{layer.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{layer.classification}</div>
                </div>
                <div className="text-lg font-semibold text-white">{formatScore(layer.score)}</div>
              </summary>
              <div className="mt-3">
                <ScoreBar value={layer.score} color={layer.color} />
                <p className="mt-3 text-xs leading-5 text-zinc-500">{layer.meaning}</p>
                <div className="mt-3 space-y-2">
                  {layer.contributors.slice(0, 3).map((item, index) => (
                    <div key={`${item.metricKey}-${index}`} className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-zinc-300">{item.label}</span>
                        <span className="text-zinc-500">{formatScore(displayContributorScore(item))}</span>
                      </div>
                      <div className="mt-1 text-zinc-600">Raw {formatRaw(item.raw, item.unit)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <details className="mt-5 rounded-lg border border-white/10 bg-[#101010] p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-white">
          <Layers className="h-4 w-4 text-[#FDD000]" />
          Metric registry and raw calculation audit
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="border-b border-white/10 text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="py-2 pr-4 font-medium">Raw</th>
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">Z</th>
                <th className="py-2 pr-4 font-medium">Percentile</th>
                <th className="py-2 pr-4 font-medium">Layers</th>
                <th className="py-2 font-medium">Calculation</th>
              </tr>
            </thead>
            <tbody>
              {rawMetrics.map((metric) => (
                <tr key={metric.key} className="border-b border-white/5 align-top">
                  <td className="py-3 pr-4 text-zinc-200">{metric.label}</td>
                  <td className="py-3 pr-4 text-zinc-500">{formatRaw(metric.raw, metric.unit)}</td>
                  <td className="py-3 pr-4 text-zinc-200">{formatScore(displayMetricScore(metric))}</td>
                  <td className="py-3 pr-4 text-zinc-500">{metric.normalization.zScore.toFixed(2)}</td>
                  <td className="py-3 pr-4 text-zinc-500">{formatScore(metric.normalization.percentileScore)}</td>
                  <td className="py-3 pr-4 text-zinc-500">
                    {formatMetricLayers(metric.layers)}
                  </td>
                  <td className="max-w-[340px] py-3 text-zinc-500">{metric.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
