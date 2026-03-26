type Scenario = {
  id: string;
  title: string;
  person: string;
  role: string;
  company: string;
  companyType: string;
  avatar: string;
  logo: string;
  pain: string;
  solution: string;
  outcome: string;
};

const scenarios: Scenario[] = [
  {
    id: "payment-capture",
    title: "Payment capture",
    person: "Maya Chen",
    role: "Payments Lead",
    company: "Payoneer",
    companyType: "Payments Platform",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80",
    logo: "https://s3-symbol-logo.tradingview.com/payoneer.svg",
    pain:
      "The same payment can be processed twice when systems retry a request after a timeout or network failure.",
    solution:
      "Each payment request is handled as one durable action. If the same request comes back, the system returns the same result instead of charging again.",
    outcome:
      "One payment, one result, and a clean audit trail that other systems can trust.",
  },
  {
    id: "escrow-release",
    title: "Escrow release",
    person: "Jordan Bell",
    role: "Operations Manager",
    company: "PayPal",
    companyType: "Payments Platform",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80",
    logo: "https://s3-symbol-logo.tradingview.com/paypal.svg",
    pain:
      "More than one internal system may try to release the same funds, which creates real financial risk.",
    solution:
      "The release is recorded once as a verified action. Duplicate attempts become safe retries instead of duplicate transfers.",
    outcome:
      "Funds move once, operations stay calm, and compliance teams can trace every step.",
  },
  {
    id: "user-onboarding",
    title: "User onboarding",
    person: "Ava Patel",
    role: "Platform Engineer",
    company: "Apple",
    companyType: "Consumer Platform",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=240&q=80",
    logo: "https://s3-symbol-logo.tradingview.com/apple.svg",
    pain:
      "Account creation usually triggers several follow-up steps, and retries can accidentally create duplicates or partial setups.",
    solution:
      "The account is created once, then welcome emails, provisioning, and downstream tasks happen safely around that single source of truth.",
    outcome:
      "Cleaner onboarding, fewer support issues, and a flow that is easy to understand.",
  },
  {
    id: "read-model-queries",
    title: "Read-only queries",
    person: "Elena Rossi",
    role: "Support Lead",
    company: "Oracle",
    companyType: "Enterprise Software",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80",
    logo: "https://s3-symbol-logo.tradingview.com/oracle.svg",
    pain:
      "Some APIs blur reading and writing, which makes them hard to trust and risky to retry.",
    solution:
      "Read actions are kept read-only. They return status and data without changing anything in the system.",
    outcome:
      "Support gets reliable answers, retries stay harmless, and behavior remains clear.",
  },
];

function PersonCluster({
  avatar,
  person,
  role,
  company,
}: {
  avatar: string;
  person: string;
  role: string;
  company: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-full bg-primary/15 blur-md" />
        <img
          src={avatar}
          alt={`${person}, ${role}`}
          className="relative h-14 w-14 rounded-full object-cover ring-1 ring-border"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">
          {person}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {role} · {company}
        </p>
      </div>
    </div>
  );
}

function CompanyBadge({
  logo,
  companyType,
  company,
}: {
  logo: string;
  companyType: string;
  company: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 backdrop-blur-xl">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-card/80">
        <img
          src={logo}
          alt={`${company} logo`}
          className="h-3.5 w-3.5 object-contain opacity-90"
          loading="lazy"
          decoding="async"
        />
      </span>
      <span className="text-xs font-medium tracking-[-0.01em] text-muted-foreground">
        {companyType}
      </span>
    </div>
  );
}

function SectionBlock({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-sm leading-6 tracking-[-0.01em] ${emphasis ? "text-foreground" : "text-muted-foreground"
          }`}
      >
        {value}
      </p>
    </div>
  );
}

function ScenarioCard({ item, index }: { item: Scenario; index: number }) {
  return (
    <article
      className="
        group relative flex h-full flex-col overflow-hidden rounded-[28px]
        border border-border bg-card/60 p-6
        shadow-[0_12px_48px_rgba(0,0,0,0.22)]
        backdrop-blur-2xl transition-all duration-300
        hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/75
      "
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,114,71,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(39,102,166,0.10),transparent_32%)] opacity-90" />
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-border/80 to-transparent" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">

          <CompanyBadge
            logo={item.logo}
            companyType={item.companyType}
            company={item.company}
          />
        </div>

        <div className="mt-5">
          <PersonCluster
            avatar={item.avatar}
            person={item.person}
            role={item.role}
            company={item.company}
          />
        </div>

        <div className="mt-6 space-y-4">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
            {item.title}
          </h3>

          <div className="rounded-[24px] border border-border bg-background/50 p-4 shadow-inner">
            <div className="space-y-4">
              <SectionBlock label="Problem" value={item.pain} />
              <SectionBlock
                label="Solution"
                value={item.solution}
              />
              <SectionBlock label="Result" value={item.outcome} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function Features() {
  return (
    <section id="use-cases" className="relative overflow-hidden py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/5 to-transparent" />
      <div className="absolute bottom-0 right-[-8rem] h-[20rem] w-[20rem] rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.32em] text-muted-foreground">
            Real workflows
          </p>

          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            <span className="text-foreground">System behavior,</span>
            <br className="hidden sm:block" />{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              shown through real teams.
            </span>
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            A clearer way to show what the platform does: familiar roles,
            concrete operational problems, and outcomes people can understand
            quickly.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:gap-8">
          {scenarios.map((item, index) => (
            <ScenarioCard key={item.id} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
