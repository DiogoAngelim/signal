import type { DashboardViewState } from "@/lib/dashboard-state";
import {
  DEFAULT_GUIDED_STEP_ID,
  GUIDED_STEPS,
  GUIDED_STEP_STATUS_LABELS,
  createGuidedStepStatuses,
  getGuidedStepById,
  getGuidedStepNumber,
  type GuidedStepId,
  type GuidedStepStatus,
} from "@/lib/guided-workflow";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bitcoin,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Database,
  Gem,
  Globe2,
  Landmark,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  WifiOff,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  FocusCard,
  ConfidenceRange,
  GoalCard,
  GuideLayout,
  MarketContextCard,
  OptionCard,
  PlanReviewCard,
  ProgressCard,
  RealityCheckCard,
  RecommendationCard,
  StepRail,
  UnknownsCard,
  UserControlCard,
  createConfidenceRange,
  defaultGuideSteps,
  processProgress,
  recommendedNextStep,
  type GuideFact,
  type GuideTone,
} from "./MarketDecisionGuide";

export type DecisionTone = "good" | "warn" | "bad" | "neutral";

export type EvidenceStageStatus = "Pass" | "Caution" | "Fail";

export type DecisionEvidenceStage = {
  id: string;
  label: string;
  status: EvidenceStageStatus;
  explanation: string;
};

export type DecisionOpportunity = {
  id: string;
  ticker: string;
  name: string;
  action: string;
  readinessPct: number;
  exposureLabel: string;
  maxExposureLabel: string;
  qualityPct: number;
  trustPct: number | null;
  riskPct: number;
  timingPct: number;
  thesis: string;
  context: string;
  support: string[];
  contradictions: string[];
  missing: string[];
  invalidations: string[];
  drivers: string[];
  decisionIntelligence?: any;
  coherenceScore?: number | null;
  coherenceStatus?: string | null;
  consensusLevel?: number | null;
  simulationRecommendation?: string | null;
  wisdomDecision?: string | null;
  outcomeAccuracy?: number | null;
  actionAllowed?: boolean | null;
  actionScale?: number | null;
  learning?: any;
};

export type DecisionStepId = "opportunity" | "trust" | "size" | "action";

type DecisionPhaseId =
  | "intent"
  | "sense"
  | "pulse"
  | "core"
  | "judgement"
  | "sizing"
  | "action"
  | "reflection";

export type DecisionWorkflowStep = {
  id: DecisionStepId;
  label: string;
  question: string;
  output: string;
  detail: string;
  status: string;
};

export type DecisionActionPlan = {
  asset: string;
  direction: string;
  exposure: string;
  entryLogic: string;
  riskConstraints: string;
  exitConditions: string;
  invalidation: string;
  portfolioImpact: string;
  nextAction: string;
};

export type DecisionRawMetric = {
  label: string;
  value: string;
};

export type CommitmentControlProps = {
  availableCapital: number;
  intent: "trading" | "investing";
  riskPreference: "conservative" | "balanced" | "aggressive";
  trustOverrideEnabled: boolean;
  trustOverridePct: number;
  maxSinglePositionPct: string;
  maxPortfolioCommitmentPct: string;
  onAvailableCapitalChange: (value: number) => void;
  onIntentChange: (value: "trading" | "investing") => void;
  onRiskPreferenceChange: (
    value: "conservative" | "balanced" | "aggressive",
  ) => void;
  onTrustOverrideEnabledChange: (value: boolean) => void;
  onTrustOverridePctChange: (value: number) => void;
  onMaxSinglePositionPctChange: (value: string) => void;
  onMaxPortfolioCommitmentPctChange: (value: string) => void;
};

export type DecisionOperatingSystemProps = {
  state: DashboardViewState;
  marketOptions: Array<{ value: string; label: string }>;
  selectedMarket: string;
  onMarketChange: (market: string) => void;
  onRefresh: () => void;
  onContinueUsingCachedData?: () => void;
  refreshing: boolean;
  refreshError: string | null;
  marketState: string;
  marketStatus: string;
  lastSyncedLabel: string;
  readinessPct: number;
  readinessState: string;
  readinessTone: DecisionTone;
  bestOpportunityLabel: string;
  recommendedAction: string;
  suggestedExposure: string;
  mainRisk: string;
  missingEvidence: string;
  executiveNarrative: string;
  readinessWhy: string;
  readinessImprover: string;
  readinessBlocker: string;
  opportunities: DecisionOpportunity[];
  selectedOpportunityId: string | null;
  onSelectOpportunity: (id: string) => void;
  evidenceLadder: DecisionEvidenceStage[];
  workflow: DecisionWorkflowStep[];
  actionPlan: DecisionActionPlan;
  rawMetrics: DecisionRawMetric[];
  commitment?: any | null;
  commitmentChangeExplanation?: string[];
  commitmentControls?: CommitmentControlProps;
};

type InvestmentStep = {
  id: DecisionPhaseId;
  label: string;
  question: string;
  headline: string;
  answer: string;
  why: string[];
  evidence: string[];
  numbers: DecisionRawMetric[];
  notes: string[];
  nextStep: string;
  facts: Array<{ label: string; value: string; tone?: DecisionTone }>;
  story: {
    happened: string;
    matters: string;
    next: string;
  };
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function boundedPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

function investorCopy(value: string) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\bmarket context\b/gi, "what we see right now")
    .replace(/\brisk state\b/gi, "current conditions")
    .replace(/\brisk pressure\b/gi, "caution level")
    .replace(/\bopportunity density\b/gi, "number of good opportunities")
    .replace(/\btrust score\b/gi, "reliability")
    .replace(/\btrust\b/gi, "reliability")
    .replace(/\bcalibration\b/gi, "confidence check")
    .replace(/\bsizing mode\b/gi, "suggested caution level")
    .replace(/\bsuggested maximum exposure\b/gi, "suggested allocation")
    .replace(/\bmaximum exposure\b/gi, "suggested allocation")
    .replace(/\bmax exposure\b/gi, "suggested allocation")
    .replace(/\bexposure\b/gi, "allocation")
    .replace(/\bmarket health\b/gi, "market stability")
    .replace(/\bmarket backdrop\b/gi, "current conditions")
    .replace(/\bcomposite signal\b/gi, "overall assessment")
    .replace(/\bself awareness\b/gi, "system confidence")
    .replace(/\bgovernance evidence\b/gi, "permission evidence")
    .replace(/\bgovernance\b/gi, "safety review")
    .replace(/\bdiscovery\b/gi, "opportunity search")
    .replace(/\bagency\b/gi, "decision control")
    .replace(/\brecognition\b/gi, "similar past situations")
    .replace(/\brecovery\b/gi, "return to normal size")
    .replace(/\bresolve\b/gi, "final decision")
    .replace(/\bsurvival memory\b/gi, "loss history")
    .replace(/\bsurvival\b/gi, "loss safety")
    .replace(/\bmarket breadth\b/gi, "market participation")
    .replace(/\bbreadth\b/gi, "market participation")
    .replace(/\bregime\b/gi, "market environment")
    .replace(/\brisk-adjusted\b/gi, "risk-aware")
    .replace(/\bdrawdown\b/gi, "past loss")
    .replace(/\bnormal sizing\b/gi, "normal size")
    .replace(/\bsizing\b/gi, "position size")
    .replace(/\s+/g, " ")
    .trim();
}

function compactList(
  values: Array<string | null | undefined>,
  fallback: string,
  limit = 4,
) {
  const items = Array.from(
    new Set(
      values
        .map((value) => investorCopy(String(value ?? "").trim()))
        .filter(Boolean),
    ),
  ).slice(0, limit);
  return items.length ? items : [fallback];
}

function metricValue(
  metrics: DecisionRawMetric[],
  label: string,
  fallback = "Pending",
) {
  return metrics.find((metric) => metric.label === label)?.value ?? fallback;
}

function parseMetricNumber(value: string) {
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function qualityWord(value: number | null, inverted = false) {
  if (value == null) return "Pending";
  const score = inverted ? 100 - value : value;
  if (score >= 75) return "High";
  if (score >= 55) return "Moderate";
  if (score >= 35) return "Low";
  return "Very low";
}

function riskWord(value: number | null) {
  if (value == null) return "Pending";
  if (value >= 72) return "Elevated";
  if (value >= 48) return "Manageable";
  return "Contained";
}

function displayPct(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "Pending";
  return `${boundedPct(value).toFixed(digits)}%`;
}

function lowerFirst(value: string) {
  const copy = investorCopy(value);
  if (!copy) return copy;
  return copy.charAt(0).toLowerCase() + copy.slice(1);
}

function cleanSentence(value: string) {
  const trimmed = investorCopy(String(value ?? "").trim());
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function displayExposure(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "No new allocation";
  if (/^(wait|none|no exposure|no new exposure|no allocation|no new allocation|0%|0\.0%)$/i.test(normalized)) {
    return "No new allocation";
  }
  return normalized;
}

function toneText(tone: DecisionTone) {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "bad") return "text-red-700";
  return "text-zinc-700";
}

function toneSurface(tone: DecisionTone) {
  if (tone === "good")
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "bad") return "border-red-200 bg-red-50 text-red-950";
  return "border-zinc-200 bg-white text-zinc-800";
}

function statusLabel(status: EvidenceStageStatus) {
  if (status === "Pass") return "Supports";
  if (status === "Fail") return "Blocks";
  return "Needs care";
}

function statusTone(status: EvidenceStageStatus): DecisionTone {
  if (status === "Pass") return "good";
  if (status === "Fail") return "bad";
  return "warn";
}

function statusIcon(status: EvidenceStageStatus) {
  if (status === "Pass") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "Fail") return <AlertTriangle className="h-4 w-4" />;
  return <CircleDashed className="h-4 w-4" />;
}

function stepIcon(step: DecisionStepId | DecisionPhaseId) {
  if (step === "intent") return <Target className="h-4 w-4" />;
  if (step === "sense") return <BarChart3 className="h-4 w-4" />;
  if (step === "pulse" || step === "opportunity")
    return <Activity className="h-4 w-4" />;
  if (step === "core") return <CircleDashed className="h-4 w-4" />;
  if (step === "judgement" || step === "trust")
    return <ShieldCheck className="h-4 w-4" />;
  if (step === "sizing" || step === "size")
    return <Wallet className="h-4 w-4" />;
  if (step === "reflection") return <BookOpen className="h-4 w-4" />;
  return <Zap className="h-4 w-4" />;
}

function friendlyEvidenceLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("market context")) return "What we see right now";
  if (normalized.includes("market")) return "Current conditions";
  if (normalized.includes("recognition")) return "Similar past situations";
  if (normalized.includes("signal")) return "Signals agree";
  if (normalized.includes("opportunity")) return "Opportunity quality";
  if (normalized.includes("risk")) return "Current conditions";
  if (normalized.includes("survival")) return "Loss history";
  if (normalized.includes("recovery")) return "Return to normal size";
  if (normalized.includes("calibration")) return "Confidence check";
  if (normalized.includes("trust")) return "Reliability";
  if (normalized.includes("regime")) return "Market environment";
  if (normalized.includes("liquidity")) return "Trading conditions";
  if (normalized.includes("governance")) return "Safety review";
  if (normalized.includes("agency")) return "Decision control";
  if (normalized.includes("resolve")) return "Final decision";
  if (normalized.includes("execution")) return "Trading quality";
  if (normalized.includes("readiness")) return "Decision readiness";
  return investorCopy(label);
}

