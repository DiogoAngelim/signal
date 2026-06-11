import type { SignalCapabilities } from "@signal/protocol";
import type { FastifyInstance } from "fastify";
import { createReferenceRuntime, createReferenceServer } from "./lib/runtime";
import { registerHealthRoute } from "./routes/health";
import { registerObservedEventsRoute } from "./routes/observed-events";

export async function startReferenceServer(): Promise<{
  app: FastifyInstance;
  port: number;
  capabilities: SignalCapabilities;
}> {
  const { runtime, subscribers } = createReferenceRuntime();
  const app = createReferenceServer(runtime);
  registerHealthRoute(app);
  registerObservedEventsRoute(app, subscribers);

  const port = Number(process.env.SIGNAL_HTTP_PORT ?? 3001);

  await app.listen({ port, host: "127.0.0.1" });

  const capabilities = runtime.capabilities();

  return {
    app,
    port,
    capabilities,
  };
}

async function main() {
  const { port, capabilities } = await startReferenceServer();

  console.log(
    JSON.stringify(
      {
        service: "signal-reference-server",
        port,
        capabilities: {
          queries: capabilities.queries.map((entry) => entry.name),
          mutations: capabilities.mutations.map((entry) => entry.name),
          publishedEvents: capabilities.publishedEvents.map(
            (entry) => entry.name,
          ),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
