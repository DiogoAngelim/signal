import type { DashboardViewState } from "@/lib/dashboard-state";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clock,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Wallet,
  WifiOff,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

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
    .replace(/\bgovernance evidence\b/gi, "permission evidence")
    .replace(/\bgovernance\b/gi, "safety review")
    .replace(/\bcalibration\b/gi, "recent reliability")
    .replace(/\bdiscovery\b/gi, "opportunity search")
    .replace(/\bagency\b/gi, "decision control")
    .replace(/\brecognition\b/gi, "similar past situations")
    .replace(/\brecovery\b/gi, "return to normal size")
    .replace(/\bresolve\b/gi, "final decision")
    .replace(/\bsurvival memory\b/gi, "loss history")
    .replace(/\bsurvival\b/gi, "loss safety")
    .replace(/\bmarket breadth\b/gi, "market participation")
    .replace(/\bbreadth\b/gi, "market participation")
    .replace(/\bregime\b/gi, "market backdrop")
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
  if (!normalized) return "No new exposure";
  if (/^(wait|none|no exposure|0%|0\.0%)$/i.test(normalized)) {
    return "No new exposure";
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
  if (normalized.includes("market")) return "Market backdrop";
  if (normalized.includes("recognition")) return "Similar past situations";
  if (normalized.includes("signal")) return "Signals agree";
  if (normalized.includes("opportunity")) return "Opportunity quality";
  if (normalized.includes("risk")) return "Risk control";
  if (normalized.includes("survival")) return "Loss history";
  if (normalized.includes("recovery")) return "Return to normal size";
  if (normalized.includes("calibration")) return "Recent reliability";
  if (normalized.includes("liquidity")) return "Trading conditions";
  if (normalized.includes("governance")) return "Safety review";
  if (normalized.includes("agency")) return "Decision control";
  if (normalized.includes("resolve")) return "Final decision";
  if (normalized.includes("execution")) return "Trading quality";
  if (normalized.includes("readiness")) return "Decision readiness";
  return investorCopy(label);
}

function friendlyMetricLabel(label: string) {
  if (label === "Confidence") return "Conviction";
  if (label === "Trust") return "Reliability";
  if (label === "Market Health") return "Market backdrop";
  if (label === "Opportunity Density") return "Opportunity flow";
  if (label === "Risk Pressure") return "Risk pressure";
  if (label === "Readiness") return "Action readiness";
  if (label === "Portfolio Cap") return "Portfolio limit";
  if (label === "Starter Size") return "Starting size";
  if (label === "Survival") return "Loss safety";
  if (label === "Calibration") return "Recent reliability";
  if (label === "History Depth") return "Historical depth";
  if (label === "Regime Coverage") return "Market coverage";
  return investorCopy(label);
}

