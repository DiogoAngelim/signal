import { ArrowDown, BookOpen, CheckCircle2, GitBranch } from "lucide-react";

const situationRows = [
  {
    label: "Read",
    state: "Current state is visible before anything changes.",
  },
  {
    label: "Change",
    state: "Important actions are named, explicit, and replay aware.",
  },
  {
    label: "Announce",
    state: "Facts remain traceable after the workflow moves on.",
  },
];

export function Hero() {
  return (
    <section
      id="understanding"
      className="relative flex min-h-[100svh] items-center border-b border-border bg-background pt-24 pb-14"
    >
      <div className="surface-grid absolute inset-0" />
      <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-6 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-12">
        <div className="flex flex-col justify-center">
          <p className="mb-6 text-sm font-medium uppercase tracking-normal text-muted-foreground">
            Signal
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-none tracking-normal text-foreground sm:text-6xl lg:text-7xl">
            Current understanding
          </h1>
          <p className="mt-8 max-w-3xl text-xl leading-8 text-foreground sm:text-2xl sm:leading-9">
            Signal appears most useful when a team needs to understand what is
            happening across a workflow before it acts again. Reads stay
            separate from changes, changes can be retried without confusion, and
            facts remain visible after the moment passes.
          </p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            The reference path is ready to inspect. Adoption should start with a
            small operational flow, then broaden as evidence from real use
            improves.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#reasoning"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Read the reasoning
              <ArrowDown className="h-4 w-4" />
            </a>
            <a
              href="/docs/what-is-signal"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
            >
              <BookOpen className="h-4 w-4" />
              Open docs
            </a>
            <a
              href="https://github.com/DiogoAngelim/signal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-transparent px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <GitBranch className="h-4 w-4" />
              Repository
            </a>
          </div>
        </div>

        <figure
          aria-label="A calm Signal briefing surface"
          className="flex min-h-[28rem] flex-col justify-between rounded-lg border border-border bg-card p-6 shadow-[0_24px_80px_rgba(31,42,36,0.08)]"
        >
          <div>
            <div className="flex items-start justify-between gap-6 border-b border-border pb-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Brief
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                  One workflow, one understandable state
                </h2>
              </div>
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-primary" />
            </div>

            <div className="mt-6 space-y-5">
              {situationRows.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-3 border-b border-border/70 pb-5 last:border-b-0 last:pb-0 sm:grid-cols-[7rem_1fr]"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {row.label}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {row.state}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-lg bg-muted p-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Reasonable next step: run the reference server against one real
              flow and compare the returned result with the team's current
              source of truth.
            </p>
          </div>
        </figure>
      </div>
    </section>
  );
}
