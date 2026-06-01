import {
  ChevronDown,
  ClipboardList,
  FileText,
  SearchCheck,
} from "lucide-react";

type DetailGroup = {
  title: string;
  lines: string[];
};

type PracticeScenario = {
  title: string;
  person: string;
  role: string;
  avatar: string;
  observation: string;
};

const reasoningGroups: DetailGroup[] = [
  {
    title: "Why this view currently holds",
    lines: [
      "Queries, mutations, and events give teams distinct words for different kinds of work.",
      "Idempotent mutations make retry behavior easier to explain after a timeout or failure.",
      "Capability documents help callers see what a runtime supports before depending on it.",
    ],
  },
  {
    title: "What remains uncertain",
    lines: [
      "The clearest production boundary depends on each team's existing source of truth.",
      "Some older compatibility areas still need context before they should guide new adoption.",
      "The protocol is easier to trust after it has been exercised inside one real workflow.",
    ],
  },
  {
    title: "What would change the view",
    lines: [
      "More reviewed workflows show that retry, replay, and capability discovery stay understandable.",
      "Documentation and examples continue to remove implementation ambiguity.",
      "A team finds that its current transport already gives the same clarity with less change.",
    ],
  },
];

const evidenceGroups: DetailGroup[] = [
  {
    title: "Protocol evidence",
    lines: [
      "Named envelopes keep the operation, payload, and result shape visible.",
      "Structured errors give callers stable reasons instead of ad hoc failure text.",
      "Capabilities describe available operations without requiring private implementation knowledge.",
    ],
  },
  {
    title: "Runtime evidence",
    lines: [
      "The reference server demonstrates query, mutation, and event paths together.",
      "Mutation idempotency records a logical result so retries do not become duplicate changes.",
      "Observed events make downstream facts inspectable after an operation completes.",
    ],
  },
  {
    title: "Adoption evidence",
    lines: [
      "The smallest useful trial is one workflow with a clear read, one change, and one emitted fact.",
      "The docs should answer what happened first, then reveal implementation details as needed.",
      "Internal scores and diagnostics belong behind the explanation, not ahead of it.",
    ],
  },
];

const scenarios: PracticeScenario[] = [
  {
    title: "Payment capture",
    person: "Maya Chen",
    role: "Payments lead",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80",
    observation:
      "The useful question is whether this charge has already reached a durable result.",
  },
  {
    title: "Escrow release",
    person: "Jordan Bell",
    role: "Operations manager",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80",
    observation:
      "The useful question is whether funds can move once while every retry remains explainable.",
  },
  {
    title: "User onboarding",
    person: "Ava Patel",
    role: "Platform engineer",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=240&q=80",
    observation:
      "The useful question is whether follow-up work stays attached to one known account state.",
  },
];

function DetailLayer({
  id,
  icon: Icon,
  label,
  title,
  intro,
  groups,
}: {
  id: string;
  icon: typeof SearchCheck;
  label: string;
  title: string;
  intro: string;
  groups: DetailGroup[];
}) {
  return (
    <section id={id} className="border-b border-border py-24">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-[0.42fr_0.58fr]">
          <div>
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
              {label}
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-foreground sm:text-4xl">
              {title}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {intro}
            </p>
          </div>

          <div className="space-y-3">
            {groups.map((group) => (
              <details
                key={group.title}
                className="group rounded-lg border border-border bg-card p-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground">
                  {group.title}
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
                  {group.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Practice() {
  return (
    <section id="practice" className="py-24">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
            In practice
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-foreground sm:text-4xl">
            The interface starts with the situation, not the machinery.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            These workflows still rely on the protocol, runtime, and transport
            details. The visible experience simply begins with what a person
            needs to understand.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {scenarios.map((scenario) => (
            <article
              key={scenario.title}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-center gap-4">
                <img
                  src={scenario.avatar}
                  alt={`${scenario.person}, ${scenario.role}`}
                  className="h-14 w-14 rounded-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <h3 className="text-lg font-semibold tracking-normal text-foreground">
                    {scenario.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {scenario.person}, {scenario.role}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                {scenario.observation}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <>
      <DetailLayer
        id="reasoning"
        icon={SearchCheck}
        label="Reasoning"
        title="Why this understanding is reasonable"
        intro="The reasoning layer is available when a reader wants more context. It stays quiet until they ask for it."
        groups={reasoningGroups}
      />
      <DetailLayer
        id="evidence"
        icon={FileText}
        label="Evidence"
        title="The details remain available"
        intro="Evidence supports the understanding without replacing it. Technical material belongs here, behind the main explanation."
        groups={evidenceGroups}
      />
      <DetailLayer
        id="checks"
        icon={ClipboardList}
        label="Checks"
        title="What to look for before broad adoption"
        intro="Signal should become more visible only where it helps people reason about reality with less effort."
        groups={[
          {
            title: "A small first trial",
            lines: [
              "Choose one workflow where retries, facts, and results are currently difficult to explain.",
              "Run the reference server locally and compare the returned result with the existing operational record.",
              "Keep the rollout gradual until the team can describe the situation plainly.",
            ],
          },
        ]}
      />
      <Practice />
    </>
  );
}
