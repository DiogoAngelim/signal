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
    title: "Protocol first",
    description:
      "Public RFCs define the envelope, result model, idempotency, and versioning rules.",
  },
  {
    icon: Cloud,
    title: "Versioned operations",
    description:
      "Queries, mutations, and events use explicit names like payment.capture.v1.",
  },
  {
    icon: Zap,
    title: "Standard envelope",
    description:
      "Every message carries protocol, kind, name, messageId, timestamp, and payload.",
  },
  {
    icon: Shield,
    title: "Idempotent mutations",
    description:
      "Mutations declare whether idempotency is required, optional, or none.",
  },
  {
    icon: RefreshCcw,
    title: "Replay-safe events",
    description:
      "Consumers must tolerate duplicates and avoid assuming global ordering.",
  },
  {
    icon: Layers,
    title: "Capability documents",
    description:
      "Systems expose the queries, mutations, published events, and subscriptions they support.",
  },
  {
    icon: Lock,
    title: "HTTP binding",
    description:
      "The reference server executes queries and mutations over HTTP without redefining the protocol.",
  },
  {
    icon: Code2,
    title: "In-process runtime",
    description:
      "The same registry can execute inside Node.js for local runs and tests.",
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
            Defined for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              adoption
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            The structure stays simple and the contract stays explicit. Signal is
            meant to be read, implemented, and extended.
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
