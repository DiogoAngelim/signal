"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    id: "setup",
    label: "Setup",
    code: `import { createSignalRuntime, defineQuery, defineMutation } from "@signal/sdk-node";
import { createMemoryIdempotencyStore } from "@signal/runtime";

const runtime = createSignalRuntime({
  runtimeName: "signal-reference",
  dispatcher,
  idempotencyStore: createMemoryIdempotencyStore(),
});

runtime.registerQuery(
  defineQuery({
    name: "payment.status.v1",
    kind: "query",
    inputSchema: paymentStatusInputSchema,
    resultSchema: paymentStatusResultSchema,
    handler: async (input) => repository.getPayment(input.paymentId),
  })
);`,
  },
  {
    id: "mutation",
    label: "Mutation",
    code: `runtime.registerMutation(
  defineMutation({
    name: "payment.capture.v1",
    kind: "mutation",
    idempotency: "required",
    inputSchema: paymentCaptureInputSchema,
    resultSchema: paymentStatusResultSchema,
    handler: async (input, context) => {
      const captured = await repository.capturePayment(input);
      await context.emit("payment.captured.v1", {
        paymentId: captured.paymentId,
        amount: captured.amount,
        currency: captured.currency,
        capturedAt: captured.capturedAt ?? new Date().toISOString(),
      });
      return captured;
    },
  })
);`,
  },
  {
    id: "execute",
    label: "Replay",
    code: `const first = await runtime.mutation(
  "payment.capture.v1",
  { paymentId: "pay_1001", amount: 120, currency: "USD" },
  { idempotencyKey: "capture-pay_1001-001" }
);

const replay = await runtime.mutation(
  "payment.capture.v1",
  { paymentId: "pay_1001", amount: 120, currency: "USD" },
  { idempotencyKey: "capture-pay_1001-001" }
);

// The second call returns the stored logical result.
console.log(first.ok, replay.ok);`,
  },
];

export function CodeExample() {
  const [activeTab, setActiveTab] = useState("setup");
  const [copied, setCopied] = useState(false);

  const activeCode = tabs.find((tab) => tab.id === activeTab)?.code || "";

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="code" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Register, execute, and replay in{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              one flow
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            The example keeps the contract visible from registration to retry.
            The code shown here is intentionally small and explicit.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {/* Tab header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-brain-core-light/80" />
                  <div className="w-3 h-3 rounded-full bg-brain-core-glow/80" />
                  <div className="w-3 h-3 rounded-full bg-brain-core-rose/80" />
                </div>
                <div className="ml-4 flex gap-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        activeTab === tab.id
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-brain-core-glow" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Code content */}
            <div className="p-6 overflow-x-auto">
              <pre className="text-sm font-mono leading-relaxed">
                <code className="text-muted-foreground">
                  {activeCode.split("\n").map((line, i) => (
                    <div key={i} className="flex">
                      <span className="w-8 text-border select-none">
                        {i + 1}
                      </span>
                      <span
                        dangerouslySetInnerHTML={{
                          __html: highlightSyntax(line),
                        }}
                      />
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function highlightSyntax(line: string): string {
  return line
    .replace(
      /("[^"]*"|'[^']*')/g,
      '<span class="text-brain-tissue">$1</span>'
    )
    .replace(/(\/\/.*$)/g, '<span class="text-muted-foreground/60">$1</span>')
    .replace(
      /\b(import|from|const|await|async|return|new)\b/g,
      '<span class="text-primary">$1</span>'
    )
    .replace(
      /\b(defineQuery|defineMutation|defineEvent|createSignalRuntime|registerQuery|registerMutation|registerEvent|mutation|query|emit|start|close)\b/g,
      '<span class="text-accent">$1</span>'
    )
    .replace(
      /\b(SignalRuntime|SignalDispatcher|createMemoryIdempotencyStore)\b/g,
      '<span class="text-brain-core-light">$1</span>'
    );
}