function metricGuidance(metric: DecisionRawMetric) {
  const number = parseMetricNumber(metric.value);
  switch (metric.label) {
    case "Confidence":
      if (number == null) return "Conviction is still forming.";
      if (number >= 70)
        return "The system has enough conviction to support the recommendation.";
      if (number >= 45)
        return "Conviction is mixed, so keep the action measured.";
      return "Conviction is weak. Wait for better confirmation.";
    case "Trust":
      if (number == null) return "Reliability evidence is still pending.";
      if (number >= 70)
        return "Reliability is strong enough to consider the suggested size.";
      if (number >= 45)
        return "Reliability is only partial. Keep size limited.";
      return "Reliability is too weak for new exposure.";
    case "Market Health":
      if (number == null) return "The market backdrop is still loading.";
      if (number >= 70)
        return "The market backdrop supports cautious participation.";
      if (number >= 45)
        return "The market backdrop is improving, but confirmation is incomplete.";
      return "The market backdrop is weak. Protect capital.";
    case "Opportunity Density":
      if (number == null) return "Opportunity flow is still loading.";
      if (number >= 65)
        return "Enough good opportunities are appearing to stay engaged.";
      if (number >= 35)
        return "Good opportunities are limited. Be selective.";
      return "Few opportunities are strong enough. Wait.";
    case "Risk Pressure":
      if (number == null) return "Risk pressure is still loading.";
      if (number >= 70) return "Risk is elevated. Keep exposure defensive.";
      if (number >= 45) return "Risk is manageable only with disciplined size.";
      return "Risk looks contained for the suggested action.";
    case "Readiness":
      if (number == null) return "The decision is still forming.";
      if (number >= 70)
        return "The evidence is close enough to act inside the suggested size.";
      if (number >= 45)
        return "Prepare, but wait for the missing evidence before adding risk.";
      return "Do not act yet. The decision is not ready.";
    case "Portfolio Cap":
      return "Do not exceed this total portfolio exposure for now.";
    case "Starter Size":
      return "Use this as the first size only if the recommendation allows action.";
    case "Survival":
      if (number == null) return "Loss-history protection is still pending.";
      if (number >= 70)
        return "Loss history supports the current risk boundary.";
      if (number >= 45)
        return "Loss history argues for reduced size.";
      return "Loss history argues against adding risk.";
    case "Calibration":
      if (number == null) return "Recent reliability is still pending.";
      if (number >= 70)
        return "Recent reliability supports the recommendation.";
      if (number >= 45)
        return "Recent reliability is mixed. Keep the decision cautious.";
      return "Recent reliability is weak. Wait for cleaner outcomes.";
    case "History Depth":
      if (number == null) return "Comparable history is still pending.";
      if (number >= 70) return "There is enough history to support the view.";
      if (number >= 45) return "History is usable, but not deep enough for full size.";
      return "History is too thin. Keep the decision conservative.";
    case "Regime Coverage":
      if (number == null) return "Market coverage is still pending.";
      if (number >= 70)
        return "The view has held up across enough market backdrops.";
      if (number >= 45)
        return "Coverage is partial. Avoid stretching the size.";
      return "Coverage is too narrow. Wait for broader proof.";
    default:
      return "This number supports the recommendation but should not lead it.";
  }
}

const MARKET_ENTRY_OPTIONS = [
  { label: "Binance", match: /binance|crypto/i, fallback: "BINANCE" },
  {
    label: "Stocks",
    match: /stock|stocks|nasdaq|nyse|amex|us\b/i,
    fallback: "US",
  },
  { label: "ETFs", match: /etf|fund/i, fallback: "ETF" },
  { label: "Forex", match: /forex|fx|currency/i, fallback: "FOREX" },
  { label: "Futures", match: /future|futures/i, fallback: "FUTURES" },
];

function marketEntryValue(
  entry: (typeof MARKET_ENTRY_OPTIONS)[number],
  marketOptions: Array<{ value: string; label: string }>,
) {
  const match = marketOptions.find(
    (market) =>
      entry.match.test(market.value) || entry.match.test(market.label),
  );
  return match?.value ?? entry.fallback;
}

