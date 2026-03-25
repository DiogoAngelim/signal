import {
  Database,
  Shield,
  Zap,
  Cloud,
  Lock,
  Layers,
  RefreshCcw,
  Code2,
} from "lucide-react";

const features = [
  {
    icon: Database,
    title: "Database Agnostic",
    description:
      "Works with any database. Signal keeps policy in the core and storage in adapters.",
  },
  {
    icon: Cloud,
    title: "Serverless-First",
    description:
      "Built for Vercel, AWS Lambda, Fly.io, and edge runtimes with no long-lived state.",
  },
  {
    icon: Zap,
    title: "Named Operations",
    description:
      "Every query and mutation is explicit, named, and easy to trace end to end.",
  },
  {
    icon: Shield,
    title: "Declarative Access Control",
    description:
      "Define access rules at the collection level. They run before handlers every time.",
  },
  {
    icon: RefreshCcw,
    title: "Idempotent Mutations",
    description:
      "Use an idempotency key plus payload fingerprint to replay stored results or detect conflicts.",
  },
  {
    icon: Layers,
    title: "Replay-Safe Events",
    description:
      "Event handlers stay safe under retries and out-of-order delivery.",
  },
  {
    icon: Lock,
    title: "Inbox / Outbox",
    description:
      "Per-consumer dedupe and append-only audit hooks keep delivery explicit and adapter-friendly.",
  },
  {
    icon: Code2,
    title: "Optimistic Concurrency",
    description:
      "Expected versions raise explicit mismatch errors instead of silently overwriting data.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-32">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/5 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Built for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              production
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Every design decision is made with production guarantees in mind.
            No compromises on reliability, security, or developer experience.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative p-6 rounded-2xl bg-card/50 border border-border hover:border-brain-core-glow/30 transition-all duration-300 hover:bg-card"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Hover glow */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brain-core-light/6 via-brain-core-glow/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brain-core-light/20 via-brain-core-glow/10 to-brain-core-rose/10 flex items-center justify-center mb-4 group-hover:from-brain-core-light/30 group-hover:to-brain-core-rose/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
