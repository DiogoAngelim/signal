import { cn } from "@/lib/utils";

const packages = [
  {
    name: "core",
    description: "Envelope, naming, result model, errors, and capability documents",
    color: "from-brain-core-light via-brain-core-glow to-brain-core-rose",
  },
  {
    name: "db",
    description: "PostgreSQL idempotency store and replay-safe projections",
    color: "from-brain-core-rose via-brain-core-root to-brain-core-light",
  },
  {
    name: "transport",
    description: "HTTP binding, in-process execution, and event dispatch",
    color: "from-brain-core-light/80 via-brain-core-glow/80 to-brain-core-rose/80",
  },
  {
    name: "http",
    description: "Query and mutation routes plus capability declaration",
    color: "from-brain-core-rose/80 via-brain-core-root/80 to-brain-core-light/80",
  },
  {
    name: "security",
    description: "Extension points for auth and request context",
    color: "from-brain-core-light via-brain-core-glow to-brain-core-rose",
  },
  {
    name: "utils",
    description: "Helpers used by the runtime and example packages",
    color: "from-brain-core-rose via-brain-core-glow to-brain-core-light",
  },
];

const lifecycle = [
  { phase: "SPECIFIED", description: "RFCs define names, envelope fields, and semantics" },
  { phase: "REGISTERED", description: "Operations are added to the runtime with schemas" },
  { phase: "RUNNING", description: "Queries execute, mutations can emit, events can replay" },
];

export function Architecture() {
  return (
    <section id="architecture" className="relative py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/5 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Separation of{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              protocol concerns
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            The protocol, runtime, bindings, and docs are kept separate so each
            layer can be read and implemented on its own.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Packages */}
          <div>
            <h3 className="text-xl font-semibold mb-6">Packages</h3>
            <div className="space-y-3">
              {packages.map((pkg) => (
                <div
                  key={pkg.name}
                  className="group flex items-start gap-4 p-4 rounded-xl bg-card/50 border border-border hover:border-brain-core-glow/30 transition-all"
                >
                  <div
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center",
                      pkg.color
                    )}
                  >
                    <span className="text-xs font-bold text-background">
                      {pkg.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold text-foreground">
                      /packages/{pkg.name}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {pkg.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lifecycle */}
          <div>
            <h3 className="text-xl font-semibold mb-6">Lifecycle Phases</h3>
            <div className="relative">
              {/* Connection line */}
              <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary via-secondary to-muted" />

              <div className="space-y-4">
                {lifecycle.map((item, index) => (
                  <div key={item.phase} className="relative flex items-start gap-4">
                    {/* Dot */}
                    <div
                      className={cn(
                        "relative z-10 flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center",
                        index === 2 ? "border-primary bg-primary/20" : "border-border bg-card"
                      )}
                    >
                      <span className="text-xs font-bold">{index + 1}</span>
                    </div>

                    <div className="flex-1 pt-1.5">
                      <p
                        className={cn(
                          "font-mono text-sm font-semibold",
                          index === 2 ? "text-primary" : "text-foreground"
                        )}
                      >
                        {item.phase}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Code example */}
            <div className="mt-8 p-4 rounded-xl bg-card border border-border font-mono text-sm">
              <div className="text-muted-foreground">
                <span className="text-primary">const</span> runtime ={" "}
                <span className="text-primary">new</span>{" "}
                <span className="text-secondary-foreground">SignalRuntime</span>();{" "}
                <span className="text-muted-foreground/60">{"// SPECIFIED"}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                runtime.<span className="text-accent">registerMutation</span>("payment.capture.v1", mutation);{" "}
                <span className="text-muted-foreground/60">{"// REGISTERED"}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                <span className="text-primary">await</span> runtime.
                <span className="text-accent">mutation</span>("payment.capture.v1", payload, {"{ idempotencyKey }"});{" "}
                <span className="text-muted-foreground/60">{"// RUNNING"}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                <span className="text-primary">const</span> replay ={" "}
                <span className="text-primary">await</span> runtime.
                <span className="text-accent">mutation</span>("payment.capture.v1", payload, {"{ idempotencyKey }"});{" "}
                <span className="text-muted-foreground/60">{"// same logical result"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
