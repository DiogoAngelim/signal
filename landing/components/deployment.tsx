import { cn } from "@/lib/utils";

const platforms = [
  {
    name: "In-process",
    code: `const result = await runtime.query("payment.status.v1", input);`,
    description: "Execute the same registry directly in Node.js for local runs",
  },
  {
    name: "HTTP",
    code: `POST /signal/query
POST /signal/mutation
GET /signal/capabilities`,
    description: "Expose queries, mutations, and capability documents over HTTP",
  },
  {
    name: "Reference server",
    code: `pnpm --filter @signal/reference-server dev`,
    description: "Run the Node.js implementation that demonstrates the contract end to end",
  },
];

export function Deployment() {
  return (
    <section id="deployment" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Bind the protocol{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              in two ways
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            The first release includes an in-process binding and an HTTP binding.
            Both execute the same protocol surface.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {platforms.map((platform, index) => (
            <div
              key={platform.name}
              className={cn(
                "group relative p-6 rounded-2xl border transition-all duration-300",
                index === 0
                  ? "bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/8 border-primary/30"
                  : "bg-card/50 border-border hover:border-brain-core-glow/20"
              )}
            >
              {index === 0 && (
                <div className="absolute -top-3 left-6 px-3 py-1 text-xs font-semibold bg-primary text-background rounded-full">
                  Local
                </div>
              )}

              <h3 className="text-xl font-semibold mb-2">{platform.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {platform.description}
              </p>

              <div className="p-4 rounded-lg bg-background/50 border border-border font-mono text-xs overflow-x-auto">
                <pre className="text-muted-foreground whitespace-pre-wrap">
                  {platform.code}
                </pre>
              </div>
            </div>
          ))}
        </div>

        {/* HTTP Endpoints */}
        <div className="mt-16 p-8 rounded-2xl bg-card/50 border border-border">
          <h3 className="text-xl font-semibold mb-6 text-center">
            HTTP Endpoints
          </h3>
          <p className="text-center text-sm text-muted-foreground mb-6">
            The HTTP binding carries protocol fields, request context, and capability data.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brain-core-light/10 text-brain-core-light font-mono text-sm mb-3">
                POST
              </div>
              <p className="font-mono text-sm">/signal/query</p>
              <p className="text-xs text-muted-foreground mt-2">
                Execute read-only queries
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brain-core-glow/10 text-brain-core-glow font-mono text-sm mb-3">
                POST
              </div>
              <p className="font-mono text-sm">/signal/mutation</p>
              <p className="text-xs text-muted-foreground mt-2">
                Execute explicit mutations
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brain-core-rose/10 text-brain-core-rose font-mono text-sm mb-3">
                GET
              </div>
              <p className="font-mono text-sm">/signal/capabilities</p>
              <p className="text-xs text-muted-foreground mt-2">
                Discover supported operations
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
