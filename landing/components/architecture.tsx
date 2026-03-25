import { cn } from "@/lib/utils";

const packages = [
  {
    name: "core",
    description: "Signal.ts, Registry, Collection, Lifecycle, Context",
    color: "from-brain-core-light via-brain-core-glow to-brain-core-rose",
  },
  {
    name: "db",
    description: "Database abstraction + adapters",
    color: "from-brain-core-rose via-brain-core-root to-brain-core-light",
  },
  {
    name: "transport",
    description: "Event bus + transport adapters",
    color: "from-brain-core-light/80 via-brain-core-glow/80 to-brain-core-rose/80",
  },
  {
    name: "http",
    description: "HTTP handler, router, validation",
    color: "from-brain-core-rose/80 via-brain-core-root/80 to-brain-core-light/80",
  },
  {
    name: "security",
    description: "Auth, access control",
    color: "from-brain-core-light via-brain-core-glow to-brain-core-rose",
  },
  {
    name: "utils",
    description: "Utilities (freeze, hash, logger)",
    color: "from-brain-core-rose via-brain-core-glow to-brain-core-light",
  },
];

const lifecycle = [
  { phase: "CONFIGURING", description: "Initial state, configure with configure()" },
  { phase: "REGISTERING", description: "Register collections, queries, mutations" },
  { phase: "RUNNING", description: "Operational, registry immutable" },
  { phase: "FAILED", description: "Unrecoverable error" },
];

export function Architecture() {
  return (
    <section id="architecture" className="relative py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/5 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Modular{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              architecture
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Clean separation of concerns. Each package handles one responsibility.
            Extend or replace any component.
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
                        index === 2
                          ? "border-primary bg-primary/20"
                          : index === 3
                          ? "border-brain-core-rose/50 bg-brain-core-rose/10"
                          : "border-border bg-card"
                      )}
                    >
                      <span className="text-xs font-bold">{index + 1}</span>
                    </div>

                    <div className="flex-1 pt-1.5">
                      <p
                        className={cn(
                          "font-mono text-sm font-semibold",
                          index === 2
                            ? "text-primary"
                            : index === 3
                            ? "text-brain-core-rose"
                            : "text-foreground"
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
                <span className="text-primary">const</span> signal ={" "}
                <span className="text-primary">new</span>{" "}
                <span className="text-secondary-foreground">Signal</span>();{" "}
                <span className="text-muted-foreground/60">{"// CONFIGURING"}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                signal.<span className="text-accent">configure</span>({"{"} ... {"}"});{" "}
                <span className="text-muted-foreground/60">{"// REGISTERING"}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                <span className="text-primary">await</span> signal.
                <span className="text-accent">start</span>();{" "}
                <span className="text-muted-foreground/60">{"// RUNNING"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
