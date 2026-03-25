"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    id: "setup",
    label: "Setup",
    code: `import { Signal, MemoryAdapter, InMemoryTransport } from "@digelo/signal";

// 1. Create and configure
const signal = new Signal();

signal.configure({
  db: new MemoryAdapter(),
  transport: new InMemoryTransport(),
});`,
  },
  {
    id: "collection",
    label: "Collection",
    code: `// 2. Register collection with access control
signal
  .collection("posts")
  .access({
    query: { list: "public" },
    mutation: { create: "auth" },
  })
  .query("list", async (_, ctx) => {
    return ctx.db.find("posts", { published: true });
  })
  .mutation("create", async (params, ctx) => {
    const postId = await ctx.db.insert("posts", {
      title: params.title,
      authorId: ctx.auth.user?.id,
    });
    // ctx.emit writes to the outbox and stays replay-safe.
    await ctx.emit("posts.created", { postId });
    return { postId };
  });`,
  },
  {
    id: "execute",
    label: "Replay",
    code: `// 3. Start the framework
await signal.start();

// 4. Retry-safe writes use an idempotency key and expected version.
const request = {
  idempotencyKey: "req_123",
  expectedVersion: 7,
};

const first = await signal.mutation("posts.create", {
  title: "Hello, Signal!",
}, { ...context, request });

const replay = await signal.mutation("posts.create", {
  title: "Hello, Signal!",
}, { ...context, request });

console.log(first, replay); // same stored result, no duplicate write`,
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
            Get started in{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              minutes
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Clean, explicit API that feels familiar. Configure once, register
            your collections, and keep retries, duplicates, and version checks explicit.
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
    // Strings
    .replace(
      /("[^"]*"|'[^']*')/g,
      '<span class="text-brain-tissue">$1</span>'
    )
    // Comments
    .replace(/(\/\/.*$)/g, '<span class="text-muted-foreground/60">$1</span>')
    // Keywords
    .replace(
      /\b(import|from|const|await|async|return|new)\b/g,
      '<span class="text-primary">$1</span>'
    )
    // Functions and methods
    .replace(
      /\b(configure|collection|access|query|mutation|start|find|insert|emit)\b/g,
      '<span class="text-accent">$1</span>'
    )
    .replace(
      /\b(update|registerAuditHook|getAuditTrail|getResourceVersion)\b/g,
      '<span class="text-accent">$1</span>'
    )
    // Types/classes
    .replace(
      /\b(Signal|MemoryAdapter|InMemoryTransport)\b/g,
      '<span class="text-brain-core-light">$1</span>'
    );
}
