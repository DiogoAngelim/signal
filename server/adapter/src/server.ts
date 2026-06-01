import type { SignalRuntime } from "@digelim/12.signal";
import fastify, { type FastifyInstance } from "fastify";
import { registerSignalHttpRoutes } from "./routes";

export interface CreateSignalHttpServerOptions {
  logger?: boolean;
  basePath?: string;
}

export function createSignalHttpServer(
  runtime: SignalRuntime,
  options: CreateSignalHttpServerOptions = {},
): FastifyInstance {
  const app = fastify({ logger: options.logger ?? false });
  registerSignalHttpRoutes(app, runtime, { basePath: options.basePath });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
