import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Compass,
  Gauge,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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

export type DecisionStepId =
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

type DisclosureLevel = "default" | "evidence" | "advanced" | "expert" | "debug";

type StageViewModel = {
  id: DecisionStepId;
  label: string;
  question: string;
  summaryLabel: string;
  summary: string;
  evidenceTitle: string;
  evidence: string[];
  nextStep: string;
  primaryFacts: Array<{ label: string; value: string; tone?: DecisionTone }>;
  details: string[];
  metrics: DecisionRawMetric[];
  diagnostics: string[];
  raw: string[];
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function boundedPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

function toneBorder(tone: DecisionTone) {
  if (tone === "good") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
  if (tone === "warn") return "border-amber-300/45 bg-amber-300/10 text-amber-100";
  if (tone === "bad") return "border-red-400/40 bg-red-400/10 text-red-100";
  return "border-zinc-700 bg-zinc-950 text-zinc-200";
}

function toneText(tone: DecisionTone) {
  if (tone === "good") return "text-emerald-300";
  if (tone === "warn") return "text-amber-200";
  if (tone === "bad") return "text-red-300";
  return "text-zinc-300";
}

function statusTone(status: EvidenceStageStatus): DecisionTone {
  if (status === "Pass") return "good";
  if (status === "Fail") return "bad";
  return "warn";
}

function stageIcon(stage: DecisionStepId) {
  if (stage === "intent") return <Compass className="h-4 w-4" />;
  if (stage === "sense") return <Gauge className="h-4 w-4" />;
  if (stage === "pulse") return <Target className="h-4 w-4" />;
  if (stage === "core") return <ListChecks className="h-4 w-4" />;
  if (stage === "judgement") return <ShieldCheck className="h-4 w-4" />;
  if (stage === "sizing") return <Wallet className="h-4 w-4" />;
  if (stage === "action") return <Zap className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
}

function statusIcon(status: EvidenceStageStatus) {
  if (status === "Pass") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "Fail") return <XCircle className="h-4 w-4" />;
  return <CircleDashed className="h-4 w-4" />;
}

function metricValue(metrics: DecisionRawMetric[], label: string, fallback = "Pending") {
  return metrics.find((metric) => metric.label === label)?.value ?? fallback;
}

function compactList(values: Array<string | null | undefined>, fallback: string, limit = 4) {
  const items = Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  ).slice(0, limit);
  return items.length ? items : [fallback];
}

function GlobalMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: DecisionTone;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="truncate text-[11px] text-zinc-500">{label}</div>
      <div className={cx("mt-1 truncate text-sm font-semibold", toneText(tone))}>
        {value}
      </div>
    </div>
  );
}

function DisclosureButton({
  level,
  active,
  onClick,
}: {
  level: DisclosureLevel;
  active: boolean;
  onClick: () => void;
}) {
  const labels: Record<DisclosureLevel, string> = {
    default: "Default",
    evidence: "Evidence",
    advanced: "Advanced",
    expert: "Expert",
    debug: "Debug",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-9 rounded-md px-3 text-xs font-semibold transition",
        active ? "bg-zinc-100 text-black" : "text-zinc-400 hover:bg-zinc-900",
      )}
    >
      {labels[level]}
    </button>
  );
}

function FactCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: DecisionTone;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-black px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={cx("mt-1 truncate text-lg font-semibold", toneText(tone))}>
        {value}
      </div>
    </div>
  );
}