function friendlyMetricLabel(label: string) {
  if (label === "Confidence") return "System confidence";
  if (label === "Trust") return "Reliability";
  if (label === "Trust Score") return "Reliability";
  if (label === "Conviction") return "Conviction";
  if (label === "Decision Readiness") return "Decision readiness";
  if (label === "Portfolio Contribution") return "Portfolio contribution";
  if (label === "Similar Regimes") return "Similar regimes";
  if (label === "Market Health") return "Market stability";
  if (label === "Opportunity Density") return "Number of good opportunities";
  if (label === "Risk Pressure") return "Current conditions";
  if (label === "Risk State") return "Current conditions";
  if (label === "Readiness") return "Action readiness";
  if (label === "Portfolio Cap") return "Portfolio allocation limit";
  if (label === "Starter Size") return "Starting allocation";
  if (label === "Survival") return "Loss safety";
  if (label === "Calibration") return "Confidence check";
  if (label === "History Depth") return "Similar examples checked";
  if (label === "Regime Coverage") return "Market environment coverage";
  if (label === "Composite Signal") return "Overall assessment";
  if (label === "Self Awareness") return "System confidence";
  if (label === "Sizing Mode") return "Suggested caution level";
  if (label === "Suggested Maximum Exposure") return "Suggested allocation";
  return investorCopy(label);
}

function metricGuidance(metric: DecisionRawMetric) {
  const number = parseMetricNumber(metric.value);
  switch (metric.label) {
    case "Confidence":
      if (number == null) return "Confidence is still forming.";
      if (number >= 70)
        return "The range is constructive, but it is still not certainty.";
      if (number >= 45)
        return "The range is mixed, so keep the action measured.";
      return "The range is weak. Wait for better confirmation.";
    case "Trust":
      if (number == null) return "Reliability evidence is still pending.";
      if (number >= 70)
        return "Reliability is strong enough to consider the suggested size.";
      if (number >= 45)
        return "Reliability is only partial. Keep size limited.";
      return "Reliability is too weak for new allocation.";
    case "Market Health":
      if (number == null) return "Current conditions are still loading.";
      if (number >= 70)
        return "Current conditions support cautious participation.";
      if (number >= 45)
        return "Current conditions are improving, but confirmation is incomplete.";
      return "Current conditions are weak. Protect capital.";
    case "Opportunity Density":
      if (number == null) return "The number of good opportunities is still loading.";
      if (number >= 65)
        return "Enough good opportunities are appearing to stay engaged.";
      if (number >= 35) return "Good opportunities are limited. Be selective.";
      return "Few opportunities are strong enough. Wait.";
    case "Risk Pressure":
      if (number == null) return "Current conditions are still loading.";
      if (number >= 70) return "Conditions are elevated. Keep allocation defensive.";
      if (number >= 45) return "Conditions are manageable only with disciplined size.";
      return "Conditions look contained for the suggested action.";
    case "Readiness":
      if (number == null) return "The decision is still forming.";
      if (number >= 70)
        return "The evidence is close enough to act inside the suggested size.";
      if (number >= 45)
        return "Prepare, but wait for the missing evidence before adding risk.";
      return "Do not act yet. The decision is not ready.";
    case "Portfolio Cap":
      return "Do not exceed this total portfolio allocation for now.";
    case "Starter Size":
      return "Use this as the first size only if the recommendation allows action.";
    case "Survival":
      if (number == null) return "Loss-history protection is still pending.";
      if (number >= 70)
        return "Loss history supports the current risk boundary.";
      if (number >= 45) return "Loss history argues for reduced size.";
      return "Loss history argues against adding risk.";
    case "Calibration":
      if (number == null) return "The confidence check is still pending.";
      if (number >= 70)
        return "The confidence check supports the recommendation.";
      if (number >= 45)
        return "The confidence check is mixed. Keep the decision cautious.";
      return "The confidence check is weak. Wait for cleaner outcomes.";
    case "History Depth":
      if (number == null) return "Comparable history is still pending.";
      if (number >= 70) return "There is enough history to support the view.";
      if (number >= 45)
        return "History is usable, but not deep enough for full size.";
      return "History is too thin. Keep the decision conservative.";
    case "Regime Coverage":
      if (number == null) return "Market coverage is still pending.";
      if (number >= 70)
        return "The view has held up across enough market environments.";
      if (number >= 45)
        return "Coverage is partial. Avoid stretching the size.";
      return "Coverage is too narrow. Wait for broader proof.";
    default:
      return "This number supports the recommendation but should not lead it.";
  }
}

type MarketEntryOption = {
  id: "stocks" | "crypto" | "forex" | "commodities" | "indexes" | "bonds";
  label: string;
  description: string;
  shortDescription: string;
  match: RegExp;
  fallbackValue: string;
  preferredValues?: string[];
  colorClass: string;
  icon: "stocks" | "crypto" | "forex" | "commodities" | "indexes" | "bonds";
};

const MARKET_ENTRY_OPTIONS: MarketEntryOption[] = [
  {
    id: "stocks",
    label: "Stocks",
    description: "Public companies and ETFs",
    shortDescription: "Companies you can invest in",
    match: /stock|stocks|nasdaq|nyse|amex|arca|bats|iex|us\b|usa/i,
    fallbackValue: "US",
    preferredValues: ["US", "USA", "NASDAQ", "NYSE"],
    colorClass: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: "stocks",
  },
  {
    id: "crypto",
    label: "Crypto",
    description: "Digital assets and tokens",
    shortDescription: "Blockchain assets and tokens",
    match: /binance|crypto|coin|token/i,
    fallbackValue: "CRYPTO",
    preferredValues: ["CRYPTO", "BINANCE"],
    colorClass: "border-violet-200 bg-violet-50 text-violet-950",
    icon: "crypto",
  },
  {
    id: "forex",
    label: "Forex",
    description: "Global currency markets",
    shortDescription: "Currencies from around the world",
    match: /forex|fx|currency|currencies|usd|eur|gbp|jpy/i,
    fallbackValue: "FOREX",
    preferredValues: ["FOREX", "FX"],
    colorClass: "border-sky-200 bg-sky-50 text-sky-950",
    icon: "forex",
  },
  {
    id: "commodities",
    label: "Commodities",
    description: "Gold, oil, agriculture, metals",
    shortDescription: "Physical goods and resources",
    match: /commod|future|futures|gold|oil|metal|energy|agriculture/i,
    fallbackValue: "COMMODITIES",
    preferredValues: ["COMMODITIES", "FUTURES"],
    colorClass: "border-amber-200 bg-amber-50 text-amber-950",
    icon: "commodities",
  },
  {
    id: "indexes",
    label: "Indexes",
    description: "Broad market exposure",
    shortDescription: "Baskets that track whole markets",
    match: /index|indices|spx|ndx|dow|etf|fund/i,
    fallbackValue: "ETF",
    preferredValues: ["ETF", "INDEX", "INDEXES"],
    colorClass: "border-indigo-200 bg-indigo-50 text-indigo-950",
    icon: "indexes",
  },
  {
    id: "bonds",
    label: "Bonds",
    description: "Fixed income opportunities",
    shortDescription: "Loans issued by governments and companies",
    match: /bond|bonds|fixed income|treasury|yield/i,
    fallbackValue: "BONDS",
    preferredValues: ["BONDS", "BOND", "FIXED_INCOME"],
    colorClass: "border-teal-200 bg-teal-50 text-teal-950",
    icon: "bonds",
  },
];

const GUIDE_GOALS = [
  "Build wealth steadily.",
  "Protect what I have while still making progress.",
  "Grow aggressively without taking unnecessary risks.",
  "Recover confidence and capital.",
];

function marketEntryValue(
  entry: MarketEntryOption,
  marketOptions: Array<{ value: string; label: string }>,
) {
  const preferred = entry.preferredValues
    ?.map((value) => value.toUpperCase())
    .find((value) =>
      marketOptions.some((market) => market.value.toUpperCase() === value),
    );
  if (preferred) return preferred;

  const match = marketOptions.find(
    (market) =>
      entry.match.test(market.value) || entry.match.test(market.label),
  );
  return match?.value ?? entry.fallbackValue;
}

function MarketEntryIcon({ icon }: { icon: MarketEntryOption["icon"] }) {
  if (icon === "stocks") return <TrendingUp className="h-6 w-6" />;
  if (icon === "crypto") return <Bitcoin className="h-6 w-6" />;
  if (icon === "forex") return <Globe2 className="h-6 w-6" />;
  if (icon === "commodities") return <Gem className="h-6 w-6" />;
  if (icon === "bonds") return <Landmark className="h-6 w-6" />;
  return <BarChart3 className="h-6 w-6" />;
}

