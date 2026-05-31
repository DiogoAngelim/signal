import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  Clock,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

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
  marketOptions: Array<{ value: string; label: string }>;
  selectedMarket: string;
  onMarketChange: (market: string) => void;
  onRefresh: () => void;
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

type DetailLevel = "answer" | "why" | "evidence" | "numbers" | "notes";

type InvestmentStep = {
  id: DecisionStepId;
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
    .replace(/\bgovernance evidence\b/gi, "permission evidence")
    .replace(/\bgovernance\b/gi, "permission")
    .replace(/\bcalibration\b/gi, "historical reliability")
    .replace(/\bdiscovery\b/gi, "opportunity search")
    .replace(/\bagency\b/gi, "decision control")
    .replace(/\bnormal-sizing\b/gi, "normal size");
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
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "bad") return "border-red-200 bg-red-50 text-red-950";
  return "border-zinc-200 bg-white text-zinc-800";
}

function statusTone(status: EvidenceStageStatus): DecisionTone {
  if (status === "Pass") return "good";
  if (status === "Fail") return "bad";
  return "warn";
}

function statusLabel(status: EvidenceStageStatus) {
  if (status === "Pass") return "Supports";
  if (status === "Fail") return "Blocks";
  return "Needs care";
}

function statusIcon(status: EvidenceStageStatus) {
  if (status === "Pass") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "Fail") return <XCircle className="h-4 w-4" />;
  return <CircleDashed className="h-4 w-4" />;
}

function stepIcon(step: DecisionStepId) {
  if (step === "opportunity") return <Target className="h-4 w-4" />;
  if (step === "trust") return <ShieldCheck className="h-4 w-4" />;
  if (step === "size") return <Wallet className="h-4 w-4" />;
  return <Zap className="h-4 w-4" />;
}

function friendlyEvidenceLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("market")) return "Market backdrop";
  if (normalized.includes("signal")) return "Signals agree";
  if (normalized.includes("opportunity")) return "Opportunity quality";
  if (normalized.includes("risk")) return "Risk control";
  if (normalized.includes("survival")) return "Loss history";
  if (normalized.includes("calibration")) return "Historical reliability";
  if (normalized.includes("liquidity")) return "Trading conditions";
  if (normalized.includes("governance")) return "Permission to invest";
  if (normalized.includes("execution")) return "Trading quality";
  if (normalized.includes("readiness")) return "Decision readiness";
  return label;
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
  if (label === "Calibration") return "Historical reliability";
  if (label === "History Depth") return "Historical depth";
  if (label === "Regime Coverage") return "Market coverage";
  return label;
}

function metricMeaning(metric: DecisionRawMetric) {
  const number = parseMetricNumber(metric.value);
  switch (metric.label) {
    case "Confidence":
      return number == null
        ? "The view is still forming."
        : `${qualityWord(number)} conviction in the current recommendation.`;
    case "Trust":
      return number == null
        ? "Reliability evidence is still pending."
        : `${qualityWord(number)} reliability after history, fit, and risk checks.`;
    case "Market Health":
      return number == null
        ? "Market condition is still loading."
        : `${qualityWord(number)} backdrop for taking risk.`;
    case "Opportunity Density":
      return number == null
        ? "The opportunity set is still loading."
        : `${qualityWord(number)} number of ideas worth reviewing.`;
    case "Risk Pressure":
      return number == null
        ? "Risk pressure is still loading."
        : `${riskWord(number)} pressure against taking new risk.`;
    case "Readiness":
      return number == null
        ? "The decision is still forming."
        : `${qualityWord(number)} readiness to act now.`;
    case "Portfolio Cap":
      return "Maximum total portfolio exposure currently allowed.";
    case "Starter Size":
      return "First position size suggested before stronger confirmation.";
    case "Survival":
      return number == null
        ? "Loss-history protection is still loading."
        : `${qualityWord(number)} evidence that the strategy can survive stress.`;
    case "Calibration":
      return number == null
        ? "Historical reliability is still loading."
        : `${qualityWord(number)} alignment between past forecasts and outcomes.`;
    case "History Depth":
      return number == null
        ? "Historical depth is still loading."
        : `${qualityWord(number)} amount of comparable history.`;
    case "Regime Coverage":
      return number == null
        ? "Market-regime coverage is still loading."
        : `${qualityWord(number)} coverage across different market conditions.`;
    default:
      return "Supporting number for the current recommendation.";
  }
}

function DetailButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-9 rounded-md px-3 text-sm font-semibold transition",
        active
          ? "bg-zinc-950 text-white"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {children}
    </button>
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
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className={cx("mt-1 break-words text-base font-semibold leading-snug", toneText(tone))}>
        {investorCopy(value)}
      </div>
    </div>
  );
}

function StoryLine({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-zinc-100 text-zinc-700">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-zinc-950">{label}</div>
        <p className="mt-1 line-clamp-3 text-sm leading-6 text-zinc-600">
          {children}
        </p>
      </div>
    </div>
  );
}

function EvidenceRow({ stage }: { stage: DecisionEvidenceStage }) {
  const tone = statusTone(stage.status);

  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3">
      <span className={cx("mt-0.5", toneText(tone))}>{statusIcon(stage.status)}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-zinc-950">
          {friendlyEvidenceLabel(stage.label)}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">
          {investorCopy(stage.explanation)}
        </p>
      </div>
      <span
        className={cx(
          "rounded-md border px-2 py-1 text-xs font-semibold",
          toneSurface(tone),
        )}
      >
        {statusLabel(stage.status)}
      </span>
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
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600">
        No opportunity deserves attention yet. Keep capital flat until the
        evidence improves.
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-2 overflow-y-auto pr-1">
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
              "grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3 text-left transition",
              selectedOpportunityId === opportunity.id
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-400",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {opportunity.ticker}
              </span>
              <span
                className={cx(
                  "mt-1 block truncate text-xs",
                  selectedOpportunityId === opportunity.id
                    ? "text-zinc-300"
                    : "text-zinc-500",
                )}
              >
                {opportunity.action} at {opportunity.exposureLabel}
              </span>
              <span
                className={cx(
                  "mt-1 block truncate text-xs",
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
                "rounded-md border px-2 py-1 text-xs font-semibold",
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
    </div>
  );
}

function DetailPanel({
  level,
  step,
  evidenceLadder,
}: {
  level: DetailLevel;
  step: InvestmentStep;
  evidenceLadder: DecisionEvidenceStage[];
}) {
  if (level === "answer") {
    return (
      <div className="grid h-full min-h-0 gap-3 overflow-y-auto pr-1 lg:grid-rows-3">
        <StoryLine label="What happened" icon={<Activity className="h-4 w-4" />}>
          {step.story.happened}
        </StoryLine>
        <StoryLine label="Why it matters" icon={<ShieldCheck className="h-4 w-4" />}>
          {step.story.matters}
        </StoryLine>
        <StoryLine label="What to do" icon={<Zap className="h-4 w-4" />}>
          {step.story.next}
        </StoryLine>
      </div>
    );
  }

  if (level === "why") {
    return (
      <div className="grid h-full min-h-0 gap-2 overflow-y-auto pr-1">
        {step.why.map((item) => (
          <div
            key={item}
            className="rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-700"
          >
            {item}
          </div>
        ))}
      </div>
    );
  }

  if (level === "evidence") {
    const evidenceRows = evidenceLadder.length
      ? evidenceLadder
      : step.evidence.map((item, index) => ({
          id: `${step.id}-${index}`,
          label: "Evidence",
          status: "Caution" as EvidenceStageStatus,
          explanation: item,
        }));

    return (
      <div className="grid h-full min-h-0 gap-2 overflow-y-auto pr-1">
        {evidenceRows.slice(0, 10).map((stage) => (
          <EvidenceRow key={stage.id} stage={stage} />
        ))}
      </div>
    );
  }

  if (level === "numbers") {
    return (
      <div className="grid h-full min-h-0 auto-rows-min gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {step.numbers.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-950">
                  {friendlyMetricLabel(metric.label)}
                </div>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {metricMeaning(metric)}
                </p>
              </div>
              <div className="shrink-0 text-base font-semibold text-zinc-950">
                {metric.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-2 overflow-y-auto pr-1">
      {step.notes.map((item) => (
        <div
          key={item}
          className="rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-700"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

export default function DecisionOperatingSystem({
  marketOptions,
  selectedMarket,
  onMarketChange,
  onRefresh,
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
  const [activeStepId, setActiveStepId] = useState<DecisionStepId>("opportunity");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("answer");

  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedOpportunityId) ??
    opportunities[0] ??
    null;
  const trustNumber = parseMetricNumber(metricValue(rawMetrics, "Trust"));
  const confidenceNumber = parseMetricNumber(metricValue(rawMetrics, "Confidence"));
  const riskNumber = parseMetricNumber(metricValue(rawMetrics, "Risk Pressure"));
  const marketHealthNumber = parseMetricNumber(metricValue(rawMetrics, "Market Health"));
  const selectedTone: DecisionTone =
    selectedOpportunity == null
      ? "neutral"
      : selectedOpportunity.readinessPct >= 72
        ? "good"
        : selectedOpportunity.readinessPct >= 48
          ? "warn"
          : "bad";
  const passCount = evidenceLadder.filter((item) => item.status === "Pass").length;
  const cautionCount = evidenceLadder.filter((item) => item.status === "Caution").length;
  const failCount = evidenceLadder.filter((item) => item.status === "Fail").length;
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
  const trustWord = qualityWord(trustNumber ?? selectedOpportunity?.trustPct ?? null);
  const confidenceWord = qualityWord(confidenceNumber);
  const riskPressureWord = riskWord(riskNumber);
  const marketHealthWord = qualityWord(marketHealthNumber);
  const exposureText = displayExposure(suggestedExposure);
  const actionExposureText = displayExposure(actionPlan.exposure);
  const capitalPosture =
    exposureText === "No new exposure" ? "capital flat" : lowerFirst(exposureText);
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

  const steps = useMemo<InvestmentStep[]>(
    () => [
      {
        id: "opportunity",
        label: "Opportunity",
        question: "What deserves attention?",
        headline: selectedOpportunity
          ? `${selectedOpportunity.ticker} is the clearest opportunity to review.`
          : "No opportunity is ready for attention yet.",
        answer: selectedOpportunity
          ? cleanSentence(selectedOpportunity.thesis)
          : cleanSentence(executiveNarrative),
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
          ["Opportunity Density", "Market Health", "Confidence", "Readiness"].includes(
            metric.label,
          ),
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
        nextStep: "Check whether the evidence is trustworthy before changing risk.",
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
        id: "trust",
        label: "Trust",
        question: "Can I trust it?",
        headline:
          failCount > 0
            ? "Trust is limited, so the decision should stay conservative."
            : `${trustWord} trust supports the recommendation.`,
        answer: `${passCount} checks support the decision, ${cautionCount} need care, and ${failCount} block it.`,
        why: compactList(
          [
            topSupport[0],
            topRisk[0],
            missingEvidence,
            readinessBlocker,
          ],
          "Trust evidence is still forming.",
        ),
        evidence: evidenceLadder.map(
          (stage) =>
            `${friendlyEvidenceLabel(stage.label)} ${statusLabel(stage.status).toLowerCase()}: ${investorCopy(stage.explanation)}`,
        ),
        numbers: rawMetrics.filter((metric) =>
          ["Trust", "Confidence", "Survival", "Calibration", "History Depth"].includes(
            metric.label,
          ),
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
          { label: "Trust", value: trustWord, tone: failCount > 0 ? "warn" : readinessTone },
          { label: "Conviction", value: confidenceWord, tone: readinessTone },
          { label: "Main risk", value: topRisk[0], tone: topRisk[0] === "No major risk is being promoted." ? "good" : "warn" },
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
        id: "size",
        label: "Size",
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
          ["Starter Size", "Portfolio Cap", "Risk Pressure", "Readiness"].includes(
            metric.label,
          ),
        ),
        notes: compactList(
          [readinessBlocker, readinessImprover, actionPlan.invalidation],
          "No sizing notes are available yet.",
        ),
        nextStep: "Turn the size into a concrete action.",
        facts: [
          { label: "Suggested size", value: exposureText, tone: readinessTone },
          { label: "Risk pressure", value: riskPressureWord, tone: riskNumber != null && riskNumber > 65 ? "warn" : "good" },
          { label: "Portfolio effect", value: actionPlan.portfolioImpact },
          { label: "Limiter", value: mainRisk, tone: mainRisk === "No active limiter" ? "good" : "warn" },
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
        notes: Object.entries(actionPlan).map(
          ([key, value]) => `${key}: ${investorCopy(value)}`,
        ),
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
    ],
    [
      actionPlan,
      cautionCount,
      confidenceWord,
      evidenceLadder,
      executiveNarrative,
      failCount,
      lastSyncedLabel,
      mainRisk,
      marketHealthWord,
      marketState,
      missingEvidence,
      opportunities.length,
      opportunityLabel,
      passCount,
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
      suggestedExposure,
      exposureText,
      actionExposureText,
      capitalPosture,
      sizePosture,
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
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < steps.length - 1;

  const moveStep = (direction: -1 | 1) => {
    const next = steps[activeIndex + direction];
    if (next) {
      setActiveStepId(next.id);
      setDetailLevel("answer");
    }
  };

  return (
    <div
      data-testid="decision-operating-system"
      className="min-h-screen overflow-y-auto bg-[#f6f7f5] text-zinc-950 md:h-screen md:overflow-hidden"
    >
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid min-h-[76px] w-full max-w-[1520px] gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_420px] md:items-center md:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-500">
              Signal Investment Brief
            </div>
            <h1 className="line-clamp-3 break-words text-lg font-semibold leading-snug text-zinc-950 sm:line-clamp-2 sm:text-xl">
              {primaryAnswer}
            </h1>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              value={selectedMarket}
              onChange={(event) => onMarketChange(event.target.value)}
              className="h-10 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none"
            >
              {!marketOptions.length ? <option value="">Loading markets</option> : null}
              {marketOptions.map((market) => (
                <option key={market.value} value={market.value}>
                  {market.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-950 bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
            >
              <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} />
              Update
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1520px] gap-3 px-4 py-3 md:h-[calc(100vh-76px)] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden md:px-6 lg:px-8">
        <section
          data-testid="primary-answer"
          className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_520px]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "rounded-md border px-2.5 py-1 text-sm font-semibold",
                  toneSurface(readinessTone),
                )}
              >
                {recommendedAction}
              </span>
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm font-semibold text-zinc-700">
                {marketStatus}
              </span>
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm font-semibold text-zinc-700">
                {lastSyncedLabel}
              </span>
            </div>
            <h2 className="mt-3 break-words text-2xl font-semibold leading-tight text-zinc-950 sm:text-3xl">
              {activeStep.headline}
            </h2>
            <p className="mt-2 max-w-4xl text-base leading-7 text-zinc-600">
              {activeStep.answer}
            </p>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <FactTile label="Opportunity" value={opportunityLabel} tone={selectedTone} />
            <FactTile label="Trust" value={trustWord} tone={failCount > 0 ? "warn" : readinessTone} />
            <FactTile label="Size" value={exposureText} tone={readinessTone} />
            <FactTile label="Main risk" value={mainRisk} tone={mainRisk === "No active limiter" ? "good" : "warn"} />
          </div>
        </section>

        <section
          data-testid="decision-step-screen"
          data-active-step={activeStep.id}
          className="grid min-h-0 gap-3 md:grid-cols-[220px_minmax(0,1fr)_340px] md:overflow-hidden"
        >
          <nav
            aria-label="Investment decision flow"
            className="grid auto-rows-min gap-2 rounded-lg border border-zinc-200 bg-white p-2"
          >
            {steps.map((step, index) => {
              const active = step.id === activeStep.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveStepId(step.id);
                    setDetailLevel("answer");
                  }}
                  className={cx(
                    "grid min-h-[70px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-md p-3 text-left transition",
                    active
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-700 hover:bg-zinc-100",
                  )}
                >
                  <span
                    className={cx(
                      "grid h-8 w-8 place-items-center rounded-md border",
                      active ? "border-white/20 bg-white/10" : "border-zinc-200 bg-white",
                    )}
                  >
                    {stepIcon(step.id)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {index + 1}. {step.label}
                    </span>
                    <span
                      className={cx(
                        "mt-0.5 block truncate text-xs",
                        active ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      {workflowStatus[step.id] ?? "Ready"}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
                  {stepIcon(activeStep.id)}
                  {activeStep.question}
                </div>
                <h3 className="mt-1 break-words text-xl font-semibold leading-tight text-zinc-950 sm:text-2xl">
                  {activeStep.headline}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-white p-1 sm:grid-cols-5">
                {(["answer", "why", "evidence", "numbers", "notes"] as DetailLevel[]).map(
                  (level) => (
                    <DetailButton
                      key={level}
                      active={detailLevel === level}
                      onClick={() => setDetailLevel(level)}
                    >
                      {level === "answer"
                        ? "Answer"
                        : level === "why"
                          ? "Why"
                          : level === "evidence"
                            ? "Evidence"
                            : level === "numbers"
                              ? "Numbers"
                              : "Notes"}
                    </DetailButton>
                  ),
                )}
              </div>
            </div>

            {refreshError ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{refreshError}</span>
              </div>
            ) : null}

            <div className="min-h-0 overflow-hidden">
              <DetailPanel
                level={detailLevel}
                step={activeStep}
                evidenceLadder={evidenceLadder}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-6 text-zinc-800">
                {activeStep.nextStep}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={!canGoBack}
                  onClick={() => moveStep(-1)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-300 text-zinc-700 transition enabled:hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Previous step"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!canGoForward}
                  onClick={() => moveStep(1)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-950 bg-zinc-950 text-white transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Next step"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4">
            <div className="border-b border-zinc-200 pb-3">
              <div className="text-sm font-semibold text-zinc-500">
                Recommended action
              </div>
              <div className={cx("mt-1 text-3xl font-semibold", toneText(readinessTone))}>
                {recommendedAction}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <FactTile label="Size" value={actionExposureText} tone={readinessTone} />
                <FactTile label="Trust" value={trustWord} tone={failCount > 0 ? "warn" : readinessTone} />
              </div>
            </div>

            <div className="min-h-0 overflow-hidden">
              {activeStep.id === "opportunity" ? (
                <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                    <Search className="h-4 w-4 text-zinc-500" />
                    Opportunities needing attention
                  </div>
                  <OpportunityPicker
                    opportunities={opportunities}
                    selectedOpportunityId={selectedOpportunityId}
                    onSelectOpportunity={onSelectOpportunity}
                  />
                </div>
              ) : (
                <div className="grid h-full min-h-0 auto-rows-min gap-2 overflow-y-auto pr-1">
                  {activeStep.facts.map((fact) => (
                    <FactTile
                      key={fact.label}
                      label={fact.label}
                      value={fact.value}
                      tone={fact.tone}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <Clock className="h-4 w-4 text-zinc-500" />
                Current context
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">
                {investorCopy(marketState)}. {marketStatus}. {lastSyncedLabel}.
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
                <BarChart3 className="h-4 w-4" />
                Action state: {readinessState}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