function primaryMarketValue(
  marketOptions: Array<{ value: string; label: string }>,
) {
  const stocks = MARKET_ENTRY_OPTIONS.find((entry) => entry.label === "Stocks");
  return stocks
    ? marketEntryValue(stocks, marketOptions)
    : (marketOptions[0]?.value ?? "US");
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
}: {
  state: DashboardViewState;
  marketOptions: Array<{ value: string; label: string }>;
  onMarketChange: (market: string) => void;
  onRefresh: () => void;
  onContinueUsingCachedData?: () => void;
}) {
  const [showPrimer, setShowPrimer] = useState(false);
  const isNoMarket = state.kind === "no-market";
  const isConnectionLost = state.kind === "connection-lost";
  const isError = state.kind === "error";
  const isEmpty = state.kind === "empty-results";

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

        {isNoMarket ? (
          <div className="grid gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-500">
                Available options
              </div>
              <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {MARKET_ENTRY_OPTIONS.map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    onClick={() =>
                      onMarketChange(marketEntryValue(entry, marketOptions))
                    }
                    className="min-h-14 min-w-0 break-words rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm font-semibold text-zinc-900 transition hover:border-zinc-950 hover:bg-white"
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              data-overflow-policy="sticky-state-actions"
              className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur sm:flex-row md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none"
            >
              <StateActionButton
                icon={<Target className="h-4 w-4" />}
                onClick={() =>
                  onMarketChange(primaryMarketValue(marketOptions))
                }
              >
                Select Market
              </StateActionButton>
              <StateActionButton
                icon={<BookOpen className="h-4 w-4" />}
                variant="secondary"
                onClick={() => setShowPrimer((current) => !current)}
              >
                Learn How Signal Works
              </StateActionButton>
            </div>

            {showPrimer ? (
              <div className="max-w-3xl rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
                Signal ranks a selected market by opportunity quality, trust,
                sizing permission, and action readiness before suggesting any
                exposure.
              </div>
            ) : null}
          </div>
        ) : null}

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
                {opportunity.action} at {opportunity.exposureLabel}
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
}: DecisionOperatingSystemProps) {
  const [activeStepId, setActiveStepId] =
    useState<DecisionPhaseId>("intent");

  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedOpportunityId) ??
    opportunities[0] ??
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
  const workflowStatus = Object.fromEntries(
    workflow.map((step) => [step.id, step.status]),
  ) as Partial<Record<DecisionStepId, string>>;
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
    exposureText === "No new exposure"
      ? "capital flat"
      : lowerFirst(exposureText);
  const sizePosture =
    exposureText === "No new exposure"
      ? "capital stays flat"
      : `size stays at ${exposureText}`;
  const actionWithExposure =
    exposureText === "No new exposure"
      ? `${recommendedAction}; keep capital flat`
      : `${recommendedAction} with ${exposureText}`;
  const sizeLimitInstruction =
    exposureText === "No new exposure"
      ? "do not add exposure"
      : `do not exceed ${lowerFirst(exposureText)}`;
  const primaryAnswer = selectedOpportunity
    ? `${recommendedAction}: ${opportunityLabel} deserves review, but ${sizePosture} until ${lowerFirst(missingEvidence)} improves.`
    : `${recommendedAction}: no opportunity deserves capital yet; keep ${capitalPosture} until ${lowerFirst(missingEvidence)} improves.`;
  const headerReadiness =
    state.kind === "no-market" ? "No market selected" : readinessState;
  const headerMarket = selectedMarket || "No market selected";
  const systemNotice =
    state.kind === "refreshing" || state.kind === "partial-data"
      ? `${state.headline}: ${state.description}`
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
            `The market backdrop is ${investorCopy(marketState)}.`,
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
        nextStep: "Sense the market backdrop before changing risk.",
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
        headline: `${marketHealthWord} market backdrop; ${marketStatus}.`,
        answer: cleanSentence(marketState),
        why: compactList(
          [
            marketStatus,
            `Last sync: ${lastSyncedLabel}.`,
            readinessWhy,
            mainRisk,
          ],
          "Market context is still loading.",
        ),
        evidence: compactList(
          [
            `Market backdrop: ${marketState}.`,
            `Opportunity flow is ${metricValue(rawMetrics, "Opportunity Density")}.`,
            `Risk pressure is ${metricValue(rawMetrics, "Risk Pressure")}.`,
            topSupport[0],
          ],
          "Market evidence is still forming.",
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
            label: "Risk pressure",
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
        nextStep: "Focus on the core reason before judging trust.",
        facts: [
          { label: "Lead", value: opportunityLabel, tone: selectedTone },
          { label: "Quality", value: displayPct(selectedOpportunity?.qualityPct) },
          { label: "Timing", value: displayPct(selectedOpportunity?.timingPct) },
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
        nextStep: "Judge whether the reason deserves trust.",
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
        question: "Can I trust it?",
        headline:
          failCount > 0
            ? "Trust is limited, so the decision should stay conservative."
            : `${trustWord} trust supports the recommendation.`,
        answer: `${passCount} checks support the decision, ${cautionCount} need care, and ${failCount} block it.`,
        why: compactList(
          [topSupport[0], topRisk[0], missingEvidence, readinessBlocker],
          "Trust evidence is still forming.",
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
          "No trust notes are available yet.",
        ),
        nextStep: "Translate that trust into a position size.",
        facts: [
          {
            label: "Trust",
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
              : "The evidence is coherent enough to explain, but still needs sizing discipline.",
          next: `Keep the action at ${recommendedAction} until ${lowerFirst(missingEvidence)} is resolved.`,
        },
      },
      {
        id: "sizing",
        label: "Sizing",
        question: "How much should I risk?",
        headline: `${exposureText} is the right size for now.`,
        answer: cleanSentence(actionPlan.riskConstraints),
        why: compactList(
          [
            actionPlan.portfolioImpact,
            actionPlan.riskConstraints,
            readinessWhy,
            mainRisk,
          ],
          "Sizing is waiting for the risk view.",
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
          "Sizing evidence is still forming.",
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
          "No sizing notes are available yet.",
        ),
        nextStep: "Turn the size into a concrete action.",
        facts: [
          { label: "Suggested size", value: exposureText, tone: readinessTone },
          {
            label: "Risk pressure",
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
          happened: `The recommended size is ${exposureText}.`,
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
          { label: "Size", value: actionExposureText, tone: readinessTone },
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
          ["Calibration", "History Depth", "Regime Coverage", "Readiness"].includes(
            metric.label,
          ),
        ),
        notes: compactList(
          [systemNotice, `Last sync: ${lastSyncedLabel}.`, readinessImprover],
          "No reflection notes are available yet.",
        ),
        nextStep: "Review the outcome after the next market update.",
        facts: [
          { label: "Next action", value: actionPlan.nextAction },
          { label: "Invalidation", value: actionPlan.invalidation, tone: "warn" },
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

  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId),
  );
  const activeStep = steps[activeIndex] ?? steps[0];
  const phaseStatus: Record<DecisionPhaseId, string> = {
    intent: headerReadiness,
    sense: marketStatus,
    pulse: selectedOpportunity ? opportunityLabel : "Waiting",
    core: confidenceWord,
    judgement: workflowStatus.trust ?? trustWord,
    sizing: exposureText,
    action: recommendedAction,
    reflection: lastSyncedLabel,
  };
  const visibleReason = compactList(
    activeStep.why,
    "The reason is still forming.",
    3,
  );
  const visibleDiagnostics = compactList(
    [systemNotice, ...activeStep.notes],
    "No extra cautions are active.",
    4,
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

  const blockingState =
    state.kind === "no-market" ||
    state.kind === "connection-lost" ||
    state.kind === "initial-loading" ||
    state.kind === "empty-results" ||
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

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="hidden text-xs font-semibold uppercase tracking-normal text-zinc-500 sm:inline">
              Market
            </span>
            <select
              value={selectedMarket}
              onChange={(event) => onMarketChange(event.target.value)}
              aria-label="Current market"
              className="h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 outline-none sm:w-[180px]"
            >
              {!selectedMarket ? (
                <option value="">
                  {marketOptions.length ? "Select market" : "Loading markets"}
                </option>
              ) : null}
              {selectedMarket && !marketOptions.length ? (
                <option value="">Loading markets</option>
              ) : null}
              {marketOptions.map((market) => (
                <option key={market.value} value={market.value}>
                  {market.label}
                </option>
              ))}
            </select>
          </div>

          <div
            className={cx(
              "ml-auto hidden h-9 min-w-0 items-center gap-2 rounded-md border px-2.5 text-sm font-semibold sm:inline-flex",
              toneSurface(readinessTone),
            )}
          >
            <span className="hidden text-[11px] uppercase tracking-normal opacity-70 sm:inline">
              Decision readiness
            </span>
            <span className="max-w-[150px] truncate">{headerReadiness}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-950 bg-zinc-950 px-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <RefreshCw
                className={cx("h-4 w-4", refreshing && "animate-spin")}
              />
              <span className="hidden sm:inline">Update</span>
            </button>
          </div>
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
        />
      ) : (
        <main
          data-testid="decision-main-scroll"
          data-scroll-region="decision-main"
          className="signal-scroll-region mx-auto grid h-full min-h-0 w-full max-w-[1880px] gap-2 overflow-y-auto overflow-x-hidden px-3 py-2 md:grid-cols-[248px_minmax(0,1fr)] md:overflow-hidden lg:px-4"
        >
          <nav
            aria-label="Decision workflow"
            data-overflow-policy="responsive-workflow-nav"
            className="sticky top-0 z-20 grid min-h-0 min-w-0 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm md:static md:grid-rows-[auto_minmax(0,1fr)_auto] md:shadow-none"
          >
            <div className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-normal text-zinc-500 md:block">
              Workflow
            </div>

            <ScrollBoundary
              policy="horizontal-tabs"
              testId="workflow-tab-list"
              horizontal
              fade="none"
              regionClassName="flex gap-1 pb-1 md:grid md:auto-rows-min md:overflow-x-hidden md:overflow-y-auto md:pb-0 md:pr-1"
            >
              {steps.map((step, index) => {
                const active = step.id === activeStep.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    className={cx(
                      "grid min-h-[58px] w-[138px] shrink-0 grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-md px-2.5 py-2 text-left transition md:w-full md:shrink",
                      active
                        ? "bg-zinc-950 text-white"
                        : "text-zinc-700 hover:bg-zinc-100",
                    )}
                  >
                    <span
                      className={cx(
                        "grid h-7 w-7 place-items-center rounded-md border",
                        active
                          ? "border-white/20 bg-white/10"
                          : "border-zinc-200 bg-white text-zinc-700",
                      )}
                    >
                      {stepIcon(step.id)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {step.label}
                      </span>
                      <span
                        className={cx(
                          "mt-0.5 block truncate text-xs",
                          active ? "text-zinc-300" : "text-zinc-500",
                        )}
                      >
                        {index + 1}/8 - {phaseStatus[step.id]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </ScrollBoundary>

            <div className="mt-2 hidden border-t border-zinc-200 px-2 pt-2 md:block">
              <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                Active
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-zinc-950">
                {activeStep.label}
              </div>
            </div>
          </nav>

          <section
            data-testid="decision-step-screen"
            data-active-step={activeStep.id}
            className="grid min-h-0 min-w-0 gap-2 md:h-full md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden"
          >
            <section
              aria-label="Decision priority strip"
              className="grid min-w-0 gap-2 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.35fr)_minmax(260px,0.78fr)]"
            >
              <div
                className={cx(
                  "grid min-w-0 gap-2 rounded-lg border p-3",
                  toneSurface(readinessTone),
                )}
              >
                <div className="text-xs font-semibold uppercase tracking-normal opacity-70">
                  Recommended action
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-2xl font-semibold leading-tight">
                      {recommendedAction}
                    </div>
                    <div className="mt-1 break-words text-sm font-semibold opacity-80">
                      {actionExposureText}
                    </div>
                  </div>
                  <span className="rounded-md border border-current/20 px-2 py-1 text-xs font-semibold">
                    {headerReadiness}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-current/15">
                  <div
                    className="h-full rounded-full bg-current"
                    style={{ width: `${readinessProgress}%` }}
                  />
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                      {stepIcon(activeStep.id)}
                      Current step
                    </div>
                    <div className="mt-1 text-sm font-semibold text-zinc-700">
                      {activeStep.question}
                    </div>
                    <h2 className="mt-1 break-words text-xl font-semibold leading-tight text-zinc-950">
                      {activeStep.headline}
                    </h2>
                  </div>
                  <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600">
                    {activeIndex + 1}/8
                  </span>
                </div>
              </div>

              <div
                className={cx(
                  "grid min-w-0 gap-2 rounded-lg border p-3",
                  toneSurface(trustTone),
                )}
              >
                <div className="text-xs font-semibold uppercase tracking-normal opacity-70">
                  Trust summary
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold leading-tight">
                      {trustWord}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold opacity-80">
                      {passCount} supports / {cautionCount} caution /{" "}
                      {failCount} block
                    </div>
                  </div>
                  <ShieldCheck className="h-5 w-5 opacity-80" />
                </div>
              </div>
            </section>

            <div className="grid min-h-0 min-w-0 gap-2 overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <article
                data-testid="active-decision-step"
                className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden"
              >
                <div className="grid min-h-0 gap-2 overflow-hidden lg:grid-cols-2 lg:grid-rows-2">
                  <DecisionPanel
                    ariaLabel="Decision summary"
                    testId="decision-summary-panel"
                    title="Decision summary"
                  >
                    <div className="mt-2 grid gap-2">
                      <p className="break-words text-sm leading-6 text-zinc-700">
                        {activeStep.story.happened}
                      </p>
                      <p className="break-words text-sm leading-6 text-zinc-700">
                        {activeStep.story.matters}
                      </p>
                      <p className="break-words text-sm font-semibold leading-6 text-zinc-950">
                        {activeStep.story.next}
                      </p>
                    </div>
                  </DecisionPanel>

                  <DecisionPanel
                    ariaLabel="Evidence summary"
                    testId="evidence-summary-panel"
                    title="Evidence summary"
                  >
                    <div className="mt-2 grid gap-1.5">
                      {evidencePreview.map((stage) => (
                        <div
                          key={stage.id}
                          className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 text-sm leading-5 text-zinc-700"
                        >
                          <span
                            className={cx(
                              "mt-0.5 grid h-5 w-5 place-items-center rounded-md",
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
                      ))}
                    </div>
                  </DecisionPanel>

                  <DecisionPanel
                    ariaLabel="Reason and risk"
                    testId="reason-risk-panel"
                    title="Reason and risk"
                  >
                    <div className="mt-2 grid gap-2">
                      {visibleReason.map((item) => (
                        <p
                          key={item}
                          className="break-words text-sm leading-6 text-zinc-700"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0 rounded-md bg-zinc-50 px-2.5 py-2">
                        <div className="break-words text-xs font-medium text-zinc-500">
                          Main risk
                        </div>
                        <div className="mt-1 break-words text-sm font-semibold text-zinc-950">
                          {investorCopy(mainRisk)}
                        </div>
                      </div>
                      <div className="min-w-0 rounded-md bg-zinc-50 px-2.5 py-2">
                        <div className="break-words text-xs font-medium text-zinc-500">
                          Size limit
                        </div>
                        <div className="mt-1 break-words text-sm font-semibold text-zinc-950">
                          {actionExposureText}
                        </div>
                      </div>
                    </div>
                  </DecisionPanel>

                  <DecisionPanel
                    ariaLabel="Supporting numbers"
                    testId="supporting-numbers-panel"
                    title="Supporting numbers"
                  >
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {activeStep.numbers.slice(0, 4).map((metric) => (
                        <div
                          key={metric.label}
                          className="grid min-h-[82px] min-w-0 rounded-md bg-zinc-50 px-2.5 py-2"
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
                    <div className="mt-2 grid gap-1.5">
                      {visibleDiagnostics.slice(0, 2).map((item) => (
                        <p
                          key={item}
                          className="break-words text-sm leading-5 text-zinc-600"
                        >
                          {investorCopy(item)}
                        </p>
                      ))}
                    </div>
                  </DecisionPanel>
                </div>

                <section
                  data-overflow-policy="sticky-primary-action"
                  className="sticky bottom-0 z-10 flex min-h-[52px] items-center gap-3 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur md:static md:bg-white md:shadow-none"
                >
                  <Zap className="h-4 w-4 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                      Recommended next step
                    </div>
                    <p className="break-words text-sm font-semibold text-zinc-900">
                      {activeStep.nextStep}
                    </p>
                  </div>
                </section>
              </article>

              <aside
                data-testid="opportunity-review"
                data-overflow-policy="bounded-opportunity-panel"
                className="grid min-h-[420px] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden rounded-lg border border-zinc-200 bg-white p-3 md:min-h-0"
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                    Opportunity review
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-2 break-words text-2xl font-semibold leading-tight text-zinc-950">
                        {opportunityLabel}
                      </div>
                      <div className={cx("break-words text-sm", toneText(selectedTone))}>
                        {trustWord} trust - {exposureText}
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

                <div className="min-h-0 overflow-hidden">
                  <OpportunityPicker
                    opportunities={opportunities}
                    selectedOpportunityId={selectedOpportunityId}
                    onSelectOpportunity={onSelectOpportunity}
                  />
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                    <Clock className="h-4 w-4 text-zinc-500" />
                    Context
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">
                    {investorCopy(marketState)}. {marketStatus}.{" "}
                    {lastSyncedLabel}.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <span className="truncate">Risk: {riskPressureWord}</span>
                    <span className="truncate">Action: {readinessState}</span>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
