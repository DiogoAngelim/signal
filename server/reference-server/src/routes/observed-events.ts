import type { FastifyInstance } from "fastify";

export interface ObservedSignalEvents {
  seen: string[];
}

export function registerObservedEventsRoute(
  app: FastifyInstance,
  observed: ObservedSignalEvents,
): FastifyInstance {
  app.get("/signal/observed-events", async () => ({
    ok: true,
    eventIds: [...observed.seen],
    count: observed.seen.length,
  }));

  return app;
}
