"use client";

import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

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
            Register, execute, and replay the same rules in{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              one flow
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Payment capture, escrow release, and onboarding all follow the same
            pattern: define the schema, register the operation, and replay the
            same request safely.
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
                      type="button"
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        activeTab === tab.id
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
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
                    <div key={`${i}-${line}`} className="flex">
                      <span className="w-8 text-border select-none">
                        {i + 1}
                      </span>
                      <span>
                        {highlightSyntax(line).map((part) => (
                          <span
                            key={`${part.offset}-${part.text}`}
                            className={part.className}
                          >
                            {part.text}
                          </span>
                        ))}
                      </span>
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

type SyntaxPart = {
  text: string;
  offset: number;
  className?: string;
};

const syntaxPattern =
  /("[^"]*"|'[^']*'|\/\/.*$|\b(?:import|from|const|await|async|return|new)\b|\b(?:defineQuery|defineMutation|defineEvent|createSignalRuntime|registerQuery|registerMutation|registerEvent|mutation|query|emit|start|close)\b|\b(?:SignalRuntime|SignalDispatcher|createMemoryIdempotencyStore)\b)/g;

function highlightSyntax(line: string): SyntaxPart[] {
  const parts: SyntaxPart[] = [];
  let cursor = 0;

  for (const match of line.matchAll(syntaxPattern)) {
    const text = match[0];
    const offset = match.index ?? 0;
    if (offset > cursor) {
      parts.push({ text: line.slice(cursor, offset), offset: cursor });
    }
    parts.push({ text, offset, className: syntaxClassName(text) });
    cursor = offset + text.length;
  }

  if (cursor < line.length) {
    parts.push({ text: line.slice(cursor), offset: cursor });
  }

  return parts.length ? parts : [{ text: line, offset: 0 }];
}

function syntaxClassName(text: string): string | undefined {
  if (/^\/\//.test(text)) return "text-muted-foreground/60";
  if (/^["']/.test(text)) return "text-brain-tissue";
  if (
    /^(defineQuery|defineMutation|defineEvent|createSignalRuntime|registerQuery|registerMutation|registerEvent|mutation|query|emit|start|close)$/.test(
      text,
    )
  ) {
    return "text-accent";
  }
  if (
    /^(SignalRuntime|SignalDispatcher|createMemoryIdempotencyStore)$/.test(text)
  ) {
    return "text-brain-core-light";
  }
  if (/^(import|from|const|await|async|return|new)$/.test(text))
    return "text-primary";
  return undefined;
}