function MarketChoiceGrid({
  marketOptions,
  selectedMarket,
  onMarketChange,
  compact = false,
}: {
  marketOptions: Array<{ value: string; label: string }>;
  selectedMarket: string;
  onMarketChange: (market: string) => void;
  compact?: boolean;
}) {
  const selectedMarketName =
    marketOptions.find((market) => market.value === selectedMarket)?.label ??
    selectedMarket;

  return (
    <div
      data-testid="market-choice-grid"
      className={cx(
        "grid min-w-0 gap-3",
        compact ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {MARKET_ENTRY_OPTIONS.map((entry) => {
        const value = marketEntryValue(entry, marketOptions);
        const active =
          value === selectedMarket ||
          entry.match.test(selectedMarketName) ||
          entry.match.test(selectedMarket);

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onMarketChange(value)}
            aria-pressed={active}
            className={cx(
              "group grid min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-950",
              compact ? "min-h-[116px]" : "min-h-[148px]",
              active
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-400",
            )}
          >
            <span
              className={cx(
                "grid h-12 w-12 place-items-center rounded-lg border",
                active ? "border-white/20 bg-white/10" : entry.colorClass,
              )}
            >
              <MarketEntryIcon icon={entry.icon} />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-lg font-semibold leading-tight">
                {entry.label}
              </span>
              <span
                className={cx(
                  "mt-1 block break-words text-sm leading-6",
                  active ? "text-zinc-300" : "text-zinc-600",
                )}
              >
                {entry.description}
              </span>
              <span
                className={cx(
                  "mt-3 block break-words text-xs font-semibold leading-5",
                  active ? "text-zinc-400" : "text-zinc-500",
                )}
              >
                {entry.shortDescription}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cx("animate-pulse rounded-lg bg-zinc-200/90", className)} />
  );
}

function InitialLoadingState() {
  return (
    <main
      data-testid="dashboard-state"
      data-state-kind="initial-loading"
      data-scroll-region="initial-loading"
      className="signal-scroll-region mx-auto grid h-full min-h-0 w-full max-w-[1880px] gap-2 overflow-y-auto overflow-x-hidden px-3 py-2 md:grid-rows-[auto_minmax(0,1fr)] lg:px-4"
      aria-busy="true"
    >
      <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-8 w-24" />
          </div>
          <SkeletonBlock className="mt-4 h-9 w-full max-w-3xl" />
          <SkeletonBlock className="mt-3 h-6 w-full max-w-4xl" />
          <SkeletonBlock className="mt-2 h-6 w-2/3" />
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <SkeletonBlock className="h-[76px]" />
          <SkeletonBlock className="h-[76px]" />
          <SkeletonBlock className="h-[76px]" />
          <SkeletonBlock className="h-[76px]" />
        </div>
      </section>

      <section className="grid gap-2 md:min-h-0 md:grid-cols-[248px_minmax(0,1fr)_340px] md:overflow-hidden">
        <nav className="grid auto-rows-min gap-2 rounded-lg border border-zinc-200 bg-white p-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="grid min-h-[70px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-md p-3"
            >
              <SkeletonBlock className="h-8 w-8" />
              <div>
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-2 h-3 w-16" />
              </div>
            </div>
          ))}
        </nav>

        <div className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:min-h-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-5 w-48" />
              <SkeletonBlock className="mt-3 h-8 w-full max-w-2xl" />
            </div>
            <SkeletonBlock className="h-11 w-full max-w-[360px]" />
          </div>
          <div className="grid min-h-0 gap-3 lg:grid-rows-3">
            <SkeletonBlock className="min-h-[112px]" />
            <SkeletonBlock className="min-h-[112px]" />
            <SkeletonBlock className="min-h-[112px]" />
          </div>
          <SkeletonBlock className="h-16" />
        </div>

        <aside className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 md:min-h-0">
          <div className="border-b border-zinc-200 pb-3">
            <SkeletonBlock className="h-5 w-36" />
            <SkeletonBlock className="mt-2 h-10 w-44" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SkeletonBlock className="h-[76px]" />
              <SkeletonBlock className="h-[76px]" />
            </div>
          </div>
          <div className="grid min-h-0 gap-2">
            <SkeletonBlock className="h-[76px]" />
            <SkeletonBlock className="h-[76px]" />
            <SkeletonBlock className="h-[76px]" />
            <SkeletonBlock className="h-[160px]" />
          </div>
          <SkeletonBlock className="h-28" />
        </aside>
      </section>
    </main>
  );
}

function StateActionButton({
  children,
  icon,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition",
        variant === "primary"
          ? "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800"
          : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100",
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function ScrollBoundary({
  children,
  className,
  regionClassName,
  testId,
  policy,
  horizontal = false,
  fade = "white",
}: {
  children: React.ReactNode;
  className?: string;
  regionClassName?: string;
  testId?: string;
  policy: string;
  horizontal?: boolean;
  fade?: "white" | "zinc" | "none";
}) {
  return (
    <div
      data-overflow-policy={policy}
      className={cx(
        "relative min-h-0 min-w-0 overflow-hidden",
        fade !== "none" && "signal-scroll-fade",
        fade === "zinc" && "signal-scroll-fade-zinc",
        className,
      )}
    >
      <div
        data-testid={testId}
        data-scroll-region={policy}
        className={cx(
          "signal-scroll-region min-h-0 min-w-0",
          horizontal
            ? "overflow-x-auto overflow-y-hidden"
            : "overflow-y-auto overflow-x-hidden",
          regionClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function DecisionPanel({
  title,
  children,
  ariaLabel,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  ariaLabel: string;
  testId: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      data-testid={testId}
      className="grid min-h-[168px] max-h-[320px] min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-zinc-200 bg-white md:max-h-none"
    >
      <div className="border-b border-zinc-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
        {title}
      </div>
      <ScrollBoundary
        policy="card-body-scroll"
        regionClassName="h-full px-3 py-2.5"
      >
        {children}
      </ScrollBoundary>
    </section>
  );
}

function BlockingStateScreen({
  state,
  marketOptions,
  onMarketChange,
  onRefresh,
  onContinueUsingCachedData,
  guideSteps,
  activeStep,
  stepStatuses,
  completedStepCount,
  remainingStepCount,
  onStepChange,
}: {
  state: DashboardViewState;
  marketOptions: Array<{ value: string; label: string }>;
  onMarketChange: (market: string) => void;
  onRefresh: () => void;
  onContinueUsingCachedData?: () => void;
  guideSteps: ReturnType<typeof defaultGuideSteps>;
  activeStep: GuidedStepId;
  stepStatuses: Record<GuidedStepId, GuidedStepStatus>;
  completedStepCount: number;
  remainingStepCount: number;
  onStepChange: (stepId: GuidedStepId) => void;
}) {
  const isNoMarket = state.kind === "no-market";
  const isConnectionLost = state.kind === "connection-lost";
  const isError = state.kind === "error";
  const isEmpty = state.kind === "empty-results";

  if (isNoMarket) {
    return (
      <main
        data-testid="dashboard-state"
        data-state-kind={state.kind}
        data-scroll-region="market-entry"
        className="signal-scroll-region mx-auto grid h-full min-h-0 w-full max-w-[1640px] content-start gap-3 overflow-y-auto overflow-x-hidden px-3 py-3 lg:px-4"
      >
        <GuideLayout
          stepRail={
            <StepRail
              steps={guideSteps}
              activeStepId={activeStep}
              stepStatuses={stepStatuses}
              completedCount={completedStepCount}
              remainingCount={remainingStepCount}
              onStepChange={onStepChange}
            />
          }
          primary={
            <>
              <GuidedStepPanel
                stepId="choose-market"
                activeStepId={activeStep}
                status={stepStatuses["choose-market"]}
              >
                <section className="grid w-full gap-7 rounded-lg border border-zinc-200 bg-white p-5 text-center shadow-sm sm:p-6">
                  <div className="mx-auto grid max-w-3xl gap-3">
                    <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 shadow-sm">
                      <Target className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-500">
                      What would you like help with today?
                    </p>
                    <h2 className="break-words text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl">
                      What would you like to explore today?
                    </h2>
                    <p className="mx-auto max-w-2xl break-words text-base leading-7 text-zinc-600">
                      Choose a market first. Signal will then explain current
                      conditions, surface opportunities, and suggest a next step
                      in plain language.
                    </p>
                  </div>

                  <MarketChoiceGrid
                    marketOptions={marketOptions}
                    selectedMarket=""
                    onMarketChange={onMarketChange}
                  />
                </section>
              </GuidedStepPanel>

              {GUIDED_STEPS.filter((step) => step.id !== "choose-market").map(
                (step) => (
                  <GuidedStepPanel
                    key={step.id}
                    stepId={step.id}
                    activeStepId={activeStep}
                    status={stepStatuses[step.id]}
                  >
                    <BlockingStepPlaceholder stepId={step.id} />
                  </GuidedStepPanel>
                ),
              )}
            </>
          }
          secondary={
            <WorkflowProgressCard
              activeStepId={activeStep}
              completedCount={completedStepCount}
              remainingCount={remainingStepCount}
              statuses={stepStatuses}
            />
          }
          />
      </main>
    );
  }

  return (
    <main
      data-testid="dashboard-state"
      data-state-kind={state.kind}
      data-scroll-region="blocking-state"
      className="signal-scroll-region mx-auto grid h-full min-h-0 w-full max-w-[1880px] content-start gap-2 overflow-y-auto overflow-x-hidden px-3 py-2 lg:px-4"
    >
      <section className="grid min-w-0 content-start gap-5 self-start overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:min-h-0 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700">
              {isConnectionLost ? (
                <WifiOff className="h-5 w-5" />
              ) : isError ? (
                <AlertTriangle className="h-5 w-5" />
              ) : isEmpty ? (
                <Search className="h-5 w-5" />
              ) : (
                <Target className="h-5 w-5" />
              )}
            </div>
            <h2 className="mt-4 break-words text-3xl font-semibold leading-tight text-zinc-950 sm:text-4xl">
              {state.headline}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-600">
              {state.description}
            </p>
          </div>

          <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <FactTile
              label="Last successful update"
              value={state.lastSuccessfulUpdateLabel}
            />
            <FactTile
              label="Current cached market"
              value={state.cachedMarketLabel}
            />
            <FactTile
              label="Current cached opportunities"
              value={`${state.cachedOpportunityCount}`}
            />
          </div>
        </div>

        {isConnectionLost || isError ? (
          <div
            data-overflow-policy="sticky-state-actions"
            className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur sm:flex-row md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none"
          >
            <StateActionButton
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={onRefresh}
            >
              {isConnectionLost ? "Retry Connection" : "Retry"}
            </StateActionButton>
            {state.cachedMarketItemCount > 0 ||
            state.cachedOpportunityCount > 0 ? (
              <StateActionButton
                icon={<Database className="h-4 w-4" />}
                variant="secondary"
                onClick={onContinueUsingCachedData ?? onRefresh}
              >
                Continue Using Cached Data
              </StateActionButton>
            ) : null}
          </div>
        ) : null}

        {isEmpty ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              "Wait for new opportunities",
              "Change market",
              "Adjust filters",
            ].map((action) => (
              <div
                key={action}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-800"
              >
                {action}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function FactTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: DecisionTone;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="break-words text-xs font-medium text-zinc-500">
        {label}
      </div>
      <div
        className={cx(
          "mt-1 break-words text-base font-semibold leading-snug",
          toneText(tone),
        )}
      >
        {investorCopy(value)}
      </div>
    </div>
  );
}

function money(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Pending";
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function pct(value: unknown, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Pending";
  return `${number.toFixed(digits)}%`;
}

function commitmentRowTone(action: string): DecisionTone {
  if (action === "Buy") return "good";
  if (action === "Blocked") return "bad";
  if (action === "Sell") return "warn";
  return "neutral";
}

function CommitmentClientPanel({
  commitment,
  changeExplanation,
  controls,
}: {
  commitment?: any | null;
  changeExplanation?: string[];
  controls: CommitmentControlProps;
}) {
  const summary = commitment?.summary ?? {};
  const result = commitment?.result ?? {};
  const rows = Array.isArray(commitment?.executionPlan)
    ? commitment.executionPlan
    : [];
  const invalidationTriggers = Array.isArray(result?.invalidation?.triggers)
    ? result.invalidation.triggers
    : [];
  const monitoringMetrics = Array.isArray(result?.monitoringPlan?.metrics)
    ? result.monitoringPlan.metrics
    : [];
  const futureChecks = Array.isArray(result?.monitoringPlan?.futureChecks)
    ? result.monitoringPlan.futureChecks
    : [];
  const why = Array.isArray(summary?.why) ? summary.why : result?.reasons ?? [];
  const changes = changeExplanation?.length
    ? changeExplanation
    : ["No previous commitment snapshot is available yet."];

  return (
    <section
      data-testid="signal-commitment-client"
      className="grid min-w-0 gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            Signal Commitment
          </div>
          <h2 className="mt-1 break-words text-2xl font-semibold leading-tight text-zinc-950">
            {summary?.status
              ? `${investorCopy(String(summary.status))} commitment`
              : "Commitment pending"}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-zinc-600">
            {summary?.totalRecommended != null
              ? `${money(summary.totalRecommended)} recommended from ${money(summary.availableCapital)}.`
              : "The strategy API will return the canonical commitment result."}
          </p>
        </div>
        <span
          className={cx(
            "shrink-0 rounded-md border px-2 py-1 text-xs font-semibold",
            toneSurface(
              summary?.status === "recommended"
                ? "good"
                : summary?.status === "blocked"
                  ? "bad"
                  : "warn",
            ),
          )}
        >
          {investorCopy(String(summary?.policy?.name ?? "policy pending"))}
        </span>
      </div>

      <div
        data-testid="commitment-investor-inputs"
        className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <label className="grid gap-1 text-sm font-semibold text-zinc-700">
          Available Capital
          <input
            type="number"
            min={0}
            value={controls.availableCapital}
            onChange={(event) =>
              controls.onAvailableCapitalChange(
                Math.max(0, Number(event.target.value) || 0),
              )
            }
            className="h-10 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          />
        </label>

        <div className="grid gap-1 text-sm font-semibold text-zinc-700">
          Mode
          <div className="grid grid-cols-2 rounded-md border border-zinc-300 bg-white p-1">
            {(["investing", "trading"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={controls.intent === item}
                onClick={() => controls.onIntentChange(item)}
                className={cx(
                  "h-8 rounded px-2 text-xs font-semibold capitalize",
                  controls.intent === item
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-600 hover:bg-zinc-100",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-1 text-sm font-semibold text-zinc-700">
          Risk Preference
          <select
            value={controls.riskPreference}
            onChange={(event) =>
              controls.onRiskPreferenceChange(
                event.target.value as CommitmentControlProps["riskPreference"],
              )
            }
            className="h-10 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm capitalize text-zinc-950 outline-none focus:border-zinc-950"
          >
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>

        <div className="grid gap-1 text-sm font-semibold text-zinc-700">
          Trust Override
          <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={controls.trustOverrideEnabled}
              onChange={(event) =>
                controls.onTrustOverrideEnabledChange(event.target.checked)
              }
              className="h-4 w-4"
            />
            <span>{controls.trustOverrideEnabled ? pct(controls.trustOverridePct, 0) : "Use Signal"}</span>
          </label>
          {controls.trustOverrideEnabled ? (
            <input
              aria-label="Trust override percentage"
              type="range"
              min={0}
              max={100}
              value={controls.trustOverridePct}
              onChange={(event) =>
                controls.onTrustOverridePctChange(Number(event.target.value))
              }
              className="h-2 w-full accent-zinc-950"
            />
          ) : null}
        </div>

        <label className="grid gap-1 text-sm font-semibold text-zinc-700 md:col-span-1 xl:col-span-2">
          Single-Position Cap
          <input
            inputMode="decimal"
            placeholder="Auto"
            value={controls.maxSinglePositionPct}
            onChange={(event) =>
              controls.onMaxSinglePositionPctChange(event.target.value)
            }
            className="h-10 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-950"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold text-zinc-700 md:col-span-1 xl:col-span-2">
          Portfolio Commitment Cap
          <input
            inputMode="decimal"
            placeholder="Auto"
            value={controls.maxPortfolioCommitmentPct}
            onChange={(event) =>
              controls.onMaxPortfolioCommitmentPctChange(event.target.value)
            }
            className="h-10 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-950"
          />
        </label>
      </div>

      <div
        data-testid="commitment-summary"
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        <FactTile label="Recommended" value={money(summary?.totalRecommended)} />
        <FactTile label="Uncommitted" value={money(summary?.uncommittedCapital)} />
        <FactTile label="Commitment" value={pct(Number(summary?.normalizedCommitment ?? 0) * 100)} />
        <FactTile label="Monitor First" value={String(summary?.monitorFirst ?? "Pending")} />
      </div>

      <DisclosurePanel
        title="Recommended Commitment"
        summary={`${rows.filter((row: any) => Number(row.commitmentAmount) > 0).length} executable rows`}
        defaultOpen
        testId="recommended-commitment-panel"
      >
        <div className="grid gap-2">
          {rows.length ? (
            rows.slice(0, 8).map((row: any) => (
              <div
                key={`${row.symbol}-${row.action}`}
                className="grid min-w-0 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 lg:grid-cols-[minmax(86px,0.35fr)_minmax(0,1fr)_minmax(116px,0.45fr)]"
              >
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-zinc-950">
                    {row.symbol}
                  </div>
                  <span
                    className={cx(
                      "mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      toneSurface(commitmentRowTone(String(row.action))),
                    )}
                  >
                    {investorCopy(String(row.action))}
                  </span>
                </div>
                <div className="min-w-0 text-sm leading-6 text-zinc-700">
                  <div className="font-semibold text-zinc-950">
                    {money(row.commitmentAmount)} · {pct(row.allocationPct)}
                    {row.estimatedUnits != null
                      ? ` · ${row.estimatedUnits} units`
                      : ""}
                  </div>
                  <div className="break-words">
                    {investorCopy(String(row.reasons?.[0] ?? "No reason supplied."))}
                  </div>
                </div>
                <div className="min-w-0 text-xs leading-5 text-zinc-500">
                  {investorCopy(String(row.limitedBy?.[0] ?? row.mode ?? "No limiter"))}
                </div>
              </div>
            ))
          ) : (
            <p className="break-words text-sm leading-6 text-zinc-600">
              No execution rows have been returned yet.
            </p>
          )}
        </div>
      </DisclosurePanel>

      <DisclosurePanel
        title="Why This"
        summary={why[0] ?? "Waiting for commitment reasons"}
        testId="commitment-why-panel"
      >
        <div className="grid gap-2">
          {(why.length ? why : ["Signal Commitment has not returned reasons yet."]).map((item: string) => (
            <p key={item} className="break-words text-sm leading-6 text-zinc-700">
              {investorCopy(item)}
            </p>
          ))}
        </div>
      </DisclosurePanel>

      <DisclosurePanel
        title="What Changed"
        summary={changes[0]}
        testId="commitment-change-panel"
      >
        <div className="grid gap-2">
          {changes.map((item) => (
            <p key={item} className="break-words text-sm leading-6 text-zinc-700">
              {investorCopy(item)}
            </p>
          ))}
        </div>
      </DisclosurePanel>

      <DisclosurePanel
        title="Invalidation"
        summary={`${invalidationTriggers.length} triggers`}
        testId="commitment-invalidation-panel"
      >
        <div className="grid gap-2">
          {invalidationTriggers.length ? (
            invalidationTriggers.slice(0, 8).map((trigger: any) => (
              <FactTile
                key={`${trigger.id}-${trigger.targetId ?? "portfolio"}`}
                label={String(trigger.targetId ?? trigger.severity ?? "Portfolio")}
                value={String(trigger.condition ?? "Review commitment.")}
                tone={trigger.severity === "high" || trigger.severity === "critical" ? "bad" : "warn"}
              />
            ))
          ) : (
            <p className="break-words text-sm leading-6 text-zinc-600">
              No invalidation triggers have been returned yet.
            </p>
          )}
        </div>
      </DisclosurePanel>

      <DisclosurePanel
        title="Monitoring"
        summary={`${monitoringMetrics.length} metrics`}
        testId="commitment-monitoring-panel"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {monitoringMetrics.slice(0, 8).map((metric: any) => (
            <FactTile
              key={`${metric.targetId ?? "portfolio"}-${metric.id}-${metric.direction}`}
              label={String(metric.targetId ?? metric.id)}
              value={`${investorCopy(String(metric.id))} ${metric.direction} ${pct(Number(metric.threshold ?? 0) * 100)}`}
            />
          ))}
        </div>
        <div className="mt-3 grid gap-1">
          {futureChecks.map((item: string) => (
            <p key={item} className="break-words text-sm leading-6 text-zinc-700">
              {investorCopy(item)}
            </p>
          ))}
        </div>
      </DisclosurePanel>
    </section>
  );
}

function OpportunityPicker({
  opportunities,
  selectedOpportunityId,
  onSelectOpportunity,
}: {
  opportunities: DecisionOpportunity[];
  selectedOpportunityId: string | null;
  onSelectOpportunity: (id: string) => void;
}) {
  if (!opportunities.length) {
    return (
      <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600">
        No opportunity deserves attention yet. Keep capital flat until the
        evidence improves.
      </div>
    );
  }

  return (
    <ScrollBoundary
      policy="opportunity-list-scroll"
      testId="opportunity-list-scroll"
      regionClassName="grid max-h-[22rem] gap-2 pr-1 md:max-h-none"
    >
      {opportunities.slice(0, 6).map((opportunity) => {
        const tone: DecisionTone =
          opportunity.readinessPct >= 72
            ? "good"
            : opportunity.readinessPct >= 48
              ? "warn"
              : "bad";

        return (
          <button
            key={opportunity.id}
            type="button"
            onClick={() => onSelectOpportunity(opportunity.id)}
            className={cx(
              "grid min-h-[76px] min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3 text-left transition",
              selectedOpportunityId === opportunity.id
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-400",
            )}
          >
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold leading-snug">
                {opportunity.ticker}
              </span>
              <span
                className={cx(
                  "mt-1 block break-words text-xs leading-5",
                  selectedOpportunityId === opportunity.id
                    ? "text-zinc-300"
                    : "text-zinc-500",
                )}
              >
                {opportunity.action} at {displayExposure(opportunity.exposureLabel)}
              </span>
              <span
                className={cx(
                  "mt-1 line-clamp-2 break-words text-xs leading-5",
                  selectedOpportunityId === opportunity.id
                    ? "text-zinc-400"
                    : "text-zinc-500",
                )}
              >
                {opportunity.name}
              </span>
            </span>
            <span
              className={cx(
                "shrink-0 rounded-md border px-2 py-1 text-xs font-semibold",
                selectedOpportunityId === opportunity.id
                  ? "border-white/20 bg-white/10 text-white"
                  : toneSurface(tone),
              )}
            >
              {qualityWord(opportunity.readinessPct)}
            </span>
          </button>
        );
      })}
    </ScrollBoundary>
  );
}

function MeaningTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: DecisionTone;
}) {
  return (
    <div className={cx("min-w-0 rounded-lg border p-3", toneSurface(tone))}>
      <div className="text-xs font-semibold uppercase tracking-normal opacity-70">
        {label}
      </div>
      <div className="mt-1 break-words text-xl font-semibold leading-tight">
        {investorCopy(value)}
      </div>
      {detail ? (
        <p className="mt-2 break-words text-sm leading-6 opacity-80">
          {investorCopy(detail)}
        </p>
      ) : null}
    </div>
  );
}

function DisclosurePanel({
  title,
  summary,
  children,
  defaultOpen = false,
  testId,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return (
    <details
      data-testid={testId}
      className="group min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
      open={defaultOpen}
    >
      <summary className="grid cursor-pointer list-none gap-1 border-b border-zinc-200 px-4 py-3 marker:hidden sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)] sm:items-center [&::-webkit-details-marker]:hidden">
        <span className="break-words text-sm font-semibold text-zinc-950">
          {title}
        </span>
        <span className="break-words text-sm leading-6 text-zinc-500 sm:text-right">
          {investorCopy(summary)}
        </span>
      </summary>
      <ScrollBoundary
        policy="card-body-scroll"
        regionClassName="max-h-[28rem] px-4 py-3"
        fade="zinc"
      >
        {children}
      </ScrollBoundary>
    </details>
  );
}

function learningText(value: unknown, fallback = "Pending") {
  const text = investorCopy(String(value ?? "").trim());
  return text || fallback;
}

function learningList(values: unknown, fallback: string, limit = 4) {
  if (Array.isArray(values)) {
    const mapped = values
      .map((item) =>
        typeof item === "string"
          ? item
          : (item?.description ?? item?.summary ?? item?.lesson ?? item?.reason ?? item?.label),
      )
      .map((item) => investorCopy(String(item ?? "").trim()))
      .filter(Boolean);
    const unique = Array.from(new Set(mapped)).slice(0, limit);
    return unique.length ? unique : [fallback];
  }
  return [fallback];
}

function LearningSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2 border-t border-zinc-200 pt-3 first:border-t-0 first:pt-0">
      <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
        {title}
      </div>
      {children}
    </section>
  );
}

function InvestorLearningPanel({ learning }: { learning?: any }) {
  const thesis = learning?.thesis ?? {};
  const evidence = learning?.evidence ?? {};
  const narrative = learning?.narrative ?? {};
  const conviction = learning?.conviction ?? {};
  const readiness = learning?.readiness ?? {};
  const calibration = learning?.calibration ?? {};
  const processQuality = learning?.processQuality ?? {};
  const beliefFreshness = learning?.beliefFreshness ?? {};
  const ranking = learning?.opportunityRanking ?? {};
  const portfolio = learning?.portfolioContext ?? {};
  const similarRegimes = Array.isArray(learning?.similarRegimes)
    ? learning.similarRegimes
    : [];
  const emptyStates = learningList(
    learning?.emptyStates,
    "Outcome learning starts after decisions are reviewed.",
    4,
  );
  const supports = learningList(
    evidence.supporting,
    "Supporting evidence is still forming.",
    5,
  );
  const contradicts = learningList(
    evidence.contradicting,
    emptyStates.find((item) => /contradicting evidence/i.test(item)) ??
      "No contradicting evidence has been found yet.",
    5,
  );
  const triggers = learningList(
    learning?.mindChangeTriggers,
    "What would change the view will appear as more evidence is collected.",
    5,
  );
  const lessons = learningList(
    learning?.learningRecords,
    emptyStates.find((item) => /outcome learning|previous decisions/i.test(item)) ??
      "No previous decisions have been reviewed yet.",
    4,
  );
  const horizonLines = Array.isArray(learning?.horizons)
    ? learning.horizons.map((view: any) =>
        `${learningText(view.horizon)}: ${learningText(view.view)}. ${learningText(view.action)}`,
      )
    : ["Horizon views are still forming."];
  const similarLines = similarRegimes.length
    ? similarRegimes.slice(0, 3).map((item: any) =>
        `${Math.round(Number(item.similarity ?? 0) * 100)}% similar: ${learningText(item.whatHappened)}`,
      )
    : [
        emptyStates.find((item) => /similar regimes/i.test(item)) ??
          "Similar regimes will appear after more snapshots are collected.",
      ];
  const otherOpportunities = Array.isArray(ranking.otherOpportunities)
    ? ranking.otherOpportunities.map((item: any) => item.label)
    : [];
  const notReady = Array.isArray(ranking.notReadyYet)
    ? ranking.notReadyYet.map((item: any) => item.label)
    : [];

  return (
    <DisclosurePanel
      title="Investor Judgment"
      summary={learningText(narrative.action, "Learning output is still forming.")}
      testId="investor-learning-panel"
    >
      <div className="grid min-w-0 gap-3">
        <LearningSection title="Current Thesis">
          <p className="break-words text-sm font-semibold leading-6 text-zinc-950">
            {learningText(thesis.title, "Current thesis is still forming.")}
          </p>
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(thesis.description, "Signal has not formed a durable thesis yet.")}
          </p>
        </LearningSection>

        <LearningSection title="Supporting Evidence">
          <div className="grid gap-1">
            {supports.map((item) => (
              <p key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>

        <LearningSection title="Contradicting Evidence">
          <div className="grid gap-1">
            {contradicts.map((item) => (
              <p key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>

        <LearningSection title="Similar Regimes">
          <div className="grid gap-1">
            {similarLines.map((item, index) => (
              <p key={`${item}-${index}`} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>

        <LearningSection title="What Changed">
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(narrative.whatChanged, "No reviewed change has been detected yet.")}
          </p>
        </LearningSection>

        <LearningSection title="Calibration">
          <div className="grid gap-2 sm:grid-cols-3">
            <FactTile label="Score" value={`${Math.round(Number(calibration.calibrationScore ?? 0))}%`} />
            <FactTile label="Trend" value={learningText(calibration.reliabilityTrend, "insufficient data")} />
            <FactTile label="Samples" value={String(calibration.sampleSize ?? 0)} />
          </div>
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(calibration.explanation, "Calibration will improve after more outcomes are reviewed.")}
          </p>
        </LearningSection>

        <LearningSection title="Process Quality">
          <div className="grid gap-2 sm:grid-cols-3">
            <FactTile label="Process" value={`${Math.round(Number(processQuality.processQualityScore ?? 0))}%`} />
            <FactTile
              label="Outcome"
              value={
                processQuality.outcomeQualityScore == null
                  ? "Pending"
                  : `${Math.round(Number(processQuality.outcomeQualityScore))}%`
              }
            />
            <FactTile label="Readiness" value={`${Math.round(Number(processQuality.readinessScore ?? 0))}%`} />
          </div>
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(processQuality.learningNote, "Process quality will become clearer after the decision has a reviewed outcome.")}
          </p>
        </LearningSection>

        <LearningSection title="Belief Freshness">
          <div className="grid gap-2 sm:grid-cols-3">
            <FactTile label="Freshness" value={`${Math.round(Number(beliefFreshness.freshness ?? 0))}%`} />
            <FactTile label="Status" value={learningText(beliefFreshness.status, "unsupported")} />
            <FactTile label="After decay" value={`${Math.round(Number(beliefFreshness.confidenceAfterDecay ?? 0))}%`} />
          </div>
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(beliefFreshness.explanation, "This thesis has not received fresh evidence yet.")}
          </p>
        </LearningSection>

        <LearningSection title="Conviction">
          <div className="grid gap-2 sm:grid-cols-3">
            <FactTile label="Confidence" value={`${Math.round(Number(conviction.confidence ?? 0))}%`} />
            <FactTile label="Reliability" value={`${Math.round(Number(conviction.trust ?? 0))}%`} />
            <FactTile label="Conviction" value={`${Math.round(Number(conviction.conviction ?? 0))}%`} />
          </div>
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(conviction.explanation, "Conviction is still being separated from readiness.")}
          </p>
        </LearningSection>

        <LearningSection title="Decision Readiness">
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(readiness.explanation, "Readiness is still forming.")}
          </p>
          <p className="break-words text-sm font-semibold leading-6 text-zinc-950">
            {learningText(readiness.actionLanguage, "observe")}
          </p>
        </LearningSection>

        <LearningSection title="Mind Change Triggers">
          <div className="grid gap-1">
            {triggers.map((item) => (
              <p key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>

        <LearningSection title="Opportunity Cost">
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(ranking.explanation, "No opportunity is ready enough to rank as best right now.")}
          </p>
          <p className="break-words text-xs leading-5 text-zinc-500">
            Best: {learningText(ranking.bestOpportunity?.label, "None")} | Other: {otherOpportunities.join(", ") || "None"} | Not ready: {notReady.join(", ") || "None"}
          </p>
        </LearningSection>

        <LearningSection title="Time Horizon Views">
          <div className="grid gap-1">
            {horizonLines.map((item) => (
              <p key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>

        <LearningSection title="Portfolio Context">
          <p className="break-words text-sm leading-6 text-zinc-700">
            {learningText(portfolio.summary, "Portfolio context is unavailable.")}
          </p>
          {learningList(portfolio.warnings, "", 3).filter(Boolean).map((item) => (
            <p key={item} className="break-words text-xs leading-5 text-zinc-500">
              {item}
            </p>
          ))}
        </LearningSection>

        <LearningSection title="Reflection / Lessons">
          <div className="grid gap-1">
            {lessons.map((item) => (
              <p key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>

        <LearningSection title="Investor Narrative">
          <div className="grid gap-1">
            {[
              narrative.whatIsHappening,
              narrative.whyItMatters,
              narrative.uncertainty,
              narrative.mindChange,
            ].map((item) => learningText(item, "")).filter(Boolean).map((item) => (
              <p key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </p>
            ))}
          </div>
        </LearningSection>
      </div>
    </DisclosurePanel>
  );
}

function guidedStatusTone(status: GuidedStepStatus): DecisionTone {
  if (status === "completed") return "good";
  if (status === "needsAttention") return "warn";
  if (status === "inProgress") return "neutral";
  return "neutral";
}

function GuidedStepPanel({
  stepId,
  activeStepId,
  status,
  children,
}: {
  stepId: GuidedStepId;
  activeStepId: GuidedStepId;
  status: GuidedStepStatus;
  children: React.ReactNode;
}) {
  const step = getGuidedStepById(stepId);
  const active = stepId === activeStepId;

  return (
    <section
      id={`guided-panel-${stepId}`}
      data-testid={`guided-panel-${stepId}`}
      data-active={active ? "true" : "false"}
      data-status={status}
      aria-labelledby={`guided-panel-heading-${stepId}`}
      aria-hidden={active ? undefined : "true"}
      hidden={!active}
      className={cx("grid min-w-0 content-start gap-3", !active && "hidden")}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600">
            Step {getGuidedStepNumber(stepId)} of {GUIDED_STEPS.length}
          </span>
          <span
            data-testid={`guided-panel-status-${stepId}`}
            className={cx(
              "rounded-md border px-2 py-1 text-xs font-semibold",
              toneSurface(guidedStatusTone(status)),
            )}
          >
            {GUIDED_STEP_STATUS_LABELS[status]}
          </span>
        </div>
        <h1
          id={`guided-panel-heading-${stepId}`}
          className="break-words text-2xl font-semibold leading-tight text-zinc-950"
        >
          {step.title}
        </h1>
        <p className="max-w-3xl break-words text-sm leading-6 text-zinc-600">
          {step.description}
        </p>
      </div>
      {children}
    </section>
  );
}

function BlockingStepPlaceholder({ stepId }: { stepId: GuidedStepId }) {
  const step = getGuidedStepById(stepId);

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
        Waiting for market
      </div>
      <h2 className="break-words text-2xl font-semibold leading-tight text-zinc-950">
        {step.title}
      </h2>
      <p className="break-words text-sm leading-6 text-zinc-600">
        Select a market and venue first. This step will become useful once the
        market context is available.
      </p>
    </section>
  );
}

function WorkflowProgressCard({
  activeStepId,
  completedCount,
  remainingCount,
  statuses,
}: {
  activeStepId: GuidedStepId;
  completedCount: number;
  remainingCount: number;
  statuses: Record<GuidedStepId, GuidedStepStatus>;
}) {
  const activeStep = getGuidedStepById(activeStepId);

  return (
    <section
      data-testid="workflow-progress-card"
      className="grid min-w-0 gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
          Progress
        </div>
        <div className="mt-1 break-words text-lg font-semibold leading-tight text-zinc-950">
          {activeStep.title}
        </div>
        <p className="mt-1 break-words text-sm leading-6 text-zinc-600">
          {completedCount} complete · {remainingCount} remaining
        </p>
      </div>
      <div className="grid gap-2">
        {GUIDED_STEPS.map((step) => {
          const status = statuses[step.id];
          return (
            <div
              key={step.id}
              data-testid={`workflow-progress-item-${step.id}`}
              data-status={status}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <span className="min-w-0 break-words text-sm font-semibold text-zinc-800">
                {step.title}
              </span>
              <span className="shrink-0 text-xs font-semibold text-zinc-500">
                {GUIDED_STEP_STATUS_LABELS[status]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function DecisionOperatingSystem({
  state,
  marketOptions,
  selectedMarket,
  onMarketChange,
  onRefresh,
  onContinueUsingCachedData,
  refreshing,
  refreshError,
  marketState,
  marketStatus,
  lastSyncedLabel,
  readinessPct,
  readinessState,
  readinessTone,
  bestOpportunityLabel,
  recommendedAction,
  suggestedExposure,
  mainRisk,
  missingEvidence,
  executiveNarrative,
  readinessWhy,
  readinessImprover,
  readinessBlocker,
  opportunities,
  selectedOpportunityId,
  onSelectOpportunity,
  evidenceLadder,
  workflow,
  actionPlan,
  rawMetrics,
  commitment,
  commitmentChangeExplanation,
  commitmentControls,
}: DecisionOperatingSystemProps) {
  const [selectedGoal, setSelectedGoal] = useState(GUIDE_GOALS[0]);
  const [activeStep, setActiveStep] = useState<GuidedStepId>(
    DEFAULT_GUIDED_STEP_ID,
  );
  const [visitedSteps, setVisitedSteps] = useState<Set<GuidedStepId>>(
    () => new Set([DEFAULT_GUIDED_STEP_ID]),
  );
  function handleStepChange(stepId: GuidedStepId) {
    setActiveStep(stepId);
    setVisitedSteps((current) => {
      const next = new Set(current);
      next.add(stepId);
      return next;
    });
  }

  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedOpportunityId) ??
    opportunities[0] ??
    null;
  const selectedLearning =
    selectedOpportunity?.learning ??
    selectedOpportunity?.decisionIntelligence?.learning ??
    null;
  const trustNumber = parseMetricNumber(metricValue(rawMetrics, "Trust"));
  const confidenceNumber = parseMetricNumber(
    metricValue(rawMetrics, "Confidence"),
  );
  const riskNumber = parseMetricNumber(
    metricValue(rawMetrics, "Risk Pressure"),
  );
  const marketHealthNumber = parseMetricNumber(
    metricValue(rawMetrics, "Market Health"),
  );
  const selectedTone: DecisionTone =
    selectedOpportunity == null
      ? "neutral"
      : selectedOpportunity.readinessPct >= 72
        ? "good"
        : selectedOpportunity.readinessPct >= 48
          ? "warn"
          : "bad";
  const passCount = evidenceLadder.filter(
    (item) => item.status === "Pass",
  ).length;
  const cautionCount = evidenceLadder.filter(
    (item) => item.status === "Caution",
  ).length;
  const failCount = evidenceLadder.filter(
    (item) => item.status === "Fail",
  ).length;
  const topSupport = compactList(
    [
      selectedOpportunity?.support[0],
      selectedOpportunity?.drivers[0],
      readinessWhy,
    ],
    "Evidence is still forming.",
    3,
  );
  const topRisk = compactList(
    [
      selectedOpportunity?.contradictions[0],
      mainRisk,
      selectedOpportunity?.missing[0],
    ],
    "No major risk is being promoted.",
    3,
  );
  const opportunityLabel = selectedOpportunity?.ticker ?? bestOpportunityLabel;
  const trustWord = qualityWord(
    trustNumber ?? selectedOpportunity?.trustPct ?? null,
  );
  const confidenceWord = qualityWord(confidenceNumber);
  const riskPressureWord = riskWord(riskNumber);
  const marketHealthWord = qualityWord(marketHealthNumber);
  const exposureText = displayExposure(suggestedExposure);
  const actionExposureText = displayExposure(actionPlan.exposure);
  const capitalPosture =
    exposureText === "No new allocation"
      ? "capital flat"
      : lowerFirst(exposureText);
  const actionWithExposure =
    exposureText === "No new allocation"
      ? `${recommendedAction}; keep capital flat`
      : `${recommendedAction} with ${exposureText}`;
  const sizeLimitInstruction =
    exposureText === "No new allocation"
      ? "do not add allocation"
      : `do not exceed ${lowerFirst(exposureText)}`;
  const sizeSentence =
    exposureText === "No new allocation"
      ? "Keep capital flat."
      : `Keep size at ${exposureText}.`;
  const missingProofSentence = `Next proof needed: ${cleanSentence(
    lowerFirst(missingEvidence),
  )}`;
  const primaryAnswer = selectedOpportunity
    ? `${recommendedAction}: ${opportunityLabel} is the lead idea. ${sizeSentence} ${missingProofSentence}`
    : `${recommendedAction}: no opportunity deserves capital yet. ${sizeSentence} ${missingProofSentence}`;
  const headerReadiness =
    state.kind === "no-market" ? "No market selected" : readinessState;
  const headerMarket = selectedMarket || "No market selected";
  const systemNotice =
    state.kind === "refreshing" ||
    state.kind === "partial-data" ||
    state.kind === "stale-data"
      ? `${cleanSentence(state.headline)} ${cleanSentence(state.description)}`
      : refreshError;

  const steps = useMemo<InvestmentStep[]>(
    () => [
      {
        id: "intent",
        label: "Intent",
        question: "What decision is being made?",
        headline: selectedOpportunity
          ? `${recommendedAction} ${selectedOpportunity.ticker} at ${exposureText}.`
          : `${recommendedAction}; keep ${capitalPosture}.`,
        answer: cleanSentence(primaryAnswer),
        why: compactList(
          [
            selectedOpportunity?.context,
            selectedOpportunity?.support[0],
            readinessWhy,
            `Current conditions are ${investorCopy(marketState)}.`,
          ],
          "The opportunity list is waiting for market evidence.",
        ),
        evidence: compactList(
          selectedOpportunity
            ? [
                selectedOpportunity.thesis,
                ...selectedOpportunity.support,
                ...selectedOpportunity.drivers,
              ]
            : [executiveNarrative],
          "No opportunity evidence is ready yet.",
        ),
        numbers: rawMetrics.filter((metric) =>
          [
            "Opportunity Density",
            "Market Health",
            "Confidence",
            "Readiness",
          ].includes(metric.label),
        ),
        notes: compactList(
          [
            `Selected market: ${selectedMarket || "Pending"}.`,
            `Last sync: ${lastSyncedLabel}.`,
            `Opportunity count: ${opportunities.length}.`,
            readinessImprover,
          ],
          "No notes are available yet.",
        ),
        nextStep: "Review current conditions before changing allocation.",
        facts: [
          { label: "Opportunity", value: opportunityLabel, tone: selectedTone },
          { label: "Action", value: recommendedAction, tone: readinessTone },
          { label: "Market", value: marketHealthWord, tone: readinessTone },
          { label: "Missing", value: missingEvidence },
        ],
        story: {
          happened: selectedOpportunity
            ? `${selectedOpportunity.ticker} rose to the top of the attention list.`
            : "No clean opportunity has appeared yet.",
          matters: selectedOpportunity
            ? cleanSentence(selectedOpportunity.context)
            : cleanSentence(executiveNarrative),
          next: `${actionWithExposure}; revisit when ${lowerFirst(missingEvidence)} improves.`,
        },
      },
      {
        id: "sense",
        label: "Sense",
        question: "What is the market saying?",
        headline: `${marketHealthWord} current conditions; ${marketStatus}.`,
        answer: cleanSentence(marketState),
        why: compactList(
          [
            marketStatus,
            `Last sync: ${lastSyncedLabel}.`,
            readinessWhy,
            mainRisk,
          ],
          "Current conditions are still loading.",
        ),
        evidence: compactList(
          [
            `Current conditions: ${marketState}.`,
            `Good opportunities: ${metricValue(rawMetrics, "Opportunity Density")}.`,
            `Caution level: ${metricValue(rawMetrics, "Risk Pressure")}.`,
            topSupport[0],
          ],
          "Current-condition evidence is still forming.",
        ),
        numbers: rawMetrics.filter((metric) =>
          [
            "Market Health",
            "Opportunity Density",
            "Risk Pressure",
            "Regime Coverage",
          ].includes(metric.label),
        ),
        notes: compactList(
          [systemNotice, readinessImprover, readinessBlocker],
          "No market notes are available yet.",
        ),
        nextStep: "Check whether a specific opportunity has a live pulse.",
        facts: [
          { label: "Market", value: marketHealthWord, tone: readinessTone },
          { label: "Status", value: marketStatus },
          {
            label: "Caution level",
            value: riskPressureWord,
            tone: riskNumber != null && riskNumber > 65 ? "warn" : "good",
          },
          { label: "Synced", value: lastSyncedLabel },
        ],
        story: {
          happened: `The selected market is ${headerMarket}.`,
          matters: cleanSentence(marketState),
          next: `Keep the action at ${recommendedAction} while the backdrop stays ${lowerFirst(marketHealthWord)}.`,
        },
      },
      {
        id: "pulse",
        label: "Pulse",
        question: "Is there a live opportunity?",
        headline: selectedOpportunity
          ? `${selectedOpportunity.ticker} is the lead opportunity.`
          : "No live opportunity is ready.",
        answer: selectedOpportunity
          ? cleanSentence(selectedOpportunity.context)
          : cleanSentence(executiveNarrative),
        why: compactList(
          [
            selectedOpportunity?.thesis,
            selectedOpportunity?.support[0],
            selectedOpportunity?.drivers[0],
            readinessWhy,
          ],
          "The opportunity pulse is still forming.",
        ),
        evidence: compactList(
          selectedOpportunity
            ? [
                ...selectedOpportunity.support,
                ...selectedOpportunity.drivers,
                ...selectedOpportunity.contradictions,
              ]
            : [executiveNarrative],
          "No opportunity evidence is ready yet.",
        ),
        numbers: rawMetrics.filter((metric) =>
          ["Opportunity Density", "Confidence", "Readiness"].includes(
            metric.label,
          ),
        ),
        notes: compactList(
          [
            selectedOpportunity?.missing[0],
            selectedOpportunity?.invalidations[0],
            readinessImprover,
          ],
          "No pulse notes are available yet.",
        ),
        nextStep: "Focus on the core reason before judging reliability.",
        facts: [
          { label: "Lead", value: opportunityLabel, tone: selectedTone },
          {
            label: "Quality",
            value: displayPct(selectedOpportunity?.qualityPct),
          },
          {
            label: "Timing",
            value: displayPct(selectedOpportunity?.timingPct),
          },
          { label: "Missing", value: missingEvidence },
        ],
        story: {
          happened: selectedOpportunity
            ? `${selectedOpportunity.ticker} has the strongest live pulse.`
            : "The market has not produced a clean live candidate.",
          matters: selectedOpportunity
            ? cleanSentence(selectedOpportunity.thesis)
            : cleanSentence(executiveNarrative),
          next: `Review the reason, then decide whether ${lowerFirst(recommendedAction)} is justified.`,
        },
      },
      {
        id: "core",
        label: "Core",
        question: "What is the core reason?",
        headline: selectedOpportunity
          ? cleanSentence(selectedOpportunity.thesis)
          : cleanSentence(executiveNarrative),
        answer: selectedOpportunity
          ? cleanSentence(selectedOpportunity.context)
          : cleanSentence(readinessWhy),
        why: compactList(
          [
            selectedOpportunity?.support[0],
            selectedOpportunity?.drivers[0],
            topSupport[0],
            readinessWhy,
          ],
          "The core reason is still forming.",
        ),
        evidence: compactList(
          [
            ...(selectedOpportunity?.support ?? []),
            ...(selectedOpportunity?.drivers ?? []),
            ...(selectedOpportunity?.contradictions ?? []),
          ],
          "No core evidence is ready yet.",
        ),
        numbers: rawMetrics.filter((metric) =>
          ["Confidence", "Market Health", "Trust", "Readiness"].includes(
            metric.label,
          ),
        ),
        notes: compactList(
          [topRisk[0], missingEvidence, readinessBlocker],
          "No core notes are available yet.",
        ),
        nextStep: "Judge whether the reason deserves reliability.",
        facts: [
          { label: "Conviction", value: confidenceWord, tone: readinessTone },
          { label: "Support", value: topSupport[0], tone: readinessTone },
          { label: "Risk", value: topRisk[0], tone: "warn" },
          { label: "Missing", value: missingEvidence },
        ],
        story: {
          happened: selectedOpportunity
            ? cleanSentence(selectedOpportunity.thesis)
            : cleanSentence(executiveNarrative),
          matters: selectedOpportunity
            ? cleanSentence(selectedOpportunity.context)
            : cleanSentence(readinessWhy),
          next: "Move from reason to judgement before committing capital.",
        },
      },
      {
        id: "judgement",
        label: "Judgement",
        question: "How reliable is it?",
        headline:
          failCount > 0
            ? "Reliability is limited, so the decision should stay conservative."
            : `${trustWord} reliability supports the recommendation.`,
        answer: `${passCount} checks support the decision, ${cautionCount} need care, and ${failCount} block it.`,
        why: compactList(
          [topSupport[0], topRisk[0], missingEvidence, readinessBlocker],
          "Reliability evidence is still forming.",
        ),
        evidence: evidenceLadder.map(
          (stage) =>
            `${friendlyEvidenceLabel(stage.label)} ${statusLabel(stage.status).toLowerCase()}: ${investorCopy(stage.explanation)}`,
        ),
        numbers: rawMetrics.filter((metric) =>
          [
            "Trust",
            "Confidence",
            "Survival",
            "Calibration",
            "History Depth",
          ].includes(metric.label),
        ),
        notes: compactList(
          evidenceLadder.map(
            (stage) =>
              `${friendlyEvidenceLabel(stage.label)}: ${statusLabel(stage.status)}.`,
          ),
          "No reliability notes are available yet.",
        ),
        nextStep: "Translate that reliability into a position size.",
        facts: [
          {
            label: "Reliability",
            value: trustWord,
            tone: failCount > 0 ? "warn" : readinessTone,
          },
          { label: "Conviction", value: confidenceWord, tone: readinessTone },
          {
            label: "Main risk",
            value: topRisk[0],
            tone:
              topRisk[0] === "No major risk is being promoted."
                ? "good"
                : "warn",
          },
          { label: "Missing", value: missingEvidence },
        ],
        story: {
          happened: `${passCount} pieces of evidence support the current view.`,
          matters:
            failCount > 0
              ? "At least one blocker remains, so taking full risk would ask too much of the evidence."
              : "The evidence is coherent enough to explain, but still needs position-size discipline.",
          next: `Keep the action at ${recommendedAction} until ${lowerFirst(missingEvidence)} is resolved.`,
        },
      },
      {
        id: "sizing",
        label: "Suggested caution level",
        question: "What allocation is sensible?",
        headline: `${exposureText} is the right allocation for now.`,
        answer: cleanSentence(actionPlan.riskConstraints),
        why: compactList(
          [
            actionPlan.portfolioImpact,
            actionPlan.riskConstraints,
            readinessWhy,
            mainRisk,
          ],
          "Suggested allocation is waiting for the current-conditions view.",
        ),
        evidence: compactList(
          [
            actionPlan.portfolioImpact,
            actionPlan.riskConstraints,
            selectedOpportunity?.maxExposureLabel
              ? `Per-asset cap is ${selectedOpportunity.maxExposureLabel}.`
              : "",
            readinessBlocker,
          ],
          "Suggested-allocation evidence is still forming.",
        ),
        numbers: rawMetrics.filter((metric) =>
          [
            "Starter Size",
            "Portfolio Cap",
            "Risk Pressure",
            "Readiness",
          ].includes(metric.label),
        ),
        notes: compactList(
          [readinessBlocker, readinessImprover, actionPlan.invalidation],
          "No allocation notes are available yet.",
        ),
        nextStep: "Turn the size into a concrete action.",
        facts: [
          { label: "Suggested allocation", value: exposureText, tone: readinessTone },
          {
            label: "Caution level",
            value: riskPressureWord,
            tone: riskNumber != null && riskNumber > 65 ? "warn" : "good",
          },
          { label: "Portfolio effect", value: actionPlan.portfolioImpact },
          {
            label: "Limiter",
            value: mainRisk,
            tone: mainRisk === "No active limiter" ? "good" : "warn",
          },
        ],
        story: {
          happened: `The suggested allocation is ${exposureText}.`,
          matters: cleanSentence(actionPlan.riskConstraints),
          next: `${recommendedAction}; ${sizeLimitInstruction} until the limiter changes.`,
        },
      },
      {
        id: "action",
        label: "Action",
        question: "What should I do?",
        headline: `${recommendedAction} now.`,
        answer: cleanSentence(actionPlan.entryLogic),
        why: compactList(
          [
            actionPlan.entryLogic,
            actionPlan.exitConditions,
            actionPlan.invalidation,
            readinessBlocker,
          ],
          "The action plan is waiting for market confirmation.",
        ),
        evidence: compactList(
          [
            actionPlan.entryLogic,
            actionPlan.riskConstraints,
            actionPlan.exitConditions,
            actionPlan.invalidation,
          ],
          "Action evidence is still forming.",
        ),
        numbers: rawMetrics.filter((metric) =>
          ["Readiness", "Confidence", "Trust", "Starter Size"].includes(
            metric.label,
          ),
        ),
        notes: [
          `Entry rule: ${investorCopy(actionPlan.entryLogic)}`,
          `Risk rule: ${investorCopy(actionPlan.riskConstraints)}`,
          `Exit rule: ${investorCopy(actionPlan.exitConditions)}`,
          `Change your mind if: ${investorCopy(actionPlan.invalidation)}`,
        ],
        nextStep: "Review the outcome after the next market update.",
        facts: [
          { label: "Action", value: recommendedAction, tone: readinessTone },
          { label: "Asset", value: actionPlan.asset },
          { label: "Allocation", value: actionExposureText, tone: readinessTone },
          { label: "Stop reviewing if", value: actionPlan.invalidation },
        ],
        story: {
          happened: `The current recommendation is ${recommendedAction}.`,
          matters: cleanSentence(actionPlan.entryLogic),
          next: cleanSentence(actionPlan.exitConditions),
        },
      },
      {
        id: "reflection",
        label: "Reflection",
        question: "What should change my mind?",
        headline: cleanSentence(actionPlan.invalidation),
        answer: `Next action: ${investorCopy(actionPlan.nextAction)}.`,
        why: compactList(
          [
            actionPlan.invalidation,
            actionPlan.exitConditions,
            readinessImprover,
            readinessBlocker,
          ],
          "Reflection evidence is still forming.",
        ),
        evidence: compactList(
          [
            ...(selectedOpportunity?.invalidations ?? []),
            ...(selectedOpportunity?.missing ?? []),
            actionPlan.exitConditions,
            actionPlan.invalidation,
          ],
          "No reflection evidence is ready yet.",
        ),
        numbers: rawMetrics.filter((metric) =>
          [
            "Calibration",
            "History Depth",
            "Regime Coverage",
            "Readiness",
          ].includes(metric.label),
        ),
        notes: compactList(
          [systemNotice, `Last sync: ${lastSyncedLabel}.`, readinessImprover],
          "No reflection notes are available yet.",
        ),
        nextStep: "Review the outcome after the next market update.",
        facts: [
          { label: "Next action", value: actionPlan.nextAction },
          {
            label: "Invalidation",
            value: actionPlan.invalidation,
            tone: "warn",
          },
          { label: "Exit", value: actionPlan.exitConditions },
          { label: "Improve when", value: readinessImprover },
        ],
        story: {
          happened: `The current recommendation is ${recommendedAction}.`,
          matters: cleanSentence(actionPlan.invalidation),
          next: cleanSentence(actionPlan.exitConditions),
        },
      },
    ],
    [
      actionPlan,
      capitalPosture,
      cautionCount,
      confidenceWord,
      evidenceLadder,
      executiveNarrative,
      failCount,
      headerMarket,
      lastSyncedLabel,
      mainRisk,
      marketHealthWord,
      marketState,
      marketStatus,
      missingEvidence,
      opportunities.length,
      opportunityLabel,
      passCount,
      primaryAnswer,
      rawMetrics,
      readinessBlocker,
      readinessImprover,
      readinessTone,
      readinessWhy,
      recommendedAction,
      riskNumber,
      riskPressureWord,
      selectedMarket,
      selectedOpportunity,
      selectedTone,
      systemNotice,
      exposureText,
      actionExposureText,
      actionWithExposure,
      sizeLimitInstruction,
      topRisk,
      topSupport,
      trustWord,
    ],
  );

  const trustTone: DecisionTone =
    failCount > 0
      ? "bad"
      : cautionCount > 0
        ? "warn"
        : passCount > 0
          ? "good"
          : "neutral";
  const readinessProgress = boundedPct(readinessPct);
  const evidencePreview = evidenceLadder.slice(0, 5);
  const reasonSummary = selectedOpportunity
    ? cleanSentence(selectedOpportunity.context || selectedOpportunity.thesis)
    : cleanSentence(executiveNarrative || readinessWhy);
  const supportSummary = compactList(
    [
      selectedOpportunity?.thesis,
      selectedOpportunity?.support[0],
      selectedOpportunity?.drivers[0],
      readinessWhy,
    ],
    "The supporting reason is still forming.",
    4,
  );
  const riskSummary = compactList(
    [
      mainRisk,
      selectedOpportunity?.contradictions[0],
      selectedOpportunity?.missing[0],
      readinessBlocker,
    ],
    "No major risk is being promoted.",
    4,
  );
  const trustSummary = `${passCount} supports / ${cautionCount} caution / ${failCount} block`;
  const nextStep =
    actionPlan.nextAction ||
    steps.find((step) => step.id === "action")?.nextStep ||
    "Review after the next market update.";
  const secondaryMetrics = rawMetrics.filter((metric) =>
    [
      "Confidence",
      "Coherence",
      "Consensus",
            "Trust",
            "Conviction",
            "Risk Pressure",
            "Market Health",
            "Simulation",
            "Wisdom",
            "Action Scale",
            "Outcome Accuracy",
            "Readiness",
            "Decision Readiness",
            "Starter Size",
            "Portfolio Cap",
            "Portfolio Contribution",
            "Similar Regimes",
            "Survival",
      "Calibration",
      "History Depth",
      "Regime Coverage",
    ].includes(metric.label),
  );
  const confidenceRange = createConfidenceRange({
    confidence: confidenceNumber,
    trust: trustNumber,
    cautionCount,
    failCount,
  });
  const displaySecondaryMetrics = secondaryMetrics.map((metric) =>
    metric.label === "Confidence"
      ? { ...metric, value: confidenceRange.label }
      : metric,
  );
  const guideTone = readinessTone as GuideTone;
  const selectedMarketName =
    marketOptions.find((market) => market.value === selectedMarket)?.label ??
    selectedMarket ??
    "No market selected";
  const marketAndVenueSelected = Boolean(
    selectedMarket && selectedMarketName !== "No market selected",
  );
  const stepStatuses = createGuidedStepStatuses({
    activeStepId: activeStep,
    visitedStepIds: visitedSteps,
    marketAndVenueSelected,
  });
  const completedStepCount = GUIDED_STEPS.filter(
    (step) => stepStatuses[step.id] === "completed",
  ).length;
  const remainingStepCount = GUIDED_STEPS.length - completedStepCount;
  const safeRecommendation = recommendedNextStep({
    action: recommendedAction,
    exposureText,
    failCount,
    risk: riskNumber,
    missingEvidence,
  });
  const unknownItems = compactList(
    [
      missingEvidence,
      selectedOpportunity?.missing[0],
      evidenceLadder.find((stage) => stage.status === "Caution")?.explanation,
      evidenceLadder.find((stage) => stage.status === "Fail")?.explanation,
      "Market participation",
      "Liquidity conditions",
      "Macro events",
      "Unexpected catalysts",
    ],
    "Market participation",
    6,
  );
  const focusItems = compactList(
    [
      topSupport[0],
      "Protect capital first.",
      "Trade only high-quality opportunities.",
      "Stay selective.",
      "Keep risk small and consistent.",
    ],
    "Stay selective.",
    5,
  );
  const optionSupports = compactList(
    [selectedOpportunity?.support[0], topSupport[0], readinessImprover],
    "Wait for stronger confirmation.",
    4,
  );
  const optionRisks = compactList(
    [
      selectedOpportunity?.contradictions[0],
      mainRisk,
      missingEvidence,
      "Chasing moves before confirmation.",
    ],
    "Chasing moves before confirmation.",
    4,
  );
  const guideMarketFacts: GuideFact[] = [
    { label: "Market", value: selectedMarketName || "Pending" },
    { label: "Status", value: marketStatus },
    { label: "Updated", value: lastSyncedLabel },
  ];
  const realityFacts: GuideFact[] = [
    { label: "Current conditions", value: marketHealthWord, tone: guideTone },
    {
      label: "Caution level",
      value: riskPressureWord,
      tone: riskNumber != null && riskNumber > 65 ? "warn" : "good",
    },
    { label: "Reliability", value: trustWord, tone: trustTone },
    { label: "Suggested allocation", value: exposureText, tone: guideTone },
  ];
  const progressSignals = processProgress({
    readiness: readinessProgress,
    risk: riskNumber,
    confidenceRange,
    hasExposure: exposureText !== "No new allocation",
  });
  const reviewCheckpoints = compactList(
    [
      `Before acting, confirm ${lowerFirst(missingEvidence)}.`,
      actionPlan.riskConstraints,
      actionPlan.invalidation,
      `Review again after ${lastSyncedLabel}.`,
    ],
    "Review after the next market update.",
    4,
  );
  const testedSummary =
    workflow.find((step) => step.id === "size")?.detail ||
    "Signal compared acting fully, acting smaller, waiting, and blocking action.";
  const whySummary =
    reasonSummary ||
    "The recommendation balances opportunity, risk, and survival.";
  const similarDecisionLesson =
    selectedLearning?.narrative?.whatChanged ||
    selectedOpportunity?.decisionIntelligence?.memory?.summary ||
    "Signal has seen similar situations before. Past outcomes increased confidence slightly.";
  const learningSummary = `${similarDecisionLesson} Signal will remember this decision and compare it with the result later.`;
  const guideSteps = defaultGuideSteps({
    goal: selectedGoal,
    reality: `${marketHealthWord} backdrop with ${riskPressureWord.toLowerCase()} risk.`,
    focus: optionSupports[0] ?? "Wait for better confirmation.",
    options:
      selectedOpportunity?.drivers[0] ??
      "Signal is preparing for several possible paths.",
    tested: testedSummary,
    recommendation: safeRecommendation,
    why: whySummary,
    review: learningSummary,
    tone: guideTone,
  });
  const refreshNotice = systemNotice;
  const blockingState =
    state.kind === "no-market" ||
    state.kind === "connection-lost" ||
    state.kind === "initial-loading" ||
    state.kind === "error";
  return (
    <div
      data-testid="decision-operating-system"
      data-state-kind={state.kind}
      data-overflow-policy="contained-app-shell"
      className="signal-shell grid h-dvh min-h-dvh max-h-dvh w-full max-w-full grid-rows-[52px_minmax(0,1fr)] overflow-hidden bg-[#f3f4f1] text-zinc-950"
    >
      <header className="h-[52px] shrink-0 border-b border-zinc-200 bg-white/95">
        <div className="mx-auto flex h-[52px] w-full max-w-[1880px] items-center gap-3 overflow-hidden px-3 lg:px-4">
          <div className="shrink-0 text-sm font-semibold tracking-normal text-zinc-950">
            Signal
          </div>

          {selectedMarket ? (
            <div className="ml-auto flex min-w-0 shrink items-center gap-2">
              <span className="hidden text-xs font-semibold uppercase tracking-normal text-zinc-500 sm:inline">
                Choose market
              </span>
              <select
                value={selectedMarket}
                onChange={(event) => onMarketChange(event.target.value)}
                aria-label="Current market"
                className="h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 outline-none sm:w-[190px]"
              >
                {selectedMarket &&
                !marketOptions.some((market) => market.value === selectedMarket) ? (
                  <option value={selectedMarket}>{selectedMarketName}</option>
                ) : null}
                {marketOptions.map((market) => (
                  <option key={market.value} value={market.value}>
                    {market.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-950 bg-zinc-950 px-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                <RefreshCw
                  className={cx("h-4 w-4", refreshing && "animate-spin")}
                />
                <span className="hidden sm:inline">Update</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {state.kind === "initial-loading" ? (
        <InitialLoadingState />
      ) : blockingState ? (
        <BlockingStateScreen
          state={state}
          marketOptions={marketOptions}
          onMarketChange={onMarketChange}
          onRefresh={onRefresh}
          onContinueUsingCachedData={onContinueUsingCachedData}
          guideSteps={guideSteps}
          activeStep={activeStep}
          stepStatuses={stepStatuses}
          completedStepCount={completedStepCount}
          remainingStepCount={remainingStepCount}
          onStepChange={handleStepChange}
        />
      ) : (
        <main
          data-testid="decision-main-scroll"
          data-scroll-region="decision-main"
          className="signal-scroll-region mx-auto grid h-full min-h-0 w-full max-w-[1640px] content-start gap-3 overflow-y-auto overflow-x-hidden px-3 py-3 lg:px-4"
        >
          {refreshNotice ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
              {investorCopy(refreshNotice)}
            </section>
          ) : null}

          <GuideLayout
            stepRail={
              <StepRail
                steps={guideSteps}
                activeStepId={activeStep}
                stepStatuses={stepStatuses}
                completedCount={completedStepCount}
                remainingCount={remainingStepCount}
                onStepChange={handleStepChange}
              />
            }
            primary={
              <>
                <GuidedStepPanel
                  stepId="choose-market"
                  activeStepId={activeStep}
                  status={stepStatuses["choose-market"]}
                >
                  <GoalCard
                    goal={selectedGoal}
                    goals={GUIDE_GOALS}
                    onGoalChange={setSelectedGoal}
                    marketLabel={selectedMarketName || "Market pending"}
                    supportingText={`Every recommendation is judged against this goal. Signal guides the decision; you decide whether the evidence fits your plan.`}
                  />
                </GuidedStepPanel>

                <GuidedStepPanel
                  stepId="review-current-conditions"
                  activeStepId={activeStep}
                  status={stepStatuses["review-current-conditions"]}
                >
                  <RealityCheckCard
                    facts={realityFacts}
                    narrative={`${investorCopy(marketState)}. ${investorCopy(readinessWhy)}`}
                  />

                  <ConfidenceRange
                    low={confidenceRange.low}
                    high={confidenceRange.high}
                    label={confidenceRange.label}
                    explanation={confidenceRange.explanation}
                  />

                  <FocusCard items={focusItems} />
                  <UnknownsCard unknowns={unknownItems} />
                  <ProgressCard items={progressSignals} />
                </GuidedStepPanel>

                <GuidedStepPanel
                  stepId="explore-opportunities"
                  activeStepId={activeStep}
                  status={stepStatuses["explore-opportunities"]}
                >
                  <OptionCard
                    supports={optionSupports}
                    worksAgainst={optionRisks}
                  />

                  <section
                    data-testid="opportunity-review"
                    data-overflow-policy="bounded-opportunity-panel"
                    className="grid min-w-0 content-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                        Lead opportunity
                      </div>
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 break-words text-3xl font-semibold leading-tight text-zinc-950">
                            {opportunityLabel}
                          </div>
                          <div
                            className={cx(
                              "mt-1 break-words text-sm font-semibold",
                              toneText(selectedTone),
                            )}
                          >
                            {selectedOpportunity
                              ? `${investorCopy(selectedOpportunity.action)} - ${displayExposure(selectedOpportunity.exposureLabel)}`
                              : actionExposureText}
                          </div>
                        </div>
                        <span
                          className={cx(
                            "shrink-0 rounded-md border px-2 py-1 text-xs font-semibold",
                            toneSurface(selectedTone),
                          )}
                        >
                          {selectedOpportunity
                            ? displayPct(selectedOpportunity.readinessPct)
                            : "Pending"}
                        </span>
                      </div>
                    </div>

                    <p className="break-words text-sm leading-6 text-zinc-600">
                      {selectedOpportunity
                        ? cleanSentence(
                            selectedOpportunity.thesis ||
                              selectedOpportunity.context,
                          )
                        : "No opportunity deserves capital yet."}
                    </p>

                    <details className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50">
                      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-zinc-950 marker:hidden [&::-webkit-details-marker]:hidden">
                        Other opportunities
                      </summary>
                      <div className="px-3 pb-3">
                        <OpportunityPicker
                          opportunities={opportunities}
                          selectedOpportunityId={selectedOpportunityId}
                          onSelectOpportunity={onSelectOpportunity}
                        />
                      </div>
                    </details>
                  </section>
                </GuidedStepPanel>

                <GuidedStepPanel
                  stepId="understand-reasoning"
                  activeStepId={activeStep}
                  status={stepStatuses["understand-reasoning"]}
                >
                  <FocusCard
                    title="What Signal Tested"
                    items={compactList(
                      [
                        testedSummary,
                        actionPlan.portfolioImpact,
                        actionPlan.riskConstraints,
                      ],
                      "Signal compared acting fully, acting smaller, waiting, and blocking action.",
                      3,
                    )}
                  />

                  <DisclosurePanel
                    title="Why"
                    summary={reasonSummary}
                    defaultOpen
                    testId="decision-summary-panel"
                  >
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                          Supports
                        </div>
                        <div className="mt-2 grid gap-2">
                          {supportSummary.map((item) => (
                            <p
                              key={item}
                              className="break-words text-sm leading-6 text-zinc-700"
                            >
                              {investorCopy(item)}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                          Watch
                        </div>
                        <div className="mt-2 grid gap-2">
                          {riskSummary.map((item) => (
                            <p
                              key={item}
                              className="break-words text-sm leading-6 text-zinc-700"
                            >
                              {investorCopy(item)}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DisclosurePanel>

                  <DisclosurePanel
                    title="Evidence"
                    summary={trustSummary}
                    testId="evidence-summary-panel"
                  >
                    <div className="grid gap-2">
                      {(evidenceLadder.length ? evidenceLadder : evidencePreview).map(
                        (stage) => (
                          <div
                            key={stage.id}
                            className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-sm leading-5 text-zinc-700"
                          >
                            <span
                              className={cx(
                                "grid h-6 w-6 place-items-center rounded-md",
                                statusTone(stage.status) === "good" &&
                                  "bg-emerald-50 text-emerald-700",
                                statusTone(stage.status) === "warn" &&
                                  "bg-amber-50 text-amber-700",
                                statusTone(stage.status) === "bad" &&
                                  "bg-red-50 text-red-700",
                              )}
                            >
                              {statusIcon(stage.status)}
                            </span>
                            <span className="min-w-0">
                              <span className="block break-words font-semibold text-zinc-950">
                                {friendlyEvidenceLabel(stage.label)}
                              </span>
                              <span className="block break-words text-zinc-600">
                                {investorCopy(stage.explanation)}
                              </span>
                            </span>
                            <span
                              className={cx(
                                "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                                toneSurface(statusTone(stage.status)),
                              )}
                            >
                              {statusLabel(stage.status)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </DisclosurePanel>

                  <InvestorLearningPanel learning={selectedLearning} />

                  <DisclosurePanel
                    title="Decision path"
                    summary={`${guideSteps.length} guide steps behind the recommendation`}
                    testId="workflow-detail-panel"
                  >
                    <div className="grid gap-2">
                      {guideSteps.map((step, index) => (
                        <div
                          key={step.id}
                          className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-700">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                                {index + 1}/{guideSteps.length}
                              </span>
                              <span className="break-words text-sm font-semibold text-zinc-950">
                                {step.label}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-sm leading-6 text-zinc-700">
                              {step.summary}
                            </p>
                          </div>
                        </div>
                      ))}
                      {workflow.length ? (
                        <div className="grid gap-2 border-t border-zinc-200 pt-3">
                          {workflow.map((step) => (
                            <div
                              key={step.id}
                              className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="break-words text-sm font-semibold text-zinc-950">
                                  {investorCopy(step.label)}
                                </div>
                                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600">
                                  {investorCopy(step.status)}
                                </span>
                              </div>
                              <p className="mt-1 break-words text-sm leading-6 text-zinc-700">
                                {investorCopy(step.output)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </DisclosurePanel>
                </GuidedStepPanel>

                <GuidedStepPanel
                  stepId="decide-what-to-do"
                  activeStepId={activeStep}
                  status={stepStatuses["decide-what-to-do"]}
                >
                  {commitmentControls ? (
                    <CommitmentClientPanel
                      commitment={commitment}
                      changeExplanation={commitmentChangeExplanation}
                      controls={commitmentControls}
                    />
                  ) : null}

                  <RecommendationCard
                    recommendation={safeRecommendation}
                    rationale={`${cleanSentence(primaryAnswer)} ${cleanSentence(readinessBlocker)}`}
                    nextReview={nextStep}
                    tone={guideTone}
                  />

                  <PlanReviewCard checkpoints={reviewCheckpoints} />

                  <DisclosurePanel
                    title="Action plan"
                    summary={nextStep}
                    testId="action-plan-panel"
                  >
                    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                      {[
                        ["Asset", actionPlan.asset],
                        ["Direction", actionPlan.direction],
                        ["Allocation", actionExposureText],
                        ["Entry", actionPlan.entryLogic],
                        ["Risk rule", actionPlan.riskConstraints],
                        ["Exit", actionPlan.exitConditions],
                        ["Change your mind if", actionPlan.invalidation],
                        ["Portfolio effect", actionPlan.portfolioImpact],
                      ].map(([label, value]) => (
                        <FactTile key={label} label={label} value={value} />
                      ))}
                    </div>
                  </DisclosurePanel>

                  <DisclosurePanel
                    title="Metrics"
                    summary="Secondary context"
                    testId="supporting-numbers-panel"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(displaySecondaryMetrics.length
                        ? displaySecondaryMetrics
                        : rawMetrics
                      ).map((metric) => (
                        <div
                          key={metric.label}
                          className="grid min-h-[92px] min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 break-words text-xs font-medium text-zinc-500">
                              {friendlyMetricLabel(metric.label)}
                            </div>
                            <div className="shrink-0 break-words text-sm font-semibold text-zinc-950">
                              {metric.value}
                            </div>
                          </div>
                          <p className="mt-1 break-words text-xs leading-5 text-zinc-700">
                            {metricGuidance(metric)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </DisclosurePanel>

                  <UserControlCard />
                </GuidedStepPanel>
              </>
            }
            secondary={
              <>
                <WorkflowProgressCard
                  activeStepId={activeStep}
                  completedCount={completedStepCount}
                  remainingCount={remainingStepCount}
                  statuses={stepStatuses}
                />

                <MarketContextCard
                  selectedMarket={selectedMarketName}
                  facts={guideMarketFacts}
                />
              </>
            }
          />
        </main>
      )}
    </div>
  );
}
