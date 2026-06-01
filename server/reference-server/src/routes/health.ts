import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance): FastifyInstance {
  app.get("/healthz", async () => ({
    ok: true,
    service: "signal-reference-server",
  }));

  return app;
}
