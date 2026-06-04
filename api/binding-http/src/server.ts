import fastify, { type FastifyInstance } from "fastify";
import { registerSignalHttpRoutes } from "./routes";
import type { SignalRuntime } from "@signal/runtime";

export interface CreateSignalHttpServerOptions {
  logger?: boolean;
  basePath?: string;
}

export function createSignalHttpServer(
  runtime: SignalRuntime,
  options: CreateSignalHttpServerOptions = {}
): FastifyInstance {
  const app = fastify({ logger: options.logger ?? false });
  registerSignalHttpRoutes(app, runtime, { basePath: options.basePath });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
