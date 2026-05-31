import type { ReactNode } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Compass,
  Layers,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";

export type GuideTone = "good" | "warn" | "bad" | "neutral";

export type GuideStepId =
  | "understand"
  | "reality"
  | "matters"
  | "options"
  | "tested"
  | "recommendation"
  | "why"
  | "review";

export type GuideStep = {
  id: GuideStepId;
  label: string;
  question: string;
  summary: string;
  status: string;
  tone?: GuideTone;
};

export type GuideFact = {
  label: string;
  value: string;
  detail?: string;
  tone?: GuideTone;
};

export type AssetClassOption = {
  label: string;
  value: string;
  active?: boolean;
};

export type ProgressSignal = {
  label: string;
  value: number;
  detail: string;
  tone?: GuideTone;
};

export type ConfidenceRangeValue = {
  low: number;
  high: number;
  label: string;
  explanation: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function boundedPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toneAccent(tone: GuideTone = "neutral") {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "bad") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-zinc-200 bg-white text-zinc-900";
}

function toneText(tone: GuideTone = "neutral") {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "bad") return "text-rose-700";
  return "text-zinc-700";
}

function stepIcon(id: GuideStepId) {
  if (id === "understand") return <Target className="h-4 w-4" />;
  if (id === "reality") return <Compass className="h-4 w-4" />;
  if (id === "matters") return <Layers className="h-4 w-4" />;
  if (id === "options") return <SlidersHorizontal className="h-4 w-4" />;
  if (id === "tested") return <CircleDashed className="h-4 w-4" />;
  if (id === "recommendation") return <ShieldCheck className="h-4 w-4" />;
  if (id === "why") return <CheckCircle2 className="h-4 w-4" />;
  return <RefreshCw className="h-4 w-4" />;
}