function DetailPanel({
  disclosure,
  stage,
}: {
  disclosure: DisclosureLevel;
  stage: StageViewModel;
}) {
  if (disclosure === "default") {
    return null;
  }

  if (disclosure === "evidence") {
    return (
      <div className="h-full min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-2">
          {stage.details.map((item) => (
            <div key={item} className="rounded-lg border border-zinc-800 bg-black p-3 text-sm leading-6 text-zinc-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (disclosure === "advanced") {
    return (
      <div className="h-full min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-2 sm:grid-cols-2">
          {stage.metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-zinc-800 bg-black p-3">
              <div className="text-xs text-zinc-500">{metric.label}</div>
              <div className="mt-1 text-base font-semibold text-zinc-50">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (disclosure === "expert") {
    return (
      <div className="h-full min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-2">
          {stage.diagnostics.map((item) => (
            <div key={item} className="rounded-lg border border-zinc-800 bg-black p-3 text-sm leading-6 text-zinc-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <pre className="min-h-full whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black p-3 text-xs leading-5 text-zinc-400">
        {stage.raw.join("\n")}
      </pre>
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
      <div className="rounded-lg border border-zinc-800 bg-black p-4 text-sm leading-6 text-zinc-400">
        No opportunity has cleared the attention filter yet.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 auto-rows-min gap-2 overflow-y-auto pr-1">
      {opportunities.slice(0, 8).map((opportunity) => {
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
              "grid min-h-[68px] grid-cols-[minmax(0,1fr)_64px] gap-3 rounded-lg border p-3 text-left",
              selectedOpportunityId === opportunity.id
                ? "border-cyan-300/45 bg-cyan-300/10"
                : "border-zinc-800 bg-black hover:border-zinc-700",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-50">
                {opportunity.ticker} · {opportunity.action}
              </span>
              <span className="mt-1 block truncate text-xs text-zinc-500">
                {opportunity.name}
              </span>
            </span>
            <span className={cx("text-right text-xl font-semibold", toneText(tone))}>
              {Math.round(opportunity.readinessPct)}
            </span>
          </button>
        );
      })}
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
  const [activeStageId, setActiveStageId] = useState<DecisionStepId>("intent");
  const [disclosure, setDisclosure] = useState<DisclosureLevel>("default");
  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedOpportunityId) ??
    opportunities[0] ??
    null;
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
  const stageStatus = Object.fromEntries(workflow.map((step) => [step.id, step.status]));
  const topEvidence = compactList(
    [
      selectedOpportunity?.support[0],
      selectedOpportunity?.drivers[0],
      readinessWhy,
    ],
    "Evidence is still forming.",
    3,
  );
  const topRisks = compactList(
    [
      selectedOpportunity?.contradictions[0],
      mainRisk,
      selectedOpportunity?.missing[0],
    ],
    "No promoted risk.",
    3,
  );

  const stages = useMemo<StageViewModel[]>(
    () => [
      {
        id: "intent",
        label: "Intent",
        question: "What decision am I trying to make?",
        summaryLabel: "Decision intent",
        summary: "Decide whether capital should be allocated now, watched, or held flat until evidence improves.",
        evidenceTitle: "Operating frame",
        evidence: ["Goal: protect capital while identifying the highest-quality opportunity.", "Horizon: today's briefing cycle.", `Risk profile: ${readinessState}.`, `Constraint: ${mainRisk}.`],
        nextStep: "Move to Sense to read the market state.",
        primaryFacts: [
          { label: "Goal", value: recommendedAction },
          { label: "Horizon", value: "Today" },
          { label: "Risk profile", value: readinessState, tone: readinessTone },
          { label: "Constraint", value: mainRisk },
        ],
        details: compactList(
          [executiveNarrative, readinessWhy, readinessBlocker],
          "Intent is waiting for market context.",
        ),
        metrics: rawMetrics.slice(0, 4),
        diagnostics: compactList([readinessImprover, readinessBlocker, missingEvidence], "No diagnostic promoted."),
        raw: [`marketState=${marketState}`, `readiness=${Math.round(boundedPct(readinessPct))}`, `action=${recommendedAction}`, `exposure=${suggestedExposure}`],
      },
      {
        id: "sense",
        label: "Sense",
        question: "What is happening?",
        summaryLabel: "Market read",
        summary: executiveNarrative,
        evidenceTitle: "Market insights",
        evidence: [`Market state: ${marketState}.`, `Opportunity density: ${metricValue(rawMetrics, "Opportunity Density")}.`, `Participation: ${recommendedAction}.`, `Liquidity: ${marketStatus}.`],
        nextStep: "Move to Pulse to see what deserves attention.",
        primaryFacts: [
          { label: "Market State", value: marketState, tone: readinessTone },
          { label: "Opportunity Density", value: metricValue(rawMetrics, "Opportunity Density") },
          { label: "Participation", value: recommendedAction },
          { label: "Liquidity", value: marketStatus },
        ],
        details: compactList([executiveNarrative, readinessWhy, `Last sync: ${lastSyncedLabel}`], "Market read is pending."),
        metrics: rawMetrics.filter((metric) => ["Market Health", "Opportunity Density", "Risk Pressure", "Readiness"].includes(metric.label)),
        diagnostics: compactList([mainRisk, missingEvidence, readinessBlocker], "No sense diagnostic promoted."),
        raw: rawMetrics.map((metric) => `${metric.label}: ${metric.value}`),
      },
      {
        id: "pulse",
        label: "Pulse",
        question: "What opportunity matters most?",
        summaryLabel: "Attention target",
        summary: selectedOpportunity
          ? `${selectedOpportunity.ticker} is the active opportunity to review.`
          : `${bestOpportunityLabel} is not investable yet.`,
        evidenceTitle: "Top opportunities",
        evidence: selectedOpportunity
          ? compactList([selectedOpportunity.thesis, ...selectedOpportunity.drivers], "Opportunity evidence is pending.", 4)
          : ["Opportunity ranking is waiting for synchronized market data."],
        nextStep: "Move to Core to understand the thesis.",
        primaryFacts: [
          { label: "Best Opportunity", value: bestOpportunityLabel, tone: selectedTone },
          { label: "Action", value: selectedOpportunity?.action ?? recommendedAction },
          { label: "Exposure", value: selectedOpportunity?.exposureLabel ?? suggestedExposure },
          { label: "Search", value: "Hidden in details" },
        ],
        details: compactList(
          selectedOpportunity
            ? [selectedOpportunity.context, ...selectedOpportunity.support, ...selectedOpportunity.contradictions]
            : ["No ranked opportunity yet."],
          "No opportunity detail.",
        ),
        metrics: [
          { label: "Opportunity Quality", value: selectedOpportunity ? `${Math.round(selectedOpportunity.qualityPct)}%` : "Pending" },
          { label: "Trust", value: selectedOpportunity?.trustPct == null ? "Pending" : `${Math.round(selectedOpportunity.trustPct)}%` },
          { label: "Timing", value: selectedOpportunity ? `${Math.round(selectedOpportunity.timingPct)}%` : "Pending" },
          { label: "Risk", value: selectedOpportunity ? `${Math.round(selectedOpportunity.riskPct)}%` : "Pending" },
        ],
        diagnostics: compactList(selectedOpportunity?.missing ?? [], missingEvidence),
        raw: opportunities.slice(0, 8).map((item) => `${item.ticker}: action=${item.action}, readiness=${Math.round(item.readinessPct)}, exposure=${item.exposureLabel}`),
      },
      {
        id: "core",
        label: "Core",
        question: "Why does this opportunity exist?",
        summaryLabel: "Core thesis",
        summary: selectedOpportunity?.thesis ?? "No thesis is ready until an opportunity clears Pulse.",
        evidenceTitle: "Thesis support",
        evidence: compactList(
          [selectedOpportunity?.context, selectedOpportunity?.support[0], selectedOpportunity?.drivers[0]],
          "Thesis evidence is pending.",
          4,
        ),
        nextStep: "Move to Judgement to decide whether to trust it.",
        primaryFacts: [
          { label: "Thesis", value: selectedOpportunity?.ticker ?? "Pending" },
          { label: "Why now", value: selectedOpportunity?.drivers[0] ?? "Pending" },
          { label: "Key evidence", value: selectedOpportunity?.support[0] ?? "Pending" },
          { label: "Key risk", value: selectedOpportunity?.contradictions[0] ?? mainRisk },
        ],
        details: compactList(
          selectedOpportunity
            ? [selectedOpportunity.thesis, selectedOpportunity.context, ...selectedOpportunity.support, ...selectedOpportunity.contradictions]
            : ["Core thesis is pending."],
          "Core thesis is pending.",
        ),
        metrics: rawMetrics.slice(0, 6),
        diagnostics: compactList(selectedOpportunity?.invalidations ?? [], "No invalidation promoted."),
        raw: selectedOpportunity
          ? [`ticker=${selectedOpportunity.ticker}`, `quality=${selectedOpportunity.qualityPct}`, `risk=${selectedOpportunity.riskPct}`, `timing=${selectedOpportunity.timingPct}`]
          : ["opportunity=null"],
      },
      {
        id: "judgement",
        label: "Judgement",
        question: "Can I trust it?",
        summaryLabel: "Trust report",
        summary: `${passCount}/10 evidence stages pass; trust is ${failCount > 0 ? "limited" : "explainable"}.`,
        evidenceTitle: "Trust formation",
        evidence: compactList([topEvidence[0], topRisks[0], missingEvidence], "Trust evidence is pending.", 4),
        nextStep: "Move to Sizing to translate trust into exposure.",
        primaryFacts: [
          { label: "Why trust exists", value: topEvidence[0], tone: "good" },
          { label: "Why limited", value: topRisks[0], tone: topRisks[0] === "No promoted risk." ? "good" : "warn" },
          { label: "Missing evidence", value: missingEvidence },
          { label: "Confidence", value: metricValue(rawMetrics, "Confidence") },
        ],
        details: evidenceLadder.map((stage) => `${stage.label}: ${stage.status}. ${stage.explanation}`),
        metrics: [
          { label: "Pass", value: String(passCount) },
          { label: "Caution", value: String(cautionCount) },
          { label: "Fail", value: String(failCount) },
          { label: "Trust", value: metricValue(rawMetrics, "Trust") },
        ],
        diagnostics: evidenceLadder.map((stage) => `${stage.id}: ${stage.status}`),
        raw: evidenceLadder.map((stage) => JSON.stringify(stage)),
      },
      {
        id: "sizing",
        label: "Sizing",
        question: "How much should I risk?",
        summaryLabel: "Sizing conclusion",
        summary: `${suggestedExposure} suggested exposure with ${metricValue(rawMetrics, "Portfolio Cap")} portfolio cap.`,
        evidenceTitle: "Risk translation",
        evidence: compactList([actionPlan.portfolioImpact, actionPlan.riskConstraints, readinessWhy], "Sizing evidence is pending.", 4),
        nextStep: "Move to Action to see the exact instruction.",
        primaryFacts: [
          { label: "Suggested Exposure", value: suggestedExposure, tone: readinessTone },
          { label: "Maximum Exposure", value: metricValue(rawMetrics, "Portfolio Cap") },
          { label: "Portfolio Impact", value: actionPlan.portfolioImpact },
          { label: "Risk Explanation", value: actionPlan.riskConstraints },
        ],
        details: compactList([actionPlan.exposure, actionPlan.portfolioImpact, actionPlan.riskConstraints], "Sizing is pending."),
        metrics: rawMetrics.filter((metric) => ["Portfolio Cap", "Starter Size", "Risk Pressure", "Readiness"].includes(metric.label)),
        diagnostics: compactList([readinessBlocker, readinessImprover, mainRisk], "No sizing diagnostic promoted."),
        raw: [`exposure=${actionPlan.exposure}`, `portfolioImpact=${actionPlan.portfolioImpact}`, `risk=${actionPlan.riskConstraints}`],
      },
      {
        id: "action",
        label: "Action",
        question: "What should I do?",
        summaryLabel: "Recommended action",
        summary: `${recommendedAction}: ${actionPlan.entryLogic}`,
        evidenceTitle: "Execution conditions",
        evidence: compactList([actionPlan.entryLogic, actionPlan.riskConstraints, actionPlan.exitConditions, actionPlan.invalidation], "Action evidence is pending.", 4),
        nextStep: "Move to Reflection after the action window resolves.",
        primaryFacts: [
          { label: "Action", value: recommendedAction, tone: readinessTone },
          { label: "Reason", value: actionPlan.entryLogic },
          { label: "Conditions", value: actionPlan.exitConditions },
          { label: "Invalidations", value: actionPlan.invalidation },
        ],
        details: compactList([actionPlan.entryLogic, actionPlan.riskConstraints, actionPlan.exitConditions, actionPlan.invalidation], "Action plan is pending."),
        metrics: rawMetrics.filter((metric) => ["Readiness", "Confidence", "Trust", "Starter Size"].includes(metric.label)),
        diagnostics: compactList([readinessBlocker, missingEvidence, mainRisk], "No action diagnostic promoted."),
        raw: Object.entries(actionPlan).map(([key, value]) => `${key}=${value}`),
      },
      {
        id: "reflection",
        label: "Reflection",
        question: "What happened?",
        summaryLabel: "Learning state",
        summary: "Outcome review is pending until the next observed result.",
        evidenceTitle: "Reflection frame",
        evidence: [actionPlan.portfolioImpact, "Actual: pending next review.", "Error: open.", readinessImprover],
        nextStep: "Return to Intent for the next decision cycle.",
        primaryFacts: [
          { label: "Expected", value: actionPlan.portfolioImpact },
          { label: "Actual", value: "Pending next review" },
          { label: "Error", value: "Open" },
          { label: "Lesson", value: readinessImprover },
        ],
        details: compactList([actionPlan.portfolioImpact, readinessImprover, readinessBlocker], "Reflection is pending."),
        metrics: rawMetrics.filter((metric) => ["Readiness", "Confidence", "Risk Pressure", "Trust"].includes(metric.label)),
        diagnostics: compactList([readinessImprover, readinessBlocker], "No reflection diagnostic promoted."),
        raw: [`expected=${actionPlan.portfolioImpact}`, "actual=pending", "forecastError=open"],
      },
    ],
    [
      actionPlan,
      bestOpportunityLabel,
      cautionCount,
      evidenceLadder,
      executiveNarrative,
      failCount,
      lastSyncedLabel,
      mainRisk,
      marketState,
      marketStatus,
      missingEvidence,
      opportunities,
      passCount,
      rawMetrics,
      readinessBlocker,
      readinessImprover,
      readinessPct,
      readinessState,
      readinessTone,
      readinessWhy,
      recommendedAction,
      selectedOpportunity,
      selectedTone,
      suggestedExposure,
      topEvidence,
      topRisks,
    ],
  );

  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === activeStageId),
  );
  const activeStage = stages[activeIndex] ?? stages[0];
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < stages.length - 1;

  const moveStage = (direction: -1 | 1) => {
    const next = stages[activeIndex + direction];
    if (next) {
      setActiveStageId(next.id);
      setDisclosure("default");
    }
  };

  return (
    <div
      data-testid="decision-operating-system"
      className="h-screen overflow-hidden bg-[#070808] text-zinc-100"
    >
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black">
        <div className="mx-auto grid h-[92px] w-full max-w-[1520px] grid-cols-[300px_minmax(0,1fr)_360px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
              <Compass className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">Signal Command Center</div>
              <h1 className="truncate text-lg font-semibold text-zinc-50">
                Decision Operating System
              </h1>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-4 gap-2">
            <GlobalMetric label="Market State" value={marketState} tone={readinessTone} />
            <GlobalMetric
              label="Decision Readiness"
              value={`${Math.round(boundedPct(readinessPct))}% · ${readinessState}`}
              tone={readinessTone}
            />
            <GlobalMetric label="Recommended Action" value={recommendedAction} tone={readinessTone} />
            <GlobalMetric label="Suggested Exposure" value={suggestedExposure} tone={readinessTone} />
          </div>

          <div className="grid w-[360px] grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={selectedMarket}
              onChange={(event) => onMarketChange(event.target.value)}
              className="h-10 min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none"
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-300/45 bg-amber-300 px-3 text-sm font-semibold text-black transition hover:bg-amber-200"
            >
              <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} />
              Update
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid h-[calc(100vh-92px)] w-full max-w-[1520px] grid-rows-[56px_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <nav
          aria-label="Decision workflow"
          className="grid grid-cols-8 gap-2 rounded-lg border border-zinc-800 bg-black p-2"
        >
          {stages.map((stage, index) => {
            const active = stage.id === activeStage.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  setActiveStageId(stage.id);
                  setDisclosure("default");
                }}
                className={cx(
                  "flex min-w-0 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold transition",
                  active
                    ? "bg-zinc-100 text-black"
                    : "border border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-950",
                )}
              >
                <span className="hidden text-xs text-zinc-500 xl:inline">{index + 1}</span>
                {stageIcon(stage.id)}
                <span className="truncate">{stage.label}</span>
              </button>
            );
          })}
        </nav>

        <section
          data-testid="decision-step-screen"
          data-active-step={activeStage.id}
          className="min-h-0 overflow-hidden"
        >
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-zinc-800 bg-black">
            <div className="border-b border-zinc-800 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-cyan-200">
                    {stageIcon(activeStage.id)}
                    <span>{activeStage.label}</span>
                    <span className="text-zinc-600">/</span>
                    <span className="text-zinc-500">{stageStatus[activeStage.id] ?? "Ready"}</span>
                  </div>
                  <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
                    {activeStage.question}
                  </h2>
                </div>
                <div className="grid grid-cols-5 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                  {(["default", "evidence", "advanced", "expert", "debug"] as DisclosureLevel[]).map((level) => (
                    <DisclosureButton
                      key={level}
                      level={level}
                      active={disclosure === level}
                      onClick={() => setDisclosure(level)}
                    />
                  ))}
                </div>
              </div>
              {refreshError ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/45 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{refreshError}</span>
                </div>
              ) : null}
            </div>

            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-3 overflow-hidden p-4">
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden">
                <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-500">Decision Summary</div>
                  <h3 className="mt-1 text-xl font-semibold text-zinc-50">
                    {activeStage.summaryLabel}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-300">
                    {activeStage.summary}
                  </p>
                </section>

                <section
                  data-testid="supporting-evidence-panel"
                  className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-cyan-300/25 bg-zinc-950 p-3 shadow-[0_0_0_1px_rgba(103,232,249,0.06)]"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <SlidersHorizontal className="h-4 w-4" />
                      Supporting Evidence · {disclosure === "default" ? "Conclusion view" : `${disclosure[0].toUpperCase()}${disclosure.slice(1)} view`}
                    </div>
                    {activeStage.id === "pulse" ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Search className="h-4 w-4" />
                        Search remains optional
                      </div>
                    ) : null}
                  </div>
                  <div className="min-h-0 overflow-hidden">
                    {activeStage.id === "pulse" && disclosure === "default" ? (
                      <OpportunityPicker
                        opportunities={opportunities}
                        selectedOpportunityId={selectedOpportunityId}
                        onSelectOpportunity={onSelectOpportunity}
                      />
                    ) : disclosure === "default" ? (
                      <div className="grid h-full min-h-0 auto-rows-fr gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                        {activeStage.evidence.slice(0, 4).map((item) => (
                          <div
                            key={item}
                            className="flex min-h-0 rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm leading-6 text-zinc-200"
                          >
                            <span className="line-clamp-6 self-center">{item}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <DetailPanel disclosure={disclosure} stage={activeStage} />
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-500">Recommended Next Step</div>
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <p className="line-clamp-2 text-sm font-semibold leading-6 text-zinc-50">
                      {activeStage.nextStep}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={!canGoBack}
                        onClick={() => moveStage(-1)}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-800 text-zinc-300 transition enabled:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Previous step"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={!canGoForward}
                        onClick={() => moveStage(1)}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-amber-300/45 bg-amber-300 text-black transition enabled:hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Next step"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="border-b border-zinc-800 pb-4">
                  <div className="text-xs text-zinc-500">Current Decision</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-50">
                    {activeStage.label}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <FactCard label="Action" value={recommendedAction} tone={readinessTone} />
                    <FactCard label="Exposure" value={suggestedExposure} tone={readinessTone} />
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto pt-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-50">
                    <Activity className="h-4 w-4 text-cyan-200" />
                    Decision Readiness
                  </div>
                  <div className={cx("text-6xl font-semibold", toneText(readinessTone))}>
                    {Math.round(boundedPct(readinessPct))}%
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-sm bg-zinc-800">
                    <div
                      className={cx(
                        "h-full rounded-sm",
                        readinessTone === "good" && "bg-emerald-300",
                        readinessTone === "warn" && "bg-amber-300",
                        readinessTone === "bad" && "bg-red-300",
                        readinessTone === "neutral" && "bg-cyan-300",
                      )}
                      style={{ width: `${boundedPct(readinessPct)}%` }}
                    />
                  </div>

                  <div className="mt-4 grid gap-2">
                    {evidenceLadder.slice(0, 5).map((stage) => {
                      const tone = statusTone(stage.status);
                      return (
                        <div
                          key={stage.id}
                          className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-zinc-800 bg-black px-3 py-2"
                        >
                          <span className={toneText(tone)}>{statusIcon(stage.status)}</span>
                          <span className="truncate text-xs text-zinc-300">{stage.label}</span>
                          <span className={cx("rounded border px-1.5 py-0.5 text-[10px]", toneBorder(tone))}>
                            {stage.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-lg border border-zinc-800 bg-black p-3">
                    <div className="text-xs text-zinc-500">System State</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-200">
                      {marketStatus} · {lastSyncedLabel}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