function CardShell({
  title,
  eyebrow,
  children,
  className,
  testId,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cx(
        "min-w-0 rounded-lg border border-zinc-200/80 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="mt-1 break-words text-lg font-semibold leading-tight text-zinc-950">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function GuideLayout({
  stepRail,
  primary,
  secondary,
  details,
}: {
  stepRail: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
  details?: ReactNode;
}) {
  return (
    <section
      data-testid="decision-step-screen"
      data-layout="market-decision-guide"
      className="grid min-w-0 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_minmax(320px,0.42fr)]"
    >
      <aside className="min-w-0 xl:sticky xl:top-3 xl:self-start">
        {stepRail}
      </aside>
      <div className="grid min-w-0 content-start gap-3">{primary}</div>
      <aside className="grid min-w-0 content-start gap-3">{secondary}</aside>
      {details ? (
        <div className="min-w-0 xl:col-span-3">{details}</div>
      ) : null}
    </section>
  );
}

export function StepRail({
  steps,
  activeStepId = "recommendation",
}: {
  steps: GuideStep[];
  activeStepId?: GuideStepId;
}) {
  return (
    <nav
      data-testid="step-rail"
      aria-label="Guide steps"
      className="signal-scroll-region flex min-w-0 gap-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-sm xl:grid xl:overflow-visible"
    >
      {steps.map((step, index) => {
        const active = step.id === activeStepId;
        return (
          <a
            key={step.id}
            href={`#guide-${step.id}`}
            aria-current={active ? "step" : undefined}
            className={cx(
              "grid min-h-[82px] min-w-[210px] grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition xl:min-w-0",
              active
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-zinc-50 text-zinc-950 hover:border-zinc-400",
            )}
          >
            <span
              className={cx(
                "grid h-8 w-8 place-items-center rounded-md border",
                active
                  ? "border-white/20 bg-white/10"
                  : "border-zinc-200 bg-white",
              )}
            >
              {stepIcon(step.id)}
            </span>
            <span className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-normal opacity-65">
                Step {index + 1}
              </span>
              <span className="block break-words text-sm font-semibold leading-tight">
                {step.label}
              </span>
              <span className="mt-1 line-clamp-2 block break-words text-xs leading-5 opacity-70">
                {step.question}
              </span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}

export function GoalCard({
  goal,
  goals,
  onGoalChange,
  marketLabel,
  supportingText,
}: {
  goal: string;
  goals: string[];
  onGoalChange: (goal: string) => void;
  marketLabel: string;
  supportingText: string;
}) {
  return (
    <section
      id="guide-understand"
      data-testid="primary-answer"
      className="grid min-w-0 gap-5 rounded-lg border border-zinc-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbf9_48%,#eef5fb_100%)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
          User goal
        </div>
        <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900">
          {marketLabel}
        </span>
      </div>
      <div>
        <h1 className="max-w-4xl break-words text-4xl font-semibold leading-none text-zinc-950 sm:text-5xl lg:text-6xl">
          {goal}
        </h1>
        <p className="mt-4 max-w-3xl break-words text-base leading-7 text-zinc-600">
          {supportingText}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {goals.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === goal}
            onClick={() => onGoalChange(item)}
            className={cx(
              "min-h-10 rounded-md border px-3 py-2 text-left text-sm font-semibold transition",
              item === goal
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MarketContextCard({
  options,
  onSelect,
  selectedMarket,
  facts,
}: {
  options: AssetClassOption[];
  onSelect: (value: string) => void;
  selectedMarket: string;
  facts: GuideFact[];
}) {
  return (
    <CardShell
      title="Market Context"
      eyebrow="Subtle identity"
      testId="market-context-card"
    >
      <div className="grid min-w-0 gap-3">
        <div
          data-testid="market-selector"
          className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onSelect(option.value)}
              aria-pressed={option.active}
              className={cx(
                "min-h-11 rounded-md border px-3 py-2 text-left text-sm font-semibold transition",
                option.active
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-white",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          {facts.map((fact) => (
            <FactPill key={fact.label} fact={fact} />
          ))}
        </div>
        <p className="break-words text-sm leading-6 text-zinc-600">
          Signal reads {selectedMarket || "the selected market"} as a decision
          context, not as a scoreboard.
        </p>
      </div>
    </CardShell>
  );
}

export function RealityCheckCard({
  facts,
  narrative,
}: {
  facts: GuideFact[];
  narrative: string;
}) {
  return (
    <CardShell
      title="Reality Check"
      eyebrow="Where things stand"
      testId="reality-check-card"
    >
      <div className="grid min-w-0 gap-3">
        <p className="break-words text-sm leading-6 text-zinc-600">
          {narrative}
        </p>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          {facts.map((fact) => (
            <FactPill key={fact.label} fact={fact} />
          ))}
        </div>
      </div>
    </CardShell>
  );
}

export function FocusCard({
  title = "What Matters",
  items,
}: {
  title?: string;
  items: string[];
}) {
  return (
    <CardShell title={title} eyebrow="Focus" testId="focus-card">
      <ul className="grid gap-2">
        {items.map((item) => (
          <li
            key={item}
            className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 text-sm leading-6 text-zinc-700"
          >
            <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-600" />
            <span className="break-words">{item}</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

export function OptionCard({
  supports,
  worksAgainst,
}: {
  supports: string[];
  worksAgainst: string[];
}) {
  return (
    <CardShell title="Your Options" eyebrow="Supports and limits" testId="option-card">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
            Supports your goal
          </div>
          <ul className="mt-2 grid gap-2">
            {supports.map((item) => (
              <li key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-amber-700">
            Works against it
          </div>
          <ul className="mt-2 grid gap-2">
            {worksAgainst.map((item) => (
              <li key={item} className="break-words text-sm leading-6 text-zinc-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </CardShell>
  );
}

export function RecommendationCard({
  recommendation,
  rationale,
  nextReview,
  tone = "neutral",
}: {
  recommendation: string;
  rationale: string;
  nextReview: string;
  tone?: GuideTone;
}) {
  return (
    <section
      id="guide-recommendation"
      data-testid="recommendation-card"
      className={cx(
        "grid min-w-0 gap-4 rounded-lg border p-5 shadow-[0_24px_65px_rgba(15,23,42,0.08)]",
        toneAccent(tone),
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal opacity-70">
        <ShieldCheck className="h-4 w-4" />
        Recommended Next Step
      </div>
      <h2 className="break-words text-3xl font-semibold leading-tight">
        {recommendation}
      </h2>
      <p className="break-words text-sm leading-6 opacity-85">{rationale}</p>
      <div className="rounded-md border border-current/20 bg-white/45 px-3 py-2 text-sm font-semibold">
        {nextReview}
      </div>
    </section>
  );
}

export function ConfidenceRange({
  low,
  high,
  label,
  explanation,
}: ConfidenceRangeValue) {
  const safeLow = boundedPct(low);
  const safeHigh = Math.max(safeLow, boundedPct(high));
  const rangeWidth = Math.min(100 - safeLow, Math.max(4, safeHigh - safeLow));
  return (
    <div
      data-testid="confidence-range"
      className="grid min-w-0 gap-3 rounded-lg border border-sky-200 bg-white/80 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-sky-700">
            Confidence Range
          </div>
          <div className="mt-1 break-words text-2xl font-semibold text-zinc-950">
            {label}
          </div>
        </div>
        <CircleDashed className="h-5 w-5 text-sky-700" />
      </div>
      <div className="h-2 rounded-full bg-sky-100">
        <div
          className="h-2 rounded-full bg-sky-600"
          style={{
            marginLeft: `${safeLow}%`,
            width: `${rangeWidth}%`,
          }}
        />
      </div>
      <p className="break-words text-sm leading-6 text-zinc-600">
        {explanation}
      </p>
    </div>
  );
}

export function UnknownsCard({ unknowns }: { unknowns: string[] }) {
  return (
    <CardShell
      title="What We Don't Know"
      eyebrow="Humility"
      testId="unknowns-card"
      className="border-amber-200 bg-amber-50/80"
    >
      <ul className="grid gap-2">
        {unknowns.map((item) => (
          <li
            key={item}
            className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 text-sm leading-6 text-amber-950"
          >
            <CircleDashed className="mt-1 h-4 w-4 text-amber-700" />
            <span className="break-words">{item}</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

export function ProgressCard({ items }: { items: ProgressSignal[] }) {
  return (
    <CardShell title="Daily Progress" eyebrow="Process" testId="progress-card">
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-zinc-600">
          Today you stayed disciplined, avoided impulsive decisions, and made
          the process easier to repeat.
        </p>
        {items.map((item) => (
          <div key={item.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-zinc-900">{item.label}</span>
              <span className={cx("font-semibold", toneText(item.tone))}>
                {boundedPct(item.value)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-100">
              <div
                className={cx(
                  "h-1.5 rounded-full",
                  item.tone === "good" && "bg-emerald-500",
                  item.tone === "warn" && "bg-amber-500",
                  item.tone === "bad" && "bg-rose-500",
                  (!item.tone || item.tone === "neutral") && "bg-sky-500",
                )}
                style={{ width: `${boundedPct(item.value)}%` }}
              />
            </div>
            <p className="break-words text-xs leading-5 text-zinc-500">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

export function PlanReviewCard({ checkpoints }: { checkpoints: string[] }) {
  return (
    <CardShell title="Plan & Review" eyebrow="Stay on track" testId="plan-review-card">
      <ol className="grid gap-2">
        {checkpoints.map((checkpoint, index) => (
          <li
            key={checkpoint}
            className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 text-sm leading-6 text-zinc-700"
          >
            <span className="grid h-7 w-7 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-700">
              {index + 1}
            </span>
            <span className="break-words">{checkpoint}</span>
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

export function UserControlCard({
  statement = "Signal guides. You decide.",
}: {
  statement?: string;
}) {
  return (
    <CardShell title="You Remain In Control" eyebrow="Control" testId="user-control-card">
      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="break-words text-sm font-semibold leading-6 text-zinc-800">
          {statement}
        </p>
      </div>
    </CardShell>
  );
}

function FactPill({ fact }: { fact: GuideFact }) {
  return (
    <div className={cx("min-w-0 rounded-md border px-3 py-2", toneAccent(fact.tone))}>
      <div className="break-words text-xs font-medium opacity-70">
        {fact.label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold leading-snug">
        {fact.value}
      </div>
      {fact.detail ? (
        <div className="mt-1 break-words text-xs leading-5 opacity-75">
          {fact.detail}
        </div>
      ) : null}
    </div>
  );
}

export function defaultGuideSteps(input: {
  goal: string;
  reality: string;
  focus: string;
  options: string;
  tested?: string;
  recommendation: string;
  why?: string;
  review: string;
  tone?: GuideTone;
}): GuideStep[] {
  return [
    {
      id: "understand",
      label: "What is happening now?",
      question: "The current market setup in plain language.",
      summary: input.reality,
      status: "Goal",
      tone: "neutral",
    },
    {
      id: "recommendation",
      label: "What Signal suggests",
      question: "The safest justified action right now.",
      summary: input.recommendation,
      status: "Next",
      tone: input.tone,
    },
    {
      id: "why",
      label: "Why Signal is confident or cautious",
      question: "The plain reason behind the recommendation.",
      summary: input.focus,
      status: "Reason",
      tone: input.tone,
    },
    {
      id: "review",
      label: "What similar past decisions taught Signal",
      question: "How previous outcomes shape today's caution.",
      summary: input.review || "Signal has seen similar situations before. Past outcomes increased confidence slightly.",
      status: "Learning",
      tone: "neutral",
    },
    {
      id: "tested",
      label: "What Signal will track after this",
      question: "The result Signal will compare later.",
      summary: input.tested ?? input.options,
      status: "Track",
      tone: "warn",
    },
    {
      id: "matters",
      label: "Why this decision matters",
      question: "Why the choice affects future confidence.",
      summary: input.why ?? input.focus,
      status: "Meaning",
      tone: input.tone,
    },
  ];
}

export function createConfidenceRange(input: {
  confidence: number | null;
  trust: number | null;
  cautionCount: number;
  failCount: number;
}): ConfidenceRangeValue {
  const base =
    input.confidence != null && Number.isFinite(input.confidence)
      ? input.confidence
      : input.trust != null && Number.isFinite(input.trust)
        ? input.trust
        : 45;
  const uncertainty = 10 + input.cautionCount * 4 + input.failCount * 9;
  const low = boundedPct(base - uncertainty);
  const high = boundedPct(base + Math.max(12, uncertainty * 0.75));
  return {
    low,
    high,
    label: `${low}%-${high}%`,
    explanation: "We don't know enough to be certain. Treat this as a range, not a promise.",
  };
}

export function recommendedNextStep(input: {
  action: string;
  exposureText: string;
  failCount: number;
  risk: number | null;
  missingEvidence: string;
}) {
  const action = input.action.toLowerCase();
  const noExposure = /no new exposure|no exposure|0%|flat|none/i.test(
    input.exposureText,
  );

  if (input.failCount > 0 || (input.risk != null && input.risk >= 72)) {
    return "Protect capital first.";
  }

  if (noExposure || /wait|hold|watch|review/.test(action)) {
    return "Wait for stronger confirmation.";
  }

  if (/sell|exit|reduce/.test(action)) {
    return "Reduce risk only where your plan already requires it.";
  }

  if (/buy|add|long|enter/.test(action)) {
    return "Consider a small planned entry only after confirmation.";
  }

  return input.action || "Stay patient and review the next update.";
}

export function processProgress(input: {
  readiness: number;
  risk: number | null;
  confidenceRange: ConfidenceRangeValue;
  hasExposure: boolean;
}): ProgressSignal[] {
  const patience = input.hasExposure ? 68 : 86;
  const discipline =
    input.risk != null && input.risk > 70 ? 84 : Math.max(62, input.readiness);
  const consistency = Math.max(58, Math.min(88, input.readiness + 8));
  const confidenceQuality = Math.max(
    38,
    100 - (input.confidenceRange.high - input.confidenceRange.low) * 1.6,
  );
  const decisionQuality = Math.max(
    45,
    Math.min(92, (discipline + consistency + confidenceQuality) / 3),
  );

  return [
    {
      label: "Patience",
      value: patience,
      detail: input.hasExposure
        ? "You kept the position size bounded."
        : "You waited instead of forcing a trade.",
      tone: "good",
    },
    {
      label: "Discipline",
      value: discipline,
      detail: "The recommendation stays tied to evidence and risk.",
      tone: discipline >= 70 ? "good" : "warn",
    },
    {
      label: "Consistency",
      value: consistency,
      detail: "The same process can be repeated tomorrow.",
      tone: consistency >= 70 ? "good" : "warn",
    },
    {
      label: "Confidence quality",
      value: confidenceQuality,
      detail: "The range keeps uncertainty visible.",
      tone: confidenceQuality >= 70 ? "good" : "warn",
    },
    {
      label: "Decision quality",
      value: decisionQuality,
      detail: "The next step is clear without pretending to predict the future.",
      tone: decisionQuality >= 70 ? "good" : "warn",
    },
  ];
}

export function uniqueGuideList(values: Array<string | null | undefined>, limit = 5) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}
